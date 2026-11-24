-- Cleaning and feature engineering, entirely in SQL.

-- 1. Cleaned borrowers: fix the issues the DQ checks found.
--    Missing income -> mean income of the same employment type and city tier.
--    Negative years employed -> NULL (the model treats it as unknown).
--    Region case -> title case.
CREATE VIEW borrowers_clean AS
WITH segment_income AS (
    SELECT employment_type, city_tier, AVG(monthly_income) AS seg_income
    FROM borrowers
    WHERE monthly_income IS NOT NULL
    GROUP BY employment_type, city_tier
)
SELECT
    b.borrower_id, b.age, b.gender, b.city_tier,
    UPPER(SUBSTR(b.region, 1, 1)) || LOWER(SUBSTR(b.region, 2)) AS region,
    b.employment_type,
    COALESCE(b.monthly_income, ROUND(s.seg_income, -2))          AS monthly_income,
    CASE WHEN b.monthly_income IS NULL THEN 1 ELSE 0 END          AS income_imputed,
    CASE WHEN b.years_employed < 0 THEN NULL ELSE b.years_employed END AS years_employed,
    b.dependents, b.education, b.residence_type
FROM borrowers b
JOIN segment_income s USING (employment_type, city_tier);

-- 2. One modelling row per loan. Behavioural features use window functions over
--    the six instalments up to the 30 Jun 2025 observation date.
CREATE VIEW model_features AS
WITH pay AS (
    SELECT
        p.*,
        ROW_NUMBER() OVER (PARTITION BY loan_id ORDER BY instalment_no DESC) AS recency_rank,
        LAG(dpd_at_month_end) OVER (PARTITION BY loan_id ORDER BY instalment_no) AS prev_dpd,
        CASE WHEN amount_due > 0 THEN amount_paid * 1.0 / amount_due END AS pay_ratio,
        CASE WHEN paid_date IS NOT NULL
             THEN julianday(paid_date) - julianday(due_date) END AS days_late
    FROM payments p
),
behaviour AS (
    SELECT
        loan_id,
        SUM(dpd_at_month_end > 0)                                       AS late_months_6m,
        SUM(amount_paid = 0)                                            AS missed_instalments_6m,
        MAX(dpd_at_month_end)                                           AS max_dpd_6m,
        MAX(CASE WHEN recency_rank = 1 THEN dpd_at_month_end END)       AS current_dpd,
        AVG(CASE WHEN recency_rank <= 3 THEN pay_ratio END)             AS pay_ratio_last3,
        AVG(CASE WHEN recency_rank > 3  THEN pay_ratio END)             AS pay_ratio_first3,
        SUM(CASE WHEN prev_dpd IS NOT NULL AND dpd_at_month_end > prev_dpd THEN 1 ELSE 0 END)
                                                                        AS dpd_roll_forwards,
        COALESCE(AVG(days_late), 30)                                    AS avg_days_late,
        MAX(CASE WHEN recency_rank = 1 THEN amount_due - amount_paid END) AS current_arrears
    FROM pay
    GROUP BY loan_id
)
SELECT
    l.loan_id, l.borrower_id,
    -- application & product
    l.product, l.sourcing_channel, l.principal, l.annual_rate_pct, l.tenure_months, l.emi,
    l.disbursal_date,
    CAST((julianday('2025-06-30') - julianday(l.disbursal_date)) / 30.44 AS INTEGER) AS months_on_book,
    -- borrower
    c.age, c.gender, c.city_tier, c.region, c.employment_type, c.monthly_income, c.income_imputed,
    c.years_employed, c.dependents, c.education, c.residence_type,
    -- bureau
    u.bureau_score, CASE WHEN u.bureau_score = -1 THEN 1 ELSE 0 END AS new_to_credit,
    u.credit_utilisation, u.enquiries_6m, u.prior_defaults, u.active_tradelines,
    -- affordability
    ROUND((l.emi + u.existing_emi_total) / c.monthly_income, 4) AS emi_to_income,
    ROUND(l.principal / (c.monthly_income * 12), 4)             AS loan_to_annual_income,
    -- behaviour
    b.late_months_6m, b.missed_instalments_6m, b.max_dpd_6m, b.current_dpd,
    ROUND(b.pay_ratio_last3, 4)                         AS pay_ratio_last3,
    ROUND(b.pay_ratio_last3 - b.pay_ratio_first3, 4)    AS pay_ratio_trend,
    b.dpd_roll_forwards, ROUND(b.avg_days_late, 2)      AS avg_days_late,
    b.current_arrears,
    -- target
    o.default_12m
FROM loans l
JOIN borrowers_clean c USING (borrower_id)
JOIN bureau u          USING (borrower_id)
JOIN behaviour b       USING (loan_id)
JOIN outcomes o        USING (loan_id)
-- Accounts already 90+ DPD have defaulted: they belong to the recoveries team,
-- not to an early-warning list, so they are excluded from the modelling population.
WHERE b.current_dpd < 90;

-- 3. The accounts handed to recoveries instead (reported on the dashboard).
CREATE VIEW recoveries_handover AS
SELECT p.loan_id, p.dpd_at_month_end AS current_dpd, p.amount_due - p.amount_paid AS arrears
FROM payments p
WHERE p.instalment_no = 6 AND p.dpd_at_month_end >= 90;
