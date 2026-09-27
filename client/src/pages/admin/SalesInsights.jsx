/**
 * Sales insights: what actually sold, how the money trended, and where demand
 * and sales disagree.
 *
 * The whole page is built from `Order` documents, not from `Product.status` and
 * not from the denormalised counters on listings. That distinction is not
 * pedantry: the live data has far more listings with orders than listings
 * carrying a `sold` flag, so a page built on the flag would understate the
 * business. The service sends the drift in `dataQuality` and this page shows it
 * rather than hiding it, because a reader who compares these totals against the
 * Products tab deserves to know why the two disagree.
 *
 * Units are kept explicit throughout. "Revenue" alone hides the difference
 * between one expensive order and ten cheap ones, and the discount and
 * decision-time figures only mean something next to volume.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  BarChart3,
  Coins,
  Info,
  Package,
  Receipt,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import api from "../../services/api.js";
import { formatINR, formatNumber } from "../../utils/format.js";
import { C, SERIES, chartAxis, chartGrid, chartTooltip } from "../../utils/theme.js";
import { BarRow, EmptyPanel, InsightCard, LoadingGrid, MetricTile, Panel } from "./intel/ui.jsx";

/**
 * Compact rupee label for chart axes.
 *
 * `formatINR` prints the full grouped amount, which is correct in a table but
 * crowds an axis tick. Nothing is hidden here: the tooltip still carries the
 * exact figure, and the axis only needs the magnitude.
 */
function shortINR(value) {
  if (value == null || Number.isNaN(value)) return "-";
  const n = Math.abs(value);
  if (n >= 1e7) return `₹${(value / 1e7).toFixed(1)}Cr`;
  if (n >= 1e5) return `₹${(value / 1e5).toFixed(1)}L`;
  if (n >= 1e3) return `₹${(value / 1e3).toFixed(0)}k`;
  return `₹${Math.round(value)}`;
}

/** Null-safe money for insight text, where `-` would read as missing data. */
const money = (value) => (value == null || Number.isNaN(value) ? "n/a" : formatINR(value));

/** Status drift is the single most misleading thing about the old sales view. */
function StatusDriftBanner({ dataQuality }) {  if (!dataQuality) return null;
  const drift = dataQuality.listingsWithOrders - dataQuality.listingsFlaggedSold;
  if (drift <= 0) return null;
  return (
    <div className="flex items-start gap-3 rounded-xl border border-warning/25 bg-warning-soft px-4 py-3">
      <AlertTriangle size={15} className="text-warning flex-none mt-0.5" />
      <p className="text-xs text-ink-700 leading-relaxed">
        <span className="font-bold text-ink-900">
          {formatNumber(drift)} listings sold without being flagged as sold.
        </span>{" "}
        {dataQuality.note} Everything below is counted from orders, so it is correct even where a listing still
        shows as <span className="font-semibold">available</span> in the catalogue.
      </p>
    </div>
  );
}

export default function SalesInsights() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [productSort, setProductSort] = useState("units");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .get("/admin/sales-insights?limit=12")
      .then(({ data: payload }) => {
        if (cancelled) return;
        setData(payload);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.response?.data?.message || err.message || "Could not load sales insights.");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const topProducts = useMemo(() => {
    if (!data?.topProducts) return [];
    return productSort === "units" ? data.topProducts.byUnits : data.topProducts.byRevenue;
  }, [data, productSort]);

  if (loading) return <LoadingGrid rows={4} height="h-28" />;

  if (error) {
    return (
      <Panel title="Sales insights unavailable">
        <EmptyPanel title="Sales insights could not be loaded" message={error} icon={AlertTriangle} />
      </Panel>
    );
  }

  if (!data) return null;

  const { basis, totals, dataQuality, categories, monthly, demandVsSales, purchaseReasons, paymentMix, topSellers } = data;
  const hasSales = (totals.orders ?? 0) > 0;

  const trend = monthly.map((m) => ({
    ...m,
    label: formatMonthLabel(m.month),
    aov: m.orders > 0 ? Math.round(m.revenue / m.orders) : 0,
  }));

  const maxCategoryRevenue = Math.max(1, ...categories.map((c) => c.revenue));
  const maxTopProduct = Math.max(1, ...topProducts.map((p) => p[productSort] || 0));

  const topPayment = paymentMix.reduce((best, p) => (p.orders > (best?.orders ?? 0) ? p : best), null);

  return (
    <div className="space-y-5">
      <header>
        <span className="page-eyebrow">
          <Coins size={12} /> Marketplace Intelligence
        </span>
        <h1 className="page-title">Sales insights</h1>
        <p className="page-sub">What actually sold, how the money trended, and where demand and sales disagree.</p>
      </header>

      {/* ================= HEADLINE ================= */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricTile label="Revenue" value={formatINR(totals.revenue)} sub={`Agreed price after negotiation, across ${formatNumber(totals.orders)} orders`} />
        <MetricTile label="Units sold" value={formatNumber(totals.units)} sub={`${totals.avgUnitsPerOrder ?? "n/a"} per order on average`} />
        <MetricTile label="Buyers" value={formatNumber(totals.buyers)} sub={`From ${formatNumber(totals.sellers)} sellers`} />
        <MetricTile label="Average order" value={formatINR(totals.avgOrderValue)} sub={`${totals.avgDiscount ?? "n/a"}% average discount · ${totals.avgDecisionHours ?? "n/a"}h to decide`} />
      </div>

      <StatusDriftBanner dataQuality={dataQuality} />

      {/* Sales and customers are different units; the reader should not have to
          guess which one a column counts. */}
      <div className="flex items-start gap-3 rounded-xl border border-line bg-raised px-4 py-3">
        <Info size={15} className="text-primary flex-none mt-0.5" />
        <p className="text-xs text-muted leading-relaxed">
          <span className="font-bold text-ink-900">Counted in orders, not customers.</span> {basis.saleDefinition}{" "}
          {basis.revenueDefinition} {basis.customerNote}
        </p>
      </div>

      {!hasSales ? (
        <Panel title="No sales recorded yet">
          <EmptyPanel
            title="Nothing has sold on this marketplace yet"
            message="Sales are read from confirmed orders. Once a listing sells, the trend, category and seller breakdowns below fill in automatically."
            icon={Receipt}
          />
        </Panel>
      ) : (
        <>
          {/* ================= TREND ================= */}
          <Panel title="Revenue trend" sub="Monthly agreed revenue, with order volume and average order value">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
                  <defs>
                    <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.primary} stopOpacity={0.28} />
                      <stop offset="100%" stopColor={C.primary} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...chartGrid} />
                  <XAxis dataKey="label" {...chartAxis} />
                  <YAxis {...chartAxis} tickFormatter={shortINR} width={62} />
                  <Tooltip
                    {...chartTooltip}
                    formatter={(value, name) => [
                      name === "revenue" ? formatINR(value) : formatNumber(value),
                      name === "revenue" ? "Revenue" : name === "orders" ? "Orders" : "Avg order",
                    ]}
                  />
                  <Area type="monotone" dataKey="revenue" stroke={C.primary} strokeWidth={2.5} fill="url(#revenueFill)" name="revenue" />
                  <Area type="monotone" dataKey="orders" stroke={C.accent} strokeWidth={2} fill="none" name="orders" />
                  <Area type="monotone" dataKey="aov" stroke={C.amber} strokeWidth={2} strokeDasharray="4 3" fill="none" name="aov" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-line">
              {[
                { label: "Revenue", color: C.primary },
                { label: "Orders", color: C.accent },
                { label: "Average order", color: C.amber },
              ].map((l) => (
                <span key={l.label} className="inline-flex items-center gap-2 text-2xs font-bold text-muted">
                  <span className="w-3 h-0.5 rounded-full" style={{ background: l.color }} />
                  {l.label}
                </span>
              ))}
            </div>
          </Panel>

          {/* ================= TOP PRODUCTS ================= */}
          <Panel
            title="Best selling listings"
            sub="Ranked from completed orders"
            action={
              <div className="tab-list">
                {[
                  { key: "units", label: "By units" },
                  { key: "revenue", label: "By revenue" },
                ].map((o) => (
                  <button key={o.key} type="button" onClick={() => setProductSort(o.key)} className={`tab ${productSort === o.key ? "tab-active" : ""}`}>
                    {o.label}
                  </button>
                ))}
              </div>
            }
          >
            {topProducts.length === 0 ? (
              <EmptyPanel title="No sales to rank yet" message="Listings appear here once they sell." icon={Package} />
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-1">
                {topProducts.map((p, i) => (
                  <BarRow
                    key={p.id}
                    label={p.title}
                    value={p[productSort] || 0}
                    max={maxTopProduct}
                    color={SERIES[i % SERIES.length]}
                    badge={
                      <span className="badge-neutral" title={productSort === "units" ? "Revenue from this listing" : "Units sold"}>
                        {productSort === "units" ? formatINR(p.revenue) : `${formatNumber(p.units)} units`}
                      </span>
                    }
                    sub={
                      <>
                        {p.category} · {formatINR(p.price)} · {formatNumber(p.orders)} orders ·{" "}
                        {formatNumber(p.buyers)} buyers
                        {p.customers > 0 && (
                          <>
                            {" · "}
                            {p.interestToPurchaseRate === null
                              ? "no attracted customers to compare"
                              : `${p.interestToPurchaseRate}% of attracted customers bought`}
                          </>
                        )}
                      </>
                    }
                  />
                ))}
              </div>
            )}
          </Panel>

          {/* ================= DEMAND VS SALES ================= */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Panel title={demandVsSales.engagedButUnsold.label} sub={demandVsSales.engagedButUnsold.note}>
              {demandVsSales.engagedButUnsold.rows.length === 0 ? (
                <EmptyPanel title="Nothing stuck" message="Every listing that reached a customer has sold at least once." icon={Target} />
              ) : (
                <div className="space-y-2">
                  {demandVsSales.engagedButUnsold.rows.map((p) => (
                    <div key={p.id} className="sunken-panel p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-ink-900 truncate">{p.title}</div>
                          <div className="text-2xs text-muted">
                            {p.category} · {formatINR(p.price)}
                          </div>
                        </div>
                        <div className="text-right flex-none">
                          <div className="text-sm font-extrabold text-ink-900 tabular">{formatNumber(p.customers)}</div>
                          <div className="text-2xs text-muted-soft">customers reached</div>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {p.reached && (
                          <span className="badge-warning" title="The deepest stage any of these customers reached">
                            deepest: {p.reached}
                          </span>
                        )}
                        {p.views > 0 && <span className="badge-neutral">{p.views} viewed</span>}
                        {p.wishlists > 0 && <span className="badge-neutral">{p.wishlists} saved</span>}
                        {p.carts > 0 && <span className="badge-neutral">{p.carts} carted</span>}
                        {p.offers > 0 && <span className="badge-neutral">{p.offers} offered</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title={demandVsSales.converting.label} sub={demandVsSales.converting.note}>
              {demandVsSales.converting.rows.length === 0 ? (
                <EmptyPanel title="No conversions yet" message="Listings appear here once they have attracted and converted customers." icon={TrendingUp} />
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Listing</th>
                        <th className="th-num">Attracted</th>
                        <th className="th-num">Bought</th>
                        <th className="th-num">Rate</th>
                        <th className="th-num">Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {demandVsSales.converting.rows.map((p) => (
                        <tr key={p.id}>
                          <td>
                            <div className="text-sm font-semibold text-ink-900 truncate max-w-[220px]">{p.title}</div>
                            <div className="text-2xs text-muted">{p.category}</div>
                          </td>
                          <td className="num text-muted">{formatNumber(p.customers)}</td>
                          <td className="num text-ink-900">{formatNumber(p.buyers)}</td>
                          <td className="num text-primary font-bold">
                            {p.interestToPurchaseRate === null ? "n/a" : `${p.interestToPurchaseRate}%`}
                          </td>
                          <td className="num text-muted">{formatINR(p.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </div>

          {/* ================= CATEGORY REVENUE ================= */}
          <Panel title="Revenue by category" sub="What each category actually earns, against the interest it attracts">
            {categories.length === 0 ? (
              <EmptyPanel title="No category sales yet" message="Category revenue appears once orders exist." icon={BarChart3} />
            ) : (
              <div className="space-y-2">
                {categories.map((c, i) => (
                  <div key={c.category} className="sunken-panel p-3.5">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full flex-none" style={{ background: SERIES[i % SERIES.length] }} />
                        <span className="text-sm font-bold text-ink-900 truncate">{c.category}</span>
                      </div>
                      <div className="text-right flex-none">
                        <div className="text-sm font-extrabold text-ink-900 tabular">{formatINR(c.revenue)}</div>
                        <div className="text-2xs text-muted-soft tabular">
                          {formatNumber(c.units)} units · {formatNumber(c.orders)} orders
                        </div>
                      </div>
                    </div>
                    <div className="h-1.5 bg-line rounded-full overflow-hidden mb-2">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(c.revenue / maxCategoryRevenue) * 100}%`, background: SERIES[i % SERIES.length] }} />
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-2xs text-muted">
                      <span>
                        <b className="text-ink-900 tabular">{formatNumber(c.customers)}</b> customers attracted
                      </span>
                      <span>
                        <b className="text-ink-900 tabular">{formatNumber(c.buyers)}</b> buyers
                      </span>
                      <span>
                        <b className="text-ink-900 tabular">{formatNumber(c.listings)}</b> listings
                      </span>
                      {c.interestToPurchaseRate === null ? (
                        <span className="text-muted-soft">no attracted customers to compare</span>
                      ) : (
                        <span className={c.interestToPurchaseRate > 40 ? "text-success font-bold" : ""}>
                          <b className="tabular">{c.interestToPurchaseRate}%</b> of attracted customers bought
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {/* ================= MIXES ================= */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <Panel title="Why customers buy" sub="Stated reason on the order">
              {purchaseReasons.length === 0 ? (
                <EmptyPanel title="No reasons recorded" message="Orders that state a reason appear here." />
              ) : (
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={purchaseReasons} dataKey="count" nameKey="reason" innerRadius={46} outerRadius={72} paddingAngle={2}>
                        {purchaseReasons.map((r, i) => (
                          <Cell key={r.reason} fill={SERIES[i % SERIES.length]} />
                        ))}
                      </Pie>
                      <Tooltip {...chartTooltip} formatter={(v, n) => [`${formatNumber(v)} orders`, n]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Panel>

            <Panel title="Payment methods" sub="How orders are paid for">
              {paymentMix.length === 0 ? (
                <EmptyPanel title="No payments recorded" message="Payment methods appear once orders exist." />
              ) : (
                <div className="space-y-2">
                  {paymentMix.map((p, i) => (
                    <BarRow
                      key={p.method}
                      label={p.method || "unspecified"}
                      value={p.orders}
                      max={Math.max(...paymentMix.map((x) => x.orders))}
                      color={SERIES[i % SERIES.length]}
                      sub={`${formatINR(p.revenue)} from ${formatNumber(p.orders)} orders`}
                    />
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="Revenue concentration" sub="How much of the money each seller represents">
              {topSellers.length === 0 ? (
                <EmptyPanel title="No sellers yet" message="Seller revenue appears once orders exist." icon={Users} />
              ) : (
                <>
                  <div className="space-y-2">
                    {topSellers.slice(0, 6).map((s, i) => {
                      const share = totals.revenue > 0 ? Math.round((s.revenue / totals.revenue) * 100) : null;
                      return (
                        <div key={s.sellerId} className="flex items-center gap-3">
                          <span
                            className={`w-6 h-6 rounded-lg flex items-center justify-center text-2xs font-extrabold flex-none ${
                              i === 0 ? "bg-primary text-white" : "bg-white border border-line text-muted"
                            }`}
                          >
                            {i + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <span className="text-2xs text-muted">
                                {formatNumber(s.units)} units · {formatNumber(s.orders)} orders
                              </span>
                              <span className="text-xs font-extrabold text-ink-900 tabular">
                                {formatINR(s.revenue)}
                                {share !== null && <span className="text-muted-soft font-semibold"> · {share}%</span>}
                              </span>
                            </div>
                            <div className="h-1.5 bg-line rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{
                                  width: `${totals.revenue > 0 ? (s.revenue / totals.revenue) * 100 : 0}%`,
                                  background: SERIES[i % SERIES.length],
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* The sales payload identifies sellers by id only, so names are
                      resolved on the page that actually has them. */}
                  <p className="text-2xs text-muted-soft mt-3 pt-3 border-t border-line">
                    Seller names, ratings and stock detail are on{" "}
                    <Link to="/admin/seller-intelligence" className="font-bold text-primary hover:underline">
                      Seller Intelligence
                    </Link>
                    .
                  </p>
                </>
              )}
            </Panel>
          </div>

          {/* ================= TAKEAWAYS ================= */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <InsightCard insight={buildTrendInsight(trend)} />
            <InsightCard insight={buildStallInsight(demandVsSales.engagedButUnsold.rows)} />
            <InsightCard insight={buildMixInsight(totals, topPayment, topSellers)} />
          </div>
        </>
      )}
    </div>
  );
}

function formatMonthLabel(month) {
  if (!month) return "";
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return month;
  return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "short", year: "2-digit" });
}

/* -------------------------------------------------------------------------- */
/* Insights                                                                    */

const pctOf = (n, d) => (d > 0 ? Math.round((n / d) * 100) : null);

function buildTrendInsight(trend) {
  if (!trend?.length) {
    return { label: "No signal", tone: "neutral", headline: "No sales history yet", detail: "Monthly revenue appears once orders exist." };
  }
  const latest = trend[trend.length - 1];
  const best = trend.reduce((m, t) => (t.revenue > m.revenue ? t : m), trend[0]);
  const prev = trend.length > 1 ? trend[trend.length - 2] : null;
  const change = prev && prev.revenue > 0 ? Math.round(((latest.revenue - prev.revenue) / prev.revenue) * 100) : null;
  return {
    label: "Momentum",
    tone: change === null ? "neutral" : change >= 0 ? "positive" : "attention",
    headline: `${latest.label} brought in ${formatINR(latest.revenue)} from ${formatNumber(latest.orders)} orders.`,
    detail: change === null
      ? `This is the first month on record. The strongest month so far is ${best.label} at ${formatINR(best.revenue)}.`
      : `${change >= 0 ? "Up" : "Down"} ${Math.abs(change)}% on ${prev.label}. The strongest month on record is ${best.label} at ${formatINR(best.revenue)}, from ${formatNumber(best.orders)} orders.`,
    evidence: [
      { label: "Revenue", value: formatINR(latest.revenue) },
      { label: "Orders", value: formatNumber(latest.orders) },
      { label: "Avg order", value: money(latest.orders ? latest.revenue / latest.orders : null) },
      { label: "Buyers", value: formatNumber(latest.buyers) },
    ],
  };
}

function buildStallInsight(stalled) {
  const rows = stalled || [];
  if (!rows.length) {
    return { label: "No signal", tone: "positive", headline: "Nothing is stuck.", detail: "Every listing that reached a customer has sold at least once, so there is no demand to recover." };
  }
  const deepest = rows[0];
  const totalReached = rows.reduce((s, r) => s + r.customers, 0);
  const nearMiss = rows.find((r) => r.offers > 0) || rows.find((r) => r.carts > 0) || deepest;
  return {
    label: "Lost demand",
    tone: "attention",
    headline: `${rows.length} listings reached ${formatNumber(totalReached)} customers in total and sold nothing.`,
    detail: nearMiss
      ? `${nearMiss.title} is the closest: ${formatNumber(nearMiss.offers)} customers offered on it and ${formatNumber(nearMiss.carts)} added it to a cart. Price or availability is more likely than interest.`
      : `${deepest.title} reached the most people at ${formatNumber(deepest.customers)} customers without converting.`,
    evidence: [
      { label: "Listings", value: String(rows.length) },
      { label: "Customers", value: formatNumber(totalReached) },
      { label: "Offers", value: formatNumber(rows.reduce((s, r) => s + (r.offers || 0), 0)) },
      { label: "Carts", value: formatNumber(rows.reduce((s, r) => s + (r.carts || 0), 0)) },
    ],
  };
}

function buildMixInsight(totals, topPayment, topSellers) {
  const share = topPayment ? pctOf(topPayment.orders, totals.orders) : null;
  const sellerShare = topSellers.length ? pctOf(topSellers[0].revenue, totals.revenue) : null;
  return {
    label: "Concentration",
    tone: (share ?? 0) > 70 || (sellerShare ?? 0) > 50 ? "attention" : "info",
    headline: topPayment
      ? `${share ?? 0}% of orders are paid for by ${topPayment.method || "an unspecified method"}.`
      : "No payment methods recorded yet.",
    detail:
      sellerShare !== null
        ? `The leading seller accounts for ${sellerShare}% of revenue, which is the number to watch if you are balancing growth against dependency on one seller.`
        : "Once revenue exists, this shows how concentrated it is across payment methods and sellers.",
    evidence: [
      { label: "Revenue", value: formatINR(totals.revenue) },
      { label: "Orders", value: formatNumber(totals.orders) },
      { label: "Avg discount", value: `${totals.avgDiscount ?? "n/a"}%` },
      { label: "Decide in", value: totals.avgDecisionHours !== null ? `${totals.avgDecisionHours}h` : "n/a" },
    ],
  };
}
