import { useState } from "react";
import type { Override } from "../types";
import { Card, Icon, TierChip, TIERS } from "../ui";

export default function AuditPage({ overrides, clear, open }: { overrides: Override[]; clear: () => void; open: (loanId: string) => void }) {
  const [confirming, setConfirming] = useState(false);
  const up = overrides.filter((o) => TIERS.indexOf(o.to_tier) > TIERS.indexOf(o.from_tier)).length;

  return (
    <>
      <div className="callout info">
        {Icon.info}
        <div>
          <h3>Why overrides are logged</h3>
          <p>Analysts know things the model does not, like a salary delay or a promise to pay. Every change is recorded with who, when and why, so risk and audit teams can review them and so the patterns feed the next model refresh.
            In this demo the log is kept in your browser.</p>
        </div>
      </div>

      <Card title="Override log" sub={overrides.length ? `${overrides.length} override${overrides.length > 1 ? "s" : ""}: ${up} raised the risk tier, ${overrides.length - up} lowered it` : undefined}
        right={overrides.length > 0 ? (
          confirming
            ? <div style={{ display: "flex", gap: 8, alignItems: "center" }}><span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>Delete all entries?</span><button className="btn" onClick={() => setConfirming(false)}>Keep</button><button className="btn primary" onClick={() => { clear(); setConfirming(false); }}>Delete</button></div>
            : <button className="btn" onClick={() => setConfirming(true)}>Clear log</button>
        ) : undefined}>
        {overrides.length === 0 ? (
          <div className="empty">
            {Icon.audit}
            <h3>No overrides yet</h3>
            <p>Open any account in the call queue and use <b>Override the model</b> at the bottom of its panel. The change appears here with its reason.</p>
          </div>
        ) : (
          <div className="card-b table-wrap">
            <table>
              <thead><tr><th>When</th><th>Loan</th><th>Change</th><th>Reason</th><th>Note</th><th>Analyst</th></tr></thead>
              <tbody>
                {overrides.map((o) => (
                  <tr key={o.id} className="click" onClick={() => open(o.loan_id)}>
                    <td className="num" style={{ whiteSpace: "nowrap" }}>{new Date(o.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</td>
                    <td className="mono">{o.loan_id}</td>
                    <td style={{ whiteSpace: "nowrap" }}><TierChip tier={o.from_tier} /> <span style={{ color: "var(--muted)", margin: "0 4px" }}>→</span> <TierChip tier={o.to_tier} /></td>
                    <td>{o.reason}</td>
                    <td style={{ color: "var(--ink-2)", maxWidth: 320 }}>{o.note || "—"}</td>
                    <td>{o.analyst}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
