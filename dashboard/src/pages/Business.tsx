import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AppData } from "../types";
import { Card, Icon, Kpi, Legend, Tip, axisProps } from "../ui";
import { inr, inrShort, num, pct } from "../format";

const STRATS = [
  { key: "Model (expected loss)", label: "RiskRadar (by ₹ at risk)", color: "var(--s1)", dash: undefined },
  { key: "Current process (most overdue first)", label: "Current process", color: "var(--s2)", dash: undefined },
  { key: "Logistic regression", label: "Logistic regression (by ₹ at risk)", color: "var(--s3)", dash: undefined },
  { key: "Model (probability only)", label: "RiskRadar (by probability only)", color: "var(--s4)", dash: undefined },
  { key: "Random calls", label: "Random calls", color: "var(--muted)", dash: "5 4" },
] as const;

export default function BusinessPage({ data }: { data: AppData }) {
  const b = data.business;
  const base = b.assumptions;
  const caps = b.curves["Random calls"].map((p) => p.capacity);

  const [capacity, setCapacity] = useState(base.call_capacity);
  const [cure, setCure] = useState(base.cure_rate_if_contacted);
  const [lgd, setLgd] = useState(base.loss_given_default);
  const [cost, setCost] = useState(base.cost_per_contact_inr);

  const scale = (cure / base.cure_rate_if_contacted) * (lgd / base.loss_given_default);

  const chart = useMemo(() => caps.map((c, i) => {
    const row: Record<string, number> = { capacity: c };
    STRATS.forEach((s) => { row[s.key] = b.curves[s.key][i].loss_prevented * scale; });
    return row;
  }), [b.curves, caps, scale]);

  const at = (key: string) => b.curves[key].find((p) => p.capacity === capacity)!;
  const calls = Math.floor(base.accounts * capacity);
  const model = at("Model (expected loss)"), rule = at("Current process (most overdue first)"), rand = at("Random calls");
  const modelPrev = model.loss_prevented * scale, rulePrev = rule.loss_prevented * scale, randPrev = rand.loss_prevented * scale;
  const net = modelPrev - calls * cost;
  const changed = capacity !== base.call_capacity || cure !== base.cure_rate_if_contacted || lgd !== base.loss_given_default || cost !== base.cost_per_contact_inr;

  return (
    <>
      <div className="kpis" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
        <Kpi label="Loss prevented with RiskRadar" value={inrShort(modelPrev)} sub={`${num(calls)} calls, ${pct(capacity, 0)} of the book`} />
        <Kpi label="With today's process" value={inrShort(rulePrev)} sub={`Random calls: ${inrShort(randPrev)}`} />
        <Kpi label="Extra loss prevented" value={<span style={{ color: "var(--good-ink)" }}>+{inrShort(modelPrev - rulePrev)}</span>} sub={`+${pct(modelPrev / rulePrev - 1, 0)} over today's process`} />
        <Kpi label="Net benefit after call costs" value={inrShort(net)} sub={`${inr(cost)} per contact · ${(modelPrev / (calls * cost)).toFixed(0)}× return`} />
      </div>

      <div className="grid g-12">
        <Card title="Assumptions" sub="Move the sliders to stress-test the case. Every figure on this page updates."
          right={changed ? <button className="btn" onClick={() => { setCapacity(base.call_capacity); setCure(base.cure_rate_if_contacted); setLgd(base.loss_given_default); setCost(base.cost_per_contact_inr); }}>Reset</button> : undefined}>
          <div className="card-b" style={{ display: "grid", gap: 18 }}>
            <div className="slider">
              <label htmlFor="cap">Call capacity <b>{pct(capacity, 0)} · {num(calls)} accounts</b></label>
              <input id="cap" type="range" min={0} max={caps.length - 1} step={1} value={caps.indexOf(capacity)} onChange={(e) => setCapacity(caps[+e.target.value])} />
            </div>
            <div className="slider">
              <label htmlFor="cure">Defaults prevented by an early call <b>{pct(cure, 0)}</b></label>
              <input id="cure" type="range" min={0.1} max={0.5} step={0.05} value={cure} onChange={(e) => setCure(+e.target.value)} />
            </div>
            <div className="slider">
              <label htmlFor="lgd">Loss given default <b>{pct(lgd, 0)}</b></label>
              <input id="lgd" type="range" min={0.4} max={0.9} step={0.05} value={lgd} onChange={(e) => setLgd(+e.target.value)} />
            </div>
            <div className="slider">
              <label htmlFor="cost">Cost per contact <b>{inr(cost)}</b></label>
              <input id="cost" type="range" min={40} max={600} step={20} value={cost} onChange={(e) => setCost(+e.target.value)} />
            </div>
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--muted)" }}>
              Loss prevented = Σ (exposure × loss given default) for contacted accounts that would have defaulted × share of defaults an early call prevents. Defaults are the actual Jul 2025 – Jun 2026 outcomes.
            </p>
          </div>
        </Card>

        <Card title="Loss prevented by call capacity" sub="RiskRadar's lead is largest when capacity is tight, which is when ranking matters most."
          right={<Legend items={STRATS.map((s) => ({ label: s.label, color: s.color, kind: s.dash ? "dash" as const : "line" as const }))} />}>
          <div className="card-b" style={{ height: 360 }}>
            <ResponsiveContainer>
              <LineChart data={chart} margin={{ left: 8, right: 16, top: 8, bottom: 16 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="capacity" type="number" domain={[0, 0.5]} ticks={[0, 0.1, 0.2, 0.3, 0.4, 0.5]} {...axisProps} tickFormatter={(v) => pct(v, 0)}
                  label={{ value: "Share of book contacted", position: "insideBottom", offset: -10, fill: "var(--muted)", fontSize: 11.5 }} />
                <YAxis {...axisProps} tickFormatter={inrShort} width={64} />
                <ReferenceLine x={capacity} stroke="var(--axis)" strokeDasharray="3 3" label={{ value: "Selected", position: "insideTopLeft", fill: "var(--muted)", fontSize: 11 }} />
                <Tooltip cursor={{ stroke: "var(--axis)" }} content={({ active, payload }) => active && payload?.length ? (
                  <Tip title={`Contacting ${pct(payload[0].payload.capacity, 0)} of the book`} rows={STRATS.map((s) => ({ label: s.label, value: inrShort(payload[0].payload[s.key]), color: s.color }))} />) : null} />
                {[...STRATS].reverse().map((s) => (
                  <Line isAnimationActive={false} key={s.key} dataKey={s.key} stroke={s.color} strokeWidth={s.key === "Model (expected loss)" ? 2.5 : 2} strokeDasharray={s.dash}
                    dot={s.dash ? false : { r: 3.5, fill: s.color, stroke: "var(--surface)", strokeWidth: 2 }} activeDot={{ r: 5 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="callout info">
        {Icon.info}
        <div>
          <h3>Why the model reaches fewer defaulters but saves more money</h3>
          <p>At {pct(capacity, 0)} capacity, today's process reaches {pct(rule.defaulters_reached, 0)} of eventual defaulters and RiskRadar reaches {pct(model.defaulters_reached, 0)}.
            Yet RiskRadar prevents {inrShort(modelPrev - rulePrev)} more, because it targets the accounts where a default costs the most: large exposures with rising risk, many of them not yet overdue.
            Today's process spends its calls on small accounts that are already late. Ranking by probability alone reaches the most defaulters ({pct(at("Model (probability only)").defaulters_reached, 0)}) but prevents less money.</p>
        </div>
      </div>
    </>
  );
}
