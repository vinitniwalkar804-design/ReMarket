/**
 * Admin console — Dashboard.
 *
 * Vanilla port of `pages/admin/AdminDashboard.jsx`.
 *
 * One question is answered here: is the marketplace healthy right now? Four
 * reports load in parallel, each optional — a failing endpoint degrades the
 * dashboard to null rather than blanking it, and the section that depended on
 * it simply is not rendered.
 *
 * The Recharts 14-day trend chart (events + orders on the left axis, revenue on
 * its own right-hand axis) is rebuilt as a hand-drawn SVG line chart on the same
 * tokens, with a hover tooltip reproducing the default Recharts output (label
 * = the row's `date`, items named per Line `name`).
 */
import { h, mount } from "../../dom.js";
import { icon } from "../../icons.js";
import { link } from "../../navigation.js";
import api from "../../services/api.js";
import { formatINR, formatNumber } from "../../utils/format.js";
import { C, chartAxis, chartGrid, chartLegend, chartTooltip } from "../../utils/theme.js";

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

const GO_DEEPER = [
  {
    to: "/admin/analytics",
    icon: "BarChart3",
    title: "Behavior Analytics",
    body: "What customers actually do: searches, comparisons, wishlists, carts and why they buy.",
  },
  {
    to: "/admin/personas",
    icon: "Brain",
    title: "Personas",
    body: "Customers grouped by K-Means, and the measured evidence behind each group.",
  },
  {
    to: "/admin/product-intelligence",
    icon: "Lightbulb",
    title: "Product Intelligence",
    body: "Which listings attract unique customers, and what those customers go on to do.",
  },
];

/** A simple-yet-honest integer tick scale, like a YAxis with `allowDecimals={false}`. */
function niceTicks(maxV) {
  const nice = Math.max(1, Math.ceil(maxV));
  let step = 1;
  if (nice > 1000) step = Math.ceil(nice / 8 / 100) * 100;
  else if (nice > 100) step = Math.ceil(nice / 5);
  else if (nice > 50) step = 20;
  else if (nice > 25) step = 10;
  else if (nice > 16) step = 5;
  else if (nice > 10) step = 2;
  const top = Math.ceil(nice / step) * step;
  const out = [];
  for (let v = 0; v <= top; v += step) out.push(v);
  return out;
}

/** Absolute-positioned hover tooltip shared by the SVG charts in this file. */
function makeTip(host) {
  let tip = null;
  const ensure = () => {
    if (!tip) {
      tip = document.createElement("div");
      Object.assign((tip.style.cssText = "position:absolute;z-index:30;pointer-events:none;white-space:nowrap;"), chartTooltip.contentStyle);
      tip.style.display = "none";
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

/**
 * The 14-day trend. Three series on a shared time axis, events and orders
 * scaled against the left axis and revenue against its own right axis, matching
 * the Recharts layout it replaces. Recharts' default tooltip is reproduced:
 * the headline is the row's `date` and each item is `name + raw value`.
 */
function TrendChart({ data, host }) {
  const W = 840;
  const H = 280;
  const mL = 48;
  const mR = 46;
  const mT = 10;
  const mB = 26;
  const plotW = W - mL - mR;
  const plotH = H - mT - mB;
  const n = data.length;

  const evTop = Math.max(1, ...data.map((d) => d.events || 0), ...data.map((d) => d.orders || 0));
  const revTop = Math.max(1, ...data.map((d) => d.revenue || 0));
  const evTicks = niceTicks(evTop);
  const revTicks = niceTicks(revTop);

  const x = (i) => mL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const yEv = (v) => mT + plotH - (v / evTicks[evTicks.length - 1]) * plotH;
  const yRev = (v) => mT + plotH - (v / revTicks[revTicks.length - 1]) * plotH;

  const linePath = (key, scale) => {
    if (!n) return "";
    let d = "";
    for (let i = 0; i < n; i++) d += `${i ? "L" : "M"}${x(i).toFixed(2)},${scale(data[i][key] || 0).toFixed(2)} `;
    return d.trim();
  };

  const svg = h("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", height: "100%", role: "img" });

  // Horizontal gridlines + left-axis ticks (events scale).
  for (const v of evTicks) {
    const y = yEv(v);
    svg.appendChild(h("line", { x1: mL, y1: y, x2: W - mR, y2: y, stroke: chartGrid.stroke, strokeDasharray: chartGrid.strokeDasharray }));
    svg.appendChild(
      h("text", { x: mL - 8, y: y + 4, textAnchor: "end", fill: chartAxis.tick.fill, fontSize: "11", fontWeight: "600" }, v)
    );
  }

  // Right-axis ticks (revenue scale, "k" formatter like the JSX).
  for (const v of revTicks) {
    const y = yRev(v);
    svg.appendChild(
      h("text", { x: W - mR + 8, y: y + 4, textAnchor: "start", fill: chartAxis.tick.fill, fontSize: "11", fontWeight: "600" }, v >= 1000 ? `${Math.round(v / 1000)}k` : v)
    );
  }

  // X labels, interval="preserveStartEnd": all points when they fit, then every other one.
  const step = n > 12 ? 2 : 1;
  for (let i = 0; i < n; i++) {
    if (i % step !== 0 && i !== n - 1) continue;
    svg.appendChild(
      h("text", { x: x(i), y: H - 8, textAnchor: "middle", fill: chartAxis.tick.fill, fontSize: "11", fontWeight: "600" }, data[i].label)
    );
  }

  const series = [
    { key: "events", color: C.primary, name: "Behavior events", scale: yEv },
    { key: "orders", color: C.violet, name: "Orders", scale: yEv },
    { key: "revenue", color: C.rating, name: "Revenue", scale: yRev },
  ];
  for (const s of series) {
    svg.appendChild(
      h("path", {
        d: linePath(s.key, s.scale),
        fill: "none",
        stroke: s.color,
        strokeWidth: 2.5,
        strokeLinejoin: "round",
        strokeLinecap: "round",
      })
    );
  }

  // Hover bands reproduce the Recharts Tooltip: label = payload.date, then the
  // three named series with their raw values.
  const tip = makeTip(host);
  const bandW = n <= 1 ? plotW : plotW / (n - 1) / 2;
  for (let i = 0; i < n; i++) {
    const row = data[i];
    const band = h("rect", {
      x: x(i) - bandW / 2,
      y: mT,
      width: bandW,
      height: plotH,
      fill: "transparent",
    });
    tip.bind(
      band,
      `<div style="color:${chartTooltip.labelStyle.color};font-weight:700;margin-bottom:4px">${row.date || row.label}</div>` +
        series
          .map(
            (s) => `<div style="color:${C.slate}"><span style="display:inline-block;width:8px;height:8px;border-radius:9999px;background:${s.color};margin-right:6px"></span>${s.name}: <b style="color:${chartTooltip.labelStyle.color}">${row[s.key] ?? 0}</b></div>`
          )
          .join("")
    );
    svg.appendChild(band);
  }

  return svg;
}

export default function AdminDashboard() {
  const st = { stats: null, trend: [], attraction: null, personas: null, loading: true };
  let disposed = false;
  const cleanups = [];

  const root = h("div", null);
  const bodyHost = h("div");

  function ensureAlive() {
    if (root.isConnected) return true;
    if (!disposed) {
      disposed = true;
      for (const fn of cleanups.splice(0)) fn();
    }
    return false;
  }

  const observer = new MutationObserver(() => {
    if (!ensureAlive()) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  const load = async () => {
    st.loading = true;
    // Each report is optional. A single failing endpoint should degrade the
    // dashboard, not blank it, so a failure resolves to null and the section
    // that depends on it is simply not rendered.
    const safe = (promise, fallback = null) => promise.catch(() => fallback);
    try {
      const [sRes, tRes, atRes, pRes] = await Promise.all([
        safe(api.get("/admin/stats")),
        safe(api.get("/admin/trends?days=14")),
        // The attraction report counts people, not events. It supplies the two
        // demand figures in the KPI row because they are the only honest
        // "how many customers did we reach" numbers the API exposes.
        safe(api.get("/admin/attraction?limit=6"), { data: null }),
        safe(api.get("/admin/personas"), { data: null }),
      ]);
      if (!ensureAlive()) return;
      st.stats = sRes?.data ?? null;
      st.trend = tRes?.data?.trend || [];
      st.attraction = atRes?.data ?? null;
      st.personas = pRes?.data ?? null;
    } catch {
      /* leave the previous values in place */
    }
    if (!ensureAlive()) return;
    st.loading = false;
    repaint();
  };

  const trendHost = h("div", { className: "relative h-[280px]" });

  const buildPage = () =>
    h(
      "div",
      { className: "animate-fade-in space-y-5" },
      h(
        "header",
        null,
        h("span", { className: "page-eyebrow" }, icon("LayoutDashboard", { size: 12 }), " Overview"),
        h("h1", { className: "page-title" }, "Dashboard"),
        h(
          "p",
          { className: "page-sub" },
          "The shape of the marketplace and whether it is moving. Everything else lives one page away."
        )
      ),
      bodyHost
    );

  function repaint() {
    if (st.loading) {
      mount(
        bodyHost,
        h(
          "div",
          { className: "grid grid-cols-2 lg:grid-cols-4 gap-3" },
          Array(8).fill(0).map((_, i) => h("div", { key: i, className: "h-28 rounded-2xl bg-sunken animate-pulse" }))
        )
      );
      return;
    }

    const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

    // Headline demand figures in people. Both are distinct-user counts: one person
    // browsing fifty listings is still one attracted customer.
    const attracted = st.attraction?.totals?.customers;
    const buyers = st.attraction?.totals?.buyers;

    const kpiCards = [
      { label: "Registered users", value: st.stats ? formatNumber(st.stats.totalCustomers) : "—", icon: "Users" },
      {
        label: "Customers attracted",
        value: attracted === undefined ? "—" : formatNumber(attracted),
        icon: "Target",
        hint: "Distinct customers who interacted with a listing",
      },
      {
        label: "Customers who bought",
        value: buyers === undefined ? "—" : formatNumber(buyers),
        icon: "ShoppingCart",
        hint: "Distinct customers with a real order",
      },
      { label: "Repeat buyers", value: st.stats ? formatNumber(st.stats.repeatCustomers) : "—", icon: "Repeat" },
      { label: "Verified sellers", value: st.stats ? formatNumber(st.stats.totalSellers) : "—", icon: "ShieldCheck" },
      { label: "Products", value: st.stats ? formatNumber(st.stats.totalProducts) : "—", icon: "Package" },
      { label: "Orders", value: st.stats ? formatNumber(st.stats.totalOrders) : "—", icon: "ShoppingCart" },
      { label: "Revenue", value: st.stats ? formatINR(st.stats.totalRevenue || 0) : "—", icon: "TrendingUp" },
    ];

    const personaList = st.personas?.personas || [];
    const numClusters = n(st.personas?.numClusters);

    const kpiRow = h(
      "div",
      { className: "grid grid-cols-2 lg:grid-cols-4 gap-3" },
      kpiCards.map((c, i) =>
        h(
          "div",
          { key: c.label, className: "stat-card" },
          h(
            "span",
            {
              className: `w-10 h-10 rounded-xl bg-gradient-to-br ${KPI_TONES[i % KPI_TONES.length]} text-white flex items-center justify-center shadow-sm`,
            },
            icon(c.icon, { size: 18 })
          ),
          h("p", { className: "metric mt-3" }, c.value),
          h("p", { className: "text-2xs font-bold uppercase tracking-[0.1em] text-muted mt-1" }, c.label),
          c.hint && h("p", { className: "text-2xs text-muted mt-0.5 leading-snug" }, c.hint)
        )
      )
    );

    const trendSection = h(
      "section",
      { className: "panel" },
      h(
        "div",
        { className: "panel-head" },
        h(
          "div",
          { className: "flex items-center gap-2.5" },
          icon("TrendingUp", { size: 16, className: "text-primary" }),
          h(
            "div",
            null,
            h("h2", { className: "panel-title" }, "14-day activity trend"),
            h("p", { className: "panel-sub" }, "Daily behavior events, orders and revenue")
          )
        ),
        h(
          "div",
          { className: "flex items-center gap-3 flex-none" },
          h(
            "span",
            { className: "inline-flex items-center gap-1.5 text-2xs text-muted" },
            h("span", { className: "w-2.5 h-2.5 rounded-full", style: { background: C.primary } }),
            " events"
          ),
          h(
            "span",
            { className: "inline-flex items-center gap-1.5 text-2xs text-muted" },
            h("span", { className: "w-2.5 h-2.5 rounded-full", style: { background: C.violet } }),
            " orders"
          ),
          h(
            "span",
            { className: "inline-flex items-center gap-1.5 text-2xs text-muted" },
            h("span", { className: "w-2.5 h-2.5 rounded-full", style: { background: C.rating } }),
            " revenue"
          )
        )
      ),
      h(
        "div",
        { className: "panel-body" },
        st.trend.length > 0
          ? (() => {
              trendHost.appendChild(TrendChart({ data: st.trend, host: trendHost }));
              return trendHost;
            })()
          : h("p", { className: "text-sm text-muted py-8 text-center" }, "The activity trend could not be loaded.")
      )
    );

    // Segmentation status: one honest line, and a link to the page that
    // explains it. The tiles that used to live here are on Personas.
    const segmentationBanner =
      st.personas?.runId &&
      h(
        "a",
        link("/admin/personas", {
          className: "panel block hover:border-brand-200 transition-colors group",
        }),
        h(
          "div",
          { className: "panel-body flex flex-wrap items-center gap-x-6 gap-y-2" },
          h(
            "span",
            { className: "flex items-center gap-2.5" },
            icon("Brain", { size: 16, className: "text-primary flex-none" }),
            h("span", { className: "text-sm font-extrabold text-ink-900" }, "Segmentation")
          ),
          h(
            "span",
            { className: "text-2xs text-muted" },
            h("span", { className: "font-bold text-ink-800" }, `${personaList.length} persona${personaList.length === 1 ? "" : "s"}`),
            " from ",
            h("span", { className: "font-bold text-ink-800 tabular" }, formatNumber(st.personas.totalCustomers)),
            " customers"
          ),
          h(
            "span",
            { className: "text-2xs text-muted" },
            "by ",
            h("span", { className: "font-bold text-ink-800" }, st.personas.sourceLabel || "K-Means"),
            numClusters > 0
              ? h(
                  "span",
                  { className: "text-2xs text-muted" },
                  " into ",
                  h("span", { className: "font-bold text-ink-800 tabular" }, numClusters),
                  " clusters"
                )
              : null
          ),
          h(
            "span",
            { className: "text-2xs text-muted" },
            st.personas.runDate
              ? `run ${new Date(st.personas.runDate).toLocaleDateString("en-IN", { dateStyle: "medium" })}`
              : null
          ),
          h(
            "span",
            { className: "ml-auto flex items-center gap-1 text-2xs font-bold text-primary" },
            "See how it was derived",
            icon("ChevronRight", { size: 13, className: "transition-transform group-hover:translate-x-0.5" })
          )
        )
      );

    const goDeeper = h(
      "section",
      { className: "grid gap-3 sm:grid-cols-3" },
      GO_DEEPER.map((g) =>
        h(
          "a",
          link(g.to, {
            key: g.to,
            className: "panel p-5 hover:border-brand-200 transition-colors group flex flex-col",
          }),
          h("span", { className: "icon-tile-primary mb-3" }, icon(g.icon, { size: 18 })),
          h(
            "span",
            { className: "text-sm font-extrabold text-ink-900 flex items-center gap-1" },
            g.title,
            icon("ChevronRight", { size: 13, className: "text-muted transition-transform group-hover:translate-x-0.5" })
          ),
          h("span", { className: "text-2xs text-muted mt-1 leading-relaxed" }, g.body)
        )
      )
    );

    mount(bodyHost, kpiRow, trendSection, segmentationBanner, goDeeper);
  }

  mount(root, buildPage());
  repaint();
  load();

  return root;
}