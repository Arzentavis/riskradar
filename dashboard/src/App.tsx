import { useCallback, useEffect, useMemo, useState } from "react";
import type { AppData, Override } from "./types";
import { Icon, Logo } from "./ui";
import { inrShort, num } from "./format";
import Overview from "./pages/Overview";
import Queue from "./pages/Queue";
import ModelPage from "./pages/Model";
import FairnessPage from "./pages/Fairness";
import BusinessPage from "./pages/Business";
import AuditPage from "./pages/Audit";
import DataPage from "./pages/DataQuality";

type View = "overview" | "queue" | "model" | "fairness" | "business" | "audit" | "data";

const VIEWS: { id: View; label: string; icon: JSX.Element; group: string; title: string; sub: string }[] = [
  { id: "overview", label: "Portfolio", icon: Icon.overview, group: "Operate", title: "Portfolio risk", sub: "Where the risk sits in the live book today" },
  { id: "queue", label: "Call queue", icon: Icon.queue, group: "Operate", title: "Today's call queue", sub: "Accounts ranked by rupees at risk, with the reasons to raise on the call" },
  { id: "audit", label: "Override log", icon: Icon.audit, group: "Operate", title: "Override log", sub: "Every analyst change to a model decision, with its reason" },
  { id: "business", label: "Business case", icon: Icon.business, group: "Prove", title: "Business case", sub: "Loss prevented by calling in model order instead of today's order" },
  { id: "model", label: "Model performance", icon: Icon.model, group: "Prove", title: "Model performance", sub: "How well the score separates future defaulters, validated out-of-fold" },
  { id: "fairness", label: "Fairness audit", icon: Icon.fairness, group: "Govern", title: "Fairness audit", sub: "Does the model treat groups consistently? Gender and age are not inputs" },
  { id: "data", label: "Data quality", icon: Icon.data, group: "Govern", title: "Data quality", sub: "Checks run in SQL before any feature is built" },
];

const FILES = ["summary", "portfolio", "queue", "model", "fairness", "business", "data_quality"] as const;
const OVERRIDE_KEY = "riskradar.overrides.v1";

function readOverrides(): Override[] {
  try {
    const raw = localStorage.getItem(OVERRIDE_KEY);
    return raw ? (JSON.parse(raw) as Override[]) : [];
  } catch {
    return [];
  }
}

function viewFromHash(): View {
  const h = location.hash.replace("#", "") as View;
  return VIEWS.some((v) => v.id === h) ? h : "overview";
}

export default function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>(viewFromHash);
  const [overrides, setOverrides] = useState<Override[]>(readOverrides);
  const [openLoan, setOpenLoan] = useState<string | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    document.documentElement.getAttribute("data-theme") === "dark" ||
    (!document.documentElement.getAttribute("data-theme") && matchMedia("(prefers-color-scheme: dark)").matches)
      ? "dark" : "light");

  useEffect(() => {
    Promise.all(FILES.map((f) => fetch(`./data/${f}.json`).then((r) => {
      if (!r.ok) throw new Error(`Could not load data/${f}.json (HTTP ${r.status}). Run the pipeline first: python run_pipeline.py`);
      return r.json();
    })))
      .then(([summary, portfolio, queue, model, fairness, business, dq]) =>
        setData({ summary, portfolio, queue, model, fairness, business, dq }))
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    const onHash = () => setView(viewFromHash());
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  }, []);

  const go = useCallback((v: View) => {
    setView(v);
    if (location.hash !== `#${v}`) location.hash = v;
    scrollTo({ top: 0 });
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    setTheme(next);
  };

  const addOverride = useCallback((o: Override) => {
    setOverrides((prev) => {
      const next = [o, ...prev];
      try { localStorage.setItem(OVERRIDE_KEY, JSON.stringify(next)); } catch { /* storage unavailable: keep in memory */ }
      return next;
    });
  }, []);

  const clearOverrides = useCallback(() => {
    setOverrides([]);
    try { localStorage.removeItem(OVERRIDE_KEY); } catch { /* ignore */ }
  }, []);

  const current = VIEWS.find((v) => v.id === view)!;
  const overrideMap = useMemo(() => new Map(overrides.map((o) => [o.loan_id, o])), [overrides]);

  if (error) {
    return <div className="loading"><div className="empty">{Icon.warn}<h3>Data not found</h3><p>{error}</p></div></div>;
  }
  if (!data) {
    return <div className="loading"><div style={{ display: "grid", placeItems: "center", gap: 12 }}><div className="radar" /><span>Scanning the portfolio…</span></div></div>;
  }

  let group = "";
  return (
    <div className="shell">
      <aside className="rail">
        <div className="brand">
          <Logo />
          <div>
            <div className="brand-name">RiskRadar</div>
            <div className="brand-sub">Collections early warning</div>
          </div>
        </div>
        <nav className="nav" aria-label="Sections">
          {VIEWS.map((v) => {
            const header = v.group !== group ? <div className="nav-label" key={`g-${v.group}`}>{v.group}</div> : null;
            group = v.group;
            return [
              header,
              <button key={v.id} aria-current={view === v.id ? "page" : undefined} onClick={() => go(v.id)}>
                {v.icon}{v.label}
                {v.id === "audit" && overrides.length > 0 && <span className="count">{overrides.length}</span>}
                {v.id === "queue" && <span className="count">{num(data.summary.calls)}</span>}
              </button>,
            ];
          })}
        </nav>
        <div className="rail-foot">
          Synthetic portfolio of {num(data.summary.accounts)} live retail loans.<br />
          Built by Arka Prabha Bauri.
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="crumbs">
            <h1>{current.title}</h1>
            <p>{current.sub}</p>
          </div>
          <div className="top-actions">
            <span className="asof"><i />Snapshot {new Date(data.summary.as_of).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} · {inrShort(data.summary.exposure)} book</span>
            <button className="icon-btn" onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>
              {theme === "dark" ? Icon.sun : Icon.moon}
            </button>
          </div>
        </header>

        <main className="page" key={view}>
          {view === "overview" && <Overview data={data} go={go} openAccount={(id) => { setOpenLoan(id); go("queue"); }} />}
          {view === "queue" && <Queue data={data} overrides={overrideMap} addOverride={addOverride} openLoan={openLoan} setOpenLoan={setOpenLoan} />}
          {view === "model" && <ModelPage data={data} />}
          {view === "fairness" && <FairnessPage data={data} />}
          {view === "business" && <BusinessPage data={data} />}
          {view === "audit" && <AuditPage overrides={overrides} clear={clearOverrides} open={(id) => { setOpenLoan(id); go("queue"); }} />}
          {view === "data" && <DataPage data={data} />}
        </main>
      </div>
    </div>
  );
}
