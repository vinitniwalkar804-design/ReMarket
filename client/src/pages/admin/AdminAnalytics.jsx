import { useState, useEffect } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip,
  PieChart, Pie, Cell, CartesianGrid, Legend,
} from "recharts";
import {
  BarChart3, TrendingDown, Timer, RefreshCcw, Percent, Repeat, IndianRupee,
  ClipboardList, Search, ShoppingBag, Handshake,
} from "lucide-react";
import api from "../../services/api.js";
import CategoryAttraction from "./CategoryAttraction.jsx";
import UniqueCustomerFunnel from "./intel/UniqueCustomerFunnel.jsx";
import { formatINR, formatNumber } from "../../utils/format.js";
import { C, SERIES, chartAxis, chartGrid, chartTooltip, chartLegend } from "../../utils/theme.js";

const TABS = [
  { key: "overview", label: "Overview", icon: BarChart3 },
  { key: "engagement", label: "Engagement", icon: Search },
  { key: "purchase", label: "Purchases & negotiation", icon: Handshake },
];

const CHECKOUT_ROWS = [
  "Cart Adds",
  "Cart Removes",
  "Checkout Starts",
  "Offers Sent",
  "Offers Accepted",
  "Price Watches",
  "Chats Started",
];

export default function AdminAnalytics() {
  const [analytics, setAnalytics] = useState(null);
  const [attraction, setAttraction] = useState(null);
  const [tab, setTab] = useState("overview");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/admin/analytics")
      .then(({ data }) => {
        setAnalytics(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    // Unique-customer figures, kept separate from the event summary above. The
    // category table and the funnel both need people rather than counts, and
    // deriving them from behaviorSummary would reintroduce the exact confusion
    // this page exists to remove.
    api.get("/admin/attraction?limit=1").then(({ data }) => setAttraction(data)).catch(() => {});
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 animate-fade-in">
        {Array(4).fill(0).map((_, i) => (
          <div key={i} className="h-64 rounded-2xl bg-sunken animate-pulse" />
        ))}
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="panel p-12 text-center">
        <span className="icon-tile-primary mx-auto mb-4">
          <BarChart3 size={20} />
        </span>
        <h3 className="font-extrabold text-ink-900">No behavior data yet</h3>
        <p className="text-sm text-muted mt-1">
          Metrics appear once buyers start browsing, comparing and checking out.
        </p>
      </div>
    );
  }

  const statCards = [
    {
      label: "Cart abandonment", value: `${analytics.cartAbandonmentRate ?? 0}%`,
      icon: TrendingDown, tone: "danger",
    },
    {
      label: "Avg decision time", value: `${analytics.avgDecisionTime ?? 0} min`,
      icon: Timer, tone: "info",
    },
    {
      label: "Negotiation rounds", value: analytics.avgNegotiationRounds ?? 0,
      icon: RefreshCcw, tone: "accent",
    },
    { label: "Avg discount", value: `${analytics.avgDiscount ?? 0}%`, icon: Percent, tone: "primary" },
    {
      label: "Repeat purchase rate", value: `${analytics.repeatPurchaseRate ?? 0}%`,
      icon: Repeat, tone: "primary",
    },
    {
      label: "Total revenue", value: formatINR(analytics.totalRevenue || 0),
      icon: IndianRupee, tone: "success",
    },
  ];

  const toneMap = {
    danger: "bg-danger-soft text-danger",
    info: "bg-info-soft text-info",
    accent: "bg-accent-soft text-accent",
    primary: "bg-primary-soft text-primary",
    success: "bg-success-soft text-success",
  };

  const summary = analytics.behaviorSummary || [];
  const summaryMax = Math.max(1, ...summary.map((x) => x.value));
  const findRow = (key) => summary.find((x) => x.key === key)?.value || 0;
  const checkoutMax = Math.max(1, findRow("Cart Adds"), findRow("Checkout Starts"));

  return (
    <div className="animate-fade-in space-y-5">
      <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <span className="page-eyebrow">
            <BarChart3 size={12} /> Behaviour
          </span>
          <h1 className="page-title">Behavior analytics</h1>
          <p className="page-sub">
            How buyers discover, compare and decide — computed from stored behavior events.
          </p>
        </div>
        <div className="tab-list self-start overflow-x-auto max-w-full">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`tab whitespace-nowrap ${tab === t.key ? "tab-active" : ""}`}
            >
              <t.icon size={14} /> {t.label}
            </button>
          ))}
        </div>
      </header>

      {/* ================= OVERVIEW ================= */}
      {tab === "overview" && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {statCards.map((s) => (
              <div key={s.label} className="stat-card flex items-center gap-3.5">
                <span className={`icon-tile flex-none ${toneMap[s.tone]}`}>
                  <s.icon size={17} />
                </span>
                <div className="min-w-0">
                  <p className="text-2xs font-bold uppercase tracking-[0.1em] text-muted">{s.label}</p>
                  <p className="metric mt-0.5">{s.value}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <section className="panel lg:col-span-2">
              <div className="panel-head">
                <div className="flex items-center gap-2.5">
                  <ClipboardList size={16} className="text-primary" />
                  <div>
                    <h2 className="panel-title">Event volume by type</h2>
                    <p className="panel-sub">Every tracked interaction, ranked</p>
                  </div>
                </div>
                <span className="badge-neutral">{summary.length} types</span>
              </div>
              <div className="panel-body table-wrap">
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-line">
                    {summary.map((r, i) => (
                      <tr key={r.key} className="hover:bg-raised transition-colors">
                        <td className="py-2.5 pr-3 w-56">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2 h-2 rounded-full flex-none"
                              style={{ background: SERIES[i % SERIES.length] }}
                            />
                            <span className="font-semibold text-ink-800">{r.key}</span>
                          </div>
                        </td>
                        <td className="py-2.5 w-full">
                          <div className="h-2.5 bg-sunken rounded-full overflow-hidden max-w-md">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${Math.max(2, (r.value / summaryMax) * 100)}%`,
                                background: SERIES[i % SERIES.length],
                              }}
                            />
                          </div>
                        </td>
                        <td className="py-2.5 text-right font-extrabold text-ink-900 tabular pl-3">
                          {formatNumber(r.value)}
                        </td>
                      </tr>
                    ))}
                    {summary.length === 0 && (
                      <tr>
                        <td className="py-8 text-center text-sm text-muted-soft">No events recorded yet</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Was "Journey funnel", a bar per stage sized against the largest
                stage. Two problems: the numbers were raw events, so a customer who
                viewed thirty listings counted thirty times, and normalising by the
                largest stage made the widest bar mean "biggest stage" rather than
                "everyone who entered". Replaced by the distinct-customer funnel,
                which measures every stage against everyone attracted. */}
            {attraction?.funnel ? (
              <UniqueCustomerFunnel
                funnel={attraction.funnel}
                title="Customer funnel"
                sub="Distinct customers at each stage, measured against everyone attracted"
              />
            ) : (
              <section className="panel">
                <div className="panel-head">
                  <h2 className="panel-title">Customer funnel</h2>
                </div>
                <div className="panel-body">
                  <p className="text-sm text-muted-soft py-6 text-center">
                    Run the app to start collecting journey events. The event table above is unaffected.
                  </p>
                </div>
              </section>
            )}

            <section className="panel">
              <div className="panel-head">
                <h2 className="panel-title">Purchase reasons</h2>
              </div>
              <div className="panel-body">
                {(analytics.purchaseReasons || []).length === 0 ? (
                  <p className="text-sm text-muted-soft py-6 text-center">No purchase reasons recorded yet</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {(analytics.purchaseReasons || []).map((r) => (
                      <div key={r._id} className="sunken-panel p-3.5">
                        <div className="text-sm font-bold text-ink-900 capitalize">{r._id}</div>
                        <div className="text-2xs text-muted mt-0.5 tabular">
                          {formatNumber(r.count)} purchases
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>
        </>
      )}

      {/* ================= ENGAGEMENT ================= */}
      {tab === "engagement" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <section className="panel">
            <div className="panel-head">
              <h2 className="panel-title">Most searched categories</h2>
            </div>
            <div className="panel-body">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={(analytics.mostSearched || []).map((s, i) => ({
                    name: (s._id || `#${i + 1}`).slice(0, 14),
                    searches: s.count,
                  }))}
                >
                  <CartesianGrid {...chartGrid} />
                  <XAxis dataKey="name" {...chartAxis} />
                  <YAxis {...chartAxis} />
                  <Tooltip {...chartTooltip} />
                  <Bar dataKey="searches" fill={C.primary} radius={[5, 5, 0, 0]} maxBarSize={38} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2 className="panel-title">Category demand vs. supply</h2>
              <p className="panel-sub">
                Interest is measured from recorded behaviour, weighted by intent
                (a view is weak, a purchase is strong) and resolved to a category
                through the product. Supply is live listing count. A high
                conversion with few listings means demand is under-served.
              </p>
            </div>
            <div className="panel-body">
              <CategoryAttraction
                rows={analytics.categoryAttraction}
                customerRows={attraction?.categories}
              />
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2 className="panel-title">Listing mix by category</h2>
              <p className="panel-sub">
                How many live listings exist per category &mdash; what sellers have
                posted, not what customers are interested in.
              </p>
            </div>
            <div className="panel-body">
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={analytics.categoryPopularity || []}
                    dataKey="count"
                    nameKey="_id"
                    cx="50%"
                    cy="50%"
                    outerRadius={85}
                    label={(e) => e._id}
                  >
                    {(analytics.categoryPopularity || []).map((_, i) => (
                      <Cell key={i} fill={SERIES[i % SERIES.length]} />
                    ))}
                  </Pie>
                  <Tooltip {...chartTooltip} />
                  <Legend {...chartLegend} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2 className="panel-title">Most viewed products</h2>
            </div>
            <div className="panel-body">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={(analytics.mostViewed || []).map((p) => ({
                    name: (p.title || "").slice(0, 18),
                    views: p.views,
                  }))}
                  layout="vertical"
                >
                  <CartesianGrid {...chartGrid} horizontal={false} vertical />
                  <XAxis type="number" {...chartAxis} />
                  <YAxis type="category" dataKey="name" width={120} {...chartAxis} />
                  <Tooltip {...chartTooltip} />
                  <Bar dataKey="views" fill={C.accent} radius={[0, 5, 5, 0]} maxBarSize={26} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2 className="panel-title">Most compared products</h2>
            </div>
            <div className="panel-body">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={(analytics.mostCompared || []).map((p) => ({
                    name: (p.title || "").slice(0, 18),
                    comparisons: p.compareCount,
                  }))}
                  layout="vertical"
                >
                  <CartesianGrid {...chartGrid} horizontal={false} vertical />
                  <XAxis type="number" {...chartAxis} />
                  <YAxis type="category" dataKey="name" width={120} {...chartAxis} />
                  <Tooltip {...chartTooltip} />
                  <Bar dataKey="comparisons" fill={C.violet} radius={[0, 5, 5, 0]} maxBarSize={26} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="panel lg:col-span-2">
            <div className="panel-head">
              <h2 className="panel-title">Most wishlisted products</h2>
            </div>
            <div className="panel-body">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={(analytics.mostWishlisted || []).map((p) => ({
                    name: (p.title || "").slice(0, 20),
                    wishlists: p.wishlistCount,
                  }))}
                >
                  <CartesianGrid {...chartGrid} />
                  <XAxis dataKey="name" {...chartAxis} interval={0} angle={-12} textAnchor="end" height={64} />
                  <YAxis {...chartAxis} />
                  <Tooltip {...chartTooltip} />
                  <Bar dataKey="wishlists" fill={C.magenta} radius={[5, 5, 0, 0]} maxBarSize={44} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>
      )}

      {/* ================= PURCHASE ================= */}
      {tab === "purchase" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <section className="panel">
            <div className="panel-head">
              <div className="flex items-center gap-2.5">
                <ShoppingBag size={16} className="text-primary" />
                <h2 className="panel-title">Best-selling products</h2>
              </div>
            </div>
            <div className="panel-body space-y-2">
              {(analytics.mostNegotiated || []).length === 0 ? (
                <p className="text-sm text-muted-soft py-6 text-center">No purchases yet</p>
              ) : (
                (analytics.mostNegotiated || []).map((p, i) => (
                  <div key={p._id} className="flex items-center gap-3 sunken-panel px-4 py-2.5">
                    <span
                      className={`w-7 h-7 rounded-lg flex items-center justify-center text-2xs font-extrabold flex-none ${
                        i < 3 ? "bg-primary text-white" : "bg-white border border-line text-muted"
                      }`}
                    >
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-ink-900 truncate">{p.title}</div>
                      <div className="text-2xs text-muted">
                        {p.categoryName || "Uncategorized"} · {p.orderCount} orders
                      </div>
                    </div>
                    <div className="text-right flex-none">
                      <div className="text-base font-extrabold text-ink-900 tabular">
                        {formatNumber(p.orderCount)}
                      </div>
                      <div className="text-2xs text-muted-soft">ordered</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2 className="panel-title">Cart &amp; checkout dynamics</h2>
            </div>
            <div className="panel-body space-y-3">
              {CHECKOUT_ROWS.map((key) => {
                const value = findRow(key);
                return (
                  <div key={key} className="flex items-center gap-3">
                    <span className="w-32 text-2xs font-bold uppercase tracking-[0.08em] text-muted flex-none truncate">
                      {key}
                    </span>
                    <div className="flex-1 h-6 bg-sunken rounded-lg overflow-hidden">
                      <div
                        className="h-full rounded-lg bg-accent flex items-center justify-end px-2 transition-all duration-500"
                        style={{ width: `${Math.max(5, (value / checkoutMax) * 100)}%` }}
                      >
                        <span className="text-2xs font-extrabold text-white tabular">
                          {formatNumber(value)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
