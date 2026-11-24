# Case study: who should collections call first?

**Arka Prabha Bauri** · Business / Technology Analyst

## The problem

A lender's collections team can call about one in five borrowers each cycle. They call whoever is most overdue first. I wanted to know whether a different order, with the same team and the same number of calls, would prevent more losses.

## What I built

**RiskRadar**, an early-warning system that scores 59,097 live retail loans (₹962 crore of exposure) and gives the team a ranked call list with reasons.

1. **Requirements first.** A business requirements document with stakeholders, success measures, functional requirements and risks, plus current- and future-state process maps.
2. **SQL data layer.** Five tables in SQLite, ten data-quality checks, and 33 features built with window functions (`ROW_NUMBER`, `LAG`) that capture *deterioration*, not just delinquency.
3. **Model.** Logistic regression and LightGBM, validated with 5-fold out-of-fold predictions so every reported number comes from unseen data. Gender and age are blocked as inputs.
4. **Explanations.** SHAP values turned into sentences an agent can read out, such as "Late in 3 of the last 6 months" or "EMIs take 55% of monthly income".
5. **Product.** A React + TypeScript dashboard with a call queue, borrower drill-down, analyst overrides with an audit log, model validation, a fairness audit and an interactive business case.

## What I found

### 1. Ranking by rupees beats ranking by days overdue: +26.5%
At 20% call capacity (11,819 calls), calling in order of **expected loss** prevents **₹11.4 crore** of losses, compared with **₹9.0 crore** for the current process. That's **₹2.4 crore more per cycle**.

The surprise is that the model **reaches fewer defaulters** (57% vs 65%) yet saves more money. Today's process spends calls on small loans that are already late. RiskRadar targets large exposures with rising risk, and **51% of its queue is not overdue yet**, so these accounts can still be cured.

When capacity is tight the lead grows: at 5% capacity RiskRadar prevents **86% more** than the current process.

### 2. The simple model was as good as the complex one
LightGBM and logistic regression both reached **AUC 0.861** (current process: 0.824). I reported this honestly instead of claiming the complex model won. The recommendation: rank with LightGBM for its native handling of missing data and its reason codes, and keep logistic regression running as a transparent benchmark whose divergence signals drift.

### 3. The probabilities can be trusted
Predicted and actual default rates match within 7% in every risk tier (Critical: 57.1% predicted vs 57.6% actual). That matters because expected loss uses the probability itself, not just the ranking.

### 4. The fairness audit found a real issue, and its cause
Women who later default get an early call **6.3 points less often** than men (53.2% vs 59.5%), even though their default rates (7.4% vs 7.3%), calibration and AUC are almost identical.

I tested the cause: ranked by probability alone, the gap falls to **1.8 points**. So the gap comes mainly from the **business rule** of prioritising by rupee exposure, not from the model.

**Recommendation:** keep ranking by expected loss, but reserve 10% of daily calls for the highest-probability accounts regardless of loan size, and alert the risk committee if the gap exceeds 5 points.

## What drives default risk
Bureau score, the number of late months in the last six, recent credit enquiries, credit utilisation and EMI-to-income ratio, in that order. The riskiest 10% of accounts default 5.4× as often as average and hold 54% of all defaults.

## What I'd do next with real data
- Swap the synthetic feed for the Home Credit dataset or a lender's real tables (only the loader changes)
- Run a champion–challenger pilot: half the agents use RiskRadar order for one month and the realised cure rate replaces the 30% assumption
- Add population-stability monitoring and a monthly override review

## Skills shown
Requirements gathering · process mapping · SQL (window functions, data-quality checks) · Python (pandas, scikit-learn, LightGBM, SHAP) · model validation · fairness auditing · business-case modelling · React + TypeScript · data visualisation · stakeholder communication
