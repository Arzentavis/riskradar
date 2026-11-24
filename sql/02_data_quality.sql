-- Data-quality checks. Each block starts with "-- check:" followed by
-- name | severity | what it protects. Every query returns the count of failing rows.
-- build_database.py runs them all and writes the results to reports/ and the dashboard.

-- check: missing_income | high | Income drives repayment burden; missing values break EMI-to-income
SELECT COUNT(*) FROM borrowers WHERE monthly_income IS NULL;

-- check: negative_tenure_at_job | medium | Years employed cannot be negative
SELECT COUNT(*) FROM borrowers WHERE years_employed < 0;

-- check: inconsistent_region_case | low | Region labels must match the reference list exactly
SELECT COUNT(*) FROM borrowers WHERE region NOT IN ('North', 'South', 'East', 'West', 'Central');

-- check: orphan_loans | high | Every loan must belong to a known borrower
SELECT COUNT(*) FROM loans l LEFT JOIN borrowers b USING (borrower_id) WHERE b.borrower_id IS NULL;

-- check: missing_bureau_record | high | Each borrower needs a bureau pull, even if new to credit
SELECT COUNT(*) FROM borrowers b LEFT JOIN bureau u USING (borrower_id) WHERE u.borrower_id IS NULL;

-- check: incomplete_payment_history | high | Features assume exactly six instalments per loan
SELECT COUNT(*) FROM (SELECT loan_id FROM payments GROUP BY loan_id HAVING COUNT(*) <> 6);

-- check: overpayment | medium | Amount paid should never exceed amount due
SELECT COUNT(*) FROM payments WHERE amount_paid > amount_due + 1;

-- check: paid_before_due_window | low | Payments dated more than 15 days before the due date
SELECT COUNT(*) FROM payments WHERE paid_date IS NOT NULL AND julianday(paid_date) < julianday(due_date) - 15;

-- check: bureau_score_out_of_range | high | Scores must be 300-900 or -1 (new to credit)
SELECT COUNT(*) FROM bureau WHERE bureau_score <> -1 AND bureau_score NOT BETWEEN 300 AND 900;

-- check: missing_outcome | high | Every modelled loan needs a known 12-month outcome
SELECT COUNT(*) FROM loans l LEFT JOIN outcomes o USING (loan_id) WHERE o.loan_id IS NULL;
