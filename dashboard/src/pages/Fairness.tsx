import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AppData, FairRow } from "../types";
import { Card, Icon, Legend, Tip, axisProps } from "../ui";
import { inrShort, num, pct } from "../format";

type Row = FairRow & { tpr_pd_only: number; avg_exposure: number };

function GroupCard({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <Card title={title} sub="Share of eventual defaulters each group gets a call for, under two ranking rules"
      right={<Legend items={[{ label: "Ranked by expected loss (₹)", color: "var(--s1)" }, { label: "Ranked by probability only", color: "var(--s2)" }]} />}>
      <div className="card-b" style={{ height: 240 }}>
        <ResponsiveContainer>
          <BarChart data={rows} margin={{ left: 0, right: 8, top: 8, bottom: 0 }} barGap={2} barCategoryGap="28%">
            <CartesianGrid vertical={false} />
            <XAxis dataKey="group" {...axisProps} />
            <YAxis {...axisProps} domain={[0, 1]} tickFormatter={(v) => pct(v, 0)} width={44} />
            <Tooltip cursor={{ fill: "var(--surface-2)" }} content={({ active, payload }) => active && payload?.length ? (
              <Tip title={payload[0].payload.group} rows={[
                { label: "Caught, by expected loss", value: pct(payload[0].payload.tpr), color: "var(--s1)" },
                { label: "Caught, by probability", value: pct(payload[0].payload.tpr_pd_only), color: "var(--s2)" },
                { label: "Actual default rate", value: pct(payload[0].payload.actual_rate) },
                { label: "Avg exposure", value: inrShort(payload[0].payload.avg_exposure) },
              ]} />) : null} />
            <Bar isAnimationActive={false} dataKey="tpr" fill="var(--s1)" radius={[4, 4, 0, 0]} maxBarSize={40} />
            <Bar isAnimationActive={false} dataKey="tpr_pd_only" fill="var(--s2)" radius={[4, 4, 0, 0]} maxBarSize={40} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="table-wrap" style={{ padding: "0 20px 16px" }}>
        <table>
          <thead><tr><th>Group</th><th className="r">Accounts</th><th className="r">Actual default</th><th className="r">Predicted</th><th className="r">Calibration</th><th className="r">AUC</th><th className="r">Flag rate</th><th className="r">Good accounts flagged</th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const off = r.calibration_ratio !== null && Math.abs(r.calibration_ratio - 1) > 0.05;
              return (
                <tr key={r.group}>
                  <td><b>{r.group}</b></td>
                  <td className="r num">{num(r.accounts)}</td>
                  <td className="r num">{pct(r.actual_rate)}</td>
                  <td className="r num">{pct(r.avg_pd)}</td>
                  <td className="r num">{off ? <span className="chip bad">{Icon.warn}{r.calibration_ratio?.toFixed(2)}</span> : <span className="chip good">{Icon.check}{r.calibration_ratio?.toFixed(2)}</span>}</td>
                  <td className="r num">{r.auc.toFixed(3)}</td>
                  <td className="r num">{pct(r.flag_rate)}</td>
                  <td className="r num">{pct(r.fpr)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default function FairnessPage({ data }: { data: AppData }) {
  const f = data.fairness;
  const g = f.gender as Row[];
  const a = f.age_band as Row[];
  const fem = g.find((r) => r.group === "Female")!, male = g.find((r) => r.group === "Male")!;
  const gapEl = male.tpr - fem.tpr, gapPd = male.tpr_pd_only - fem.tpr_pd_only;
  const older = a.find((r) => r.group === "46+")!;

  return (
    <>
      <div className="callout warn">
        {Icon.warn}
        <div>
          <h3>Finding: women who later default are less likely to get an early call ({pct(fem.tpr)} vs {pct(male.tpr)})</h3>
          <p>The model itself is fair on accuracy: both groups have near-identical default rates ({pct(fem.actual_rate)} vs {pct(male.actual_rate)}), calibration and AUC.
            The gap comes mostly from the business rule of ranking by rupees at risk. Ranked by probability alone, the gap falls from {(gapEl * 100).toFixed(1)} to {(gapPd * 100).toFixed(1)} points.</p>
        </div>
      </div>

      <div className="callout info">
        {Icon.info}
        <div>
          <h3>Recommendation</h3>
          <p>Keep ranking by expected loss, which recovers the most money, but reserve 10% of daily calls for the highest-probability accounts regardless of loan size.
            Track the gap monthly and escalate to the risk committee if it passes 5 points. The over-46 group is also slightly under-predicted (calibration {older.calibration_ratio?.toFixed(2)}), so watch it at the next model refresh.</p>
        </div>
      </div>

      <GroupCard title="By gender" rows={g} />
      <GroupCard title="By age band" rows={a} />

      <Card title="How this audit works">
        <div className="card-b" style={{ color: "var(--ink-2)", display: "grid", gap: 8, maxWidth: "80ch" }}>
          <p style={{ margin: 0 }}><b style={{ color: "var(--ink)" }}>Policy tested.</b> {f.policy}. {f.note}</p>
          <p style={{ margin: 0 }}><b style={{ color: "var(--ink)" }}>Equal opportunity.</b> Of the borrowers who go on to default, what share does each group get an early call for? A call is help (a restructuring offer, a payment plan), so missing someone is the harm to watch.</p>
          <p style={{ margin: 0 }}><b style={{ color: "var(--ink)" }}>Calibration.</b> Predicted ÷ actual default rate per group. Values between 0.95 and 1.05 are marked as fine.</p>
          <p style={{ margin: 0 }}><b style={{ color: "var(--ink)" }}>Good accounts flagged.</b> Share of borrowers who repay but still get a call. High values mean unnecessary contact.</p>
        </div>
      </Card>
    </>
  );
}
