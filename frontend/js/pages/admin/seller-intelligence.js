/**
 * Admin console — seller intelligence.
 *
 * Vanilla port of `pages/admin/SellerIntelligence.jsx`.
 *
 * An analytical leaderboard, deliberately separate from the operational seller
 * directory at `/admin/sellers`: that directory exists to act on a seller
 * (approve, suspend, message), this page answers who converts, who negotiates
 * well, and whose status flag is lying to them.
 *
 * Two derived numbers do most of the work. Sell-through counts listings that
 * have sold, derived from order history, not from `Product.status === "sold"`
 * (that flag drifts badly on this data). Acceptance rate is offers accepted
 * over offers received, and reads null rather than 0% when a seller has never
 * received an offer: a seller nobody has bid on is not refusing bids.
 */
import { h, mount } from "../../dom.js";
import { icon } from "../../icons.js";
import { link } from "../../navigation.js";
import api from "../../services/api.js";
import { formatINR, formatNumber } from "../../utils/format.js";
import { SERIES } from "../../utils/theme.js";
import { EmptyPanel, InsightCard, LoadingGrid, MetricTile, NoSearchResults, Panel } from "./intel/ui.js";

const SORTS = [
  { key: "revenue", label: "Revenue" },
  { key: "units", label: "Units" },
  { key: "sellThrough", label: "Sell-through" },
  { key: "listings", label: "Stock" },
  { key: "rating", label: "Rating" },
  { key: "buyers", label: "Buyers" },
];

/** A rate that refuses to lie: null means "not measurable", not "zero". */
const Rate = ({ value }) =>
  value === null || value === undefined
    ? h("span", { className: "badge-neutral", title: "No denominator: this seller has no stock, or no offers received" }, "n/a")
    : h("span", { className: "tabular" }, `${value}%`);

const StarRating = ({ rating, count }) => {
  const r = Number(rating || 0);
  if (!r) return h("span", { className: "text-muted-soft text-xs" }, "unrated");
  return h(
    "span",
    { className: "inline-flex items-center gap-1", title: `${r} from ${formatNumber(count || 0)} ratings` },
    icon("Star", { size: 12, className: "text-rating fill-rating" }),
    h("span", { className: "text-xs font-bold text-ink-900 tabular" }, r.toFixed(1))
  );
};

/** Chart axis labels are narrow; full names live in the table below. */
function shortName(name = "") {
  const trimmed = String(name).trim();
  if (trimmed.length <= 12) return trimmed;
  return `${trimmed.slice(0, 11)}…`;
}

const niceCeil = (v) => {
  const exp = Math.floor(Math.log10(Math.max(1, v)));
  const base = Math.pow(10, exp);
  for (const m of [1, 2, 5, 10]) if (m * base >= v) return m * base;
  return 10 * base;
};

const shortINR = (value) => {
  if (value == null || Number.isNaN(value)) return "-";
  const n = Math.abs(value);
  if (n >= 1e7) return `\u20B9${(value / 1e7).toFixed(1)}Cr`;
  if (n >= 1e5) return `\u20B9${(value / 1e5).toFixed(1)}L`;
  if (n >= 1e3) return `\u20B9${(value / 1e3).toFixed(0)}k`;
  return `\u20B9${Math.round(value)}`;
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

/** Leading-seller revenue bars, with a hover tooltip carrying exact revenue and units. */
function sellerChart(chartData) {
  const W = 760;
  const H = 256;
  const mL = 56;
  const mR = 10;
  const mT = 10;
  const mB = 42;
  const L = mL;
  const R = W - mR;
  const T = mT;
  const B = H - mB;

  const n = chartData.length;
  const yMax = niceCeil(Math.max(1, ...chartData.map((c) => Number(c.revenue) || 0)));
  const slotW = (R - L) / n;
  const barW = Math.min(44, slotW * 0.55);
  const x = (i) => L + (i + 0.5) * slotW;
  const y = (v) => B - (v / yMax) * (B - T);

  const grid = [];
  const ticks = 5;
  for (let i = 0; i <= ticks; i++) {
    const gy = T + (i / ticks) * (B - T);
    const v = yMax - (yMax * i) / ticks;
    grid.push(h("line", { x1: L, y1: gy, x2: R, y2: gy, stroke: "#E4E7F0", strokeDasharray: "3 3", "shape-rendering": "crispEdges" }));
    grid.push(h("text", { x: mL - 8, y: gy + 3.5, textAnchor: "end", fontSize: 11, fontWeight: 600, fill: "#7C86A1" }, shortINR(v)));
  }

  const bars = chartData.map((c, i) => {
    const cx = x(i);
    const x0 = cx - barW / 2;
    const x1 = cx + barW / 2;
    const yTop = y(Number(c.revenue) || 0);
    const rad = 6;
    const d = `M${x0.toFixed(1)},${B} L${x0.toFixed(1)},${(yTop + rad).toFixed(1)} Q${x0.toFixed(1)},${yTop.toFixed(1)} ${(x0 + rad).toFixed(1)},${yTop.toFixed(1)} L${(x1 - rad).toFixed(1)},${yTop.toFixed(1)} Q${x1.toFixed(1)},${yTop.toFixed(1)} ${x1.toFixed(1)},${(yTop + rad).toFixed(1)} L${x1.toFixed(1)},${B} Z`;
    return h(
      "path",
      { key: c.id, d, fill: SERIES[i % SERIES.length] },
      h("title", null, `${formatINR(c.revenue)} from ${formatNumber(c.units)} units`)
    );
  });

  const xLabels = chartData.map((c, i) =>
    h(
      "text",
      { key: c.id, x: x(i).toFixed(1), y: B + 16, textAnchor: "end", fontSize: 10.5, fontWeight: 600, fill: "#5B6580", transform: `rotate(-18 ${x(i).toFixed(1)} ${(B + 16).toFixed(1)})` },
      c.name
    )
  );

  const guide = h("line", { x1: 0, y1: T, x2: 0, y2: B, stroke: "#0C1122", strokeOpacity: 0.15, strokeWidth: 1, display: "none" });

  const wrap = h("div", { className: "relative" });
  const tip = h("div", { style: { ...TT_CARD, position: "absolute", opacity: "0", top: "0", left: "0" } });
  wrap.appendChild(tip);

  wrap.appendChild(
    h(
      "svg",
      { viewBox: `0 0 ${W} ${H}`, width: "100%", preserveAspectRatio: "xMidYMid meet", role: "img", "aria-label": "Leading sellers by revenue" },
      grid,
      bars,
      guide,
      xLabels
    )
  );

  wrap.addEventListener("mousemove", (e) => {
    const rect = wrap.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const plotL = (L / W) * rect.width;
    const plotR = (R / W) * rect.width;
    const clamped = Math.min(Math.max(px, plotL), plotR);
    const i = Math.min(Math.max(Math.floor(((clamped - plotL) / (plotR - plotL)) * n), 0), n - 1);
    const c = chartData[i];
    if (!c) return;
    wrap.style.cursor = "crosshair";
    const gx = (x(i) / W) * rect.width;
    guide.setAttribute("x1", x(i).toFixed(1));
    guide.setAttribute("x2", x(i).toFixed(1));
    guide.setAttribute("style", "display: block");
    const tx = Math.min(Math.max(px + 12, 0), rect.width - 170);
    const ty = Math.min(Math.max(e.clientY - rect.top - 46, 4), rect.height - 96);
    tip.style.left = `${tx}px`;
    tip.style.top = `${ty}px`;
    tip.style.opacity = "1";
    mount(
      tip,
      h("div", null,
        h("div", { className: "text-2xs font-bold uppercase tracking-wider text-muted mb-1" }, c.name),
        h("div", { className: "flex items-center gap-3" },
          h("span", { className: "text-sm font-extrabold text-ink-900 tabular" }, formatINR(c.revenue)),
          h("span", { className: "text-2xs text-muted-soft" }, `${formatNumber(c.units)} units`)))
    );
  });
  wrap.addEventListener("mouseleave", () => {
    tip.style.opacity = "0";
    guide.setAttribute("style", "display: none");
  });

  return wrap;
}

export default function SellerIntelligence() {
  const st = {
    data: null,
    loading: true,
    error: null,
    sort: "revenue",
    query: "",
    headerBuilt: false,
    queryInput: null,
    clearBtn: null,
    tabBtns: {},
    countText: null,
    showSort: false,
    showOf: false,
  };
  let disposed = false;

  const root = h("div", { className: "space-y-5" });
  const headerHost = h("div");
  const bodyHost = h("div");
  root.appendChild(headerHost);
  root.appendChild(bodyHost);

  function ensureAlive() {
    if (root.isConnected) return true;
    if (!disposed) disposed = true;
    return false;
  }

  const observer = new MutationObserver(() => {
    if (!ensureAlive()) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  const filteredRows = () => {
    const sellers = st.data?.sellers ?? [];
    const q = st.query.trim().toLowerCase();
    if (!q) return sellers;
    return sellers.filter(
      (s) => s.name?.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q) || s.location?.toLowerCase().includes(q)
    );
  };

  const sortedRows = () => {
    const comparators = {
      revenue: (a, b) => b.revenue - a.revenue,
      units: (a, b) => b.units - a.units,
      listings: (a, b) => b.listings - a.listings,
      sellThrough: (a, b) => (b.sellThroughRate ?? -1) - (a.sellThroughRate ?? -1),
      rating: (a, b) => b.rating - a.rating || b.ratingCount - a.ratingCount,
      buyers: (a, b) => b.buyers - a.buyers,
    };
    return [...filteredRows()].sort(comparators[st.sort] ?? comparators.revenue);
  };

  const setQuery = (q) => {
    st.query = q;
    if (st.queryInput) st.queryInput.value = q;
    repaintHeaderBits();
    paint();
  };

  const setSort = (key) => {
    st.sort = key;
    repaintHeaderBits();
    paint();
  };

  const repaintHeaderBits = () => {
    if (st.showSort) {
      for (const [key, btn] of Object.entries(st.tabBtns)) {
        btn.classList.toggle("tab-active", st.sort === key);
      }
    }
    if (st.clearBtn) st.clearBtn.style.display = st.query ? "" : "none";
    if (st.countText) {
      const sellers = st.data?.sellers ?? [];
      const filtered = st.query.trim() ? filteredRows() : sellers;
      st.countText.textContent = st.showOf ? `Showing ${filtered.length} of ${sellers.length} sellers` : `Showing ${filtered.length} sellers`;
    }
  };

  const buildHeader = () => {
    const sellers = st.data?.sellers ?? [];
    st.showSort = sellers.length > 0;
    st.showOf = sellers.length > 0;

    const header = h("header", { className: "flex flex-col lg:flex-row lg:items-end justify-between gap-4" });
    header.appendChild(
      h("div", null,
        h("span", { className: "page-eyebrow" }, icon("TrendingUp", { size: 12 }), " Marketplace Intelligence"),
        h("h1", { className: "page-title" }, "Seller intelligence"),
        h("p", { className: "page-sub" }, "Who is carrying the marketplace, who is stuck, and who negotiates well.")
      )
    );

    const controls = h("div", { className: "flex flex-col sm:flex-row items-stretch sm:items-center gap-3" });
    const box = h("div", { className: "relative" });
    box.appendChild(icon("Search", { size: 14, className: "absolute left-3 top-1/2 -translate-y-1/2 text-muted-soft pointer-events-none" }));
    const input = h("input", {
      type: "search",
      value: st.query,
      placeholder: "Search seller, email or location",
      className: "input-field pl-9 w-full sm:w-64",
      "aria-label": "Search sellers",
    });
    st.queryInput = input;
    input.addEventListener("input", (e) => setQuery(e.target.value));
    box.appendChild(input);
    const clearBtn = h("button", {
      type: "button",
      "aria-label": "Clear search",
      className: "absolute right-2 top-1/2 -translate-y-1/2 text-muted-soft hover:text-ink-900",
    });
    st.clearBtn = clearBtn;
    clearBtn.style.display = st.query ? "" : "none";
    clearBtn.addEventListener("click", () => setQuery(""));
    clearBtn.appendChild(icon("X", { size: 14 }));
    box.appendChild(clearBtn);
    controls.appendChild(box);

    if (st.showSort) {
      const tabs = h("div", { className: "tab-list" });
      for (const s of SORTS) {
        const btn = h("button", { type: "button", className: `tab ${st.sort === s.key ? "tab-active" : ""}` }, s.label);
        st.tabBtns[s.key] = btn;
        btn.addEventListener("click", () => setSort(s.key));
        tabs.appendChild(btn);
      }
      controls.appendChild(tabs);
    }
    header.appendChild(controls);

    if (st.showOf) {
      const p = h("p", { className: "text-2xs text-muted-soft -mt-2" });
      st.countText = p;
      header.appendChild(p);
    }
    st.headerBuilt = true;
    repaintHeaderBits();
    return header;
  };

  const load = async () => {
    st.loading = true;
    st.error = null;
    paint();
    try {
      const { data } = await api.get("/admin/seller-intelligence?limit=200&sort=revenue");
      if (!ensureAlive()) return;
      st.data = data;
      st.loading = false;
      if (!st.headerBuilt) mount(headerHost, buildHeader());
      paint();
    } catch (err) {
      if (!ensureAlive()) return;
      st.error = err?.response?.data?.message || err?.message || "Could not load seller intelligence.";
      st.loading = false;
      paint();
    }
  };

  const paint = () => {
    if (st.loading) {
      mount(bodyHost, LoadingGrid({ rows: 4, height: "h-28" }));
      return;
    }
    if (st.error) {
      mount(bodyHost, Panel({ title: "Seller intelligence unavailable", children: EmptyPanel({ title: "Seller intelligence could not be loaded", message: st.error, icon: "AlertTriangle" }) }));
      return;
    }
    if (!st.data) {
      mount(bodyHost, null);
      return;
    }

    const sellers = st.data.sellers ?? [];
    const totals = st.data.totals;
    if (!st.headerBuilt) mount(headerHost, buildHeader());

    if (sellers.length === 0) {
      repaintHeaderBits();
      mount(
        bodyHost,
        Panel({
          title: "No sellers registered",
          children: EmptyPanel({
            title: "No seller accounts exist yet",
            message: "Seller performance appears here as soon as accounts are registered, with stock, sales and reputation derived from real orders.",
            icon: "Building2",
          }),
        })
      );
      return;
    }

    repaintHeaderBits();

    const rows = sortedRows();
    const withSales = sellers.filter((s) => s.units > 0);
    const driftSellers = sellers.filter((s) => s.soldFlagged < s.soldListings);
    const revenueConcentration = totals.revenue > 0 && rows.length ? Math.round((rows[0].revenue / totals.revenue) * 100) : null;
    const chartData = withSales.slice(0, 8).map((s) => ({ id: s.id, name: shortName(s.name), revenue: s.revenue, units: s.units }));
    const stockData = withSales.slice(0, 8);
    const maxUnits = Math.max(1, ...stockData.map((x) => x.units || 0));

    mount(
      bodyHost,
      h(
        "div",
        { className: "space-y-5" },
        h(
          "div",
          { className: "grid grid-cols-2 lg:grid-cols-4 gap-4" },
          MetricTile({ label: "Revenue from sellers", value: formatINR(totals.revenue), sub: `${formatNumber(totals.units)} units sold by ${formatNumber(totals.sellers)} sellers` }),
          MetricTile({ label: "Stock listed", value: formatNumber(totals.listings), sub: `${formatNumber(totals.activeListings)} currently available` }),
          MetricTile({ label: "Listings that sold", value: formatNumber(totals.soldListings), sub: "Derived from orders, not the stored status flag" }),
          MetricTile({ label: "Buyers served", value: formatNumber(totals.buyers), sub: `From ${formatNumber(totals.offers)} offers received by sellers` })
        ),
        driftSellers.length > 0 &&
          h(
            "div",
            { className: "flex items-start gap-3 rounded-xl border border-warning/25 bg-warning-soft px-4 py-3" },
            icon("AlertTriangle", { size: 15, className: "text-warning flex-none mt-0.5" }),
            h(
              "p",
              { className: "text-xs text-ink-700 leading-relaxed" },
              h("span", { className: "font-bold text-ink-900" }, `${formatNumber(driftSellers.length)} ${driftSellers.length === 1 ? "seller has" : "sellers have"} sold listings that are not flagged as sold.`),
              " ",
              st.data.basis.sellThroughNote,
              " Sell-through below is calculated from order history, so it is accurate regardless of the flag."
            )
          ),
        h(
          "div",
          { className: "flex items-start gap-3 rounded-xl border border-line bg-raised px-4 py-3" },
          icon("ShieldCheck", { size: 15, className: "text-primary flex-none mt-0.5" }),
          h(
            "p",
            { className: "text-xs text-muted leading-relaxed" },
            h("span", { className: "font-bold text-ink-900" }, "Counted in sellers, not accounts."),
            " ",
            st.data.basis.saleDefinition,
            " ",
            st.data.basis.reputationNote
          )
        ),
        h(
          "div",
          { className: "grid grid-cols-1 lg:grid-cols-5 gap-5" },
          Panel({
            title: "Leading sellers by revenue",
            sub: "Top sellers by agreed order value",
            className: "lg:col-span-3",
            children:
              withSales.length === 0
                ? EmptyPanel({ title: "No sales yet", message: "Seller revenue appears once orders exist.", icon: "TrendingUp" })
                : h("div", { className: "h-64" }, sellerChart(chartData)),
          }),
          Panel({
            title: "Stock and sales",
            sub: "Active listings against units sold, top sellers",
            className: "lg:col-span-2",
            children:
              withSales.length === 0
                ? EmptyPanel({ title: "Nothing to compare yet", message: "Once sellers sell, their stock and volume appear side by side.", icon: "Package" })
                : h(
                    "div",
                    { className: "space-y-2" },
                    stockData.map((s, i) =>
                      h(
                        "div",
                        { key: s.id, className: "flex items-center gap-3" },
                        h("span", { className: "text-2xs font-extrabold text-muted-soft tabular w-4 flex-none" }, i + 1),
                        h(
                          "div",
                          { className: "min-w-0 flex-1" },
                          h(
                            "div",
                            { className: "flex items-center justify-between gap-2 mb-1" },
                            h("span", { className: "text-xs font-semibold text-ink-900 truncate" }, s.name),
                            h("span", { className: "text-2xs text-muted flex-none tabular" }, formatNumber(s.activeListings), " live \u00B7 ", h("b", { className: "text-ink-900" }, formatNumber(s.units)), " sold")
                          ),
                          h(
                            "div",
                            { className: "h-1.5 bg-line rounded-full overflow-hidden" },
                            h("div", { className: "h-full rounded-full transition-all duration-500", style: { width: `${(s.units / maxUnits) * 100}%`, background: SERIES[i % SERIES.length] } })
                          )
                        )
                      )
                    )
                  ),
          })
        ),
        Panel({
          title: "Seller leaderboard",
          sub: "Ranked by the selected measure",
          action: h("span", { className: "badge-neutral" }, `${rows.length} sellers`),
          children:
            rows.length === 0
              ? NoSearchResults({ query: st.query, onClear: () => setQuery(""), noun: "seller", hint: "Search runs against seller name, email and location." })
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
                        h("th", { className: "w-10" }, "#"),
                        h("th", null, "Seller"),
                        h("th", { className: "th-num" }, "Listings"),
                        h("th", { className: "th-num" }, "Sold"),
                        h("th", { className: "th-num" }, "Sell-through"),
                        h("th", { className: "th-num" }, "Units"),
                        h("th", { className: "th-num" }, "Revenue"),
                        h("th", { className: "th-num" }, "Buyers"),
                        h("th", { className: "th-num" }, "Offers"),
                        h("th", { className: "th-num" }, "Accept rate"),
                        h("th", { className: "th-num" }, "Rating")
                      )
                    ),
                    h(
                      "tbody",
                      null,
                      rows.map((s, i) =>
                        h(
                          "tr",
                          { key: s.id },
                          h("td", null, h("span", { className: `w-6 h-6 rounded-lg flex items-center justify-center text-2xs font-extrabold ${i < 3 ? "bg-primary text-white" : "bg-sunken text-muted"}` }, i + 1)),
                          h(
                            "td",
                            null,
                            h(
                              "div",
                              { className: "min-w-0" },
                              h(
                                "div",
                                { className: "text-sm font-semibold text-ink-900 flex items-center gap-1.5" },
                                h("span", { className: "truncate max-w-[200px]" }, s.name),
                                s.verified && icon("BadgeCheck", { size: 13, className: "text-success flex-none", "aria-label": "Verified seller" })
                              ),
                              h(
                                "div",
                                { className: "text-2xs text-muted truncate max-w-[220px]" },
                                s.location || "Location unknown",
                                s.email ? ` \u00B7 ${s.email}` : ""
                              )
                            )
                          ),
                          h("td", { className: "num text-muted" }, formatNumber(s.listings), h("span", { className: "text-2xs text-muted-soft" }, ` (${formatNumber(s.activeListings)} live)`)),
                          h("td", { className: "num text-ink-900" }, formatNumber(s.soldListings)),
                          h("td", { className: "num" }, Rate({ value: s.sellThroughRate })),
                          h("td", { className: "num text-muted" }, formatNumber(s.units)),
                          h("td", { className: "num font-bold text-ink-900" }, formatINR(s.revenue)),
                          h("td", { className: "num text-muted" }, formatNumber(s.buyers)),
                          h("td", { className: "num text-muted" }, formatNumber(s.offers)),
                          h("td", { className: "num" }, Rate({ value: s.acceptanceRate })),
                          h("td", { className: "num" }, StarRating({ rating: s.rating, count: s.ratingCount }))
                        )
                      )
                    )
                  )
                ),
        }),
        h(
          "div",
          { className: "grid grid-cols-1 lg:grid-cols-3 gap-4" },
          InsightCard({ insight: buildLeaderInsight(rows, revenueConcentration) }),
          InsightCard({ insight: buildNegotiationInsight(sellers) }),
          InsightCard({ insight: buildInventoryInsight(sellers, withSales) })
        ),
        h(
          "p",
          { className: "text-2xs text-muted-soft" },
          "Need to act on a seller - approve, suspend or message? ",
          h("a", link("/admin/sellers", { className: "font-bold text-primary hover:underline" }), "Open the seller directory"),
          "."
        )
      )
    );
  };

  paint();
  load();

  return root;
}

/* -------------------------------------------------------------------------- */
/* Insights                                                                    */

const pctOf = (n, d) => (d > 0 ? Math.round((n / d) * 100) : null);

function buildLeaderInsight(rows, concentration) {
  const leader = rows.find((s) => s.revenue > 0);
  if (!leader) {
    return { label: "No signal", tone: "neutral", headline: "No seller revenue yet", detail: "The leaderboard fills in as orders land." };
  }
  return {
    label: "Revenue leader",
    tone: (concentration ?? 0) > 50 ? "attention" : "positive",
    headline: `${leader.name} leads with ${formatINR(leader.revenue)} from ${formatNumber(leader.units)} units.`,
    detail:
      concentration === null
        ? "Seller revenue appears once orders exist."
        : concentration > 50
          ? `That is ${concentration}% of all seller revenue, so marketplace health currently depends heavily on this one account.`
          : `That is ${concentration}% of all seller revenue, so revenue is spread across sellers rather than concentrated in one.`,
    evidence: [
      { label: "Revenue", value: formatINR(leader.revenue) },
      { label: "Units", value: formatNumber(leader.units) },
      { label: "Buyers", value: formatNumber(leader.buyers) },
      { label: "Sell-through", value: leader.sellThroughRate === null ? "n/a" : `${leader.sellThroughRate}%` },
    ],
  };
}

function buildNegotiationInsight(sellers) {
  const negotiating = sellers.filter((s) => s.offers > 0);
  if (!negotiating.length) {
    return { label: "No signal", tone: "neutral", headline: "No offers received yet", detail: "Negotiation quality appears once customers make offers." };
  }
  const totalOffers = negotiating.reduce((s, x) => s + x.offers, 0);
  const totalAccepted = negotiating.reduce((s, x) => s + x.offersAccepted, 0);
  const rate = pctOf(totalAccepted, totalOffers);
  const fastest = negotiating.filter((s) => s.avgResponseHours !== null).sort((a, b) => a.avgResponseHours - b.avgResponseHours)[0];
  return {
    label: "Negotiation",
    tone: (rate ?? 0) < 40 ? "attention" : "positive",
    headline: `${formatNumber(totalAccepted)} of ${formatNumber(totalOffers)} offers were accepted.`,
    detail: fastest
      ? `${fastest.name} replies fastest, at ${fastest.avgResponseHours}h on average. A low acceptance rate usually means asking price is set above what the market will bear rather than a refusal to negotiate.`
      : "Acceptance rate is the clearest signal that asking prices match what buyers will pay.",
    evidence: [
      { label: "Offers", value: formatNumber(totalOffers) },
      { label: "Accepted", value: formatNumber(totalAccepted) },
      { label: "Accept rate", value: rate === null ? "n/a" : `${rate}%` },
      { label: "Fastest reply", value: fastest ? `${fastest.avgResponseHours}h` : "n/a" },
    ],
  };
}

function buildInventoryInsight(sellers, withSales) {
  const stocked = sellers.filter((s) => s.listings > 0);
  if (!stocked.length) {
    return { label: "No signal", tone: "neutral", headline: "No seller has listed stock", detail: "Listings appear once sellers publish them." };
  }
  const idle = stocked.filter((s) => s.soldListings === 0).sort((a, b) => b.listings - a.listings);
  const totalListings = stocked.reduce((s, x) => s + x.listings, 0);
  const totalSold = stocked.reduce((s, x) => s + x.soldListings, 0);
  return {
    label: "Inventory",
    tone: idle.length ? "attention" : "positive",
    headline: idle.length
      ? `${idle.length} ${idle.length === 1 ? "seller has" : "sellers have"} stock but have never sold.`
      : "Every seller with stock has sold at least one listing.",
    detail: idle.length
      ? `${idle[0].name} is the largest of them at ${formatNumber(idle[0].listings)} unsold listings. Unsold stock still shows in catalogue counts, so it dilutes every attention and sell-through ratio on the platform.`
      : `${formatNumber(totalSold)} of ${formatNumber(totalListings)} listed listings have sold at least once.`,
    evidence: [
      { label: "Sellers stocked", value: formatNumber(stocked.length) },
      { label: "Listings", value: formatNumber(totalListings) },
      { label: "Sold", value: formatNumber(totalSold) },
      { label: "No sales", value: formatNumber(idle.length) },
    ],
  };
}