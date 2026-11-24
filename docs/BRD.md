# Business Requirements Document: RiskRadar

| | |
|---|---|
| **Project** | RiskRadar, a credit-risk early-warning system for retail collections |
| **Author** | Arka Prabha Bauri, Business / Technology Analyst |
| **Version** | 1.0 |
| **Status** | Built and backtested on a synthetic portfolio |

---

## 1. Problem statement

A retail lender's collections team can proactively contact only about **20% of its live book** each review cycle. Today, agents work the list in **"most overdue first"** order: whoever has the most days past due (DPD) gets called first.

That order has two weaknesses:

1. **It reacts too late.** By the time an account is 30–60 DPD, the chance of curing it has already fallen. About half of next year's defaulters are **not overdue at all** at the time of the call list.
2. **It ignores how much is at stake.** A ₹45,000 consumer-durable loan and a ₹12 lakh small-business loan at the same DPD get the same priority, even though one default costs 25 times more.

## 2. Objective

Give the collections team a daily call list that **prevents the most rupees of credit loss** with the same call capacity, and tells each agent **why** an account is on the list.

### Success measures

| Measure | Target | Achieved in backtest |
|---|---|---|
| Loss prevented vs current process, same capacity | ≥ +15% | **+26.5% (₹2.38 Cr per cycle)** |
| Model ranking power (AUC) | ≥ 0.80 | **0.861** |
| Calibration: predicted vs actual default rate per tier | within ±10% relative | **within ±7%** |
| Every flagged account has plain-language reasons | 100% | **100%** (top 3 SHAP reasons) |
| Fairness: gap in early-call rate for eventual defaulters, by gender | ≤ 5 points | **6.3 points ⚠, mitigation proposed (§9)** |

## 3. Scope

**In scope**
- Live retail loans that are under 90 DPD on the snapshot date (personal, two-wheeler, consumer durable, small business, education)
- 12-month probability of default (PD), exposure at default (EAD), expected loss (EL)
- Daily ranked call queue with reason codes and a recommended action
- Analyst override with a mandatory reason and an audit log
- Data-quality checks, fairness audit, business-case simulator

**Out of scope**
- Accounts already 90+ DPD (handed to the recoveries team; 903 accounts, ₹3.3 Cr overdue)
- Credit approval decisions at origination
- Automated customer contact (agents make the call)
- Changes to pricing or credit limits

## 4. Stakeholders

| Stakeholder | Role | What they need from RiskRadar |
|---|---|---|
| Head of Collections | Sponsor | Fewer rupees lost with the same team |
| Collections agents | Primary users | Who to call, in what order, and what to say |
| Collections manager | User | Workload by tier, ability to override, override review |
| Chief Risk Officer | Approver | Validated, calibrated, explainable model |
| Model Risk / Audit | Reviewer | Documentation, override trail, fairness evidence |
| Compliance | Reviewer | No protected attributes used; fair-treatment monitoring |
| Data Engineering | Supplier | Clear data contract for the four source feeds |

## 5. Current vs future process

See [process_flow.md](process_flow.md) for the diagrams.

| Step | Today | With RiskRadar |
|---|---|---|
| Build the list | Export of overdue accounts, sorted by DPD | Pipeline scores the full live book every cycle |
| Prioritise | Most days past due first | Highest expected loss (₹) first |
| Prepare the call | Agent opens the account and guesses | Top 3 reasons plus a recommended action shown on screen |
| Exceptions | Informal, not recorded | Override with mandatory reason, logged for audit |
| Measure | Collections rate only | Loss prevented vs baseline, model and fairness monitoring |

## 6. Functional requirements

| ID | Requirement | Priority |
|---|---|---|
| FR-01 | Score every live account under 90 DPD with a 12-month PD | Must |
| FR-02 | Compute EAD as outstanding principal plus current arrears | Must |
| FR-03 | Compute expected loss = PD × EAD × LGD | Must |
| FR-04 | Assign a risk tier: Low (< 5%), Medium (5–15%), High (15–35%), Critical (≥ 35%) | Must |
| FR-05 | Rank the call queue by expected loss, capped at the team's call capacity | Must |
| FR-06 | Show the top 3 risk-increasing reasons per account in plain language | Must |
| FR-07 | Show a recommended action per tier | Must |
| FR-08 | Show the last 6 instalments with DPD for context | Should |
| FR-09 | Let an analyst override a tier with a mandatory reason and note | Must |
| FR-10 | Record every override with analyst, timestamp, old and new tier | Must |
| FR-11 | Filter the queue by tier, product, region and overdue status; search by ID | Should |
| FR-12 | Export the filtered queue to CSV for dialler upload | Should |
| FR-13 | Run data-quality checks before features are built and report the results | Must |
| FR-14 | Report model performance against the current process | Must |
| FR-15 | Report fairness by gender and age band each cycle | Must |
| FR-16 | Let managers stress-test the business case (capacity, cure rate, LGD, call cost) | Could |

## 7. Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-01 | Gender and age must never be model inputs; the pipeline asserts this on every run |
| NFR-02 | All reported performance must come from data the model did not train on (out-of-fold) |
| NFR-03 | Outcome data is stored in a separate table and joined only for training and evaluation |
| NFR-04 | The full pipeline must run end to end in under 5 minutes on a laptop |
| NFR-05 | The dashboard must work on desktop and phone, in light and dark mode |
| NFR-06 | All monetary values are shown in INR with Indian digit grouping (lakh / crore) |

## 8. Data requirements

Four source feeds plus an outcome table. See [data_dictionary.md](data_dictionary.md).

| Feed | Grain | Key fields |
|---|---|---|
| Borrowers | One row per borrower | income, employment, city tier |
| Bureau | One row per borrower | bureau score, utilisation, enquiries, prior defaults |
| Loans | One row per loan | product, principal, rate, tenure, EMI, channel |
| Payments | One row per loan per month (6 months) | amount due, amount paid, paid date, DPD |
| Outcomes | One row per loan | 90+ DPD within 12 months (training only) |

## 9. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Ranking by ₹ under-serves smaller-ticket borrowers. **The audit found women who later default get an early call 6.3 points less often**; ranked by probability alone the gap is 1.8 points | Reserve 10% of daily capacity for the highest-PD accounts regardless of size; alert the risk committee if the gap exceeds 5 points |
| Over-46 age band slightly under-predicted (calibration 0.93) | Re-check at the next quarterly refresh; add a segment calibration step if it persists |
| Model drifts as the economy or product mix changes | Logistic regression runs alongside as a benchmark; a divergence between the two triggers review. Monthly PSI on top features |
| Agents ignore the reasons and call as before | Reasons shown in the queue row, not hidden in a detail page; adoption measured by call order |
| Overrides used to game targets | Mandatory reason, analyst name, monthly override review by the collections manager |

## 10. Assumptions

See [assumptions.md](assumptions.md). The business case is most sensitive to the **cure rate** (share of defaults an early call prevents). The dashboard lets the reader change it.
