import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AppData, Tier } from "../types";
import { Card, Kpi, Legend, Tip, TierChip, TIER_COLOR, axisProps } from "../ui";
import { inrShort, num, pct } from "../format";

export default function Overview({ data, go, openAccount }: {
  data: AppData; go: (v: "queue" | "business") => void; openAccount: (loanId: string) => void;
}) {
  const s = data.summary;
  const p = data.portfolio;
  const h = data.business.headline;

  const tiers = p.tiers.map((t) => ({ ...t, share: t.accounts / s.accounts }));
  const products = [...p.products].sort((a, b) => b.expected_loss - a.expected_loss);
  const hist = p.pd_histogram.filter((b) => b.accounts > 0).map((b) => ({
    label: `${Math.round(b.from * 100)}–${Math.round(b.to * 100)}%`, from: b.from,
    repaid: b.accounts - b.defaults, defaulted: b.defaults,
  }));
  const cohorts = p.cohorts.map((c) => ({ ...c, name: c.name.replace(/(\d{4})Q(\d)/, "Q$2 $1") }));

  return (
    <>
      <section className="hero">
        <div style={{ position: "relative", zIndex: 1 }}>
          <div className="eyebrow">Business impact · backtest on Jul 2025 – Jun 2026 outcomes</div>
          <h2>Calling in RiskRadar order prevents <b>{inrShort(h.uplift_vs_rule)}</b> more loss per cycle than today's “most overdue first” process.</h2>
          <p>Same team, same {num(h.calls)} calls. The model ranks accounts by rupees at risk, so agents reach the expensive defaults while they can still be cured.</p>
          <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
            <button className="btn primary" onClick={() => go("queue")}>Open today's call queue</button>
            <button className="btn" style={{ background: "rgba(255,255,255,.08)", color: "#fff", borderColor: "rgba(255,255,255,.2)" }} onClick={() => go("business")}>See the business case</button>
          </div>
        </div>
        <div className="hero-stats">
          <div className="hero-stat"><span>More loss prevented</span><b>+{pct(h.uplift_vs_rule_pct, 0)}</b></div>
          <div className="hero-stat"><span>Loss prevented per cycle</span><b>{inrShort(h.model_loss_prevented)}</b></div>
          <div className="hero-stat"><span>Model accuracy (AUC)</span><b>{s.auc.toFixed(3)}</b></div>
          <div className="hero-stat"><span>Calls per cycle</span><b>{num(h.calls)}</b></div>
        </div>
      </section>

      <div className="kpis">
        <Kpi label="Live accounts" value={num(s.accounts)} sub={`${num(s.currently_delinquent)} overdue this month`} />
        <Kpi label="Book exposure" value={inrShort(s.exposure)} sub="Outstanding principal + arrears" />
        <Kpi label="Expected loss, 12 months" value={inrShort(s.expected_loss)} sub={`${pct(s.expected_loss / s.exposure)} of exposure`} />
        <Kpi label="Default rate (backtest)" value={pct(s.default_rate)} sub="Reached 90+ days past due" />
        <Kpi label="High or Critical risk" value={num(s.high_or_critical)} sub={`${pct(s.high_or_critical / s.accounts)} of accounts`} />
        <Kpi label="Handed to recoveries" value={num(s.handed_to_recoveries)} sub={`Already 90+ DPD · ${inrShort(s.handed_to_recoveries_arrears)} overdue`} />
      </div>

      <Card title="Risk tiers" sub="Accounts by predicted 12-month default probability. Predicted and actual rates match closely, so the tiers can be trusted.">
          <div className="card-b">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Tier</th><th className="r">Accounts</th><th style={{ minWidth: 130 }}>Share of book</th><th className="r">Exposure</th><th className="r">Predicted</th><th className="r">Actual</th><th className="r">Expected loss</th></tr>
                </thead>
                <tbody>
                  {tiers.map((t, i) => (
                    <tr key={t.name}>
                      <td>
                        <TierChip tier={t.name as Tier} />
                        <div className="num" style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 3 }}>PD {["< 5%", "5–15%", "15–35%", "≥ 35%"][i]}</div>
                      </td>
                      <td className="r num">{num(t.accounts)}</td>
                      <td>
                        <div className="pdbar"><div className="track"><div className="fill" style={{ width: `${t.share * 100}%`, background: TIER_COLOR[t.name as Tier] }} /></div><b>{pct(t.share, 0)}</b></div>
                      </td>
                      <td className="r num">{inrShort(t.exposure)}</td>
                      <td className="r num">{pct(t.avg_pd)}</td>
                      <td className="r num">{pct(t.actual_rate)}</td>
                      <td className="r num"><b>{inrShort(t.expected_loss)}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="card-f">Critical accounts are {pct(tiers[3].share)} of the book but carry {pct(tiers[3].expected_loss / s.expected_loss, 0)} of expected loss.</div>
        </Card>

      <div className="grid g-3">
        <Card title="Expected loss by product" sub="Probability × exposure × loss given default, over 12 months">
          <div className="card-b" style={{ height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={products} layout="vertical" margin={{ left: 0, right: 64, top: 4, bottom: 4 }} barCategoryGap={8}>
                <CartesianGrid horizontal={false} />
                <XAxis type="number" {...axisProps} tickFormatter={inrShort} />
                <YAxis type="category" dataKey="name" {...axisProps} width={118} />
                <Tooltip cursor={{ fill: "var(--surface-2)" }} content={({ active, payload }) => active && payload?.length ? (
                  <Tip title={payload[0].payload.name} rows={[
                    { label: "Expected loss", value: inrShort(payload[0].payload.expected_loss), color: "var(--s1)" },
                    { label: "Accounts", value: num(payload[0].payload.accounts) },
                    { label: "Avg predicted PD", value: pct(payload[0].payload.avg_pd) },
                    { label: "Actual default rate", value: pct(payload[0].payload.actual_rate) },
                  ]} />) : null} />
                <Bar isAnimationActive={false} dataKey="expected_loss" fill="var(--s1)" radius={[0, 4, 4, 0]} maxBarSize={22}
                  label={(p: { x: number; y: number; width: number; height: number; value: number }) => (
                    <text x={p.x + p.width + 6} y={p.y + p.height / 2} dy={4} fill="var(--ink-2)" fontSize={11.5}>{inrShort(p.value)}</text>
                  )} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Where defaulters sit on the score" sub="Accounts by predicted probability. Defaults pile up on the right, which is what a useful score looks like."
          right={<Legend items={[{ label: "Repaid", color: "var(--s1)" }, { label: "Defaulted", color: "var(--s2)" }]} />}>
          <div className="card-b" style={{ height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={hist} margin={{ left: 0, right: 8, top: 8, bottom: 0 }} barCategoryGap={1}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" {...axisProps} interval={9} />
                <YAxis {...axisProps} tickFormatter={(v) => num(v)} width={52} />
                <Tooltip cursor={{ fill: "var(--surface-2)" }} content={({ active, payload }) => active && payload?.length ? (
                  <Tip title={`Predicted PD ${payload[0].payload.label}`} rows={[
                    { label: "Repaid", value: num(payload[0].payload.repaid), color: "var(--s1)" },
                    { label: "Defaulted", value: num(payload[0].payload.defaulted), color: "var(--s2)" },
                    { label: "Default rate", value: pct(payload[0].payload.defaulted / (payload[0].payload.repaid + payload[0].payload.defaulted)) },
                  ]} />) : null} />
                <Bar isAnimationActive={false} dataKey="repaid" stackId="a" fill="var(--s1)" stroke="var(--surface)" strokeWidth={1} />
                <Bar isAnimationActive={false} dataKey="defaulted" stackId="a" fill="var(--s2)" stroke="var(--surface)" strokeWidth={1} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="card-f">Accounts above 60% predicted PD are grouped into the last bar.</div>
        </Card>

        <Card title="Predicted vs actual default rate by disbursal quarter" sub="Checks that the model holds up across loan vintages, not just on average."
          right={<Legend items={[{ label: "Predicted", color: "var(--s1)", kind: "line" }, { label: "Actual", color: "var(--s2)", kind: "line" }]} />}>
          <div className="card-b" style={{ height: 280 }}>
            <ResponsiveContainer>
              <LineChart data={cohorts} margin={{ left: 0, right: 16, top: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="name" {...axisProps} />
                <YAxis {...axisProps} tickFormatter={(v) => pct(v, 0)} width={44} domain={[0, "auto"]} />
                <Tooltip cursor={{ stroke: "var(--axis)" }} content={({ active, payload }) => active && payload?.length ? (
                  <Tip title={payload[0].payload.name} rows={[
                    { label: "Predicted", value: pct(payload[0].payload.avg_pd), color: "var(--s1)" },
                    { label: "Actual", value: pct(payload[0].payload.actual_rate), color: "var(--s2)" },
                    { label: "Accounts", value: num(payload[0].payload.accounts) },
                  ]} />) : null} />
                <Line isAnimationActive={false} dataKey="avg_pd" stroke="var(--s1)" strokeWidth={2} dot={{ r: 4, fill: "var(--s1)", stroke: "var(--surface)", strokeWidth: 2 }} activeDot={{ r: 6 }} />
                <Line isAnimationActive={false} dataKey="actual_rate" stroke="var(--s2)" strokeWidth={2} dot={{ r: 4, fill: "var(--s2)", stroke: "var(--surface)", strokeWidth: 2 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card title="Call first" sub="The five accounts with the most rupees at risk this cycle" right={<button className="btn" onClick={() => go("queue")}>Full queue</button>}>
        <div className="card-b">
          <div className="table-wrap">
            <table>
              <thead><tr><th>#</th><th>Loan</th><th>Product</th><th>Tier</th><th className="r">PD</th><th className="r">Exposure</th><th className="r">Expected loss</th><th>Main reason</th></tr></thead>
              <tbody>
                {data.queue.slice(0, 5).map((a) => (
                  <tr key={a.loan_id} className="click" onClick={() => openAccount(a.loan_id)}>
                    <td className="num">{a.rank}</td>
                    <td className="mono">{a.loan_id}</td>
                    <td>{a.product}</td>
                    <td><TierChip tier={a.tier} /></td>
                    <td className="r num">{pct(a.pd)}</td>
                    <td className="r num">{inrShort(a.ead)}</td>
                    <td className="r num"><b>{inrShort(a.expected_loss)}</b></td>
                    <td style={{ color: "var(--ink-2)" }}>{a.reasons[0]?.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>
    </>
  );
}
