/**
 * Marketplace attraction: which categories and listings reach the most real
 * people, and what those people did next.
 *
 * Vanilla port of `pages/admin/intel/CatalogueAttraction.jsx`. Every figure
 * counts distinct customers, never events. The funnel is drawn as
 * distinct-customer bars against the attracted population, and the server's
 * caveat is printed verbatim. Recharts is replaced with inline SVG on the same
 * theme tokens.
 */
import { h, mount } from "../../../dom.js";
import { icon } from "../../../icons.js";
import api from "../../../services/api.js";
import { formatINR, formatNumber } from "../../../utils/format.js";
import { C, SERIES, chartAxis, chartGrid, chartTooltip, listingTone } from "../../../utils/theme.js";
import { BarRow, EmptyPanel, InsightCard, LoadingGrid, MetricTile, Panel } from "./ui.js";

/* ---------------------------------------------------------------- helpers ---- */

function makeTip(host) {
  let tip = null;
  const ensure = () => {
    if (!tip) {
      tip = document.createElement("div");
      tip.style.cssText = "position:absolute;z-index:30;pointer-events:none;white-space:nowrap;display:none;";
      Object.assign(tip.style, chartTooltip.contentStyle);
      if (getComputedStyle(host).position === "static") host.style.position = "relative";
      host.appendChild(tip);
    }
    return tip;
  };
  return {
    bind(el, html) {
      el.addEventListener("mouseenter", () => {
        const t = ensure();
        t.innerHTML = html;
        t.style.display = "block";
      });
      el.addEventListener("mousemove", (e) => {
        const t = ensure();
        const r = host.getBoundingClientRect();
        t.style.left = `${e.clientX - r.left}px`;
        t.style.top = `${e.clientY - r.top}px`;
      });
      el.addEventListener("mouseleave", () => {
        if (tip) tip.style.display = "none";
      });
    },
  };
}

function barPath(x, y, w, h, r = 6) {
  r = Math.min(r, w / 2, h);
  if (h <= 0) return "";
  return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`;
}

function niceTicks(maxV) {
  const nice = Math.max(1, Math.ceil(maxV));
  let step = 1;
  if (nice > 100) step = Math.ceil(nice / 5);
  else if (nice > 50) step = 20;
  else if (nice > 25) step = 10;
  else if (nice > 16) step = 5;
  else if (nice > 10) step = 2;
  const top = Math.ceil(nice / step) * step;
  const out = [];
  for (let v = 0; v <= top; v += step) out.push(v);
  return out;
}

/**
 * Stage chips, in funnel order. Each shows the *customer* count with the raw
 * event count beside it, because the gap between the two is the whole reason
 * this report exists.
 */
const STAGE_CHIPS = [
  { key: "views", label: "Viewed", iconName: "Eye", color: C.info },
  { key: "comparisons", label: "Compared", iconName: "GitCompareArrows", color: C.violet },
  { key: "wishlist", label: "Saved", iconName: "Heart", color: C.magenta },
  { key: "cart", label: "Carted", iconName: "ShoppingCart", color: C.amber },
  { key: "offers", label: "Offered", iconName: "Sparkles", color: C.teal },
  { key: "purchases", label: "Bought", iconName: "ShoppingBag", color: C.success },
];

const StageChips = ({ stages, compact = false }) => {
  if (!stages) return null;
  return h(
    "div",
    { className: `flex flex-wrap gap-1.5 ${compact ? "" : "mt-2.5"}` },
    STAGE_CHIPS.map(({ key, label, iconName, color }) => {
      const stage = stages[key];
      const customers = stage?.customers ?? 0;
      const events = stage?.events ?? 0;
      return h(
        "span",
        {
          key,
          title: `${formatNumber(customers)} distinct customers · ${formatNumber(events)} events`,
          className: "inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-2 py-1 text-2xs font-bold text-ink-900",
        },
        icon(iconName, { size: 11, color }),
        formatNumber(customers),
        h("span", { className: "font-semibold text-muted-soft" }, label.toLowerCase())
      );
    })
  );
};

/** A rate, or an honest "not computable" rather than a misleading 0%. */
const Rate = ({ value, suffix = "%" }) =>
  value === null || value === undefined
    ? h("span", { className: "badge-neutral", title: "No denominator: nobody reached the first step of this comparison" }, "n/a")
    : h("span", { className: "tabular" }, `${value}${suffix}`);

/**
 * The insight cards. Each one is derived from the rows already on screen, and
 * each carries the evidence it was computed from, so a claim can always be
 * traced back to the numbers rather than taken on trust.
 */
const pct = (n, d) => (d > 0 ? Math.round((n / d) * 100) : null);

function buildCategoryInsight(categories, totals) {
  if (!categories?.length) {
    return {
      label: "No signal",
      tone: "neutral",
      headline: "Not enough data yet",
      detail: "No category has recorded customer interest.",
    };
  }
  const top = categories[0];
  const bestPerListing = categories
    .filter((c) => c.demandPerListing !== null)
    .sort((a, b) => b.demandPerListing - a.demandPerListing)[0];
  return {
    label: "Strongest demand",
    tone: "positive",
    headline: `${top.category} reaches ${formatNumber(top.customers)} of the ${formatNumber(totals.customers)} customers attracted to the marketplace.`,
    detail: bestPerListing && bestPerListing.category !== top.category
      ? `${bestPerListing.category} is the tighter supply: ${bestPerListing.demandPerListing} customers per listing across just ${bestPerListing.listings} listings, versus ${top.demandPerListing ?? "n/a"} for ${top.category}.`
      : `${top.category} is also the most efficient draw, at ${top.demandPerListing ?? "n/a"} attracted customers per listing.`,
    evidence: [
      { label: "Customers", value: formatNumber(top.customers) },
      { label: "Buyers", value: formatNumber(top.buyers) },
      { label: "Listings", value: formatNumber(top.listings) },
      { label: "Per listing", value: String(top.demandPerListing ?? "n/a") },
    ],
  };
}

function buildStallInsight(categories) {
  const withInterest = (categories || []).filter((c) => c.listings > 0 && c.customers > 0);
  if (!withInterest.length) {
    return {
      label: "No signal",
      tone: "neutral",
      headline: "No supply to compare against",
      detail: "No category currently has both customer interest and listings.",
    };
  }
  const worst = [...withInterest].sort(
    (a, b) => (pct(a.buyers, a.customers) ?? 101) - (pct(b.buyers, b.customers) ?? 101)
  )[0];
  const rate = pct(worst.buyers, worst.customers);
  return {
    label: "Weakest conversion",
    tone: "attention",
    headline: `${worst.category} attracts ${formatNumber(worst.customers)} customers but only ${formatNumber(worst.buyers)} buy.`,
    detail: rate === null
      ? `Not one of the customers it reached converted, against ${formatNumber(worst.units)} units sold across ${worst.listings} listings. Interest is not the constraint here.`
      : `That is ${rate}% of the people it reaches, against ${formatNumber(worst.units)} units sold across ${worst.listings} listings.`,
    evidence: [
      { label: "Customers", value: formatNumber(worst.customers) },
      { label: "Buyers", value: formatNumber(worst.buyers) },
      { label: "Units sold", value: formatNumber(worst.units) },
      { label: "Revenue", value: formatINR(worst.revenue) },
    ],
  };
}

function buildStageInsight(products) {
  const engaged = (products || []).filter((p) => p.customers > 0);
  if (!engaged.length) {
    return { label: "No signal", tone: "neutral", headline: "No listing has reached a customer yet", detail: "Listings appear here once customers interact with them." };
  }
  const deepest = [...engaged].sort((a, b) => b.stages.offers.customers - a.stages.offers.customers)[0];
  const savesNoBuy = engaged
    .filter((p) => p.stages.wishlist.customers > 0 && p.buyers === 0)
    .sort((a, b) => b.stages.wishlist.customers - a.stages.wishlist.customers)[0];
  return {
    label: "Closest to closing",
    tone: "info",
    headline: `${deepest.title} has ${deepest.stages.offers.customers} customers negotiating.`,
    detail: savesNoBuy
      ? `${savesNoBuy.title} was saved by ${savesNoBuy.stages.wishlist.customers} customers and has never sold, which usually means price or availability rather than interest.`
      : `${deepest.title} converted ${deepest.buyers} of its ${deepest.customers} attracted customers.`,
    evidence: [
      { label: "Offers", value: formatNumber(deepest.stages.offers.customers) },
      { label: "Carts", value: formatNumber(deepest.stages.cart.customers) },
      { label: "Buyers", value: formatNumber(deepest.buyers) },
      { label: "Saved, no sale", value: savesNoBuy ? formatNumber(savesNoBuy.stages.wishlist.customers) : "none" },
    ],
  };
}

export default function CatalogueAttraction({ onOpenListing } = {}) {
  const root = h("div", { className: "space-y-5" });
  let alive = true;
  const cleanups = [];
  const ensureAlive = () => alive;
  const observer = new MutationObserver(() => {
    if (!root.isConnected) {
      alive = false;
      observer.disconnect();
      while (cleanups.length) cleanups.pop()();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  const paintLoading = () => {
    mount(root, LoadingGrid({ rows: 4, height: "h-28" }));
  };

  const paint = () => {
    if (st.loading) {
      mount(root, LoadingGrid({ rows: 4, height: "h-28" }));
      return;
    }
    if (st.error) {
      mount(
        root,
        Panel({
          title: "Attraction report unavailable",
          children: EmptyPanel({ title: "The attraction report could not be loaded", message: st.error, icon: "AlertTriangle" }),
        })
      );
      return;
    }
    if (!st.data) return;

    const { basis, totals, funnel, categories, products, dataQuality } = st.data;
    const hasInterest = (totals?.customers ?? 0) > 0;

    const funnelChart = funnel.steps.map((s) => ({
      name: s.label,
      customers: s.customers,
      events: s.events,
      share: s.ofInterested,
    }));
    const maxCategoryCustomers = Math.max(1, ...categories.map((c) => c.customers));

    const funnelHost = h("div", { className: "lg:col-span-3 h-64" });
    if (funnelChart.length) {
      const W = 680;
      const H = 256;
      const top = 8;
      const right = 8;
      const left = 40;
      const bottom = 58;
      const plotW = W - left - right;
      const plotH = H - top - bottom;
      const ticks = niceTicks(Math.max(1, ...funnelChart.map((s) => s.customers)));
      const tickMax = ticks[ticks.length - 1];
      const n = funnelChart.length;
      const groupW = plotW / n;
      const barW = Math.min(groupW, 54);
      const tip = makeTip(funnelHost);
      const svg = h("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", height: "100%", role: "img" });

      ticks.forEach((tick) => {
        const y = top + plotH - (tick / tickMax) * plotH;
        svg.appendChild(h("line", { x1: left, x2: W - right, y1: y, y2: y, stroke: chartGrid.stroke, strokeDasharray: chartGrid.strokeDasharray, strokeWidth: 1 }));
        svg.appendChild(h("text", { x: left - 8, y: y + 4, textAnchor: "end", fill: chartAxis.tick.fill, fontSize: chartAxis.tick.fontSize, fontWeight: chartAxis.tick.fontWeight }, String(tick)));
      });

      funnelChart.forEach((entry, i) => {
        const x = left + i * groupW + (groupW - barW) / 2;
        const value = entry.customers || 0;
        const y = top + plotH - (value / tickMax) * plotH;
        const hh = (value / tickMax) * plotH;
        const el = h("path", { d: barPath(x, y, barW, hh), fill: SERIES[i % SERIES.length], stroke: "none" });
        tip.bind(
          el,
          `<div style="color:${chartTooltip.labelStyle.color};font-weight:700;margin-bottom:4px">${entry.name}</div>` +
            `<div style="color:${chartTooltip.itemStyle.color}">${formatNumber(value)} customers</div>` +
            `<div style="color:${chartTooltip.itemStyle.color}">Share of attracted: ${entry.share ?? "n/a"}%</div>`
        );
        svg.appendChild(el);
        svg.appendChild(h("text", {
          x: x + barW / 2 + 4,
          y: top + plotH + 16,
          transform: `rotate(-18 ${x + barW / 2 + 4} ${top + plotH + 16})`,
          textAnchor: "end",
          fill: chartAxis.tick.fill,
          fontSize: chartAxis.tick.fontSize,
          fontWeight: chartAxis.tick.fontWeight,
        }, entry.name));
      });

      funnelHost.appendChild(svg);
    }

    mount(
      root,
      h(
        "div",
        { className: "space-y-5" },
        h(
          "div",
          { className: "grid grid-cols-2 lg:grid-cols-4 gap-4" },
          MetricTile({ label: "Customers attracted", value: formatNumber(totals.customers), sub: "Distinct people who searched, viewed, compared, saved, carted or offered" }),
          MetricTile({ label: "Categories with interest", value: formatNumber(totals.categories), sub: `${formatNumber(totals.listingsWithInterest)} of ${formatNumber(totals.listingsTracked)} listings reached someone` }),
          MetricTile({ label: "Customers who bought", value: formatNumber(totals.buyers), sub: `From ${formatNumber(totals.buyers)} buyers, ${formatNumber(funnel.steps.at(-1)?.customers)} match a completed order` }),
          MetricTile({ label: "Attraction to purchase", value: Rate({ value: funnel.steps.at(-1)?.ofInterested }), sub: "Share of attracted customers who ended up buying something" })
        ),
        h(
          "div",
          { className: "flex items-start gap-3 rounded-xl border border-line bg-raised px-4 py-3" },
          icon("Info", { size: 15, className: "text-primary flex-none mt-0.5" }),
          h(
            "p",
            { className: "text-xs text-muted leading-relaxed" },
            h("span", { className: "font-bold text-ink-900" }, "Counted in people, not clicks."),
            ` ${basis.customerDefinition} ${basis.attractionDefinition}`
          )
        ),
        !hasInterest
          ? Panel({
              title: "No customer interest recorded yet",
              children: EmptyPanel({
                title: "Nothing has been measured yet",
                message: "Attraction is built from recorded browsing, comparison, saving and negotiation events. Once customers interact with listings, the categories and listings they care about appear here.",
                icon: "Users",
              }),
            })
          : [
              Panel({
                title: "Attraction to purchase",
                sub: "Distinct customers at each stage, measured against everyone attracted",
                children: [
                  h(
                    "div",
                    { className: "grid grid-cols-1 lg:grid-cols-5 gap-5" },
                    funnelHost,
                    h(
                      "div",
                      { className: "lg:col-span-2 space-y-1" },
                      funnel.steps.map((s, i) =>
                        h(
                          "div",
                          { key: s.key, className: "flex items-center gap-3 py-2 border-b border-line last:border-b-0" },
                          h("span", { className: "w-2.5 h-2.5 rounded-full flex-none", style: { background: SERIES[i % SERIES.length] } }),
                          h(
                            "div",
                            { className: "min-w-0 flex-1" },
                            h("div", { className: "text-xs font-semibold text-ink-900 truncate" }, s.label),
                            h("div", { className: "text-2xs text-muted-soft tabular" }, `${formatNumber(s.events)} events recorded`)
                          ),
                          h(
                            "div",
                            { className: "text-right flex-none" },
                            h("div", { className: "text-sm font-extrabold text-ink-900 tabular" }, formatNumber(s.customers)),
                            h("div", { className: "text-2xs text-muted-soft tabular" }, s.ofInterested === null ? "n/a" : `${s.ofInterested}% of attracted`)
                          )
                        )
                      )
                    )
                  ),
                  h(
                    "p",
                    { className: "text-2xs text-muted-soft mt-4 pt-3 border-t border-line leading-relaxed" },
                    icon("AlertTriangle", { size: 11, className: "inline mr-1 -mt-0.5" }),
                    funnel.caveat
                  ),
                ],
              }),
              Panel({
                title: "Most attractive categories",
                sub: "Ranked by distinct customers reached, with what they did",
                children: categories.length === 0
                  ? EmptyPanel({ title: "No category interest yet", message: "Categories appear once customers browse or search them." })
                  : h(
                      "div",
                      { className: "grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-1" },
                      categories.map((c, i) =>
                        h(
                          "div",
                          { key: c.category, className: "px-3 py-1.5" },
                          BarRow({
                            label: c.category,
                            value: c.customers,
                            max: maxCategoryCustomers,
                            color: SERIES[i % SERIES.length],
                            badge: c.demandPerListing !== null
                              ? h("span", { className: "badge-neutral", title: "Distinct customers attracted per listing. High means demand is under-served by supply." }, `${c.demandPerListing}/listing`)
                              : null,
                            sub: `${formatNumber(c.buyers)} bought · ${c.interestToPurchaseRate === null ? "no attracted customers to compare" : `${c.interestToPurchaseRate}% of attracted customers bought here`} · ${formatNumber(c.listings)} listings`,
                          }),
                          StageChips({ stages: c.stages })
                        )
                      )
                    ),
              }),
              Panel({
                title: "Listings reaching the most customers",
                sub: "Unique customers per listing, and how many of them converted",
                action: h("span", { className: "badge-neutral" }, `${products.length} listings`),
                children: products.length === 0
                  ? EmptyPanel({ title: "No listing interest yet", message: "Listings appear here once customers interact with them.", icon: "Package" })
                  : h(
                      "div",
                      { className: "table-wrap" },
                      h(
                        "table",
                        { className: "data-table" },
                        h("thead", null, h("tr", null,
                          h("th", null, "Listing"),
                          h("th", { className: "th-num" }, "Customers"),
                          h("th", { className: "th-num" }, "Viewed"),
                          h("th", { className: "th-num" }, "Saved"),
                          h("th", { className: "th-num" }, "Offered"),
                          h("th", { className: "th-num" }, "Bought"),
                          h("th", { className: "th-num" }, "Attraction → sale"),
                          h("th", null, "Status"),
                          h("th", null)
                        )),
                        h("tbody", null,
                          products.map((p) =>
                            h("tr", { key: p.id },
                              h("td", null,
                                h("div", { className: "min-w-0" },
                                  h("div", { className: "text-sm font-semibold text-ink-900 truncate max-w-[260px]" }, p.title),
                                  h("div", { className: "text-2xs text-muted" }, `${p.category} · ${formatINR(p.price)}${p.seller?.name ? ` · ${p.seller.name}` : ""}`)
                                )
                              ),
                              h("td", { className: "num font-bold text-ink-900" }, formatNumber(p.customers)),
                              h("td", { className: "num text-muted" }, formatNumber(p.stages.views.customers)),
                              h("td", { className: "num text-muted" }, formatNumber(p.stages.wishlist.customers)),
                              h("td", { className: "num text-muted" }, formatNumber(p.stages.offers.customers)),
                              h("td", { className: "num text-muted" }, formatNumber(p.buyers)),
                              h("td", { className: "num" }, Rate({ value: p.interestToPurchaseRate })),
                              h("td", null, h("span", { className: `badge capitalize border ${listingTone(p.status)}` }, p.status)),
                              h("td", { className: "text-right" },
                                h("button", {
                                  type: "button",
                                  onClick: () => onOpenListing?.(p.id),
                                  className: "btn-icon",
                                  title: `Open the full workspace for ${p.title}`,
                                  "aria-label": `Open workspace for ${p.title}`,
                                }, icon("ArrowRight", { size: 14 }))
                              )
                            )
                          )
                        )
                      )
                    ),
              }),
              h(
                "div",
                { className: "grid grid-cols-1 lg:grid-cols-3 gap-4" },
                InsightCard({ insight: buildCategoryInsight(categories, totals) }),
                InsightCard({ insight: buildStallInsight(categories) }),
                InsightCard({ insight: buildStageInsight(products) })
              ),
              dataQuality?.unattributedEvents > 0 &&
                h(
                  "p",
                  { className: "text-2xs text-muted-soft leading-relaxed" },
                  icon("AlertTriangle", { size: 11, className: "inline mr-1 -mt-0.5" }),
                  dataQuality.note
                ),
            ]
      )
    );
  };

  const st = { data: null, loading: true, error: null };
  api.get("/admin/attraction?limit=12")
    .then(({ data: payload }) => {
      if (!ensureAlive()) return;
      st.data = payload;
      st.loading = false;
      paint();
    })
    .catch((err) => {
      if (!ensureAlive()) return;
      st.error = err?.response?.data?.message || err.message || "Could not load the attraction report.";
      st.loading = false;
      paint();
    });

  return root;
}