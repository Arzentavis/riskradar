-- RiskRadar schema (SQLite). One row per borrower, one live loan per borrower,
-- six monthly instalments per loan, and the 12-month outcome kept in its own
-- table so it can never leak into features by accident.

DROP VIEW IF EXISTS recoveries_handover;
DROP VIEW IF EXISTS model_features;
DROP VIEW IF EXISTS borrowers_clean;
DROP TABLE IF EXISTS outcomes;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS loans;
DROP TABLE IF EXISTS bureau;
DROP TABLE IF EXISTS borrowers;

CREATE TABLE borrowers (
    borrower_id      TEXT PRIMARY KEY,
    age              INTEGER NOT NULL,
    gender           TEXT    NOT NULL,           -- protected: fairness audit only
    city_tier        INTEGER NOT NULL CHECK (city_tier IN (1, 2, 3)),
    region           TEXT    NOT NULL,
    employment_type  TEXT    NOT NULL,
    monthly_income   REAL,                       -- INR; nullable in raw feed
    years_employed   REAL,
    dependents       INTEGER,
    education        TEXT,
    residence_type   TEXT
);

CREATE TABLE bureau (
    borrower_id         TEXT PRIMARY KEY REFERENCES borrowers (borrower_id),
    bureau_score        INTEGER NOT NULL,        -- 300-900, -1 = new to credit
    credit_utilisation  REAL    NOT NULL,
    enquiries_6m        INTEGER NOT NULL,
    prior_defaults      INTEGER NOT NULL,
    existing_emi_total  REAL    NOT NULL,
    active_tradelines   INTEGER NOT NULL
);

CREATE TABLE loans (
    loan_id           TEXT PRIMARY KEY,
    borrower_id       TEXT NOT NULL REFERENCES borrowers (borrower_id),
    product           TEXT NOT NULL,
    principal         REAL NOT NULL CHECK (principal > 0),
    annual_rate_pct   REAL NOT NULL,
    tenure_months     INTEGER NOT NULL,
    emi               REAL NOT NULL,
    disbursal_date    TEXT NOT NULL,
    sourcing_channel  TEXT NOT NULL
);

CREATE TABLE payments (
    loan_id           TEXT    NOT NULL REFERENCES loans (loan_id),
    instalment_no     INTEGER NOT NULL,
    due_date          TEXT    NOT NULL,
    amount_due        REAL    NOT NULL,
    amount_paid       REAL    NOT NULL,
    paid_date         TEXT,                      -- NULL = nothing paid
    dpd_at_month_end  INTEGER NOT NULL,
    PRIMARY KEY (loan_id, instalment_no)
);

CREATE TABLE outcomes (
    loan_id      TEXT PRIMARY KEY REFERENCES loans (loan_id),
    default_12m  INTEGER NOT NULL CHECK (default_12m IN (0, 1))  -- 90+ DPD by Jun 2026
);

CREATE INDEX idx_loans_borrower ON loans (borrower_id);
CREATE INDEX idx_payments_loan ON payments (loan_id, instalment_no);
