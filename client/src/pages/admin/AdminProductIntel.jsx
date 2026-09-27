import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Eye, Heart, GitCompareArrows, ShoppingBag, Lightbulb, TrendingUp, Tag, Layers, Package, Gauge,
  BarChart3, Users,
} from "lucide-react";
import api from "../../services/api.js";
import { formatINR, formatNumber } from "../../utils/format.js";
import { C } from "../../utils/theme.js";
import ProductIntelWorkspace from "./intel/ProductIntelWorkspace.jsx";
import CatalogueAttraction from "./intel/CatalogueAttraction.jsx";

/**
 * Three views over two questions.
 *
 * "Which listings need attention?" is the catalogue question and it is answered
 * from denormalised counters across the whole catalogue - that stays on the
 * second tab, unchanged. "Why is this specific listing behaving like this, and
 * who is interested?" is a per-listing question and it cannot be answered by a
 * catalogue ranking, so it gets its own workspace. The ranking was demoted
 * rather than replaced: it is still the fastest way to decide *which* listing
 * to open.
 *
 * The first tab is the marketplace attraction report because it is the only
 * view that needs no prior selection at all. Everything else answers a
 * follow-up question, and the ranking used to be the entry point even though it
 * ranks on denormalised counters rather than on people.
 */
const TABS = [
  { key: "marketplace", label: "Marketplace attraction", icon: Users },
  { key: "listing", label: "Listing workspace", icon: BarChart3 },
  { key: "attention", label: "Attention ranking", icon: TrendingUp },
  { key: "catalog", label: "Catalog health", icon: Package },
];

const SECTIONS = [
  { key: "mostViewed", icon: Eye, tone: "bg-info-soft text-info", bar: C.info, label: "Most viewed", metric: "views" },
  { key: "mostWishlisted", icon: Heart, tone: "bg-magenta-soft text-magenta", bar: C.magenta, label: "Most wishlisted", metric: "wishlistCount" },
  { key: "mostCompared", icon: GitCompareArrows, tone: "bg-primary-soft text-primary", bar: C.primary, label: "Most compared", metric: "compareCount" },
  { key: "mostPurchased", icon: ShoppingBag, tone: "bg-success-soft text-success", bar: C.success, label: "Best sellers", metric: "orderCount" },
];

/** Tabs that read the denormalised catalogue-ranking payload. */
const RANKING_TABS = new Set(["attention", "catalog"]);

export default function AdminProductIntel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [tab, setTab] = useState("marketplace");
  const [searchParams, setSearchParams] = useSearchParams();

  /**
   * The catalogue ranking is fetched lazily, and only for the two tabs that
   * actually read it. The attraction report and the per-listing workspace each
   * load their own payload for the question they answer, so requesting the
   * heavier ranking aggregation on mount would be a request nobody is waiting
   * for.
   */
  useEffect(() => {
    if (!RANKING_TABS.has(tab) || data) return undefined;
    let cancelled = false;
    setLoading(true);
    api
      .get("/admin/product-intelligence")
      .then(({ data: payload }) => {
        if (cancelled) return;
        setData(payload);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, data, attempt]);

  /**
   * Hand a listing from the attraction report straight to the workspace.
   *
   * The selection is written to the URL rather than local state, because the
   * workspace already reads `?product=` and owns that contract. Reusing it means
   * a drilled-into listing is linkable and survives a refresh.
   */
  const openListing = (productId) => {
    const next = new URLSearchParams(searchParams);
    next.set("product", productId);
    setSearchParams(next);
    setTab("listing");
  };

  const categories = data?.categoryIntelligence || [];
  const maxAttention = Math.max(1, ...(data?.mostViewed || []).map((p) => p.attentionRatio || 0));
  const maxBand = Math.max(1, ...(data?.priceBands || []).map((x) => x.products));

  const totals = [
    { icon: Layers, label: "Categories", value: formatNumber(categories.length) },
    { icon: Package, label: "Listings", value: formatNumber(categories.reduce((s, c) => s + (c.products || 0), 0)) },
    { icon: Eye, label: "Total views", value: formatNumber(categories.reduce((s, c) => s + (c.totalViews || 0), 0)) },
    { icon: ShoppingBag, label: "Total orders", value: formatNumber(categories.reduce((s, c) => s + (c.totalOrders || 0), 0)) },
  ];

  return (
    <div className="animate-fade-in space-y-5">
      <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <span className="page-eyebrow">
            <Lightbulb size={12} /> Insights
          </span>
          <h1 className="page-title">Product intelligence</h1>
          <p className="page-sub">
            Who is interested in a listing, how far they get, and what they do instead.
          </p>
        </div>
        {/* self-start shrink-wraps the row, so max-w-full is what stops the tab
            strip from widening the page on a narrow screen. */}
        <div className="tab-list self-start max-w-full">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} className={`tab ${tab === t.key ? "tab-active" : ""}`}>
              <t.icon size={14} /> {t.label}
            </button>
          ))}
        </div>
      </header>

      {tab === "marketplace" ? (
        <CatalogueAttraction onOpenListing={openListing} />
      ) : tab === "listing" ? (
        <ProductIntelWorkspace />
      ) : loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 animate-fade-in">
          {Array(6).fill(0).map((_, i) => (
            <div key={i} className="h-56 rounded-2xl bg-sunken animate-pulse" />
          ))}
        </div>
      ) : !data ? (
        <div className="panel p-12 text-center">
          <span className="icon-tile-primary mx-auto mb-4">
            <Lightbulb size={20} />
          </span>
          <h3 className="font-extrabold text-ink-900">Catalogue ranking unavailable</h3>
          <p className="text-sm text-muted mt-1">
            The catalogue-level ranking could not be loaded. The per-listing workspace is unaffected.
          </p>
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className="btn btn-secondary btn-sm mt-4">
            Try again
          </button>
        </div>
      ) : (
        <>
          {/* ================= ATTENTION ================= */}
          {tab === "attention" && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {totals.map((t) => (
                  <div key={t.label} className="stat-card">
                    <div className="flex items-center justify-between">
                      <t.icon size={16} className="text-primary" />
                      <span className="metric-label">{t.label}</span>
                    </div>
                    <p className="metric mt-2">{t.value}</p>
                  </div>
                ))}
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-line bg-raised px-4 py-3">
                <Gauge size={15} className="text-primary flex-none mt-0.5" />
                <p className="text-xs text-muted leading-relaxed">
                  <span className="font-bold text-ink-900">Attention ratio</span> = orders per 1,000 views. A
                  healthy listing sits above{" "}
                  <span className="font-extrabold text-primary tabular">{(maxAttention * 0.4).toFixed(1)}</span> on
                  this catalogue.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {SECTIONS.map((s) => {
                  // Each section names the payload field it reads. Without this
                  // the list resolved to `undefined` and every section rendered
                  // "No data yet" even with a fully populated ranking.
                  const list = data[s.key] || [];
                  const maxVal = Math.max(1, ...list.map((p) => p[s.metric] || 0));
                  return (
                    <section key={s.key} className="panel">
                      <div className="panel-head">
                        <div className="flex items-center gap-2.5">
                          <span className={`icon-tile flex-none ${s.tone}`}>
                            <s.icon size={16} />
                          </span>
                          <h2 className="panel-title">{s.label}</h2>
                        </div>
                        <span className="badge-neutral">{list.length}</span>
                      </div>
                      <div className="panel-body space-y-2">
                        {list.length === 0 ? (
                          <p className="text-sm text-muted-soft py-6 text-center">No data yet</p>
                        ) : (
                          list.map((p, i) => {
                            const value = p[s.metric] || 0;
                            return (
                              <Link
                                key={p._id}
                                to={`/products/${p._id}`}
                                className="block sunken-panel p-3 hover:bg-primary-soft hover:border-brand-200 transition-colors group"
                              >
                                <div className="flex items-center gap-3">
                                  <span
                                    className={`w-6 h-6 rounded-lg flex items-center justify-center text-2xs font-extrabold flex-none ${
                                      i < 3 ? "bg-primary text-white" : "bg-white border border-line text-muted"
                                    }`}
                                  >
                                    {i + 1}
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <div className="font-semibold text-sm text-ink-900 group-hover:text-primary truncate">
                                      {p.title}
                                    </div>
                                    <div className="text-2xs text-muted">
                                      {p.categoryName || "Uncategorized"} · {formatINR(p.price)}
                                    </div>
                                    <div className="mt-1.5 h-1.5 bg-line rounded-full overflow-hidden">
                                      <div
                                        className="h-full rounded-full transition-all duration-500"
                                        style={{ width: `${(value / maxVal) * 100}%`, background: i < 3 ? s.bar : C.neutral }}
                                      />
                                    </div>
                                  </div>
                                  <div className="text-right flex-none">
                                    <div className="text-base font-extrabold text-ink-900 tabular">
                                      {formatNumber(value)}
                                    </div>
                                    <div className="text-2xs text-muted-soft tabular">
                                      attn {Number(p.attentionRatio || 0).toFixed(1)}/1k
                                    </div>
                                  </div>
                                </div>
                              </Link>
                            );
                          })
                        )}
                      </div>
                    </section>
                  );
                })}
              </div>
            </>
          )}

          {/* ================= CATALOG ================= */}
          {tab === "catalog" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <section className="panel">
                <div className="panel-head">
                  <div className="flex items-center gap-2.5">
                    <Tag size={16} className="text-primary" />
                    <div>
                      <h2 className="panel-title">Discount depth</h2>
                      <p className="panel-sub">How listings are priced vs their list price</p>
                    </div>
                  </div>
                </div>
                <div className="panel-body space-y-3">
                  {(data.priceBands || []).length === 0 ? (
                    <p className="text-sm text-muted-soft py-6 text-center">No data yet</p>
                  ) : (
                    (data.priceBands || []).map((b) => {
                      const conv = b.views > 0 ? (b.orders / Math.max(b.views, 1)) * 1000 : 0;
                      return (
                        <div key={b._id} className="sunken-panel p-4">
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <span className="text-sm font-bold text-ink-900">{b._id}</span>
                            <span className="text-2xs text-muted tabular">{b.products} listings</span>
                          </div>
                          <div className="h-2 bg-line rounded-full overflow-hidden mb-2.5">
                            <div
                              className="h-full rounded-full bg-primary transition-all duration-500"
                              style={{ width: `${(b.products / maxBand) * 100}%` }}
                            />
                          </div>
                          <div className="flex items-center gap-3 text-2xs flex-wrap">
                            <span className="text-muted"><b className="text-ink-900 tabular">{formatNumber(b.views)}</b> views</span>
                            <span className="text-muted"><b className="text-ink-900 tabular">{formatNumber(b.orders)}</b> orders</span>
                            <span className="text-muted"><b className="text-ink-900 tabular">{formatNumber(b.wishlists)}</b> wishlists</span>
                            <span className={`tabular font-bold ${conv > 2 ? "text-success" : "text-muted"}`}>
                              attn {conv.toFixed(1)}/1k
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </section>

              <section className="panel">
                <div className="panel-head">
                  <h2 className="panel-title">Category performance</h2>
                  <span className="badge-neutral">{categories.length}</span>
                </div>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Category</th>
                        <th className="th-num">Listings</th>
                        <th className="th-num">Views</th>
                        <th className="th-num">Orders</th>
                        <th className="th-num">Conv/1k</th>
                        <th className="th-num">Avg price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categories.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-10 text-center text-muted">
                            No category data yet
                          </td>
                        </tr>
                      ) : (
                        categories.map((c) => {
                          const conv =
                            c.totalViews > 0 ? ((c.totalOrders / Math.max(c.totalViews, 1)) * 1000).toFixed(1) : "0";
                          return (
                            <tr key={c._id}>
                              <td className="font-semibold text-ink-900">{c._id}</td>
                              <td className="num text-muted">{formatNumber(c.products)}</td>
                              <td className="num text-muted">{formatNumber(c.totalViews)}</td>
                              <td className="num text-muted">{formatNumber(c.totalOrders)}</td>
                              <td className="num text-primary">{conv}</td>
                              <td className="num text-muted">{formatINR(c.avgPrice)}</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}
        </>
      )}
    </div>
  );
}
