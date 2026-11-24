import { useEffect, useMemo, useState } from "react";
import type { Account, AppData, Override, Tier } from "../types";
import { Card, Icon, TierChip, TIERS } from "../ui";
import { inr, inrShort, num, pct } from "../format";

const PAGE = 25;

const ACTION: Record<Tier, { title: string; text: string }> = {
  Critical: { title: "Senior collector call today", text: "Field visit within 72 hours if unreachable. Offer a restructuring plan if hardship is confirmed." },
  High: { title: "Call within 48 hours", text: "Agree a specific payment date and send a UPI payment link during the call." },
  Medium: { title: "Automated reminder", text: "SMS and IVR reminder 3 days before the due date. Escalate to a call if the next EMI is missed." },
  Low: { title: "No proactive action", text: "Standard reminders only." },
};

const REASONS = ["Customer confirmed hardship", "Payment promise received", "Restructuring agreed", "Data error in source system", "Suspected fraud", "Other"];

export default function Queue({ data, overrides, addOverride, openLoan, setOpenLoan }: {
  data: AppData;
  overrides: Map<string, Override>;
  addOverride: (o: Override) => void;
  openLoan: string | null;
  setOpenLoan: (id: string | null) => void;
}) {
  const [q, setQ] = useState("");
  const [tier, setTier] = useState<Tier | "All">("All");
  const [product, setProduct] = useState("All");
  const [region, setRegion] = useState("All");
  const [overdue, setOverdue] = useState(false);
  const [page, setPage] = useState(0);

  const products = useMemo(() => ["All", ...new Set(data.queue.map((a) => a.product))], [data.queue]);
  const regions = useMemo(() => ["All", ...new Set(data.queue.map((a) => a.region))].sort(), [data.queue]);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return data.queue.filter((a) => {
      const t = overrides.get(a.loan_id)?.to_tier ?? a.tier;
      return (tier === "All" || t === tier)
        && (product === "All" || a.product === product)
        && (region === "All" || a.region === region)
        && (!overdue || a.current_dpd > 0)
        && (!term || a.loan_id.toLowerCase().includes(term) || a.borrower_id.toLowerCase().includes(term));
    });
  }, [data.queue, q, tier, product, region, overdue, overrides]);

  useEffect(() => setPage(0), [q, tier, product, region, overdue]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const slice = rows.slice(page * PAGE, page * PAGE + PAGE);
  const totalEl = rows.reduce((s, a) => s + a.expected_loss, 0);
  const open = openLoan ? data.queue.find((a) => a.loan_id === openLoan) ?? null : null;

  const exportCsv = () => {
    const head = ["rank", "loan_id", "borrower_id", "product", "region", "tier", "pd", "exposure", "expected_loss", "current_dpd", "reason_1", "reason_2", "reason_3"];
    const lines = rows.map((a) => [a.rank, a.loan_id, a.borrower_id, a.product, a.region, overrides.get(a.loan_id)?.to_tier ?? a.tier,
      a.pd, a.ead, a.expected_loss, a.current_dpd, ...[0, 1, 2].map((i) => a.reasons[i]?.text ?? "")]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = "riskradar_call_queue.csv"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <>
      <Card>
        <div className="toolbar">
          <div className="field">{Icon.search}<input id="queue-search" placeholder="Search loan or borrower ID" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search loan or borrower ID" /></div>
          <div className="seg" role="group" aria-label="Risk tier">
            {(["All", ...TIERS.slice().reverse()] as (Tier | "All")[]).map((t) => (
              <button key={t} aria-pressed={tier === t} onClick={() => setTier(t)}>{t}</button>
            ))}
          </div>
          <select id="queue-product" className="sel" value={product} onChange={(e) => setProduct(e.target.value)} aria-label="Product">
            {products.map((p) => <option key={p} value={p}>{p === "All" ? "All products" : p}</option>)}
          </select>
          <select id="queue-region" className="sel" value={region} onChange={(e) => setRegion(e.target.value)} aria-label="Region">
            {regions.map((p) => <option key={p} value={p}>{p === "All" ? "All regions" : p}</option>)}
          </select>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--ink-2)" }}>
            <input id="queue-overdue" type="checkbox" checked={overdue} onChange={(e) => setOverdue(e.target.checked)} /> Overdue now
          </label>
          <div className="spacer" />
          <button className="btn" onClick={exportCsv}>{Icon.download}Export CSV</button>
        </div>
        <div className="pager" style={{ borderBottom: "1px solid var(--border)" }}>
          <span><b style={{ color: "var(--ink)" }}>{num(rows.length)}</b> accounts · {inrShort(totalEl)} expected loss. Showing the top {num(data.queue.length)} of {num(data.summary.calls)} queued calls.</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th><th>Loan</th><th>Product · Region</th><th>Tier</th><th>Probability of default</th>
                <th className="r">Exposure</th><th className="r">Expected loss</th><th className="r">DPD</th><th>Why flagged</th>
              </tr>
            </thead>
            <tbody>
              {slice.map((a) => {
                const ov = overrides.get(a.loan_id);
                return (
                  <tr key={a.loan_id} className={`click ${openLoan === a.loan_id ? "sel" : ""}`} onClick={() => setOpenLoan(a.loan_id)}
                    tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") setOpenLoan(a.loan_id); }}>
                    <td className="num" style={{ color: "var(--muted)" }}>{a.rank}</td>
                    <td><div className="mono">{a.loan_id}</div><div style={{ fontSize: 12, color: "var(--muted)" }}>{a.employment}</div></td>
                    <td>{a.product}<div style={{ fontSize: 12, color: "var(--muted)" }}>{a.region} · Tier {a.city_tier}</div></td>
                    <td>
                      <TierChip tier={ov?.to_tier ?? a.tier} />
                      {ov && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>Overridden</div>}
                    </td>
                    <td><div className="pdbar"><div className="track"><div className="fill" style={{ width: `${a.pd * 100}%` }} /></div><b>{pct(a.pd, 0)}</b></div></td>
                    <td className="r num">{inrShort(a.ead)}</td>
                    <td className="r num"><b>{inrShort(a.expected_loss)}</b></td>
                    <td className="r num">{a.current_dpd > 0 ? a.current_dpd : <span style={{ color: "var(--muted)" }}>0</span>}</td>
                    <td style={{ color: "var(--ink-2)", maxWidth: 280 }}>{a.reasons[0]?.text}{a.reasons.length > 1 && <span style={{ color: "var(--muted)" }}> +{a.reasons.length - 1}</span>}</td>
                  </tr>
                );
              })}
              {slice.length === 0 && (
                <tr><td colSpan={9}><div className="empty">{Icon.search}<h3>No accounts match</h3><p>Clear a filter or search for a different ID.</p></div></td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="pager">
          <span>Page {page + 1} of {pages}</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
            <button className="btn" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        </div>
      </Card>

      {open && <AccountDrawer a={open} override={overrides.get(open.loan_id)} onClose={() => setOpenLoan(null)} addOverride={addOverride} />}
    </>
  );
}

function dpdColor(d: number) {
  if (d === 0) return "var(--good)";
  if (d < 60) return "var(--warning)";
  if (d < 90) return "var(--serious)";
  return "var(--critical)";
}

function AccountDrawer({ a, override, onClose, addOverride }: {
  a: Account; override?: Override; onClose: () => void; addOverride: (o: Override) => void;
}) {
  const [toTier, setToTier] = useState<Tier>(a.tier === "Critical" ? "High" : "Critical");
  const [reason, setReason] = useState(REASONS[0]);
  const [note, setNote] = useState("");
  const [analyst, setAnalyst] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);

  const tier = override?.to_tier ?? a.tier;
  const maxImpact = Math.max(...a.drivers.map((d) => Math.abs(d.impact)), 0.01);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    addOverride({
      id: `${a.loan_id}-${Date.now()}`, at: new Date().toISOString(), loan_id: a.loan_id,
      from_tier: a.tier, to_tier: toTier, reason, note: note.trim(), analyst: analyst.trim() || "Analyst",
    });
    setSaved(true);
  };

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={`Account ${a.loan_id}`}>
        <div className="drawer-h">
          <div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <h2 className="mono" style={{ fontSize: 18 }}>{a.loan_id}</h2>
              <TierChip tier={tier} />
              {override && <span className="chip neutral">Overridden from {a.tier}</span>}
            </div>
            <p>Queue rank #{a.rank} · {a.product} · {a.employment} · {a.region}, Tier {a.city_tier} city · Borrower {a.borrower_id}</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close account details">{Icon.close}</button>
        </div>

        <div className="drawer-b">
          <div className="facts">
            <div><span>Probability of default</span><b>{pct(a.pd)}</b></div>
            <div><span>Exposure at default</span><b>{inr(a.ead)}</b></div>
            <div><span>Expected loss</span><b>{inr(a.expected_loss)}</b></div>
            <div><span>Monthly EMI</span><b>{inr(a.emi)}</b></div>
            <div><span>Monthly income</span><b>{inr(a.income)}</b></div>
            <div><span>All EMIs / income</span><b>{pct(a.emi_to_income, 0)}</b></div>
            <div><span>Bureau score</span><b>{a.bureau_score < 0 ? "New to credit" : a.bureau_score}</b></div>
            <div><span>Days past due</span><b>{a.current_dpd}</b></div>
            <div><span>Sourced via</span><b>{a.channel}</b></div>
          </div>

          <div className="action">
            <h3>{Icon.queue && <span style={{ width: 16, height: 16, display: "inline-flex" }}>{Icon.queue}</span>}Recommended: {ACTION[tier].title}</h3>
            <p>{ACTION[tier].text}</p>
          </div>

          <Card title="Why this account was flagged" sub="Each bar is a factor's push on the score. Read the top reasons out on the call.">
            <div className="card-b drivers">
              {a.drivers.map((d) => {
                const w = (Math.abs(d.impact) / maxImpact) * 50;
                const up = d.impact > 0;
                return (
                  <div className="driver" key={d.feature}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{d.text}</div>
                      <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{d.feature} · {up ? "raises" : "lowers"} risk</div>
                    </div>
                    <div className="bar" title={`${up ? "+" : ""}${d.impact.toFixed(2)} log-odds`}>
                      <span className="mid" />
                      <i style={up ? { left: "50%", width: `${w}%`, background: "var(--raise)" } : { right: "50%", width: `${w}%`, background: "var(--lower)" }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="card-f" style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <span><i style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: "var(--raise)", marginRight: 6 }} />Raises risk</span>
              <span><i style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: "var(--lower)", marginRight: 6 }} />Lowers risk</span>
              <span>SHAP values from the LightGBM model</span>
            </div>
          </Card>

          <Card title="Payment history" sub="Six instalments before the snapshot date">
            <div className="card-b hist">
              {a.history.map((h) => (
                <div className="hcell" key={h.month}>
                  <div className="m">{h.month}</div>
                  <div className="dot" style={{ background: `color-mix(in srgb, ${dpdColor(h.dpd)} 22%, transparent)`, color: "var(--ink)", border: `2px solid ${dpdColor(h.dpd)}` }}>{h.dpd}</div>
                  <div className="num" style={{ fontWeight: 600 }}>{h.paid === 0 ? "Nothing paid" : h.paid >= h.due - 1 ? "Paid in full" : `${pct(h.paid / h.due, 0)} paid`}</div>
                  <div className="m num">{inrShort(h.paid)} / {inrShort(h.due)}</div>
                </div>
              ))}
            </div>
            <div className="card-f">The number in each circle is days past due at month end.</div>
          </Card>

          <div className={`callout ${a.outcome ? "warn" : "info"}`}>
            {a.outcome ? Icon.warn : Icon.info}
            <div>
              <h3>Backtest outcome: {a.outcome ? "defaulted within 12 months" : "did not default"}</h3>
              <p>Known only in hindsight and shown here to check the model. Logistic regression gave this account {pct(a.pd_lr)}, compared with {pct(a.pd)} from LightGBM.</p>
            </div>
          </div>

          <Card title="Override the model" sub="Analysts can change the tier with a reason. Every change is logged for audit.">
            <form className="card-b form" onSubmit={save}>
              {override && <div className="callout info">{Icon.info}<div><h3>Current override: {override.from_tier} → {override.to_tier}</h3><p>{override.reason}{override.note ? `: ${override.note}` : ""} ({override.analyst}, {new Date(override.at).toLocaleString("en-IN")})</p></div></div>}
              <div className="form-row">
                <label>New tier
                  <select id="ov-tier" value={toTier} onChange={(e) => { setToTier(e.target.value as Tier); setSaved(false); }}>
                    {TIERS.filter((t) => t !== a.tier).map((t) => <option key={t}>{t}</option>)}
                  </select>
                </label>
                <label>Reason
                  <select id="ov-reason" value={reason} onChange={(e) => { setReason(e.target.value); setSaved(false); }}>
                    {REASONS.map((r) => <option key={r}>{r}</option>)}
                  </select>
                </label>
              </div>
              <label>Note
                <textarea id="ov-note" value={note} onChange={(e) => { setNote(e.target.value); setSaved(false); }} placeholder="What did you learn? E.g. salary delayed, promised to pay on 10 July" required />
              </label>
              <div className="form-row">
                <label>Your name
                  <input id="ov-analyst" value={analyst} onChange={(e) => setAnalyst(e.target.value)} placeholder="Analyst" />
                </label>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
                  <button className="btn primary" type="submit">Save override</button>
                  {saved && <span className="ok">Saved to the override log</span>}
                </div>
              </div>
            </form>
          </Card>
        </div>
      </aside>
    </>
  );
}
