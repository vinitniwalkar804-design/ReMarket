/**
 * Customer attraction: which categories is *this* customer drawn to?
 *
 * Vanilla port of `pages/admin/CustomerAttractionChart.jsx`.
 *
 * Deliberately its own panel rather than another row in "Feature values". Those
 * are the model's own inputs; this is a readable answer to "what does this person
 * actually like", built from the same event log.
 *
 * Two views, because a customer's activity is not one shape:
 *  - Categories: a donut, and the only place a whole-to-whole share belongs. A
 *    customer with six interests is a composition, and a ring shows the
 *    composition directly.
 *  - Products: a ranked bar list. Across the seeded data a busy customer touches
 *    40+ distinct listings, which is unreadable as a ring and meaningless as an
 *    "Other" slice that swallows 70% of the chart. Naming the strongest few is
 *    the honest version of the same information.
 *
 * The Recharts donut is rebuilt as inline SVG on the same tokens and geometry
 * (58% inner / 92% outer radius of the box, 2° padding, 2px white stroke), and
 * the hover tooltip replicates the `AttractionTooltip` markup.
 */
import { h, mount } from "../../dom.js";
import { icon } from "../../icons.js";
import api from "../../services/api.js";
import { formatNumber } from "../../utils/format.js";
import { C, SERIES } from "../../utils/theme.js";

/** Below this share, an in-slice label collides with its neighbours. */
const MIN_LABELLED_SHARE = 7;

const humanise = (eventType) =>
  eventType.toLowerCase().replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

/**
 * Signal names do not all pluralise by appending an "s" - "4 searchs" in a
 * tooltip reads as a bug and undercuts the numbers printed beside it. Explicit
 * for the irregular ones, defaulting to +s for the rest.
 */
const SIGNAL_PLURALS = {
  SEARCH: "searches",
  PRICE_WATCH: "price watches",
  OFFER_SENT: "offers sent",
  OFFER_ACCEPTED: "offers accepted",
  COMPARE_SELECTED: "compares selected",
  CHAT_STARTED: "chats started",
};

const signalLabel = (eventType, n) => {
  if (n === 1) return humanise(eventType).toLowerCase();
  return SIGNAL_PLURALS[eventType] || `${humanise(eventType).toLowerCase()}s`;
};

/** The signals behind a slice, largest first, e.g. "48 views · 7 wishlists". */
const describeBreakdown = (breakdown = {}, limit = 4) =>
  Object.entries(breakdown)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([type, n]) => `${n} ${signalLabel(type, n)}`)
    .join(" · ");

function ProductBars({ products, totalProducts }) {
  const max = Math.max(...products.map((p) => p.score), 1);
  const truncated = totalProducts > products.length;
  return h(
    "div",
    { className: "space-y-2.5" },
    products.map((p, i) =>
      h(
        "div",
        { key: p.key },
        h(
          "div",
          { className: "flex items-baseline justify-between gap-3 text-xs" },
          h("span", { className: "truncate font-semibold text-ink-900" }, p.name),
          h("span", { className: "flex-none tabular text-muted" }, `${p.percentage}% · ${p.interactions} interactions`)
        ),
        h(
          "div",
          { className: "mt-1 h-1.5 overflow-hidden rounded-full bg-sunken" },
          h("div", {
            className: "h-full rounded-full",
            style: { width: `${Math.max((p.score / max) * 100, 3)}%`, background: SERIES[i % SERIES.length] },
          })
        )
      )
    ),

    /* Stated explicitly because it is the one place the two views disagree, and
       the server deliberately treats them differently. The donut partitions
       this customer and must total 100%; the product list is ranked against
       the customer's entire product history, so when it is truncated the shares
       are slices of a larger whole and will not add up. */
    h(
      "p",
      { className: "pt-1 text-2xs text-muted" },
      truncated
        ? `Showing the ${products.length} strongest of ${formatNumber(totalProducts)} listings. Each percentage is that listing's share of the whole ${formatNumber(totalProducts)}-listing history, so this list does not total 100%.`
        : `All ${formatNumber(totalProducts)} listings this customer engaged with. Percentages are each listing's share of their combined score and total 100%.`
    )
  );
}

/** Annular sector path (donut slice), clockwise from angle a0 to a1. */
function arcPath(cx, cy, rOuter, rInner, a0, a1) {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const p0 = [cx + rOuter * Math.cos(a0), cy + rOuter * Math.sin(a0)];
  const p1 = [cx + rOuter * Math.cos(a1), cy + rOuter * Math.sin(a1)];
  const i0 = [cx + rInner * Math.cos(a1), cy + rInner * Math.sin(a1)];
  const i1 = [cx + rInner * Math.cos(a0), cy + rInner * Math.sin(a0)];
  return `M${p0[0].toFixed(2)},${p0[1].toFixed(2)} A${rOuter},${rOuter} 0 ${large} 1 ${p1[0].toFixed(2)},${p1[1].toFixed(2)} L${i0[0].toFixed(2)},${i0[1].toFixed(2)} A${rInner},${rInner} 0 ${large} 0 ${i1[0].toFixed(2)},${i1[1].toFixed(2)} Z`;
}

const INK_900 = "#0C1122";
const MUTED = C.slate;
const LINE = C.grid;
const SURFACE = C.canvas;

/**
 * The chart region's hover tooltip. Mirrors the visual of the React
 * `AttractionTooltip`: the panel read {name, category?, share, score,
 * interactions, breakdown} off the hovered payload.
 */
function makeTip(host) {
  let tip = null;
  const ensure = () => {
    if (!tip) {
      tip = document.createElement("div");
      Object.assign((tip.style.cssText = "position:absolute;z-index:30;pointer-events:none;"), {
        minWidth: 190,
        background: SURFACE,
        border: `1px solid ${LINE}`,
        borderRadius: 14,
        boxShadow: "0 10px 15px -3px rgba(12,17,34,0.10), 0 4px 6px -4px rgba(12,17,34,0.05)",
        padding: "8px 12px",
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

const attractTipHtml = (slice) => {
  const row = (label, value) =>
    `<div style="display:flex;justify-content:space-between;gap:16px"><span style="color:${MUTED}">${label}</span><span style="font-weight:700;color:${INK_900}">${value}</span></div>`;
  return (
    `<div style="color:${INK_900};font-weight:800;font-size:12px;margin-bottom:2px">${escapeHtml(slice.name)}</div>` +
    (slice.category ? `<div style="color:${MUTED};font-size:11px;margin-bottom:2px">${escapeHtml(slice.category)}</div>` : "") +
    `<dl style="margin:8px 0 0;display:flex;flex-direction:column;gap:4px">` +
    row("Share of this customer", `${slice.percentage}%`) +
    row("Attraction score", `${slice.score}`) +
    row("Interactions", `${slice.interactions}`) +
    `</dl>` +
    (Object.keys(slice.breakdown || {}).length
      ? `<p style="margin:8px 0 0;border-top:1px solid ${LINE};padding-top:6px;color:${MUTED}">${escapeHtml(describeBreakdown(slice.breakdown))}</p>`
      : "")
  );
};

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/**
 * Renders the category name and share inside the ring, but only where the slice
 * is wide enough to hold it. A percentage crammed into a 2% wedge is worse than
 * no label at all: it overlaps the ring, it overlaps its neighbour, and it is
 * the kind of thing that makes an admin stop trusting the rest of the chart.
 */
const sliceLabels = (slice, cx, cy, r, mid) => {
  if (slice.share * 100 < MIN_LABELLED_SHARE) return null;
  const x = cx + r * Math.cos(mid);
  const y = cy + r * Math.sin(mid);
  return h(
    "text",
    {
      x,
      y,
      fill: "#fff",
      textAnchor: "middle",
      dominantBaseline: "central",
      pointerEvents: "none",
    },
    h("tspan", { x, dy: "-0.35em", fontSize: "11", fontWeight: "800" }, slice.name),
    h("tspan", { x, dy: "1.15em", fontSize: "10.5", fontWeight: "700", opacity: "0.92" }, `${(slice.share * 100).toFixed(0)}%`)
  );
};

const Donut = ({ chartData, host }) => {
  const W = 240;
  const H = 240;
  const cx = W / 2;
  const cy = H / 2;
  const R = Math.min(W, H) / 2;
  const rIn = R * 0.58;
  const rOut = R * 0.92;
  const pad = (2 * Math.PI) / 180;

  const total = chartData.reduce((sum, s) => sum + (s.score || 0), 0) || 1;
  const svg = h("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", height: "100%", role: "img" });
  const tip = makeTip(host);
  let acc = -Math.PI / 2;
  for (const slice of chartData) {
    const ang = ((slice.score || 0) / total) * 2 * Math.PI;
    const a0 = acc + pad / 2;
    const a1 = Math.max(acc + ang - pad / 2, a0 + 0.001);
    const el = h("path", {
      d: arcPath(cx, cy, rOut, rIn, a0, a1),
      fill: slice.fill,
      stroke: "#fff",
      strokeWidth: 2,
    });
    svg.appendChild(el);
    tip.bind(el, attractTipHtml(slice));
    const label = sliceLabels(slice, cx, cy, (rIn + rOut) / 2, (a0 + a1) / 2);
    if (label) svg.appendChild(label);
    acc += ang;
  }
  return svg;
};

export default function CustomerAttractionChart({ customerId } = {}) {
  const root = h("div", { className: "space-y-4" });
  let disposed = false;
  const cleanups = [];
  const st = { data: null, loading: true, error: false, view: "category" };
  const bodyHost = h("div");
  root.appendChild(bodyHost);
  let ticket = 0;

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

  const load = () => {
    if (!customerId) {
      st.loading = false;
      st.error = false;
      st.data = null;
      paint();
      return;
    }
    const mine = ++ticket;
    st.loading = true;
    st.error = false;
    paint();
    api
      .get(`/admin/customers/${customerId}/attraction`)
      .then(({ data: payload }) => {
        if (!ensureAlive() || mine !== ticket) return;
        st.data = payload;
        st.loading = false;
        paint();
      })
      .catch(() => {
        if (!ensureAlive() || mine !== ticket) return;
        st.error = true;
        st.loading = false;
        paint();
      });
  };

  // Colour is assigned by rank, not by category name, so the biggest slice is
  // always the same colour and the palette never repeats mid-ring for a small
  // number of slices. Computed fresh for each paint because st.data arrives late.
  const chartData = () =>
    (st.data?.attraction || []).map((slice, i) => ({
      ...slice,
      share: slice.percentage / 100,
      fill: SERIES[i % SERIES.length],
    }));

  const categoryView = () => {
    const { totals, basis, weights, insights } = st.data;
    const donutBox = h("div", { className: "h-[240px] min-w-0" });
    donutBox.appendChild(Donut({ chartData: chartData(), host: donutBox }));

    return h(
      "div",
      { className: "space-y-4" },
      h(
        "div",
        { className: "flex flex-wrap items-center justify-between gap-3" },
        h(
          "div",
          { className: "flex items-center gap-2 text-2xs text-muted" },
          icon("MousePointerClick", { size: 12, className: "text-primary" }),
          h("span", { className: "tabular" }, `${totals.interactions} interactions · attraction score ${totals.score}`)
        ),
        h(
          "div",
          { className: "flex gap-1 rounded-lg border border-line bg-sunken p-0.5" },
          [
            { key: "category", label: "Categories", icon: "PieChart" },
            { key: "product", label: "Products", icon: "Package" },
          ].map(({ key, label, icon: Icon }) =>
            h(
              "button",
              {
                key,
                type: "button",
                onClick: () => {
                  if (st.view !== key) {
                    st.view = key;
                    paint();
                  }
                },
                "aria-pressed": st.view === key,
                className: `flex items-center gap-1.5 rounded-md px-2.5 py-1 text-2xs font-bold transition-colors ${
                  st.view === key ? "bg-surface text-primary shadow-sm" : "text-muted hover:text-ink-900"
                }`,
              },
              icon(Icon, { size: 12 }),
              " ",
              label
            )
          )
        )
      ),

      h(
        "div",
        { className: "grid items-center gap-4 sm:grid-cols-[minmax(0,240px)_minmax(0,1fr)]" },
        donutBox,

        h(
          "ul",
          { className: "space-y-1.5" },
          h(
            "li",
            { className: "text-2xs font-bold uppercase tracking-wider text-muted" },
            `Share of this customer's ${formatNumber(totals.score)}-point score`
          ),
          chartData().map((slice) =>
            h(
              "li",
              { key: slice.key, className: "flex items-center gap-2 text-xs" },
              h("span", { className: "h-2.5 w-2.5 flex-none rounded-sm", style: { background: slice.fill } }),
              h("span", { className: "min-w-0 flex-1 truncate font-semibold text-ink-900" }, slice.name),
              h("span", { className: "flex-none tabular text-muted" }, `${slice.percentage}%`)
            )
          )
        )
      ),

      !!insights?.length &&
        h(
          "ul",
          { className: "space-y-1 border-t border-line pt-3" },
          insights.map((line) => h("li", { key: line, className: "text-2xs text-muted" }, line))
        ),

      h(
        "details",
        { className: "group border-t border-line pt-2" },
        h(
          "summary",
          { className: "cursor-pointer list-none text-2xs font-semibold text-muted hover:text-primary" },
          "How this is calculated"
        ),
        h("p", { className: "mt-1.5 text-2xs leading-relaxed text-muted" }, basis),
        h(
          "p",
          { className: "mt-1.5 text-2xs leading-relaxed text-muted" },
          Object.entries(weights)
            .map(([type, weight]) => `${humanise(type).toLowerCase()} ${weight}x`)
            .join(" · ")
        )
      )
    );
  };

  const contentFor = () => {
    if (st.loading) {
      return h(
        "div",
        { className: "space-y-3", "aria-busy": "true", "aria-label": "Loading customer attraction" },
        h("div", { className: "mx-auto h-40 w-40 rounded-full border-4 border-line animate-pulse" }),
        h("div", { className: "h-3 w-2/3 mx-auto rounded bg-sunken animate-pulse" })
      );
    }
    if (st.error) {
      return h(
        "div",
        { className: "py-8 text-center" },
        h("span", { className: "icon-tile-primary mx-auto mb-3" }, icon("AlertCircle", { size: 18 })),
        h("p", { className: "text-sm font-bold text-ink-900" }, "Could not load attraction"),
        h("p", { className: "mt-1 text-xs text-muted" }, "The customer's behaviour could not be read."),
        h(
          "button",
          { type: "button", onClick: load, className: "btn-secondary mt-4" },
          icon("RefreshCw", { size: 13 }),
          " Try again"
        )
      );
    }
    if (!st.data?.hasData) {
      return h("p", { className: "py-8 text-center text-sm text-muted" }, "No customer attraction data available yet.");
    }
    if (st.view === "category") return categoryView();
    return ProductBars({ products: st.data.products, totalProducts: st.data.totals?.products });
  };

  function paint() {
    mount(bodyHost, contentFor());
  }

  paint();
  load();

  return root;
}