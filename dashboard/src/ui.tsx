import type { ReactNode } from "react";
import type { Tier } from "./types";

/* ---------- Icons (inline, stroke-based) ---------- */
const P = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
export const Icon = {
  overview: <svg viewBox="0 0 24 24" {...P}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></svg>,
  queue: <svg viewBox="0 0 24 24" {...P}><path d="M5 4h2l2 5-2.5 1.5a11 11 0 0 0 5 5L13 13l5 2v2a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" /></svg>,
  model: <svg viewBox="0 0 24 24" {...P}><path d="M3 3v18h18" /><path d="M7 15c3-1 4-8 7-8s3 5 6 5" /></svg>,
  fairness: <svg viewBox="0 0 24 24" {...P}><path d="M12 3v18M5 21h14M6 7h12M6 7l-3 6a3 3 0 0 0 6 0zM18 7l-3 6a3 3 0 0 0 6 0z" /></svg>,
  business: <svg viewBox="0 0 24 24" {...P}><path d="M7 5h10M7 9h10M7 5c5 0 5 8 0 8l8 6" /></svg>,
  audit: <svg viewBox="0 0 24 24" {...P}><path d="M9 4h6l1 2h3v15H5V6h3z" /><path d="M9 12l2 2 4-4" /></svg>,
  data: <svg viewBox="0 0 24 24" {...P}><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></svg>,
  doc: <svg viewBox="0 0 24 24" {...P}><path d="M14 3H6v18h12V7z" /><path d="M14 3v4h4M9 12h6M9 16h6" /></svg>,
  sun: <svg viewBox="0 0 24 24" {...P}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>,
  moon: <svg viewBox="0 0 24 24" {...P}><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" /></svg>,
  search: <svg viewBox="0 0 24 24" {...P}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>,
  close: <svg viewBox="0 0 24 24" {...P}><path d="M6 6l12 12M18 6L6 18" /></svg>,
  download: <svg viewBox="0 0 24 24" {...P}><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>,
  warn: <svg viewBox="0 0 24 24" {...P}><path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18h.01" /></svg>,
  info: <svg viewBox="0 0 24 24" {...P}><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5h.01" /></svg>,
  check: <svg viewBox="0 0 24 24" {...P}><path d="M5 12l5 5 9-10" /></svg>,
  up: <svg viewBox="0 0 24 24" {...P}><path d="M12 19V5M6 11l6-6 6 6" /></svg>,
  dot: <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="5" /></svg>,
  triangle: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 4l9 16H3z" /></svg>,
  diamond: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l9 9-9 9-9-9z" /></svg>,
  square: <svg viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2" /></svg>,
};

export function Logo() {
  return (
    <svg className="brand-mark" viewBox="0 0 40 40" aria-hidden="true">
      <rect width="40" height="40" rx="10" fill="#2a78d6" />
      <circle cx="20" cy="20" r="12" fill="none" stroke="#fff" strokeOpacity=".35" strokeWidth="1.5" />
      <circle cx="20" cy="20" r="6.5" fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth="1.5" />
      <path d="M20 20L29.5 12.5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="26.5" cy="24.5" r="2.4" fill="#7fe0b5" />
    </svg>
  );
}

/* ---------- Tier chip: color + icon + label, never color alone ---------- */
const tierIcon: Record<Tier, ReactNode> = { Low: Icon.dot, Medium: Icon.square, High: Icon.triangle, Critical: Icon.diamond };
export const TIER_COLOR: Record<Tier, string> = { Low: "var(--good)", Medium: "var(--warning)", High: "var(--serious)", Critical: "var(--critical)" };
export const TIERS: Tier[] = ["Low", "Medium", "High", "Critical"];

export function TierChip({ tier }: { tier: Tier }) {
  return <span className={`chip ${tier}`}>{tierIcon[tier]}{tier}</span>;
}

export function Card({ title, sub, right, children, foot, className = "" }: {
  title?: ReactNode; sub?: ReactNode; right?: ReactNode; children: ReactNode; foot?: ReactNode; className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || right) && (
        <div className="card-h">
          <div>{title && <h2>{title}</h2>}{sub && <p>{sub}</p>}</div>
          {right}
        </div>
      )}
      {children}
      {foot && <div className="card-f">{foot}</div>}
    </section>
  );
}

export function Kpi({ label, value, sub }: { label: ReactNode; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="card kpi">
      <div className="label">{label}</div>
      <div className="value num">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

/* ---------- Chart tooltip ---------- */
export interface TipRow { label: string; value: string; color?: string }
export function Tip({ title, rows }: { title: ReactNode; rows: TipRow[] }) {
  return (
    <div className="tip">
      <div className="tip-title">{title}</div>
      {rows.map((r) => (
        <div className="tip-row" key={r.label}>
          <span>{r.color && <i style={{ background: r.color }} />}{r.label}</span>
          <b>{r.value}</b>
        </div>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; kind?: "box" | "line" | "dash" }[] }) {
  return (
    <div className="legend">
      {items.map((i) => (
        <span key={i.label}>
          <i className={i.kind === "line" ? "line" : i.kind === "dash" ? "dash" : ""} style={i.kind === "dash" ? undefined : { background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

export const axisProps = {
  tick: { fill: "var(--muted)", fontSize: 11.5 },
  axisLine: { stroke: "var(--axis)" },
  tickLine: false,
} as const;
