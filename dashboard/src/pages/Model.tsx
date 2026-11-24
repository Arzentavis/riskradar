import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from "recharts";
import type { AppData } from "../types";
import { Card, Icon, Legend, Tip, axisProps } from "../ui";
import { num, pct } from "../format";

const SERIES = [
  { key: "lightgbm", label: "LightGBM", color: "var(--s1)" },
  { key: "logistic_regression", label: "Logistic regression", color: "var(--s2)" },
  { key: "rule_based", label: "Current process (most overdue first)", color: "var(--s3)" },
] as const;

export default function ModelPage({ data }: { data: AppData }) {
  const m = data.model;

  // Merge the three ROC curves onto one FPR grid for a shared crosshair tooltip
  const grid = Array.from({ length: 51 }, (_, i) => i / 50);
  const interp = (pts: { fpr: number; tpr: number }[], x: number) => {
    for (let i = 1; i < pts.length; i++) {
      if (pts[i].fpr >= x) {
        const a = pts[i - 1], b = pts[i];
        const t = b.fpr === a.fpr ? 0 : (x - a.fpr) / (b.fpr - a.fpr);
        return a.tpr + t * (b.tpr - a.tpr);
      }
    }
    return 1;
  };
  const roc = grid.map((x) => ({
    fpr: x,
    lightgbm: interp(m.roc.lightgbm, x),
    logistic_regression: interp(m.roc.logistic_regression, x),
    rule_based: interp(m.roc.rule_based, x),
  }));
  const cal = m.calibration.map((c, i) => ({ ...c, bin: i + 1 }));
  const imp = m.importance.slice(0, 12);
  const gbm = m.metrics.lightgbm, lr = m.metrics.logistic_regression, rule = m.metrics.rule_based;

  return (
    <>
      <div className="callout info">
        {Icon.info}
        <div>
          <h3>Finding: the simple model is as accurate as the complex one</h3>
          <p>LightGBM and logistic regression score almost the same (AUC {gbm.auc.toFixed(3)} vs {lr.auc.toFixed(3)}), and both clearly beat today's process ({rule.auc.toFixed(3)}).
            RiskRadar ranks with LightGBM because it handles missing data natively and gives account-level reason codes, and keeps logistic regression running alongside as a transparent benchmark.
            If the two ever drift apart on new data, that gap is the early signal to review the model. {m.validation}.</p>
        </div>
      </div>

      <Card title="Head-to-head" sub={`Each approach scored all ${num(data.summary.accounts)} accounts. Higher is better, except Brier score.`}>
        <div className="card-b table-wrap">
          <table>
            <thead>
              <tr><th>Approach</th><th className="r">AUC</th><th className="r">Gini</th><th className="r">KS</th><th className="r">PR-AUC</th><th className="r">Brier</th><th className="r">Defaulters in top 20%</th></tr>
            </thead>
            <tbody>
              {SERIES.map((s) => {
                const x = m.metrics[s.key];
                return (
                  <tr key={s.key}>
                    <td><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: s.color, marginRight: 8 }} />{s.label}</td>
                    <td className="r num"><b>{x.auc.toFixed(3)}</b></td>
                    <td className="r num">{x.gini.toFixed(3)}</td>
                    <td className="r num">{x.ks.toFixed(3)}</td>
                    <td className="r num">{x.pr_auc.toFixed(3)}</td>
                    <td className="r num">{x.brier === null ? "n/a" : x.brier.toFixed(4)}</td>
                    <td className="r num">{pct(x.capture_at_capacity)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="card-f">AUC: chance a random defaulter scores higher than a random non-defaulter. KS: widest gap between the two groups' score distributions. Brier: error of the probabilities themselves (the current process gives a ranking, not probabilities).</div>
      </Card>

      <div className="grid g-2">
        <Card title="ROC curve" sub="How many defaulters are caught (y) for each share of good accounts flagged (x)"
          right={<Legend items={[...SERIES.map((s) => ({ label: s.label.replace(" (most overdue first)", ""), color: s.color, kind: "line" as const })), { label: "Chance", color: "var(--muted)", kind: "dash" as const }]} />}>
          <div className="card-b" style={{ height: 320 }}>
            <ResponsiveContainer>
              <LineChart data={roc} margin={{ left: 0, right: 16, top: 8, bottom: 16 }}>
                <CartesianGrid />
                <XAxis dataKey="fpr" type="number" domain={[0, 1]} {...axisProps} tickFormatter={(v) => pct(v, 0)} ticks={[0, 0.2, 0.4, 0.6, 0.8, 1]}
                  label={{ value: "False positive rate", position: "insideBottom", offset: -10, fill: "var(--muted)", fontSize: 11.5 }} />
                <YAxis domain={[0, 1]} {...axisProps} tickFormatter={(v) => pct(v, 0)} width={44} ticks={[0, 0.2, 0.4, 0.6, 0.8, 1]} />
                <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} stroke="var(--muted)" strokeDasharray="4 4" />
                <Tooltip cursor={{ stroke: "var(--axis)" }} content={({ active, payload }) => active && payload?.length ? (
                  <Tip title={`At ${pct(payload[0].payload.fpr, 0)} of good accounts flagged`} rows={SERIES.map((s) => ({ label: s.label.replace(" (most overdue first)", ""), value: `${pct(payload[0].payload[s.key], 0)} caught`, color: s.color }))} />) : null} />
                {SERIES.map((s) => <Line isAnimationActive={false} key={s.key} dataKey={s.key} stroke={s.color} strokeWidth={2} dot={false} activeDot={{ r: 5, stroke: "var(--surface)", strokeWidth: 2 }} />)}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Calibration" sub="Predicted vs actual default rate in ten equal-sized groups. Points on the diagonal mean the probabilities can be used as-is for loss forecasting."
          right={<Legend items={[{ label: "LightGBM", color: "var(--s1)", kind: "line" }, { label: "Perfect", color: "var(--muted)", kind: "dash" }]} />}>
          <div className="card-b" style={{ height: 320 }}>
            <ResponsiveContainer>
              <LineChart data={cal} margin={{ left: 0, right: 16, top: 8, bottom: 16 }}>
                <CartesianGrid />
                <XAxis dataKey="predicted" type="number" domain={[0, 0.55]} {...axisProps} tickFormatter={(v) => pct(v, 0)} ticks={[0, 0.1, 0.2, 0.3, 0.4, 0.5]}
                  label={{ value: "Predicted default rate", position: "insideBottom", offset: -10, fill: "var(--muted)", fontSize: 11.5 }} />
                <YAxis domain={[0, 0.55]} {...axisProps} tickFormatter={(v) => pct(v, 0)} width={44} ticks={[0, 0.1, 0.2, 0.3, 0.4, 0.5]} />
                <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 0.55, y: 0.55 }]} stroke="var(--muted)" strokeDasharray="4 4" />
                <Tooltip cursor={{ stroke: "var(--axis)" }} content={({ active, payload }) => active && payload?.length ? (
                  <Tip title={`Group ${payload[0].payload.bin} of 10`} rows={[
                    { label: "Predicted", value: pct(payload[0].payload.predicted), color: "var(--s1)" },
                    { label: "Actual", value: pct(payload[0].payload.actual) },
                    { label: "Accounts", value: num(payload[0].payload.accounts) },
                  ]} />) : null} />
                <Line isAnimationActive={false} dataKey="actual" stroke="var(--s1)" strokeWidth={2} dot={{ r: 4.5, fill: "var(--s1)", stroke: "var(--surface)", strokeWidth: 2 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid g-2">
        <Card title="What drives the score" sub="Average absolute SHAP impact across 6,000 accounts. Bureau history and recent payment behaviour dominate.">
          <div className="card-b" style={{ height: 380 }}>
            <ResponsiveContainer>
              <BarChart data={imp} layout="vertical" margin={{ left: 8, right: 40, top: 0, bottom: 0 }} barCategoryGap={6}>
                <CartesianGrid horizontal={false} />
                <XAxis type="number" {...axisProps} tickFormatter={(v) => v.toFixed(2)} />
                <YAxis type="category" dataKey="feature" {...axisProps} width={190} />
                <Tooltip cursor={{ fill: "var(--surface-2)" }} content={({ active, payload }) => active && payload?.length ? (
                  <Tip title={payload[0].payload.feature} rows={[{ label: "Mean |SHAP|", value: payload[0].payload.mean_abs_shap.toFixed(3), color: "var(--s1)" }]} />) : null} />
                <Bar isAnimationActive={false} dataKey="mean_abs_shap" fill="var(--s1)" radius={[0, 4, 4, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Lift by decile" sub="Accounts split into ten equal groups by score. Decile 1 is the riskiest.">
          <div className="card-b table-wrap">
            <table>
              <thead><tr><th>Decile</th><th className="r">Accounts</th><th className="r">Defaults</th><th className="r">Default rate</th><th className="r">Lift</th><th style={{ minWidth: 120 }}>Captured so far</th></tr></thead>
              <tbody>
                {m.deciles.map((d) => (
                  <tr key={d.decile}>
                    <td className="num">{d.decile}</td>
                    <td className="r num">{num(d.accounts)}</td>
                    <td className="r num">{num(d.defaults)}</td>
                    <td className="r num">{pct(d.actual_rate)}</td>
                    <td className="r num"><b>{d.lift.toFixed(1)}×</b></td>
                    <td><div className="pdbar"><div className="track"><div className="fill" style={{ width: `${d.cum_capture * 100}%` }} /></div><b>{pct(d.cum_capture, 0)}</b></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card-f">The riskiest 10% of accounts default {m.deciles[0].lift.toFixed(1)}× as often as average and hold {pct(m.deciles[0].cum_capture, 0)} of all defaults.</div>
        </Card>
      </div>
    </>
  );
}
