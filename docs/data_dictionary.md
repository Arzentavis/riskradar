# Data dictionary

Snapshot date: **30 June 2025**. Payment history covers the six instalments due January–June 2025. The outcome window is July 2025 – June 2026.

## Source tables

### `borrowers`
| Column | Type | Description |
|---|---|---|
| borrower_id | text | Primary key |
| age | int | Age in years. **Protected: audit only** |
| gender | text | Male / Female. **Protected: audit only** |
| city_tier | int | 1 = metro, 2 = large city, 3 = smaller town |
| region | text | North, South, East, West, Central |
| employment_type | text | Salaried, Self-employed, Business owner, Gig worker |
| monthly_income | real | Declared monthly income, INR. Nullable in the raw feed |
| years_employed | real | Years in current job or business |
| dependents | int | Number of financial dependents |
| education | text | Highest qualification |
| residence_type | text | Owned, Rented, Family |

### `bureau`
| Column | Type | Description |
|---|---|---|
| borrower_id | text | Primary key, references borrowers |
| bureau_score | int | 300–900; **-1 = new to credit** |
| credit_utilisation | real | Share of revolving limits in use (0–1) |
| enquiries_6m | int | Hard credit enquiries in the last 6 months |
| prior_defaults | int | Past defaults reported on bureau |
| existing_emi_total | real | EMIs on other loans, INR per month |
| active_tradelines | int | Open credit accounts |

### `loans`
| Column | Type | Description |
|---|---|---|
| loan_id | text | Primary key |
| borrower_id | text | References borrowers |
| product | text | Personal, Two-wheeler, Consumer durable, Small business, Education |
| principal | real | Amount disbursed, INR |
| annual_rate_pct | real | Interest rate, % a year |
| tenure_months | int | Loan term |
| emi | real | Monthly instalment, INR |
| disbursal_date | date | Jul 2023 – Dec 2024 |
| sourcing_channel | text | Branch, DSA partner, Digital app, Dealer point |

### `payments`
| Column | Type | Description |
|---|---|---|
| loan_id, instalment_no | text, int | Composite primary key (instalments 1–6) |
| due_date | date | 5th of each month, Jan–Jun 2025 |
| amount_due | real | EMI plus any carried-forward arrears |
| amount_paid | real | Amount received |
| paid_date | date | NULL when nothing was paid |
| dpd_at_month_end | int | Days past due at month end (0, 30, 60, …) |

### `outcomes`
| Column | Type | Description |
|---|---|---|
| loan_id | text | Primary key |
| default_12m | int | 1 if the loan reached 90+ DPD between Jul 2025 and Jun 2026. **Used only for training and evaluation** |

## Engineered features (`model_features` view)

| Feature | Logic | Why it matters |
|---|---|---|
| emi_to_income | (EMI + other EMIs) ÷ monthly income | Repayment burden, the core affordability measure |
| loan_to_annual_income | principal ÷ (income × 12) | Size of the loan relative to earning power |
| months_on_book | months from disbursal to snapshot | Early-life loans behave differently |
| new_to_credit | bureau_score = -1 | No history is itself a signal |
| late_months_6m | count of months with DPD > 0 | Frequency of stress |
| missed_instalments_6m | count of months with nothing paid | Severity of stress |
| max_dpd_6m | worst DPD in the window | Depth of stress |
| current_dpd | DPD at the latest instalment (window function: `ROW_NUMBER` by recency) | Where the account is now |
| pay_ratio_last3 | average paid ÷ due, last 3 instalments | Recent payment capacity |
| pay_ratio_trend | last-3 average minus first-3 average | **Deterioration**: catches accounts sliding before they go overdue |
| dpd_roll_forwards | times DPD rose month on month (window function: `LAG`) | Arrears compounding |
| avg_days_late | average days between due date and payment | Habitual lateness |
| current_arrears | latest amount due minus amount paid | Money already overdue |
| income_imputed | 1 if income was missing and filled | Lets the model learn from data gaps |

## Model outputs

| Field | Description |
|---|---|
| pd | 12-month probability of default, from LightGBM, out-of-fold |
| pd_lr | Same from the logistic-regression benchmark |
| ead | Exposure at default = amortised outstanding principal + current arrears |
| expected_loss | pd × ead × 0.65 (LGD) |
| tier | Low < 5%, Medium 5–15%, High 15–35%, Critical ≥ 35% |
| reasons | Top 3 risk-increasing SHAP drivers, turned into sentences |
