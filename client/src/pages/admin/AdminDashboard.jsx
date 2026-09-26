import { useState, useEffect } from "react";
import {
  RefreshCw, Users, Package, ShoppingCart, TrendingUp, Repeat, ShieldCheck, Target,
  ArrowUpRight, FlaskConical, Network, Brain, Filter, Loader2, LayoutDashboard, CheckCircle2,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid,
} from "recharts";
import api from "../../services/api.js";
import { formatINR, formatNumber } from "../../utils/format.js";
import { C, chartAxis, chartGrid, chartTooltip, chartLegend } from "../../utils/theme.js";

const KPI_TONES = [
  "from-brand-500 to-brand-700",
  "from-emerald-500 to-emerald-700",
  "from-violet-500 to-brand-700",
  "from-amber-400 to-amber-600",
  "from-sky-500 to-info",
  "from-magenta-500 to-rose-600",
  "from-brand-600 to-brand-900",
  "from-accent-500 to-accent-700",
];

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [trend, setTrend] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mlRunning, setMlRunning] = useState(false);
  const [mlResult, setMlResult] = useState(null);
  const [mlStep, setMlStep] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [sRes, tRes, aRes, mlRes] = await Promise.all([
        api.get("/admin/stats"),
        api.get("/admin/trends?days=14"),
        api.get("/admin/analytics"),
        api.get("/ml/results").catch(() => ({ data: { hasResults: false } })),
      ]);
      setStats(sRes.data);
      setTrend(tRes.data.trend || []);
      setAnalytics(aRes.data);
      setMlResult(mlRes.data);
    } catch {}
    setLoading(false);
  };

  const runSegmentation = async () => {
    setMlRunning(true);
    setMlStep("Preparing features from behavior data…");
    try {
      setMlStep("Running hybrid ensemble (KMeans + Agglomerative + DBSCAN)…");
      const { data } = await api.post("/ml/run");
      setMlResult({
        hasResults: true,
        runId: data.runId,
        results: data.results,
        personas: data.results.personas,
      });
      await load();
      setMlStep("Segmentation complete!");
      setTimeout(() => setMlStep(""), 4000);
    } catch (err) {
      setMlStep(err.response?.data?.message || "ML run failed");
    }
    setMlRunning(false);
  };

  useEffect(() => {
    load();
  }, []);

  const kpiCards = [
    { label: "Customers", value: stats?.totalCustomers ?? "—", icon: Users },
    { label: "Active (30d)", value: stats?.activeCustomers ?? 0, icon: Target },
    { label: "Repeat buyers", value: stats?.repeatCustomers ?? 0, icon: Repeat },
    { label: "Verified sellers", value: stats?.totalSellers ?? 0, icon: ShieldCheck },
    { label: "Products", value: stats?.totalProducts ?? "—", icon: Package },
    { label: "Orders", value: stats?.totalOrders ?? "—", icon: ShoppingCart },
    { label: "Revenue", value: formatINR(stats?.totalRevenue || 0), icon: TrendingUp },
    {
      label: "Conversion",
      value: stats?.conversionRate ? `${stats.conversionRate}%` : "—",
      icon: ArrowUpRight,
    },
  ];

  const latestRun = mlResult?.hasResults ? mlResult.results?.[0] : null;

  const summaryOf = (list) => {
    const m = {};
    (list || []).forEach((x) => {
      m[x.key] = x.value;
    });
    return m;
  };
  const bs = summaryOf(analytics?.behaviorSummary);
  const funnelSteps = [
    { label: "Searches", value: bs.Searches || 0 },
    { label: "Product views", value: bs["Product Views"] || 0 },
    { label: "Cart adds", value: bs["Cart Adds"] || 0 },
    { label: "Checkouts", value: bs["Checkout Starts"] || 0 },
    { label: "Purchases", value: bs.Purchases || 0 },
  ];
  const funnelRate = (idx) =>
    funnelSteps[idx - 1]?.value > 0
      ? ((funnelSteps[idx].value / funnelSteps[idx - 1].value) * 100).toFixed(1)
      : "—";

  return (
    <div className="animate-fade-in space-y-5">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <span className="page-eyebrow">
            <LayoutDashboard size={12} /> Overview
          </span>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-sub">
            Real-time marketplace metrics plus the ML segmentation runner.
          </p>
        </div>
        <button onClick={runSegmentation} disabled={mlRunning} className="btn-primary self-start">
          {mlRunning ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          {mlRunning ? "Running…" : "Run segmentation"}
        </button>
      </header>

      {mlRunning && (
        <div className="alert alert-info animate-fade-in">
          <Loader2 size={15} className="animate-spin flex-none" />
          <span>{mlStep}</span>
        </div>
      )}
      {mlStep && !mlRunning && (
        <div className={`alert ${mlStep.includes("complete") ? "alert-success" : "alert-danger"}`}>
          {mlStep.includes("complete") ? (
            <CheckCircle2 size={15} className="flex-none" />
          ) : (
            <FlaskConical size={15} className="flex-none" />
          )}
          <span>{mlStep}</span>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array(8).fill(0).map((_, i) => (
            <div key={i} className="h-28 rounded-2xl bg-sunken animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* ---------- KPIs ---------- */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {kpiCards.map((c, i) => (
              <div key={c.label} className="stat-card">
                <span
                  className={`w-10 h-10 rounded-xl bg-gradient-to-br ${KPI_TONES[i % KPI_TONES.length]} text-white flex items-center justify-center shadow-sm`}
                >
                  <c.icon size={18} />
                </span>
                <p className="metric mt-3">{c.value}</p>
                <p className="text-2xs font-bold uppercase tracking-[0.1em] text-muted mt-1">
                  {c.label}
                </p>
              </div>
            ))}
          </div>

          {/* ---------- trend ---------- */}
          <section className="panel">
            <div className="panel-head">
              <div className="flex items-center gap-2.5">
                <TrendingUp size={16} className="text-primary" />
                <div>
                  <h2 className="panel-title">14-day activity trend</h2>
                  <p className="panel-sub">Daily behavior events, orders and revenue</p>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-none">
                <span className="inline-flex items-center gap-1.5 text-2xs text-muted">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: C.primary }} /> events
                </span>
                <span className="inline-flex items-center gap-1.5 text-2xs text-muted">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: C.violet }} /> orders
                </span>
                <span className="inline-flex items-center gap-1.5 text-2xs text-muted">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: C.rating }} /> revenue
                </span>
              </div>
            </div>
            <div className="panel-body">
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={trend} margin={{ top: 5, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid {...chartGrid} />
                  <XAxis dataKey="label" {...chartAxis} interval="preserveStartEnd" />
                  <YAxis yAxisId="events" {...chartAxis} />
                  <YAxis
                    yAxisId="revenue"
                    orientation="right"
                    {...chartAxis}
                    tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)}
                  />
                  <Tooltip {...chartTooltip} labelFormatter={(l, p) => p?.[0]?.payload?.date || l} />
                  <Legend {...chartLegend} />
                  <Line
                    yAxisId="events"
                    type="monotone"
                    dataKey="events"
                    stroke={C.primary}
                    strokeWidth={2.5}
                    dot={false}
                    name="Behavior events"
                  />
                  <Line
                    yAxisId="events"
                    type="monotone"
                    dataKey="orders"
                    stroke={C.violet}
                    strokeWidth={2.5}
                    dot={false}
                    name="Orders"
                  />
                  <Line
                    yAxisId="revenue"
                    type="monotone"
                    dataKey="revenue"
                    stroke={C.rating}
                    strokeWidth={2.5}
                    dot={false}
                    name="Revenue"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* ---------- funnel health ---------- */}
          <section className="panel">
            <div className="panel-head">
              <div className="flex items-center gap-2.5">
                <Filter size={16} className="text-primary" />
                <div>
                  <h2 className="panel-title">Funnel health</h2>
                  <p className="panel-sub">Where attention turns into orders</p>
                </div>
              </div>
            </div>
            <div className="panel-body">
              <div className="flex flex-col xl:flex-row items-stretch gap-4">
                {funnelSteps.map((step, i) => {
                  const pct = i === 0 ? 100 : Number(funnelRate(i));
                  const width = Math.max(4, pct === Infinity || isNaN(pct) ? 0 : pct);
                  return (
                    <div key={step.label} className="flex-1 flex items-center gap-3">
                      <div className="flex-1">
                        <div className="flex items-baseline justify-between gap-2 mb-1.5">
                          <span className="text-2xs font-bold uppercase tracking-[0.08em] text-muted truncate">
                            {step.label}
                          </span>
                          <span className="text-sm font-extrabold text-ink-900 tabular">
                            {formatNumber(step.value)}
                          </span>
                        </div>
                        <div className="h-2.5 bg-sunken rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary transition-all duration-500"
                            style={{ width: i === 0 ? "100%" : `${width}%` }}
                          />
                        </div>
                        <div className="text-2xs text-muted-soft mt-1 tabular">
                          {i === 0 ? "entry" : `${pct}% of previous`}
                        </div>
                      </div>
                      {i < funnelSteps.length - 1 && (
                        <ArrowUpRight size={14} className="text-line-strong flex-none" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* ---------- latest ML run ---------- */}
          {latestRun && (
            <section className="panel">
              <div className="panel-head">
                <div>
                  <h2 className="panel-title flex items-center gap-2">
                    <FlaskConical size={16} className="text-primary" /> Latest clustering run
                  </h2>
                  <p className="panel-sub">
                    Run #{mlResult.runId} · {latestRun.methodology?.name || "Ensemble clustering"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Link to="/admin/clusters" className="btn-secondary btn-sm">
                    <Network size={13} /> Clusters
                  </Link>
                  <Link to="/admin/personas" className="btn-secondary btn-sm">
                    <Brain size={13} /> Personas
                  </Link>
                </div>
              </div>
              <div className="panel-body space-y-4">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {[
                    { label: "Clusters", value: mlResult.personas?.length || 0, tone: "" },
                    { label: "Features", value: latestRun.methodology?.featureCount || 32, tone: "" },
                    {
                      label: "Agreement (ARI)",
                      value:
                        latestRun.agreement?.consensusStrength != null
                          ? `${(latestRun.agreement.consensusStrength * 100).toFixed(0)}%`
                          : "—",
                      tone: "text-primary",
                    },
                    {
                      label: "Silhouette",
                      value:
                        latestRun.metrics?.silhouette != null
                          ? latestRun.metrics.silhouette.toFixed(3)
                          : "—",
                      tone: "text-primary",
                    },
                  ].map((m) => (
                    <div key={m.label} className="sunken-panel p-4">
                      <p className="text-2xs font-bold uppercase tracking-[0.1em] text-muted">{m.label}</p>
                      <p className={`metric mt-1 ${m.tone}`}>{m.value}</p>
                    </div>
                  ))}
                </div>

                {mlResult.personas?.length > 0 && (
                  <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                    {mlResult.personas.map((p) => (
                      <Link
                        key={p.personaId}
                        to="/admin/personas"
                        className="rounded-xl border border-brand-200 bg-primary-soft p-3.5 card-hover block"
                      >
                        <div className="font-bold text-sm text-ink-900 truncate">{p.name}</div>
                        <div className="text-xl font-extrabold text-primary tabular mt-1">
                          {p.percentage}%
                        </div>
                        <div className="text-2xs text-muted">{p.customerCount} customers</div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
