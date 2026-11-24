"""Train, explain, audit and simulate.

1. Read the SQL feature view.
2. Score every loan with 5-fold out-of-fold predictions so every number in the
   dashboard comes from a model that never saw that loan during training.
3. Compare a logistic-regression baseline, a LightGBM model and today's
   rule-based call order ("most days past due first").
4. Explain each prediction with SHAP and turn the top drivers into plain-English
   reasons a collections agent can read out.
5. Audit fairness by gender and age band (neither is a model input).
6. Simulate the collections business case at different call capacities.
7. Export JSON for the dashboard and a metrics summary for the README.
"""
import json
import sqlite3
import warnings

import lightgbm as lgb
import numpy as np
import pandas as pd
import shap
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (average_precision_score, brier_score_loss,
                             roc_auc_score, roc_curve)
from sklearn.model_selection import StratifiedKFold, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from config import (CALL_CAPACITY, COST_PER_CONTACT_INR, CURE_RATE_IF_CONTACTED,
                    DASHBOARD_DATA_DIR, DB_PATH, LOSS_GIVEN_DEFAULT,
                    PROTECTED_ATTRIBUTES, REPORTS_DIR, RISK_TIERS, SEED)

warnings.filterwarnings("ignore", category=UserWarning)
warnings.filterwarnings("ignore", message=".*eval_set.*")

CATEGORICAL = ["product", "sourcing_channel", "employment_type", "region",
               "education", "residence_type"]
NUMERIC = ["principal", "annual_rate_pct", "tenure_months", "emi", "months_on_book",
           "city_tier", "monthly_income", "income_imputed", "years_employed", "dependents",
           "bureau_score", "new_to_credit", "credit_utilisation", "enquiries_6m",
           "prior_defaults", "active_tradelines", "emi_to_income", "loan_to_annual_income",
           "late_months_6m", "missed_instalments_6m", "max_dpd_6m", "current_dpd",
           "pay_ratio_last3", "pay_ratio_trend", "dpd_roll_forwards", "avg_days_late",
           "current_arrears"]
FEATURES = NUMERIC + CATEGORICAL
assert not set(FEATURES) & set(PROTECTED_ATTRIBUTES), "protected attribute used as a feature"

LABELS = {
    "principal": "Loan amount", "annual_rate_pct": "Interest rate", "tenure_months": "Tenure",
    "emi": "Monthly EMI", "months_on_book": "Months on book", "city_tier": "City tier",
    "monthly_income": "Monthly income", "income_imputed": "Income missing at source",
    "years_employed": "Years employed", "dependents": "Dependents",
    "bureau_score": "Bureau score", "new_to_credit": "New to credit",
    "credit_utilisation": "Credit utilisation", "enquiries_6m": "Recent credit enquiries",
    "prior_defaults": "Past defaults on bureau", "active_tradelines": "Active credit lines",
    "emi_to_income": "EMI-to-income ratio", "loan_to_annual_income": "Loan-to-income ratio",
    "late_months_6m": "Late months (last 6)", "missed_instalments_6m": "Missed instalments (last 6)",
    "max_dpd_6m": "Worst days past due", "current_dpd": "Current days past due",
    "pay_ratio_last3": "Share of dues paid (last 3 months)",
    "pay_ratio_trend": "Payment trend", "dpd_roll_forwards": "Times arrears rolled forward",
    "avg_days_late": "Average days late", "current_arrears": "Current arrears",
    "product": "Product", "sourcing_channel": "Sourcing channel",
    "employment_type": "Employment type", "region": "Region", "education": "Education",
    "residence_type": "Residence",
}


def inr(x):
    """Indian digit grouping: 261461 -> ₹2,61,461."""
    s = f"{abs(x):.0f}"
    if len(s) > 3:
        head, tail = s[:-3], s[-3:]
        head = ",".join([head[max(i - 2, 0):i] for i in range(len(head), 0, -2)][::-1])
        s = f"{head},{tail}"
    return ("-₹" if x < 0 else "₹") + s


def reason_text(feat, v):
    """Turn a feature value into a sentence a collections agent can say out loud."""
    if pd.isna(v):
        return f"{LABELS[feat]} unknown"
    m = {
        "late_months_6m": lambda: f"Late in {int(v)} of the last 6 months",
        "missed_instalments_6m": lambda: f"Missed {int(v)} instalment{'s' if v != 1 else ''} entirely",
        "max_dpd_6m": lambda: f"Reached {int(v)} days past due",
        "current_dpd": lambda: f"Currently {int(v)} days past due" if v > 0 else "Up to date this month",
        "emi_to_income": lambda: f"EMIs take {v:.0%} of monthly income",
        "credit_utilisation": lambda: f"Credit lines {v:.0%} utilised",
        "bureau_score": lambda: "New to credit, no bureau score" if v < 0 else f"Bureau score {int(v)}",
        "new_to_credit": lambda: "New to credit, no bureau history" if v else "Has bureau history",
        "enquiries_6m": lambda: f"{int(v)} credit enquiries in 6 months",
        "prior_defaults": lambda: f"{int(v)} past default{'s' if v != 1 else ''} on bureau",
        "pay_ratio_last3": lambda: f"Paid {v:.0%} of dues over the last 3 months",
        "pay_ratio_trend": lambda: (f"Paying {abs(v):.0%} less of dues than 3 months ago" if v < -0.005
                                    else "Payments steady or improving"),
        "dpd_roll_forwards": lambda: f"Arrears rolled forward {int(v)} time{'s' if v != 1 else ''}",
        "avg_days_late": lambda: f"Pays {v:.0f} days late on average",
        "current_arrears": lambda: f"{inr(v)} currently overdue" if v > 1 else "No overdue amount",
        "years_employed": lambda: f"{v:.1f} years in current job",
        "monthly_income": lambda: f"Monthly income {inr(v)}",
        "loan_to_annual_income": lambda: f"Loan is {v:.1f}× annual income",
        "annual_rate_pct": lambda: f"Priced at {v:.1f}% a year",
        "months_on_book": lambda: f"{int(v)} months since disbursal",
        "city_tier": lambda: f"Tier {int(v)} city",
        "dependents": lambda: f"{int(v)} dependents",
        "active_tradelines": lambda: f"{int(v)} active credit lines",
        "income_imputed": lambda: "Income not verified at source" if v else "Income verified",
        "principal": lambda: f"Loan amount {inr(v)}",
        "emi": lambda: f"EMI {inr(v)}",
        "tenure_months": lambda: f"{int(v)}-month tenure",
    }
    if feat in m:
        return m[feat]()
    return f"{LABELS[feat]}: {v}"


def outstanding_principal(df):
    r = df["annual_rate_pct"] / 1200
    n = df["tenure_months"]
    k = np.minimum(df["months_on_book"].clip(lower=0), n - 1)
    return df["principal"] * ((1 + r) ** n - (1 + r) ** k) / ((1 + r) ** n - 1)


def lr_pipeline():
    num = Pipeline([("impute", SimpleImputer(strategy="median")), ("scale", StandardScaler())])
    cat = OneHotEncoder(handle_unknown="ignore")
    pre = ColumnTransformer([("num", num, NUMERIC), ("cat", cat, CATEGORICAL)])
    return Pipeline([("pre", pre), ("lr", LogisticRegression(C=0.5, max_iter=3000))])


def lgb_model():
    return lgb.LGBMClassifier(
        n_estimators=2000, learning_rate=0.03, num_leaves=31, min_child_samples=80,
        subsample=0.8, subsample_freq=1, colsample_bytree=0.8, reg_lambda=1.0,
        random_state=SEED, verbose=-1)


def ks_stat(y, p):
    fpr, tpr, _ = roc_curve(y, p)
    return float(np.max(tpr - fpr))


def summarise_model(y, p, probabilistic=True):
    order = np.argsort(-p)
    top = order[: int(len(p) * CALL_CAPACITY)]
    return {
        "auc": round(float(roc_auc_score(y, p)), 4),
        "gini": round(float(2 * roc_auc_score(y, p) - 1), 4),
        "ks": round(ks_stat(y, p), 4),
        "pr_auc": round(float(average_precision_score(y, p)), 4),
        "brier": round(float(brier_score_loss(y, p)), 4) if p.max() <= 1 and probabilistic else None,
        "capture_at_capacity": round(float(y[top].sum() / y.sum()), 4),
    }


def roc_points(y, p, k=80):
    fpr, tpr, _ = roc_curve(y, p)
    idx = np.unique(np.linspace(0, len(fpr) - 1, k).astype(int))
    return [{"fpr": round(float(fpr[i]), 4), "tpr": round(float(tpr[i]), 4)} for i in idx]


def tier_of(p):
    for name, lo, hi in RISK_TIERS:
        if lo <= p < hi:
            return name
    return RISK_TIERS[-1][0]


def main():
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    DASHBOARD_DATA_DIR.mkdir(parents=True, exist_ok=True)

    con = sqlite3.connect(DB_PATH)
    df = pd.read_sql("SELECT * FROM model_features", con)
    handover = con.execute("SELECT COUNT(*), COALESCE(SUM(arrears), 0) FROM recoveries_handover").fetchone()
    pay = pd.read_sql("SELECT loan_id, instalment_no, due_date, amount_due, amount_paid, "
                      "paid_date, dpd_at_month_end FROM payments", con)
    con.close()

    df["bureau_score_raw"] = df["bureau_score"]
    df.loc[df["bureau_score"] < 0, "bureau_score"] = np.nan
    for c in CATEGORICAL:
        df[c] = df[c].astype("category")
    X, y = df[FEATURES], df["default_12m"].to_numpy()
    print(f"rows={len(df):,} default rate={y.mean():.2%}")

    # ---------- 5-fold out-of-fold scoring ----------
    skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=SEED)
    oof_lr, oof_gbm = np.zeros(len(df)), np.zeros(len(df))
    fold_of = np.zeros(len(df), dtype=int)
    models = []
    for f, (tr, va) in enumerate(skf.split(X, y)):
        lr = lr_pipeline().fit(X.iloc[tr], y[tr])
        oof_lr[va] = lr.predict_proba(X.iloc[va])[:, 1]

        tr_in, es = train_test_split(tr, test_size=0.15, stratify=y[tr], random_state=SEED)
        gbm = lgb_model().fit(X.iloc[tr_in], y[tr_in], eval_set=[(X.iloc[es], y[es])],
                              callbacks=[lgb.early_stopping(100, verbose=False)])
        oof_gbm[va] = gbm.predict_proba(X.iloc[va])[:, 1]
        fold_of[va] = f
        models.append(gbm)
        print(f"fold {f}: LR AUC={roc_auc_score(y[va], oof_lr[va]):.4f} "
              f"LightGBM AUC={roc_auc_score(y[va], oof_gbm[va]):.4f} trees={gbm.best_iteration_}")

    df["pd"] = oof_gbm
    df["pd_lr"] = oof_lr
    df["ead"] = (outstanding_principal(df) + df["current_arrears"].clip(lower=0)).round(0)
    df["expected_loss"] = (df["pd"] * df["ead"] * LOSS_GIVEN_DEFAULT).round(0)
    df["tier"] = df["pd"].map(tier_of)

    # Today's process: call whoever is most overdue first
    ntc_score = df["bureau_score"].fillna(650)
    rule_rank = df.assign(_s=-ntc_score).sort_values(
        ["current_dpd", "late_months_6m", "current_arrears", "_s"], ascending=False).index
    rule_score = np.zeros(len(df))
    rule_score[rule_rank] = np.linspace(1, 0, len(df))

    metrics = {"lightgbm": summarise_model(y, oof_gbm),
               "logistic_regression": summarise_model(y, oof_lr),
               "rule_based": summarise_model(y, rule_score, probabilistic=False)}
    for k, v in metrics.items():
        print(k, v)

    # ---------- SHAP explanations ----------
    rng = np.random.default_rng(SEED)
    ranked = df.sort_values("expected_loss", ascending=False)
    queue_idx = ranked.index[:1000].to_numpy()
    sample_idx = rng.choice(len(df), 6000, replace=False)
    need = np.union1d(queue_idx, sample_idx)
    shap_vals = pd.DataFrame(0.0, index=need, columns=FEATURES)
    for f, model in enumerate(models):
        rows = need[fold_of[need] == f]
        if len(rows) == 0:
            continue
        sv = shap.TreeExplainer(model).shap_values(X.loc[rows])
        sv = sv[1] if isinstance(sv, list) else sv
        shap_vals.loc[rows] = sv
    global_imp = shap_vals.loc[sample_idx].abs().mean().sort_values(ascending=False)
    importance = [{"feature": LABELS[k], "key": k, "mean_abs_shap": round(float(v), 4)}
                  for k, v in global_imp.head(15).items()]

    def explain(i, top=6):
        s = shap_vals.loc[i].sort_values(key=np.abs, ascending=False).head(top)
        raw = df.loc[i]
        out = []
        for feat, val in s.items():
            v = raw["bureau_score_raw"] if feat == "bureau_score" else raw[feat]
            out.append({"feature": LABELS[feat], "text": reason_text(feat, v),
                        "impact": round(float(val), 3)})
        return out

    # ---------- Exports ----------
    pay_by_loan = {k: g.sort_values("instalment_no") for k, g in
                   pay[pay["loan_id"].isin(df.loc[queue_idx, "loan_id"])].groupby("loan_id")}
    queue = []
    for rank, i in enumerate(queue_idx, start=1):
        r = df.loc[i]
        drivers = explain(i)
        hist = pay_by_loan[r["loan_id"]]
        queue.append({
            "rank": rank, "loan_id": r["loan_id"], "borrower_id": r["borrower_id"],
            "product": r["product"], "region": r["region"], "city_tier": int(r["city_tier"]),
            "employment": r["employment_type"], "channel": r["sourcing_channel"],
            "income": float(r["monthly_income"]), "emi": float(r["emi"]),
            "principal": float(r["principal"]), "ead": float(r["ead"]),
            "pd": round(float(r["pd"]), 4), "pd_lr": round(float(r["pd_lr"]), 4),
            "tier": r["tier"], "expected_loss": float(r["expected_loss"]),
            "current_dpd": int(r["current_dpd"]), "late_months": int(r["late_months_6m"]),
            "bureau_score": int(r["bureau_score_raw"]),
            "emi_to_income": round(float(r["emi_to_income"]), 3),
            "reasons": [d for d in drivers if d["impact"] > 0][:3],
            "drivers": drivers,
            "history": [{"month": pd.Timestamp(h.due_date).strftime("%b %Y"),
                         "due": float(h.amount_due), "paid": float(h.amount_paid),
                         "dpd": int(h.dpd_at_month_end)} for h in hist.itertuples()],
            "outcome": int(r["default_12m"]),
        })

    # Portfolio views
    def group_view(col, order=None):
        g = df.groupby(col, observed=True).agg(
            accounts=("loan_id", "size"), exposure=("ead", "sum"),
            avg_pd=("pd", "mean"), actual_rate=("default_12m", "mean"),
            expected_loss=("expected_loss", "sum")).reset_index()
        if order:
            g[col] = pd.Categorical(g[col], order, ordered=True)
            g = g.sort_values(col)
        return [{"name": str(row[col]), "accounts": int(row.accounts),
                 "exposure": round(float(row.exposure)), "avg_pd": round(float(row.avg_pd), 4),
                 "actual_rate": round(float(row.actual_rate), 4),
                 "expected_loss": round(float(row.expected_loss))} for _, row in g.iterrows()]

    df["cohort"] = pd.to_datetime(df["disbursal_date"]).dt.to_period("Q").astype(str)
    bins = np.arange(0, 0.62, 0.02)
    hist_counts, _ = np.histogram(df["pd"].clip(upper=0.6 - 1e-9), bins=bins)
    hist_def, _ = np.histogram(df.loc[df.default_12m == 1, "pd"].clip(upper=0.6 - 1e-9), bins=bins)

    portfolio = {
        "tiers": group_view("tier", [t[0] for t in RISK_TIERS]),
        "products": group_view("product"),
        "employment": group_view("employment_type"),
        "city_tier": group_view("city_tier"),
        "regions": group_view("region"),
        "channels": group_view("sourcing_channel"),
        "cohorts": group_view("cohort"),
        "pd_histogram": [{"from": round(float(bins[i]), 2), "to": round(float(bins[i + 1]), 2),
                          "accounts": int(hist_counts[i]), "defaults": int(hist_def[i])}
                         for i in range(len(hist_counts))],
    }

    # Model evaluation
    dec = pd.qcut(pd.Series(oof_gbm).rank(method="first"), 10, labels=False)
    deciles = (pd.DataFrame({"d": 10 - dec, "y": y, "p": oof_gbm})
               .groupby("d").agg(accounts=("y", "size"), defaults=("y", "sum"),
                                 avg_pd=("p", "mean")).reset_index())
    deciles["actual_rate"] = deciles["defaults"] / deciles["accounts"]
    deciles["cum_capture"] = deciles["defaults"].cumsum() / y.sum()
    deciles["lift"] = deciles["actual_rate"] / y.mean()
    cal_bins = pd.qcut(oof_gbm, 10, labels=False, duplicates="drop")
    calibration = (pd.DataFrame({"b": cal_bins, "y": y, "p": oof_gbm, "q": oof_lr})
                   .groupby("b").agg(predicted=("p", "mean"), actual=("y", "mean"),
                                     accounts=("y", "size")).reset_index())
    model_json = {
        "validation": "5-fold stratified cross-validation, out-of-fold predictions",
        "metrics": metrics,
        "roc": {"lightgbm": roc_points(y, oof_gbm), "logistic_regression": roc_points(y, oof_lr),
                "rule_based": roc_points(y, rule_score)},
        "deciles": [{"decile": int(r.d), "accounts": int(r.accounts), "defaults": int(r.defaults),
                     "avg_pd": round(float(r.avg_pd), 4), "actual_rate": round(float(r.actual_rate), 4),
                     "cum_capture": round(float(r.cum_capture), 4), "lift": round(float(r.lift), 2)}
                    for r in deciles.itertuples()],
        "calibration": [{"predicted": round(float(r.predicted), 4), "actual": round(float(r.actual), 4),
                         "accounts": int(r.accounts)} for r in calibration.itertuples()],
        "importance": importance,
        "trees_per_fold": [int(m.best_iteration_) for m in models],
        "features_used": len(FEATURES),
    }

    # Fairness audit: who gets flagged (top 20% by expected loss) and how accurate is the model per group
    flag = np.zeros(len(df), dtype=bool)
    flag[ranked.index[: int(len(df) * CALL_CAPACITY)]] = True
    df["flagged"] = flag
    flag_pd = np.zeros(len(df), dtype=bool)
    flag_pd[np.argsort(-oof_gbm)[: int(len(df) * CALL_CAPACITY)]] = True
    df["flagged_pd"] = flag_pd
    df["age_band"] = pd.cut(df["age"], [20, 25, 35, 45, 70], labels=["21–25", "26–35", "36–45", "46+"])

    def fairness(col):
        rows = []
        for name, g in df.groupby(col, observed=True):
            yy, ff = g["default_12m"].to_numpy(), g["flagged"].to_numpy()
            rows.append({
                "group": str(name), "accounts": int(len(g)),
                "actual_rate": round(float(yy.mean()), 4),
                "avg_pd": round(float(g["pd"].mean()), 4),
                "flag_rate": round(float(ff.mean()), 4),
                "tpr": round(float(ff[yy == 1].mean()), 4),
                "fpr": round(float(ff[yy == 0].mean()), 4),
                "tpr_pd_only": round(float(g["flagged_pd"].to_numpy()[yy == 1].mean()), 4),
                "avg_exposure": round(float(g["ead"].mean())),
                "auc": round(float(roc_auc_score(yy, g["pd"])), 4),
            })
        base = max(rows, key=lambda r: r["accounts"])
        for r in rows:
            r["tpr_gap_vs_largest"] = round(r["tpr"] - base["tpr"], 4)
            r["calibration_ratio"] = round(r["avg_pd"] / r["actual_rate"], 3) if r["actual_rate"] else None
        return rows

    fair = {"policy": f"Flagged = in the top {CALL_CAPACITY:.0%} of the book by expected loss",
            "note": "Gender and age are not model inputs; they are used only for this audit.",
            "gender": fairness("gender"), "age_band": fairness("age_band")}

    # Business case: call capacity sweep
    ead_lgd = (df["ead"] * LOSS_GIVEN_DEFAULT).to_numpy()
    loss_if_default = ead_lgd * y
    total_loss = loss_if_default.sum()
    strategies = {
        "Model (expected loss)": df["expected_loss"].to_numpy(),
        "Model (probability only)": oof_gbm,
        "Logistic regression": oof_lr * ead_lgd,
        "Current process (most overdue first)": rule_score,
    }
    caps = [0.02, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.40, 0.50]
    curves = {}
    for name, score in strategies.items():
        order = np.argsort(-score)
        pts = []
        for c in caps:
            top = order[: int(len(df) * c)]
            prevented = loss_if_default[top].sum() * CURE_RATE_IF_CONTACTED
            pts.append({"capacity": c, "defaulters_reached": round(float(y[top].sum() / y.sum()), 4),
                        "loss_prevented": round(float(prevented)),
                        "net_benefit": round(float(prevented - len(top) * COST_PER_CONTACT_INR))})
        curves[name] = pts
    rand_pts = []
    for c in caps:
        prevented = total_loss * c * CURE_RATE_IF_CONTACTED
        rand_pts.append({"capacity": c, "defaulters_reached": c, "loss_prevented": round(float(prevented)),
                         "net_benefit": round(float(prevented - int(len(df) * c) * COST_PER_CONTACT_INR))})
    curves["Random calls"] = rand_pts

    at = lambda name: next(p for p in curves[name] if p["capacity"] == CALL_CAPACITY)
    model_pt, rule_pt, rand_pt = at("Model (expected loss)"), at("Current process (most overdue first)"), at("Random calls")
    business = {
        "assumptions": {"call_capacity": CALL_CAPACITY, "cure_rate_if_contacted": CURE_RATE_IF_CONTACTED,
                        "loss_given_default": LOSS_GIVEN_DEFAULT, "cost_per_contact_inr": COST_PER_CONTACT_INR,
                        "accounts": int(len(df))},
        "total_expected_loss_if_no_action": round(float(total_loss)),
        "curves": curves,
        "headline": {
            "capacity": CALL_CAPACITY,
            "model_loss_prevented": model_pt["loss_prevented"],
            "rule_loss_prevented": rule_pt["loss_prevented"],
            "random_loss_prevented": rand_pt["loss_prevented"],
            "uplift_vs_rule": model_pt["loss_prevented"] - rule_pt["loss_prevented"],
            "uplift_vs_rule_pct": round(model_pt["loss_prevented"] / rule_pt["loss_prevented"] - 1, 4),
            "model_defaulters_reached": model_pt["defaulters_reached"],
            "rule_defaulters_reached": rule_pt["defaulters_reached"],
            "calls": int(len(df) * CALL_CAPACITY),
        },
    }

    summary = {
        "as_of": "2025-06-30", "outcome_window": "Jul 2025 – Jun 2026",
        "accounts": int(len(df)), "exposure": round(float(df["ead"].sum())),
        "default_rate": round(float(y.mean()), 4),
        "expected_loss": round(float(df["expected_loss"].sum())),
        "high_or_critical": int(df["tier"].isin(["High", "Critical"]).sum()),
        "currently_delinquent": int((df["current_dpd"] > 0).sum()),
        "auc": metrics["lightgbm"]["auc"], "gini": metrics["lightgbm"]["gini"],
        "ks": metrics["lightgbm"]["ks"],
        "uplift_vs_rule": business["headline"]["uplift_vs_rule"],
        "uplift_vs_rule_pct": business["headline"]["uplift_vs_rule_pct"],
        "calls": business["headline"]["calls"],
        "handed_to_recoveries": int(handover[0]),
        "handed_to_recoveries_arrears": round(float(handover[1])),
    }

    outputs = {"summary": summary, "portfolio": portfolio, "queue": queue, "model": model_json,
               "fairness": fair, "business": business}
    for name, obj in outputs.items():
        (DASHBOARD_DATA_DIR / f"{name}.json").write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (REPORTS_DIR / "metrics.json").write_text(json.dumps(
        {"summary": summary, "metrics": metrics, "business_headline": business["headline"],
         "fairness": fair, "importance": importance}, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(summary, indent=2))
    print(json.dumps(business["headline"], indent=2))


if __name__ == "__main__":
    main()
