/**
 * Admin console — Behavior analytics.
 *
 * Vanilla port of `pages/admin/AdminAnalytics.jsx`.
 *
 * What are customers actually doing? Interaction (event) counts, deliberately
 * distinct from the unique-customer figures on Product Intelligence. Fetches
 * `/admin/analytics` and `/admin/attraction?limit=1` on mount.
 *
 * The four Recharts bar charts are rebuilt as inline SVG on the same chart
 * tokens (`chartAxis`, `chartGrid`, `chartTooltip` / `C` colours). Ticks are
 * nice-rounded, hover bands show the Recharts-style tooltip, and the "Category
 * demand vs. supply" panel is the already-ported `CategoryAttraction`.
 */
import { h, mount } from "../../dom.js";
import { icon } from "../../icons.js";
import api from "../../services/api.js";
import CategoryAttraction from "./category-attraction.js";
import { formatNumber } from "../../utils/format.js";
import { C, SERIES, chartTooltip } from "../../utils/theme.js";

const TABS = [
  { key: "overview", label: "Overview", icon: "BarChart3" },
  { key: "engagement", label: "Engagement", icon: "Search" },
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

const toneMap = {
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  accent: "bg-accent-soft text-accent",
  primary: "bg-primary-soft text-primary",
  success: "bg-success-soft text-success",
};

const INK_900 = "#0C1122";
const MUTED = C.slate;
const TICK = C.slate;
const GRID = C.grid;

/** Rounded ticks above zero so the axis labels read cleanly. */
function niceTicks(max) {
  const step = Math.pow(10, Math.floor(Math.log10(Math.max(max, 1))));
  const mult = [1, 2, 2.5, 5, 10].find((m) => (step * m * 4) / max >= 1) ?? 1;
  const tick = step * mult;
  const ticks = [0];
  for (let v = tick; v < max; v += tick) ticks.push(v);
  return ticks;
}

/** Chart-region hover tooltip replicating `chartTooltip` visual tokens. */
function makeTip(host) {
  let tip = null;
  const ensure = () => {
    if (!tip) {
      tip = document.createElement("div");
      Object.assign((tip.style.cssText = "position:absolute;z-index:30;pointer-events:none;"), {
        background: chartTooltip.contentStyle.background,
        border: chartTooltip.contentStyle.border,
        borderRadius: chartTooltip.contentStyle.borderRadius,
        boxShadow: chartTooltip.contentStyle.boxShadow,
        fontSize: chartTooltip.contentStyle.fontSize,
        fontWeight: chartTooltip.contentStyle.fontWeight,
        padding: chartTooltip.contentStyle.padding,
        display: "none",
      });
      if (getComputedStyle(host).position === "static") host.style.position = "relative";
      host.appendChild(tip);
    }
    return tip;
  };
  return {
    bind(el, html) {
      el.style.cursor = "pointer";
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

const tooltipHtml = (label, itemName, value) =>
  `<div style="font-weight:700;color:${INK_900};margin-bottom:4px">${label}</div><div style="color:#5B6580">${itemName} : ${formatNumber(value)}</div>`;

/**
 * Vertical bar chart (Recharts layout default). `labelAxis` is the X label.
 * Grid: horizontal dashed lines, `vertical={false}` in the React source for
 * searched/wishlisted charts.
 */
function verticalBars(items, { itemName, hue, maxBarSize }) {
  const W = 540;
  const H = 260;
  const L = 46;
  const R = 10;
  const T = 12;
  const B = 28;
  const plotW = W - L - R;
  const plotH = H - T - B;

  const host = h("div", { className: "w-full" });
  const svg = h("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", height: H, role: "img", "aria-label": itemName });
  const tip = makeTip(host);

  const max = Math.max(1, ...items.map((d) => d.value));
  const ticks = niceTicks(max);

  for (const v of ticks) {
    const y = T + plotH - (v / max) * plotH;
    svg.appendChild(h("line", {
      x1: L, y1: y, x2: W - R, y2: y, stroke: GRID, strokeDasharray: "3 3",
      "shape-rendering": "crispEdges",
    }));
    svg.appendChild(h("text", {
      x: L - 8, y: y + 3.5, textAnchor: "end", fontSize: 11, fontWeight: 600, fill: TICK,
    }, formatNumber(v)));
  }

  const n = items.length;
  const band = plotW / Math.max(n, 1);
  const barW = Math.min(band * 0.6, maxBarSize);
  items.forEach((d, i) => {
    const cx0 = L + band * i;
    const x = cx0 + band / 2 - barW / 2;
    const h0 = (d.value / max) * plotH;
    const y = T + plotH - h0;
    const r = Math.min(5, barW / 2, h0);

    if (h0 > 0) {
      svg.appendChild(h("path", {
        // Rounded top corners only, mirroring Recharts radius=[5,5,0,0].
        d: `M${x},${y + r} Q${x},${y} ${x + r},${y} L${x + barW - r},${y} Q${x + barW},${y} ${x + barW},${y + r} L${x + barW},${T + plotH} L${x},${T + plotH} Z`,
        fill: hue,
      }));
    }

    svg.appendChild(h("text", {
      x: cx0 + band / 2, y: H - B + 16, textAnchor: "middle", fontSize: 9.5, fontWeight: 600, fill: TICK,
    }, d.name));

    const hit = h("rect", { x: cx0, y: T, width: band, height: plotH, fill: "transparent" });
    tip.bind(hit, tooltipHtml(d.name, itemName, d.value));
    svg.appendChild(hit);
  });

  host.appendChild(svg);
  return host;
}

/** Horizontal bar chart (Recharts layout="vertical" — the "compared" chart). */
function horizontalBars(items, { itemName, hue, maxBarSize }) {
  const W = 540;
  const H = 260;
  const L = 140;
  const R = 12;
  const T = 10;
  const B = 24;
  const plotW = W - L - R;
  const plotH = H - T - B;

  const host = h("div", { className: "w-full" });
  const svg = h("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", height: H, role: "img", "aria-label": itemName });
  const tip = makeTip(host);

  const max = Math.max(1, ...items.map((d) => d.value));
  const ticks = niceTicks(max);

  for (const v of ticks) {
    const x = L + (v / max) * plotW;
    svg.appendChild(h("line", {
      x1: x, y1: T, x2: x, y2: H - B, stroke: GRID, strokeDasharray: "3 3",
      "shape-rendering": "crispEdges",
    }));
    svg.appendChild(h("text", {
      x, y: H - B + 14, textAnchor: "middle", fontSize: 11, fontWeight: 600, fill: TICK,
    }, formatNumber(v)));
  }

  const n = items.length;
  const band = plotH / Math.max(n, 1);
  const barH = Math.min(band * 0.55, maxBarSize);
  items.forEach((d, i) => {
    const cy0 = T + band * i;
    const y = cy0 + band / 2 - barH / 2;
    const w0 = (d.value / max) * plotW;
    const r = Math.min(5, w0 / 2, barH / 2);

    if (w0 > 0) {
      svg.appendChild(h("path", {
        // Right corners rounded only, mirroring Recharts radius=[0,5,5,0].
        d: `M${L},${y} L${L + w0 - r},${y} Q${L + w0},${y} ${L + w0},${y + r} L${L + w0},${y + barH - r} Q${L + w0},${y + barH} ${L + w0 - r},${y + barH} L${L},${y + barH} Z`,
        fill: hue,
      }));
    }

    svg.appendChild(h("text", {
      x: L - 8, y: cy0 + band / 2 + 4, textAnchor: "end", fontSize: 11, fontWeight: 600, fill: TICK,
    }, d.name));

    const hit = h("rect", { x: L, y: cy0, width: plotW, height: band, fill: "transparent" });
    tip.bind(hit, tooltipHtml(d.name, itemName, d.value));
    svg.appendChild(hit);
  });

  host.appendChild(svg);
  return host;
}

export default function AdminAnalytics() {
  const st = { analytics: null, attraction: null, tab: "overview", loading: true };
  let disposed = false;

  const root = h("div", { className: "animate-fade-in space-y-5" });
  const headerHost = h("div");
  const tabsHost = h("div", { className: "tab-list self-start overflow-x-auto max-w-full" });
  const contentHost = h("div");

  root.appendChild(headerHost);
  root.appendChild(tabsHost);
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

  const paintHeader = () => {
    mount(
      headerHost,
      h(
        "div",
        null,
        h("span", { className: "page-eyebrow" }, icon("BarChart3", { size: 12 }), " Behaviour"),
        h("h1", { className: "page-title" }, "Behavior analytics"),
        h(
          "p",
          { className: "page-sub" },
          "How buyers discover, compare and decide — counted as recorded interactions. Unique-customer figures are on ",
          h("span", { className: "font-bold text-ink-800" }, "Product Intelligence"),
          "."
        )
      )
    );
  };

  const paintTabs = () => {
    mount(
      tabsHost,
      TABS.map((t) =>
        h(
          "button",
          {
            type: "button",
            key: t.key,
            className: `tab whitespace-nowrap ${st.tab === t.key ? "tab-active" : ""}`,
            onClick: () => {
              st.tab = t.key;
              paintTabs();
              paintContent();
            },
          },
          icon(t.icon, { size: 14 }),
          " ",
          t.label
        )
      )
    );
  };

  const paintContent = () => {
    if (st.loading) {
      mount(
        contentHost,
        h(
          "div",
          { className: "grid grid-cols-1 lg:grid-cols-2 gap-5 animate-fade-in" },
          Array(4).fill(0).map((_, i) => h("div", { key: i, className: "h-64 rounded-2xl bg-sunken animate-pulse" }))
        )
      );
      return;
    }

    if (!st.analytics) {
      mount(
        contentHost,
        h(
          "div",
          { className: "panel p-12 text-center" },
          h("span", { className: "icon-tile-primary mx-auto mb-4" }, icon("BarChart3", { size: 20 })),
          h("h3", { className: "font-extrabold text-ink-900" }, "No behavior data yet"),
          h("p", { className: "text-sm text-muted mt-1" }, "Metrics appear once buyers start browsing, comparing and checking out.")
        )
      );
      return;
    }

    const analytics = st.analytics;

    const statCards = [
      { label: "Cart abandonment", value: `${analytics.cartAbandonmentRate ?? 0}%`, icon: "TrendingDown", tone: "danger" },
      { label: "Avg decision time", value: `${analytics.avgDecisionTime ?? 0} min`, icon: "Timer", tone: "info" },
      { label: "Negotiation rounds", value: analytics.avgNegotiationRounds ?? 0, icon: "RefreshCcw", tone: "accent" },
      { label: "Avg discount", value: `${analytics.avgDiscount ?? 0}%`, icon: "Percent", tone: "primary" },
      { label: "Repeat purchase rate", value: `${analytics.repeatPurchaseRate ?? 0}%`, icon: "Repeat", tone: "primary" },
      {
        label: "Interactions tracked",
        value: formatNumber((analytics.behaviorSummary || []).reduce((s, r) => s + (r.value || 0), 0)),
        icon: "ClipboardList",
        tone: "success",
      },
    ];

    const summary = analytics.behaviorSummary || [];
    const summaryMax = Math.max(1, ...summary.map((x) => x.value));
    const findRow = (key) => summary.find((x) => x.key === key)?.value || 0;
    const checkoutMax = Math.max(1, findRow("Cart Adds"), findRow("Checkout Starts"));

    if (st.tab === "overview") {
      mount(
        contentHost,
        h(
          "div",
          { className: "animate-fade-in space-y-5" },
          h(
            "div",
            { className: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" },
            statCards.map((s) =>
              h(
                "div",
                { key: s.label, className: "stat-card flex items-center gap-3.5" },
                h("span", { className: `icon-tile flex-none ${toneMap[s.tone]}` }, icon(s.icon, { size: 17 })),
                h(
                  "div",
                  { className: "min-w-0" },
                  h("p", { className: "text-2xs font-bold uppercase tracking-[0.1em] text-muted" }, s.label),
                  h("p", { className: "metric mt-0.5" }, s.value)
                )
              )
            )
          ),
          h(
            "section",
            { className: "panel" },
            h(
              "div",
              { className: "panel-head" },
              h(
                "div",
                { className: "flex items-center gap-2.5" },
                icon("ClipboardList", { size: 16, className: "text-primary" }),
                h(
                  "div",
                  null,
                  h("h2", { className: "panel-title" }, "Event volume by type"),
                  h(
                    "p",
                    { className: "panel-sub" },
                    "Every tracked interaction, ranked. These are events, not customers — one person browsing forty listings is counted forty times here by design."
                  )
                )
              ),
              h("span", { className: "badge-neutral" }, `${summary.length} types`)
            ),
            h(
              "div",
              { className: "panel-body table-wrap" },
              h(
                "table",
                { className: "w-full text-sm" },
                h(
                  "tbody",
                  { className: "divide-y divide-line" },
                  summary.map((r, i) =>
                    h(
                      "tr",
                      { key: r.key, className: "hover:bg-raised transition-colors" },
                      h(
                        "td",
                        { className: "py-2.5 pr-3 w-56" },
                        h(
                          "div",
                          { className: "flex items-center gap-2" },
                          h("span", { className: "w-2 h-2 rounded-full flex-none", style: { background: SERIES[i % SERIES.length] } }),
                          h("span", { className: "font-semibold text-ink-800" }, r.key)
                        )
                      ),
                      h(
                        "td",
                        { className: "py-2.5 w-full" },
                        h(
                          "div",
                          { className: "h-2.5 bg-sunken rounded-full overflow-hidden max-w-md" },
                          h("div", {
                            className: "h-full rounded-full transition-all duration-500",
                            style: { width: `${Math.max(2, (r.value / summaryMax) * 100)}%`, background: SERIES[i % SERIES.length] },
                          })
                        )
                      ),
                      h("td", { className: "py-2.5 text-right font-extrabold text-ink-900 tabular pl-3" }, formatNumber(r.value))
                    )
                  ),
                  summary.length === 0 &&
                    h(
                      "tr",
                      null,
                      h("td", { className: "py-8 text-center text-sm text-muted-soft" }, "No events recorded yet")
                    )
                )
              )
            )
          ),
          h(
            "div",
            { className: "grid grid-cols-1 lg:grid-cols-2 gap-5" },
            h(
              "section",
              { className: "panel" },
              h(
                "div",
                { className: "panel-head" },
                h(
                  "div",
                  { className: "flex items-center gap-2.5" },
                  icon("ShoppingBag", { size: 16, className: "text-primary" }),
                  h("h2", { className: "panel-title" }, "Cart & checkout dynamics")
                )
              ),
              h(
                "div",
                { className: "panel-body space-y-3" },
                CHECKOUT_ROWS.map((key) => {
                  const value = findRow(key);
                  return h(
                    "div",
                    { key: key, className: "flex items-center gap-3" },
                    h("span", { className: "w-32 text-2xs font-bold uppercase tracking-[0.08em] text-muted flex-none truncate" }, key),
                    h(
                      "div",
                      { className: "flex-1 h-6 bg-sunken rounded-lg overflow-hidden" },
                      h(
                        "div",
                        {
                          className: "h-full rounded-lg bg-accent flex items-center justify-end px-2 transition-all duration-500",
                          style: { width: `${Math.max(5, (value / checkoutMax) * 100)}%` },
                        },
                        h("span", { className: "text-2xs font-extrabold text-white tabular" }, formatNumber(value))
                      )
                    )
                  );
                })
              )
            ),
            h(
              "section",
              { className: "panel" },
              h(
                "div",
                { className: "panel-head" },
                h("h2", { className: "panel-title" }, "Purchase reasons"),
                h("p", { className: "panel-sub" }, "What buyers said drove the purchase")
              ),
              h(
                "div",
                { className: "panel-body" },
                (analytics.purchaseReasons || []).length === 0
                  ? h("p", { className: "text-sm text-muted-soft py-6 text-center" }, "No purchase reasons recorded yet")
                  : h(
                      "div",
                      { className: "grid grid-cols-2 gap-2" },
                      (analytics.purchaseReasons || []).map((r) =>
                        h(
                          "div",
                          { key: r._id, className: "sunken-panel p-3.5" },
                          h("div", { className: "text-sm font-bold text-ink-900 capitalize" }, r._id),
                          h("div", { className: "text-2xs text-muted mt-0.5 tabular" }, `${formatNumber(r.count)} purchases`)
                        )
                      )
                    )
              )
            )
          )
        )
      );
      return;
    }

    // ================= ENGAGEMENT =================
    const mostSearched = (analytics.mostSearched || []).map((s, i) => ({ name: (s._id || `#${i + 1}`).slice(0, 14), value: s.count }));
    const mostCompared = (analytics.mostCompared || []).map((p) => ({ name: (p.title || "").slice(0, 18), value: p.compareCount }));
    const mostWishlisted = (analytics.mostWishlisted || []).map((p) => ({ name: (p.title || "").slice(0, 20), value: p.wishlistCount }));

    mount(
      contentHost,
      h(
        "div",
        { className: "grid grid-cols-1 lg:grid-cols-2 gap-5" },
        h(
          "section",
          { className: "panel" },
          h(
            "div",
            { className: "panel-head" },
            h("h2", { className: "panel-title" }, "Most searched categories"),
            h("p", { className: "panel-sub" }, "What buyers are trying to find")
          ),
          h("div", { className: "panel-body" }, verticalBars(mostSearched, { itemName: "searches", hue: C.primary, maxBarSize: 38 }))
        ),
        h(
          "section",
          { className: "panel" },
          h(
            "div",
            { className: "panel-head" },
            h("h2", { className: "panel-title" }, "Category demand vs. supply"),
            h(
              "p",
              { className: "panel-sub" },
              "Demand is counted in distinct customers, weighted by intent (a view is weak, a purchase is strong). Supply is the live listing count. Demand far ahead of supply means the category is under-served."
            )
          ),
          h("div", { className: "panel-body" }, CategoryAttraction({ rows: analytics.categoryAttraction, customerRows: st.attraction?.categories }))
        ),
        h(
          "section",
          { className: "panel" },
          h(
            "div",
            { className: "panel-head" },
            h("h2", { className: "panel-title" }, "Most compared products"),
            h("p", { className: "panel-sub" }, "Listings buyers put side by side")
          ),
          h("div", { className: "panel-body" }, horizontalBars(mostCompared, { itemName: "comparisons", hue: C.violet, maxBarSize: 26 }))
        ),
        h(
          "section",
          { className: "panel" },
          h(
            "div",
            { className: "panel-head" },
            h("h2", { className: "panel-title" }, "Most wishlisted products"),
            h("p", { className: "panel-sub" }, "Listings buyers saved for later")
          ),
          h("div", { className: "panel-body" }, verticalBars(mostWishlisted, { itemName: "wishlists", hue: C.magenta, maxBarSize: 44 }))
        )
      )
    );
  };

  paintHeader();
  paintTabs();
  paintContent();

  api
    .get("/admin/analytics")
    .then(({ data }) => {
      if (!ensureAlive()) return;
      st.analytics = data;
      st.loading = false;
      paintContent();
    })
    .catch(() => {
      if (!ensureAlive()) return;
      st.loading = false;
      paintContent();
    });
  // Unique-customer figures, kept separate from the event summary above. The
  // category demand table needs people rather than counts, and deriving them
  // from behaviorSummary would reintroduce the exact confusion this page
  // exists to remove.
  api
    .get("/admin/attraction?limit=1")
    .then(({ data }) => {
      if (!ensureAlive()) return;
      st.attraction = data;
      paintContent();
    })
    .catch(() => {});

  return root;
}