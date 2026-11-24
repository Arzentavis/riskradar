"""Generate a realistic synthetic retail-lending portfolio.

Why synthetic: the public Home Credit dataset needs a Kaggle login, and real
Indian lending data is confidential. This generator produces four related tables
(borrowers, loans, bureau, payments) whose relationships mirror how retail credit
behaves: bureau score, repayment burden, utilisation, employment stability and
recent payment behaviour drive default, with realistic noise and interactions.

Protected attributes (gender, age) are generated but have NO direct causal effect
on default. Any gap the fairness audit finds therefore comes from correlated
features, which is exactly what a real audit has to look for.

Outputs CSVs to data/raw/.
"""
import numpy as np
import pandas as pd

from config import (HISTORY_MONTHS, N_BORROWERS, OBSERVATION_DATE, RAW_DIR,
                    SEED)

rng = np.random.default_rng(SEED)


def sigmoid(x):
    return 1.0 / (1.0 + np.exp(-x))


def make_borrowers(n: int) -> pd.DataFrame:
    employment = rng.choice(
        ["Salaried", "Self-employed", "Business owner", "Gig worker"],
        size=n, p=[0.52, 0.20, 0.13, 0.15])
    city_tier = rng.choice([1, 2, 3], size=n, p=[0.38, 0.37, 0.25])
    region = rng.choice(["North", "South", "East", "West", "Central"],
                        size=n, p=[0.24, 0.27, 0.16, 0.23, 0.10])
    gender = rng.choice(["Male", "Female"], size=n, p=[0.66, 0.34])
    age = np.clip(rng.normal(34, 8.5, n), 21, 62).round().astype(int)

    base_income = {"Salaried": 48_000, "Self-employed": 52_000,
                   "Business owner": 75_000, "Gig worker": 26_000}
    tier_mult = {1: 1.35, 2: 1.0, 3: 0.72}
    income = np.array([base_income[e] for e in employment]) \
        * np.array([tier_mult[t] for t in city_tier]) \
        * rng.lognormal(0, 0.42, n) * (1 + (age - 34) * 0.012)
    income = np.clip(income, 12_000, 600_000).round(-2)

    years_employed = np.clip(rng.gamma(2.2, 2.4, n) * (age - 20) / 14, 0.2, 38).round(1)
    years_employed = np.where(employment == "Gig worker",
                              np.minimum(years_employed, rng.uniform(0.3, 6, n)), years_employed)
    dependents = rng.choice([0, 1, 2, 3, 4], size=n, p=[0.28, 0.25, 0.27, 0.14, 0.06])
    education = rng.choice(["Graduate", "Post-graduate", "Diploma", "Higher secondary"],
                           size=n, p=[0.46, 0.18, 0.17, 0.19])
    residence = rng.choice(["Owned", "Rented", "Family"], size=n, p=[0.34, 0.41, 0.25])

    # Hidden credit-worthiness trait shared by bureau and behaviour (never exported)
    trait = rng.normal(0, 1, n) \
        + 0.25 * (employment == "Salaried") - 0.30 * (employment == "Gig worker") \
        + 0.10 * np.log(income / 40_000) + 0.04 * np.minimum(years_employed, 10)

    return pd.DataFrame({
        "borrower_id": [f"B{100000 + i}" for i in range(n)],
        "age": age, "gender": gender, "city_tier": city_tier, "region": region,
        "employment_type": employment, "monthly_income": income,
        "years_employed": years_employed, "dependents": dependents,
        "education": education, "residence_type": residence,
        "_trait": trait,
    })


def make_bureau(b: pd.DataFrame) -> pd.DataFrame:
    n = len(b)
    t = b["_trait"].to_numpy()
    score = np.clip(705 + 62 * t + rng.normal(0, 28, n), 300, 900).round().astype(int)
    thin_file = rng.random(n) < 0.08 + 0.10 * (b["age"].to_numpy() < 25)
    score = np.where(thin_file, -1, score)  # -1 = no bureau history (NTC)

    util = np.clip(sigmoid(-0.9 * t + rng.normal(-0.35, 0.8, n)), 0, 1).round(3)
    enquiries = rng.poisson(np.exp(0.35 - 0.45 * t), n).clip(0, 15)
    prior_def = rng.poisson(np.exp(-2.6 - 0.9 * t), n).clip(0, 4)
    existing_emi = (b["monthly_income"].to_numpy()
                    * np.clip(rng.beta(1.6, 11, n) + 0.04 * (-t).clip(0), 0, 0.45)).round(-1)
    active_tl = rng.poisson(1.6 + 0.4 * (b["city_tier"].to_numpy() == 1), n).clip(0, 12)

    return pd.DataFrame({
        "borrower_id": b["borrower_id"], "bureau_score": score,
        "credit_utilisation": util, "enquiries_6m": enquiries,
        "prior_defaults": prior_def, "existing_emi_total": existing_emi,
        "active_tradelines": active_tl,
    })


def make_loans(b: pd.DataFrame, bureau: pd.DataFrame) -> pd.DataFrame:
    n = len(b)
    products = ["Personal loan", "Two-wheeler loan", "Consumer durable",
                "Small business loan", "Education loan"]
    product = rng.choice(products, size=n, p=[0.38, 0.20, 0.22, 0.12, 0.08])
    ticket = {"Personal loan": (2.6, 9), "Two-wheeler loan": (1.1, 3),
              "Consumer durable": (0.45, 1.5), "Small business loan": (6.0, 20),
              "Education loan": (5.0, 12)}  # (median lakh, cap lakh)
    tenure_opts = {"Personal loan": [12, 24, 36, 48, 60], "Two-wheeler loan": [12, 24, 36],
                   "Consumer durable": [6, 9, 12, 18], "Small business loan": [24, 36, 48, 60],
                   "Education loan": [36, 60, 84]}

    inc = b["monthly_income"].to_numpy()
    principal = np.array([
        min(ticket[p][0] * 1e5 * rng.lognormal(0, 0.55) * (i / 48_000) ** 0.6, ticket[p][1] * 1e5)
        for p, i in zip(product, inc)]).round(-3).clip(15_000)
    tenure = np.array([rng.choice(tenure_opts[p]) for p in product])

    score = bureau["bureau_score"].to_numpy()
    score_for_price = np.where(score < 0, 680, score)
    rate = np.clip(26 - (score_for_price - 600) * 0.035 + rng.normal(0, 1.2, n)
                   + np.where(product == "Consumer durable", -4, 0)
                   + np.where(product == "Education loan", -5, 0), 9.5, 30).round(2)
    r = rate / 12 / 100
    annuity = r * (1 + r) ** tenure / ((1 + r) ** tenure - 1)
    # Underwriting policy: total EMIs may not exceed 55% of income (FOIR cap).
    # About 4% of loans are approved as policy exceptions up to 70%.
    existing = bureau["existing_emi_total"].to_numpy()
    foir_cap = np.where(rng.random(n) < 0.04, 0.70, 0.55)
    max_emi = np.clip(foir_cap * inc - existing, 0.04 * inc, None)
    principal = np.minimum(principal, (max_emi / annuity).round(-3)).clip(15_000)
    emi = (principal * annuity).round(0)

    # Disbursed Jul 2023 - Dec 2024 so every loan has a full Jan-Jun 2025 history
    start = pd.Timestamp("2023-07-01")
    disb = start + pd.to_timedelta(rng.integers(0, 549, n), unit="D")
    # Short consumer loans that would already have closed are re-dated to stay live
    obs = pd.Timestamp(OBSERVATION_DATE)
    mob_at_obs = ((obs.year - disb.year) * 12 + (obs.month - disb.month)).to_numpy()
    too_old = mob_at_obs >= tenure - 1
    disb = disb.where(~too_old, obs - pd.to_timedelta(
        (np.minimum(tenure - 2, 8) * 30.4).astype(int) + rng.integers(0, 20, n), unit="D"))
    disb = disb.where(disb <= pd.Timestamp("2024-12-31"), pd.Timestamp("2024-12-15"))

    channel = rng.choice(["Branch", "DSA partner", "Digital app", "Dealer point"],
                         size=n, p=[0.30, 0.25, 0.30, 0.15])
    channel = np.where(product == "Two-wheeler loan",
                       rng.choice(["Dealer point", "Branch"], size=n, p=[0.8, 0.2]), channel)

    return pd.DataFrame({
        "loan_id": [f"L{500000 + i}" for i in range(n)],
        "borrower_id": b["borrower_id"], "product": product,
        "principal": principal, "annual_rate_pct": rate, "tenure_months": tenure,
        "emi": emi, "disbursal_date": disb.strftime("%Y-%m-%d"),
        "sourcing_channel": channel,
    })


def make_payments_and_outcome(b, bureau, loans):
    """Six monthly instalments (Jan-Jun 2025) plus the hidden 12-month outcome."""
    n = len(b)
    t = b["_trait"].to_numpy()
    inc = b["monthly_income"].to_numpy()
    burden = (loans["emi"].to_numpy() + bureau["existing_emi_total"].to_numpy()) / inc
    gig = (b["employment_type"].to_numpy() == "Gig worker")
    util = bureau["credit_utilisation"].to_numpy()

    # Some borrowers hit a shock mid-history (job loss, medical, business slump)
    shock_month = np.where(rng.random(n) < 0.07 + 0.05 * gig, rng.integers(2, 6, n), 99)

    behave = (-3.75 - 0.95 * t + 2.6 * np.clip(burden - 0.40, 0, None)
              + 0.9 * (util > 0.8) + 0.6 * gig * (burden > 0.5))
    # Instalments due on the 5th of Jan-Jun 2025, all on or before the observation date
    months = pd.date_range("2025-01-01", periods=HISTORY_MONTHS, freq="MS") + pd.Timedelta(days=4)

    rows = []
    dpd = np.zeros(n)
    arrears = np.zeros(n)
    emi = loans["emi"].to_numpy()
    for m, due in enumerate(months):
        shocked = m >= shock_month
        p_miss = sigmoid(behave + 2.3 * shocked + 0.9 * (dpd > 0))
        miss = rng.random(n) < p_miss
        partial = (~miss) & (rng.random(n) < sigmoid(behave - 0.8 + 1.5 * shocked))
        due_amt = emi + arrears
        paid = np.where(miss, 0, np.where(partial, (emi * rng.uniform(0.3, 0.9, n)).round(0), due_amt))
        arrears = np.clip(due_amt - paid, 0, None)
        dpd = np.where(arrears > 1, np.minimum(dpd + 30, 180) if m else 30, 0)
        days_late = np.where(paid == 0, -1,
                             np.where(arrears > 1, rng.integers(3, 25, n),
                                      np.where(rng.random(n) < sigmoid(behave + 1.2), rng.integers(1, 12, n), 0)))
        paid_date = np.where(days_late < 0, None,
                             (due + pd.to_timedelta(np.maximum(days_late, 0), unit="D")).strftime("%Y-%m-%d"))
        rows.append(pd.DataFrame({
            "loan_id": loans["loan_id"], "instalment_no": m + 1,
            "due_date": due.strftime("%Y-%m-%d"), "amount_due": due_amt.round(0),
            "amount_paid": paid, "paid_date": paid_date, "dpd_at_month_end": dpd.astype(int),
        }))
    payments = pd.concat(rows, ignore_index=True)

    # 12-month outcome. Non-linear terms (burden x gig, utilisation threshold,
    # shock recency) give a tree model a real edge over a linear baseline.
    score = bureau["bureau_score"].to_numpy()
    ntc = score < 0
    late_count = payments.groupby("loan_id")["dpd_at_month_end"].apply(lambda s: (s > 0).sum()).reindex(loans["loan_id"]).to_numpy()
    last_dpd = dpd
    logit = (-3.95 - 1.05 * t
             + 2.4 * np.clip(burden - 0.42, 0, None) + 1.1 * gig * (burden > 0.48)
             + 0.85 * (util > 0.85) + 0.18 * bureau["enquiries_6m"].to_numpy().clip(0, 6)
             + 0.55 * bureau["prior_defaults"].to_numpy() + 0.45 * ntc
             + 0.38 * late_count + 0.012 * last_dpd + 0.9 * (shock_month <= 5)
             - 0.04 * np.minimum(b["years_employed"].to_numpy(), 8)
             + 0.25 * (loans["product"].to_numpy() == "Small business loan")
             - 0.30 * (loans["product"].to_numpy() == "Education loan")
             + 0.20 * (loans["sourcing_channel"].to_numpy() == "DSA partner")
             + rng.normal(0, 0.55, n))
    default = (rng.random(n) < sigmoid(logit)).astype(int)
    return payments, default


def main():
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    borrowers = make_borrowers(N_BORROWERS)
    bureau = make_bureau(borrowers)
    loans = make_loans(borrowers, bureau)
    payments, default = make_payments_and_outcome(borrowers, bureau, loans)

    outcomes = pd.DataFrame({"loan_id": loans["loan_id"], "default_12m": default})

    # Realistic data-quality issues for the DQ checks to catch and fix
    dirty = borrowers.drop(columns="_trait").copy()
    idx = rng.choice(len(dirty), 140, replace=False)
    dirty.loc[idx[:60], "monthly_income"] = np.nan
    dirty.loc[idx[60:100], "years_employed"] = -1
    dirty.loc[idx[100:], "region"] = dirty.loc[idx[100:], "region"].str.upper()

    dirty.to_csv(RAW_DIR / "borrowers.csv", index=False)
    bureau.to_csv(RAW_DIR / "bureau.csv", index=False)
    loans.to_csv(RAW_DIR / "loans.csv", index=False)
    payments.to_csv(RAW_DIR / "payments.csv", index=False)
    outcomes.to_csv(RAW_DIR / "outcomes.csv", index=False)

    print(f"borrowers={len(dirty):,} loans={len(loans):,} payments={len(payments):,}")
    print(f"12-month default rate: {default.mean():.2%}")


if __name__ == "__main__":
    main()
