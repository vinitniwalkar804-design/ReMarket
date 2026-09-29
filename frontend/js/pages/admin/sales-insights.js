/**
 * Admin console — sales insights.
 *
 * Vanilla port of `pages/admin/SalesInsights.jsx`.
 *
 * The whole page is built from `Order` documents, not from `Product.status` —
 * the drift between listings-with-orders and listings-flagged-sold is surfaced
 * in the warning banner instead of being hidden. Units stay explicit throughout:
 * revenue, units, buyers, average order value, and the discount / decision-time
 * figures next to the volume they only mean something beside.
 *
 * Charts are hand-built inline SVG: a multi-series area chart (revenue gradient,
 * orders line, dashed average-order line, with a hover tooltip), and a donut for
 * purchase reasons. Everything else composes the already-ported `intel/ui`.
 */
import { h, mount } from "../../dom.js";
import { icon } from "../../icons.js";
import { link } from "../../navigation.js";
import api from "../../services/api.js";
import { formatINR, formatNumber } from "../../utils/format.js";
import { C, SERIES } from "../../utils/theme.js";
import { BarRow, EmptyPanel, InsightCard, LoadingGrid, MetricTile, Panel } from "./intel/ui.js";

const shortINR = (value) => {
  if (value == null || Number.isNaN(value)) return "-";
  const n = Math.abs(value);
  if (n >= 1e7) return `\u20B9${(value / 1e7).toFixed(1)}Cr`;
  if (n >= 1e5) return `\u20B9${(value / 1e5).toFixed(1)}L`;
  if (n >= 1e3) return `\u20B9${(value / 1e3).toFixed(0)}k`;
  return `\u20B9${Math.round(value)}`;
};

const money = (value) => (value == null || Number.isNaN(value) ? "n/a" : formatINR(value));

function formatMonthLabel(month) {
  if (!month) return "";
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return month;
  return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "short", year: "2-digit" });
}

function StatusDriftBanner({ dataQuality }) {
  if (!dataQuality) return null;
  const drift = dataQuality.listingsWithOrders - dataQuality.listingsFlaggedSold;
  if (drift <= 0) return null;
  return h(
    "div",
    { className: "flex items-start gap-3 rounded-xl border border-warning/25 bg-warning-soft px-4 py-3" },
    icon("AlertTriangle", { size: 15, className: "text-warning flex-none mt-0.5" }),
    h(
      "p",
      { className: "text-xs text-ink-700 leading-relaxed" },
      h("span", { className: "font-bold text-ink-900" }, `${formatNumber(drift)} listings sold without being flagged as sold.`),
      " ",
      dataQuality.note,
      " Everything below is counted from orders, so it is correct even where a listing still shows as ",
      h("span", { className: "font-semibold" }, "available"),
      " in the catalogue."
    )
  );
}

const niceCeil = (v) => {
  const exp = Math.floor(Math.log10(Math.max(1, v)));
  const base = Math.pow(10, exp);
  for (const m of [1, 2, 5, 10]) if (m * base >= v) return m * base;
  return 10 * base;
};

const TT_CARD = {
  background: "#FFFFFF",
  border: "1px solid #E4E7F0",
  borderRadius: "12px",
  boxShadow: "0 18px 40px -14px rgba(12,17,34,0.22)",
  fontSize: "12px",
  fontWeight: "600",
  padding: "8px 12px",
  color: "#1B2137",
  pointerEvents: "none",
  whiteSpace: "nowrap",
};

/** Monthly revenue area chart with order-volume and average-order overlays. */
function trendChart(trend) {
  const W = 680;
  const H = 256;
  const mL = 46;
  const mR = 12;
  const mT = 10;
  const mB = 30;
  const L = mL;
  const R = W - mR;
  const T = mT;
  const B = H - mB;

  const values = trend.flatMap((t) => [Number(t.revenue) || 0, Number(t.orders) || 0, Number(t.aov) || 0]);
  const yMax = niceCeil(Math.max(1, ...values));
  const n = trend.length;
  const x = (i) => (n === 1 ? (L + R) / 2 : L + (i / (n - 1)) * (R - L));
  const y = (v) => B - (v / yMax) * (B - T);

  const grid = [];
  const ticks = 5;
  for (let i = 0; i <= ticks; i++) {
    const gy = T + (i / ticks) * (B - T);
    const v = yMax - (yMax * i) / ticks;
    grid.push(h("line", { x1: L, y1: gy, x2: R, y2: gy, stroke: "#E4E7F0", strokeDasharray: "3 3", "shape-rendering": "crispEdges" }));
    grid.push(h("text", { x: mL - 8, y: gy + 3.5, textAnchor: "end", fontSize: 11, fontWeight: 600, fill: "#7C86A1" }, shortINR(v)));
  }

  const skip = n > 10 ? 2 : 1;
  const xLabels = trend.map((t, i) =>
    i % skip === 0
      ? h("text", { x: x(i), y: H - 8, textAnchor: "middle", fontSize: 10.5, fontWeight: 600, fill: "#7C86A1" }, t.label)
      : null
  );

  const linePath = (key) => trend.map((t, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(Number(t[key]) || 0).toFixed(1)}`).join(" ");
  const revenuePath = linePath("revenue");
  const areaPath = `${revenuePath} L${x(n - 1).toFixed(1)},${B} L${x(0).toFixed(1)},${B} Z`;

  const seriesLines = [
    h("path", { d: areaPath, fill: "url(#salesRevenueFill)", stroke: "none" }),
    h("path", { d: revenuePath, fill: "none", stroke: C.primary, strokeWidth: 2.5, strokeLinejoin: "round", strokeLinecap: "round" }),
    h("path", { d: linePath("orders"), fill: "none", stroke: C.accent, strokeWidth: 2, strokeLinejoin: "round", strokeLinecap: "round" }),
    h("path", { d: linePath("aov"), fill: "none", stroke: C.amber, strokeWidth: 2, strokeDasharray: "4 3", strokeLinejoin: "round", strokeLinecap: "round" }),
  ];

  const guide = h("line", { x1: 0, y1: T, x2: 0, y2: B, stroke: "#0C1122", strokeOpacity: 0.18, strokeWidth: 1, display: "none" });
  const dots = [];
  const rows = [
    { key: "revenue", color: C.primary },
    { key: "orders", color: C.accent },
    { key: "aov", color: C.amber },
  ];
  rows.forEach((ser) => {
    const d = h("circle", { r: 3.5, fill: ser.color, stroke: "#FFFFFF", strokeWidth: 1.5, display: "none" });
    d.setAttribute("data-series", ser.key);
    dots.push(d);
  });

  const wrap = h("div", { className: "relative" });

  const tip = h("div", { style: { ...TT_CARD, position: "absolute", opacity: "0", top: "0", left: "0" } });
  wrap.appendChild(tip);

  const svg = h(
    "svg",
    { viewBox: `0 0 ${W} ${H}`, width: "100%", preserveAspectRatio: "xMidYMid meet", role: "img", "aria-label": "Monthly revenue trend" },
    h(
      "defs",
      null,
      h(
        "linearGradient",
        { id: "salesRevenueFill", x1: "0", y1: "0", x2: "0", y2: "1" },
        h("stop", { offset: "0%", stopColor: C.primary, stopOpacity: 0.28 }),
        h("stop", { offset: "100%", stopColor: C.primary, stopOpacity: 0.02 })
      )
    ),
    grid,
    seriesLines,
    guide,
    dots,
    xLabels
  );
  wrap.appendChild(svg);

  const setTip = (i) => {
    const t = trend[i];
    if (!t) return;
    svg.setAttribute("style", "cursor: crosshair");
    guide.setAttribute("x1", x(i).toFixed(1));
    guide.setAttribute("x2", x(i).toFixed(1));
    guide.setAttribute("style", "display: block");
    for (const d of dots) {
      const key = d.getAttribute("data-series");
      d.setAttribute("cx", x(i).toFixed(1));
      d.setAttribute("cy", y(Number(t[key]) || 0).toFixed(1));
      d.setAttribute("style", "display: block");
    }
    mount(
      tip,
      h("div", null,
        h("div", { className: "text-2xs font-bold uppercase tracking-wider text-muted mb-1" }, t.label),
        h("div", { className: "flex items-center gap-2 justify-between min-w-[150px]" },
          h("span", { className: "flex items-center gap-1.5" }, h("span", { className: "w-2 h-0.5 rounded-full", style: { background: C.primary } }), "Revenue"),
          h("span", { className: "tabular" }, formatINR(t.revenue))),
        h("div", { className: "flex items-center gap-2 justify-between" },
          h("span", { className: "flex items-center gap-1.5" }, h("span", { className: "w-2 h-0.5 rounded-full", style: { background: C.accent } }), "Orders"),
          h("span", { className: "tabular" }, formatNumber(t.orders))),
        h("div", { className: "flex items-center gap-2 justify-between" },
          h("span", { className: "flex items-center gap-1.5" }, h("span", { className: "w-2 h-0.5 rounded-full", style: { background: C.amber } }), "Avg order"),
          h("span", { className: "tabular" }, formatNumber(t.aov))))
    );
  };
  const hide = () => {
    tip.style.opacity = "0";
    guide.setAttribute("style", "display: none");
    for (const d of dots) d.setAttribute("style", "display: none");
  };

  wrap.addEventListener("mousemove", (e) => {
    const rect = wrap.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const plotL = (L / W) * rect.width;
    const plotR = (R / W) * rect.width;
    const clamped = Math.min(Math.max(px, plotL), plotR);
    const frac = (clamped - plotL) / (plotR - plotL);
    const i = Math.round(frac * (n - 1));
    const tx = Math.min(Math.max(clamped + 12, 0), rect.width - 180);
    tip.style.left = `${tx}px`;
    tip.style.top = `${Math.min(Math.max(e.clientY - rect.top - 70, 4), rect.height - 130)}px`;
    tip.style.opacity = "1";
    setTip(i);
  });
  wrap.addEventListener("mouseleave", hide);

  return wrap;
}

/** Donut of purchase reasons, with a native title tooltip per slice. */
function reasonPie(rows) {
  const total = rows.reduce((sum, r) => sum + (Number(r.count) || 0), 0) || 1;
  const cx = 110;
  const cy = 104;
  const R = 72;
  const r = 46;
  const pad = 0.035;
  let acc = 0;
  const segs = rows.map((row, i) => {
    const frac = (Number(row.count) || 0) / total;
    let a0 = acc * 2 * Math.PI;
    let a1 = (acc + frac) * 2 * Math.PI;
    acc += frac;
    if (a1 - a0 > pad * 2) {
      a0 += pad;
      a1 -= pad;
    }
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const x0 = cx + R * Math.cos(a0);
    const y0 = cy + R * Math.sin(a0);
    const x1 = cx + R * Math.cos(a1);
    const y1 = cy + R * Math.sin(a1);
    const xi0 = cx + r * Math.cos(a1);
    const yi0 = cy + r * Math.sin(a1);
    const xi1 = cx + r * Math.cos(a0);
    const yi1 = cy + r * Math.sin(a0);
    const d = `M${x0.toFixed(1)},${y0.toFixed(1)} A${R},${R} 0 ${large} 1 ${x1.toFixed(1)},${y1.toFixed(1)} L${xi0.toFixed(1)},${yi0.toFixed(1)} A${r},${r} 0 ${large} 0 ${xi1.toFixed(1)},${yi1.toFixed(1)} Z`;
    return h(
      "path",
      { key: row.reason, d, fill: SERIES[i % SERIES.length], stroke: "#FFFFFF", strokeWidth: 1.5 },
      h("title", null, `${row.reason}: ${formatNumber(row.count)} orders`)
    );
  });
  return h(
    "svg",
    { viewBox: "0 0 220 208", width: "100%", height: "100%", preserveAspectRatio: "xMidYMid meet", role: "img", "aria-label": "Purchase reasons" },
    segs
  );
}

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
    detail:
      change === null
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

export default function SalesInsights() {
  const st = { data: null, loading: true, error: null, productSort: "units" };
  let disposed = false;

  const root = h("div", { className: "space-y-5" });
  const contentHost = h("div");
  root.appendChild(contentHost);

  function ensureAlive() {
    if (root.isConnected) return true;
    if (!disposed) {
      disposed = true;
    }
    return false;
  }

  const observer = new MutationObserver(() => {
    if (!ensureAlive()) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  const load = async () => {
    st.loading = true;
    st.error = null;
    paint();
    try {
      const { data } = await api.get("/admin/sales-insights?limit=12");
      if (!ensureAlive()) return;
      st.data = data;
      st.loading = false;
      paint();
    } catch (err) {
      if (!ensureAlive()) return;
      st.error = err?.response?.data?.message || err?.message || "Could not load sales insights.";
      st.loading = false;
      paint();
    }
  };

  const paint = () => {
    if (st.loading) {
      mount(contentHost, LoadingGrid({ rows: 4, height: "h-28" }));
      return;
    }
    if (st.error) {
      mount(
        contentHost,
        Panel({ title: "Sales insights unavailable", children: EmptyPanel({ title: "Sales insights could not be loaded", message: st.error, icon: "AlertTriangle" }) })
      );
      return;
    }
    if (!st.data) {
      mount(contentHost, null);
      return;
    }

    const { basis, totals, dataQuality, categories, monthly, demandVsSales, purchaseReasons, paymentMix, topSellers } = st.data;
    const hasSales = (totals?.orders ?? 0) > 0;

    const topProducts = st.productSort === "units" ? st.data.topProducts?.byUnits || [] : st.data.topProducts?.byRevenue || [];
    const trend = (monthly || []).map((m) => ({
      ...m,
      label: formatMonthLabel(m.month),
      aov: m.orders > 0 ? Math.round(m.revenue / m.orders) : 0,
    }));
    const maxCategoryRevenue = Math.max(1, ...(categories || []).map((c) => c.revenue));
    const maxTopProduct = Math.max(1, ...topProducts.map((p) => p[st.productSort] || 0));
    const topPayment = (paymentMix || []).reduce((best, p) => (p.orders > (best?.orders ?? 0) ? p : best), null);

    mount(
      contentHost,
      h(
        "div",
        { className: "space-y-5" },
        h(
          "header",
          null,
          h("span", { className: "page-eyebrow" }, icon("Coins", { size: 12 }), " Marketplace Intelligence"),
          h("h1", { className: "page-title" }, "Sales insights"),
          h("p", { className: "page-sub" }, "What actually sold, how the money trended, and where demand and sales disagree.")
        ),
        h(
          "div",
          { className: "grid grid-cols-2 lg:grid-cols-4 gap-4" },
          MetricTile({ label: "Revenue", value: formatINR(totals.revenue), sub: `Agreed price after negotiation, across ${formatNumber(totals.orders)} orders` }),
          MetricTile({ label: "Units sold", value: formatNumber(totals.units), sub: `${totals.avgUnitsPerOrder ?? "n/a"} per order on average` }),
          MetricTile({ label: "Buyers", value: formatNumber(totals.buyers), sub: `From ${formatNumber(totals.sellers)} sellers` }),
          MetricTile({ label: "Average order", value: formatINR(totals.avgOrderValue), sub: `${totals.avgDiscount ?? "n/a"}% average discount \u00B7 ${totals.avgDecisionHours ?? "n/a"}h to decide` })
        ),
        StatusDriftBanner({ dataQuality }),
        h(
          "div",
          { className: "flex items-start gap-3 rounded-xl border border-line bg-raised px-4 py-3" },
          icon("Info", { size: 15, className: "text-primary flex-none mt-0.5" }),
          h(
            "p",
            { className: "text-xs text-muted leading-relaxed" },
            h("span", { className: "font-bold text-ink-900" }, "Counted in orders, not customers."),
            " ",
            basis?.saleDefinition,
            " ",
            basis?.revenueDefinition,
            " ",
            basis?.customerNote
          )
        ),
        hasSales
          ? [
              Panel({
                title: "Revenue trend",
                sub: "Monthly agreed revenue, with order volume and average order value",
                children: [
                  h("div", { className: "h-64" }, trendChart(trend)),
                  h(
                    "div",
                    { className: "flex flex-wrap gap-4 mt-3 pt-3 border-t border-line" },
                    [
                      { label: "Revenue", color: C.primary },
                      { label: "Orders", color: C.accent },
                      { label: "Average order", color: C.amber },
                    ].map((l) =>
                      h(
                        "span",
                        { key: l.label, className: "inline-flex items-center gap-2 text-2xs font-bold text-muted" },
                        h("span", { className: "w-3 h-0.5 rounded-full", style: { background: l.color } }),
                        l.label
                      )
                    )
                  ),
                ],
              }),
              Panel({
                title: "Best selling listings",
                sub: "Ranked from completed orders",
                action: h(
                  "div",
                  { className: "tab-list" },
                  [
                    { key: "units", label: "By units" },
                    { key: "revenue", label: "By revenue" },
                  ].map((o) =>
                    h(
                      "button",
                      {
                        key: o.key,
                        type: "button",
                        onClick: () => { st.productSort = o.key; paint(); },
                        className: `tab ${st.productSort === o.key ? "tab-active" : ""}`,
                      },
                      o.label
                    )
                  )
                ),
                children:
                  topProducts.length === 0
                    ? EmptyPanel({ title: "No sales to rank yet", message: "Listings appear here once they sell.", icon: "Package" })
                    : h(
                        "div",
                        { className: "grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-1" },
                        topProducts.map((p, i) => {
                          const subParts = [p.category, formatINR(p.price), `${formatNumber(p.orders)} orders`, `${formatNumber(p.buyers)} buyers`];
                          if (p.customers > 0) {
                            subParts.push(p.interestToPurchaseRate === null ? "no attracted customers to compare" : `${p.interestToPurchaseRate}% of attracted customers bought`);
                          }
                          return BarRow({
                            key: p.id,
                            label: p.title,
                            value: p[st.productSort] || 0,
                            max: maxTopProduct,
                            color: SERIES[i % SERIES.length],
                            badge: h("span", { className: "badge-neutral", title: st.productSort === "units" ? "Revenue from this listing" : "Units sold" }, st.productSort === "units" ? formatINR(p.revenue) : `${formatNumber(p.units)} units`),
                            sub: subParts.join(" \u00B7 "),
                          });
                        })
                      ),
              }),
              h(
                "div",
                { className: "grid grid-cols-1 lg:grid-cols-2 gap-5" },
                Panel({
                  title: demandVsSales?.engagedButUnsold?.label,
                  sub: demandVsSales?.engagedButUnsold?.note,
                  children:
                    !demandVsSales?.engagedButUnsold?.rows?.length
                      ? EmptyPanel({ title: "Nothing stuck", message: "Every listing that reached a customer has sold at least once.", icon: "Target" })
                      : h(
                          "div",
                          { className: "space-y-2" },
                          demandVsSales.engagedButUnsold.rows.map((p) =>
                            h(
                              "div",
                              { key: p.id, className: "sunken-panel p-3" },
                              h(
                                "div",
                                { className: "flex items-center justify-between gap-3" },
                                h(
                                  "div",
                                  { className: "min-w-0" },
                                  h("div", { className: "text-sm font-semibold text-ink-900 truncate" }, p.title),
                                  h("div", { className: "text-2xs text-muted" }, `${p.category} \u00B7 ${formatINR(p.price)}`)
                                ),
                                h(
                                  "div",
                                  { className: "text-right flex-none" },
                                  h("div", { className: "text-sm font-extrabold text-ink-900 tabular" }, formatNumber(p.customers)),
                                  h("div", { className: "text-2xs text-muted-soft" }, "customers reached")
                                )
                              ),
                              h(
                                "div",
                                { className: "flex flex-wrap gap-1.5 mt-2" },
                                p.reached && h("span", { className: "badge-warning", title: "The deepest stage any of these customers reached" }, `deepest: ${p.reached}`),
                                p.views > 0 && h("span", { className: "badge-neutral" }, `${p.views} viewed`),
                                p.wishlists > 0 && h("span", { className: "badge-neutral" }, `${p.wishlists} saved`),
                                p.carts > 0 && h("span", { className: "badge-neutral" }, `${p.carts} carted`),
                                p.offers > 0 && h("span", { className: "badge-neutral" }, `${p.offers} offered`)
                              )
                            )
                          )
                        ),
                }),
                Panel({
                  title: demandVsSales?.converting?.label,
                  sub: demandVsSales?.converting?.note,
                  children:
                    !demandVsSales?.converting?.rows?.length
                      ? EmptyPanel({ title: "No conversions yet", message: "Listings appear here once they have attracted and converted customers.", icon: "TrendingUp" })
                      : h(
                          "div",
                          { className: "table-wrap" },
                          h(
                            "table",
                            { className: "data-table" },
                            h(
                              "thead",
                              null,
                              h(
                                "tr",
                                null,
                                h("th", null, "Listing"),
                                h("th", { className: "th-num" }, "Attracted"),
                                h("th", { className: "th-num" }, "Bought"),
                                h("th", { className: "th-num" }, "Rate"),
                                h("th", { className: "th-num" }, "Revenue")
                              )
                            ),
                            h(
                              "tbody",
                              null,
                              demandVsSales.converting.rows.map((p) =>
                                h(
                                  "tr",
                                  { key: p.id },
                                  h(
                                    "td",
                                    null,
                                    h("div", { className: "text-sm font-semibold text-ink-900 truncate max-w-[220px]" }, p.title),
                                    h("div", { className: "text-2xs text-muted" }, p.category)
                                  ),
                                  h("td", { className: "num text-muted" }, formatNumber(p.customers)),
                                  h("td", { className: "num text-ink-900" }, formatNumber(p.buyers)),
                                  h("td", { className: "num text-primary font-bold" }, p.interestToPurchaseRate === null ? "n/a" : `${p.interestToPurchaseRate}%`),
                                  h("td", { className: "num text-muted" }, formatINR(p.revenue))
                                )
                              )
                            )
                          )
                        ),
                })
              ),
              Panel({
                title: "Revenue by category",
                sub: "What each category actually earns, against the interest it attracts",
                children:
                  categories.length === 0
                    ? EmptyPanel({ title: "No category sales yet", message: "Category revenue appears once orders exist.", icon: "BarChart3" })
                    : h(
                        "div",
                        { className: "space-y-2" },
                        categories.map((c, i) =>
                          h(
                            "div",
                            { key: c.category, className: "sunken-panel p-3.5" },
                            h(
                              "div",
                              { className: "flex items-center justify-between gap-3 mb-2" },
                              h(
                                "div",
                                { className: "flex items-center gap-2.5 min-w-0" },
                                h("span", { className: "w-2.5 h-2.5 rounded-full flex-none", style: { background: SERIES[i % SERIES.length] } }),
                                h("span", { className: "text-sm font-bold text-ink-900 truncate" }, c.category)
                              ),
                              h(
                                "div",
                                { className: "text-right flex-none" },
                                h("div", { className: "text-sm font-extrabold text-ink-900 tabular" }, formatINR(c.revenue)),
                                h("div", { className: "text-2xs text-muted-soft tabular" }, `${formatNumber(c.units)} units \u00B7 ${formatNumber(c.orders)} orders`)
                              )
                            ),
                            h("div", { className: "h-1.5 bg-line rounded-full overflow-hidden mb-2" }, h("div", { className: "h-full rounded-full transition-all duration-500", style: { width: `${(c.revenue / maxCategoryRevenue) * 100}%`, background: SERIES[i % SERIES.length] } })),
                            h(
                              "div",
                              { className: "flex flex-wrap gap-x-4 gap-y-1 text-2xs text-muted" },
                              h("span", null, h("b", { className: "text-ink-900 tabular" }, formatNumber(c.customers)), " customers attracted"),
                              h("span", null, h("b", { className: "text-ink-900 tabular" }, formatNumber(c.buyers)), " buyers"),
                              h("span", null, h("b", { className: "text-ink-900 tabular" }, formatNumber(c.listings)), " listings"),
                              c.interestToPurchaseRate === null
                                ? h("span", { className: "text-muted-soft" }, "no attracted customers to compare")
                                : h("span", { className: c.interestToPurchaseRate > 40 ? "text-success font-bold" : "" }, h("b", { className: "tabular" }, `${c.interestToPurchaseRate}%`), " of attracted customers bought")
                            )
                          )
                        )
                      ),
              }),
              h(
                "div",
                { className: "grid grid-cols-1 lg:grid-cols-3 gap-5" },
                Panel({
                  title: "Why customers buy",
                  sub: "Stated reason on the order",
                  children:
                    purchaseReasons.length === 0
                      ? EmptyPanel({ title: "No reasons recorded", message: "Orders that state a reason appear here." })
                      : h("div", { className: "h-52" }, reasonPie(purchaseReasons)),
                }),
                Panel({
                  title: "Payment methods",
                  sub: "How orders are paid for",
                  children:
                    paymentMix.length === 0
                      ? EmptyPanel({ title: "No payments recorded", message: "Payment methods appear once orders exist." })
                      : h(
                          "div",
                          { className: "space-y-2" },
                          paymentMix.map((p, i) =>
                            BarRow({
                              key: p.method,
                              label: p.method || "unspecified",
                              value: p.orders,
                              max: Math.max(...paymentMix.map((x) => x.orders)),
                              color: SERIES[i % SERIES.length],
                              sub: `${formatINR(p.revenue)} from ${formatNumber(p.orders)} orders`,
                            })
                          )
                        ),
                }),
                Panel({
                  title: "Revenue concentration",
                  sub: "How much of the money each seller represents",
                  children:
                    topSellers.length === 0
                      ? EmptyPanel({ title: "No sellers yet", message: "Seller revenue appears once orders exist.", icon: "Users" })
                      : [
                          h(
                            "div",
                            { className: "space-y-2" },
                            topSellers.slice(0, 6).map((s, i) => {
                              const share = totals.revenue > 0 ? Math.round((s.revenue / totals.revenue) * 100) : null;
                              return h(
                                "div",
                                { key: s.sellerId, className: "flex items-center gap-3" },
                                h("span", { className: `w-6 h-6 rounded-lg flex items-center justify-center text-2xs font-extrabold flex-none ${i === 0 ? "bg-primary text-white" : "bg-white border border-line text-muted"}` }, i + 1),
                                h(
                                  "div",
                                  { className: "flex-1 min-w-0" },
                                  h(
                                    "div",
                                    { className: "flex items-center justify-between gap-2 mb-1" },
                                    h("span", { className: "text-2xs text-muted" }, `${formatNumber(s.units)} units \u00B7 ${formatNumber(s.orders)} orders`),
                                    h("span", { className: "text-xs font-extrabold text-ink-900 tabular" }, formatINR(s.revenue), share !== null ? h("span", { className: "text-muted-soft font-semibold" }, ` \u00B7 ${share}%`) : null)
                                  ),
                                  h("div", { className: "h-1.5 bg-line rounded-full overflow-hidden" }, h("div", { className: "h-full rounded-full transition-all duration-500", style: { width: `${totals.revenue > 0 ? (s.revenue / totals.revenue) * 100 : 0}%`, background: SERIES[i % SERIES.length] } }))
                                )
                              );
                            })
                          ),
                          h(
                            "p",
                            { className: "text-2xs text-muted-soft mt-3 pt-3 border-t border-line" },
                            "Seller names, ratings and stock detail are on ",
                            h("a", link("/admin/seller-intelligence", { className: "font-bold text-primary hover:underline" }), "Seller Intelligence"),
                            "."
                          ),
                        ],
                }),
              ),
              h(
                "div",
                { className: "grid grid-cols-1 lg:grid-cols-3 gap-4" },
                InsightCard({ insight: buildTrendInsight(trend) }),
                InsightCard({ insight: buildStallInsight(demandVsSales?.engagedButUnsold?.rows) }),
                InsightCard({ insight: buildMixInsight(totals, topPayment, topSellers) })
              ),
            ]
          : Panel({
              title: "No sales recorded yet",
              children: EmptyPanel({
                title: "Nothing has sold on this marketplace yet",
                message: "Sales are read from confirmed orders. Once a listing sells, the trend, category and seller breakdowns below fill in automatically.",
                icon: "Receipt",
              }),
            })
      )
    );
  };

  paint();
  load();

  return root;
}