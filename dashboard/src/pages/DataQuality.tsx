import type { AppData } from "../types";
import { Card, Icon, Kpi } from "../ui";
import { num } from "../format";

const SEV: Record<string, string> = { high: "bad", medium: "neutral", low: "neutral" };

export default function DataPage({ data }: { data: AppData }) {
  const dq = data.dq;
  const failing = dq.checks.filter((c) => c.failing_rows > 0);
  const rows = dq.rows_loaded;

  return (
    <>
      <div className="kpis" style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}>
        {Object.entries(rows).map(([t, n]) => <Kpi key={t} label={`${t[0].toUpperCase()}${t.slice(1)} table`} value={num(n)} sub="rows loaded" />)}
      </div>

      <div className="callout info">
        {Icon.check}
        <div>
          <h3>{dq.checks.length - failing.length} of {dq.checks.length} checks passed on the raw feed. The other {failing.length} were fixed in SQL before modelling.</h3>
          <p>Missing incomes were filled with the average for the same employment type and city tier, and flagged so the model knows. Negative job tenure became "unknown". Region labels were standardised.
            Accounts already 90+ days past due ({num(data.summary.handed_to_recoveries)}) were routed to recoveries instead of the early-warning queue.</p>
        </div>
      </div>

      <Card title="Checks" sub="Defined in sql/02_data_quality.sql and run on every pipeline build">
        <div className="card-b table-wrap">
          <table>
            <thead><tr><th>Check</th><th>What it protects</th><th>Severity</th><th className="r">Failing rows</th><th>Result</th></tr></thead>
            <tbody>
              {dq.checks.map((c) => (
                <tr key={c.check}>
                  <td className="mono">{c.check}</td>
                  <td style={{ color: "var(--ink-2)" }}>{c.description}</td>
                  <td><span className={`chip ${SEV[c.severity] ?? "neutral"}`}>{c.severity}</span></td>
                  <td className="r num">{num(c.failing_rows)}</td>
                  <td>{c.failing_rows === 0
                    ? <span className="chip good">{Icon.check}Passed</span>
                    : <span className="chip neutral">{Icon.check}Fixed in cleaning</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Pipeline" sub="From raw tables to the call queue">
        <div className="card-b" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
          {[
            ["1. Raw feeds", "Borrowers, bureau, loans, payments and outcomes land as CSV"],
            ["2. SQL checks", "Ten data-quality checks in SQLite"],
            ["3. SQL features", "Cleaning plus 33 features built with window functions"],
            ["4. Model", "Logistic regression and LightGBM, 5-fold out-of-fold"],
            ["5. Explain & audit", "SHAP reason codes, fairness by gender and age"],
            ["6. Act", "Call queue ranked by expected loss, overrides logged"],
          ].map(([t, d]) => (
            <div key={t} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 14, background: "var(--surface-2)" }}>
              <div style={{ fontWeight: 600, fontFamily: "var(--font-display)" }}>{t}</div>
              <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 4 }}>{d}</div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
