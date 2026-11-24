# Process flow

## Today: "most overdue first"

```mermaid
flowchart LR
    A[Core banking<br/>overdue report] --> B[Export to Excel]
    B --> C[Sort by days past due]
    C --> D[Split list across agents]
    D --> E[Agent opens account<br/>and decides what to say]
    E --> F{Customer reached?}
    F -- Yes --> G[Promise to pay noted<br/>in free text]
    F -- No --> H[Retry next day]
    G --> I[Month-end collections rate]
    H --> I
```

**Pain points**
- Accounts that are current but deteriorating never appear until they miss a payment.
- A ₹45k loan and a ₹12L loan at the same DPD get equal priority.
- No record of why agents skipped or re-prioritised accounts.

## Future: RiskRadar

```mermaid
flowchart LR
    subgraph Data
      S1[(Borrowers)] --> Q
      S2[(Bureau)] --> Q
      S3[(Loans)] --> Q
      S4[(Payments)] --> Q
      Q[SQL data-quality checks] --> F[SQL feature view<br/>window functions]
    end
    subgraph Model
      F --> M[PD model<br/>LightGBM + LR benchmark]
      M --> X[SHAP reason codes]
      M --> EL[Expected loss<br/>PD × EAD × LGD]
    end
    subgraph Act
      EL --> R[Rank by ₹ at risk<br/>cap at call capacity]
      X --> R
      R --> U[Call queue with reasons<br/>and recommended action]
      U --> O{Analyst agrees?}
      O -- No --> OV[Override with reason<br/>→ audit log]
      O -- Yes --> C[Call / SMS / field visit]
      OV --> C
    end
    subgraph Govern
      M --> P[Performance vs<br/>current process]
      M --> FA[Fairness audit<br/>gender, age]
      OV --> RV[Monthly override review]
    end
```

## Action by tier

| Tier | PD band | Action | Owner | SLA |
|---|---|---|---|---|
| Critical | ≥ 35% | Senior collector call; field visit if unreachable; restructuring offer if hardship confirmed | Senior collector | Same day |
| High | 15–35% | Call, agree a payment date, send a UPI payment link | Agent | 48 hours |
| Medium | 5–15% | SMS + IVR reminder 3 days before due date; call if next EMI is missed | Automated | Before due date |
| Low | < 5% | Standard reminders only | n/a | n/a |
