/**
 * The chart panels of the product-intelligence workspace.
 *
 * Vanilla port of `pages/admin/intel/panels.jsx`.
 *
 * Two rules are enforced here rather than left to the caller.
 *
 * **Every chart is allowed to be empty.** Each panel checks its own data first
 * and renders a stated reason instead of an empty plot.
 *
 * **The funnel is not drawn as a funnel.** Customer counts through a
 * marketplace funnel are routinely non-monotonic, so classics tapering funnel
 * would have to lie about the shape. It is drawn as a labelled stage chart with
 * the real value printed on every bar, and the payload's own `monotonic` flag
 * decides whether to warn that the stages are not nested.
 *
 * Recharts is replaced with hand-built SVG on the same tokens
 * (`chartAxis`, `chartGrid`, `chartTooltip`, `chartLegend`, `C`, `seriesColor`),
 * so a re-implemented chart looks like the original. Hover tooltips replicate
 * the Recharts `formatter` output.
 */
import { h } from "../../../dom.js";
import { icon } from "../../../icons.js";
import { formatINR, formatNumber } from "../../../utils/format.js";
import { C, chartAxis, chartGrid, chartLegend, chartTooltip, seriesColor } from "../../../utils/theme.js";
import { BarRow, ConversionRow, EmptyPanel, Panel } from "./ui.js";

const modeLabel = (mode) => (mode === "customers" ? "Unique customers" : "Event volume");

/** Absolute-positioned hover tooltip shared by all SVG charts in this file. */
function makeTip(host) {
  let tip = null;
  const ensure = () => {
    if (!tip) {
      tip = document.createElement("div");
      tip.style.cssText =
        "position:absolute;z-index:30;pointer-events:none;white-space:nowrap;display:none;";
      Object.assign(tip.style, chartTooltip.contentStyle);
      if (getComputedStyle(host).position === "static") host.style.position = "relative";
      host.appendChild(tip);
    }
    return tip;
  };
  return {
    bind(el, html) {
      el.style.cursor = "default";
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

/** Annular sector path (donut slice), clockwise from angle a0 to a1. */
function arcPath(cx, cy, rOuter, rInner, a0, a1) {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const p0 = [cx + rOuter * Math.cos(a0), cy + rOuter * Math.sin(a0)];
  const p1 = [cx + rOuter * Math.cos(a1), cy + rOuter * Math.sin(a1)];
  const i0 = [cx + rInner * Math.cos(a1), cy + rInner * Math.sin(a1)];
  const i1 = [cx + rInner * Math.cos(a0), cy + rInner * Math.sin(a0)];
  return `M${p0[0].toFixed(2)},${p0[1].toFixed(2)} A${rOuter},${rOuter} 0 ${large} 1 ${p1[0].toFixed(2)},${p1[1].toFixed(2)} L${i0[0].toFixed(2)},${i0[1].toFixed(2)} A${rInner},${rInner} 0 ${large} 0 ${i1[0].toFixed(2)},${i1[1].toFixed(2)} Z`;
}

/** Path for a bar rounded only at the top corners (Recharts radius={[5,5,0,0]}). */
function barPath(x, y, w, h, r = 5) {
  r = Math.min(r, w / 2, h);
  if (h <= 0) return "";
  return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`;
}

/** A simple-yet-honest integer tick scale, like a YAxis with `allowDecimals={false}`. */
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

/* ------------------------------------------------------------------ mix ---- */

export function InteractionMix({ mix, mode, onModeChange, totalEvents, otherEvents }) {
  const signals = (mix?.signals || []).filter((s) => (mode === "customers" ? s.customers : s.events) > 0);
  const chartData = signals.map((s) => ({
    name: s.label,
    key: s.key,
    value: mode === "customers" ? s.customers : s.events,
    color: s.color,
  }));
  const total = chartData.reduce((sum, row) => sum + row.value, 0);
  const hasData = chartData.length > 0;

  const donutHost = h("div", { className: "lg:col-span-2 h-[220px]" });
  if (hasData) {
    const W = 260;
    const H = 220;
    const cx = W / 2;
    const cy = H / 2;
    const R = Math.min(W, H) / 2;
    const rIn = R * 0.58;
    const rOut = R * 0.92;
    const pad = (2 * Math.PI) / 180;
    const svg = h("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", height: "100%", role: "img" });
    const tip = makeTip(donutHost);
    let acc = -Math.PI / 2;
    for (const row of chartData) {
      const ang = (row.value / total) * 2 * Math.PI;
      const a0 = acc + pad / 2;
      const a1 = acc + Math.max(ang - pad / 2, 0.001);
      const el = h("path", {
        d: arcPath(cx, cy, rOut, rIn, a0, a1),
        fill: row.color,
        stroke: "none",
      });
      const span = h("span", { className: "sr-only" }, `${row.name}: ${formatNumber(row.value)}`);
      svg.appendChild(span);
      tip.bind(
        el,
        `<div style="color:${chartTooltip.labelStyle.color};font-weight:700;margin-bottom:4px">${row.name}</div>` +
          `<div style="color:${C.slate}"><span style="display:inline-block;width:8px;height:8px;border-radius:9999px;background:${row.color};margin-right:6px"></span>${formatNumber(row.value)} ${modeLabel(
            mode
          ).toLowerCase()}</div>`
      );
      svg.appendChild(el);
      acc += ang;
    }
    donutHost.appendChild(svg);
  }

  return Panel({
    title: "Product interaction mix",
    sub: "Views, research and intent for this listing",
    action: h(
      "div",
      { className: "tab-list flex-none" },
      [
        { key: "events", label: "Events" },
        { key: "customers", label: "Customers" },
      ].map((option) =>
        h(
          "button",
          {
            key: option.key,
            type: "button",
            onClick: () => onModeChange(option.key),
            className: `tab ${mode === option.key ? "tab-active" : ""}`,
            "aria-pressed": mode === option.key,
          },
          option.label
        )
      )
    ),
    children: [
      !hasData
        ? EmptyPanel({
            icon: "PieChart",
            title: "No interactions recorded",
            message:
              "Nothing has been tracked against this listing yet, so there is no mix to chart. Its listing counters are shown separately on the overview.",
          })
        : h(
            "div",
            { className: "grid grid-cols-1 lg:grid-cols-5 gap-5 items-center" },
            donutHost,
            h(
              "ul",
              { className: "lg:col-span-3 space-y-2.5" },
              chartData.map((row) => {
                const share = total > 0 ? (row.value / total) * 100 : 0;
                return h(
                  "li",
                  { key: row.key },
                  h(
                    "div",
                    { className: "flex items-center justify-between gap-3 text-xs" },
                    h(
                      "span",
                      { className: "flex items-center gap-2 font-semibold text-ink-900 min-w-0" },
                      h("span", { className: "w-2.5 h-2.5 rounded-full flex-none", style: { background: row.color } }),
                      h("span", { className: "truncate" }, row.name)
                    ),
                    h(
                      "span",
                      { className: "tabular text-muted flex-none" },
                      h("b", { className: "text-ink-900" }, formatNumber(row.value)),
                      ` · ${share.toFixed(1)}%`
                    )
                  )
                );
              })
            )
          ),
      hasData && otherEvents > 0
        ? h(
            "p",
            { className: "text-xs text-muted mt-4 pt-3 border-t border-line leading-relaxed" },
            `${formatNumber(otherEvents)} further tracked interactions on this listing are not in the chart`,
            totalEvents
              ? ` (${formatNumber(totalEvents)} in total, of which ${formatNumber(total)} are the six signals above)`
              : "",
            ". Price watches, review reads and checkout starts are shown in the signals strip below."
          )
        : null,
    ],
  });
}

export function SignalStrip({ support }) {
  const rows = (support || []).filter((s) => s.events > 0);
  if (!rows.length) {
    return Panel({
      title: "Additional signals",
      sub: "Secondary intent that is not a step toward a purchase",
      children: h("p", { className: "text-xs text-muted py-3 text-center" }, "No secondary signals have been recorded for this listing."),
    });
  }
  return Panel({
    title: "Additional signals",
    sub: "Secondary intent that is not a step toward a purchase",
    children: h(
      "div",
      { className: "grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3" },
      rows.map((s) =>
        h(
          "div",
          { key: s.event || s.label, className: "rounded-xl border border-line px-3 py-2.5" },
          h("p", { className: "text-2xs font-bold uppercase tracking-wider text-muted truncate" }, s.label),
          h("p", { className: "text-base font-extrabold tabular text-ink-900 mt-1" }, formatNumber(s.events)),
          h("p", { className: "text-2xs text-muted tabular" }, `${formatNumber(s.customers)} customers`)
        )
      )
    ),
  });
}

/* ---------------------------------------------------------------- funnel ---- */

export function FunnelPanel({ funnel }) {
  const stages = funnel?.stages || [];
  const rows = stages.map((s) => ({
    label: s.label,
    Customers: s.customers,
    Events: s.events,
    color: s.customers > 0 ? C.primary : C.grid,
  }));
  const maxVal = Math.max(1, ...stages.map((s) => Math.max(s.customers, s.events)));
  const hasData = stages.some((s) => s.events > 0);

  const chartHost = h("div", { className: "h-[240px]" });
  if (hasData && rows.length) {
    const W = 680;
    const H = 240;
    const top = 12;
    const right = 12;
    const left = 40;
    const bottom = 58;
    const plotW = W - left - right;
    const plotH = H - top - bottom;
    const ticks = niceTicks(maxVal);
    const tickMax = ticks[ticks.length - 1];
    const tip = makeTip(chartHost);

    const svg = h("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", height: "100%", role: "img" });

    ticks.forEach((tick) => {
      const y = top + plotH - (tick / tickMax) * plotH;
      svg.appendChild(h("line", {
        x1: left, x2: W - right, y1: y, y2: y,
        stroke: chartGrid.stroke, strokeDasharray: chartGrid.strokeDasharray, strokeWidth: 1,
      }));
      svg.appendChild(h("text", {
        x: left - 8, y: y + 4, textAnchor: "end",
        fill: chartAxis.tick.fill, fontSize: chartAxis.tick.fontSize, fontWeight: chartAxis.tick.fontWeight,
      }, String(tick)));
    });

    const n = rows.length;
    const groupW = plotW / n;
    const pairW = Math.min(groupW, 34 * 2 + 2);
    const barW = (pairW - 2) / 2;
    const series = [
      { key: "Customers", fill: C.primary },
      { key: "Events", fill: C.accent },
    ];

    rows.forEach((row, i) => {
      const x0 = left + i * groupW + (groupW - pairW) / 2;
      series.forEach((s, si) => {
        const value = 0 + (row[s.key] || 0);
        const y = top + plotH - (value / tickMax) * plotH;
        const hh = (value / tickMax) * plotH;
        const el = h("path", {
          d: barPath(x0 + si * (barW + 2), y, barW, hh),
          fill: s.fill,
        });
        const html =
          `<div style="color:${chartTooltip.labelStyle.color};font-weight:700;margin-bottom:4px">${row.label}</div>` +
          series
            .map(
              (ss) =>
                `<div style="color:${C.slate}"><span style="display:inline-block;width:8px;height:8px;border-radius:9999px;background:${ss.fill};margin-right:6px"></span>${ss.key}: ${formatNumber(row[ss.key])}</div>`
            )
            .join("");
        tip.bind(el, html);
        svg.appendChild(el);
      });
      svg.appendChild(h("text", {
        x: x0 + pairW / 2 + 4, y: top + plotH + 16,
        transform: `rotate(-12 ${x0 + pairW / 2 + 4} ${top + plotH + 16})`,
        textAnchor: "end", fill: chartAxis.tick.fill, fontSize: chartAxis.tick.fontSize, fontWeight: chartAxis.tick.fontWeight,
      }, row.label));
    });

    chartHost.appendChild(svg);
  }

  return Panel({
    title: "Consideration funnel",
    sub: "Distinct customers reaching each stage",
    children: !hasData
      ? EmptyPanel({
          title: "No funnel to draw",
          message: "No interaction events reference this listing, so no customer can be placed at any stage.",
        })
      : [
          h(
            "div",
            { className: "flex flex-wrap items-center justify-center gap-5 pt-1 pb-2", style: chartLegend.wrapperStyle },
            h("span", { className: "flex items-center gap-1.5" }, h("span", { className: "w-2.5 h-2.5 rounded-[3px]", style: { background: C.primary } }), "Customers"),
            h("span", { className: "flex items-center gap-1.5" }, h("span", { className: "w-2.5 h-2.5 rounded-[3px]", style: { background: C.accent } }), "Events")
          ),
          chartHost,
          h(
            "div",
            { className: "mt-4 overflow-x-auto" },
            h(
              "table",
              { className: "data-table" },
              h(
                "thead",
                null,
                h(
                  "tr",
                  null,
                  h("th", null, "Stage"),
                  h("th", { className: "th-num" }, "Customers"),
                  h("th", { className: "th-num" }, "Events"),
                  h("th", { className: "th-num" }, "In order"),
                  h("th", { className: "th-num" }, "From previous")
                )
              ),
              h(
                "tbody",
                null,
                stages.map((stage, index) => {
                  const previous = index > 0 ? stages[index - 1] : null;
                  return h(
                    "tr",
                    { key: stage.key },
                    h("td", { className: "font-semibold text-ink-900" }, stage.label),
                    h("td", { className: "num" }, formatNumber(stage.customers)),
                    h("td", { className: "num text-muted" }, formatNumber(stage.events)),
                    h("td", { className: "num text-muted" }, stage.orderedCustomers === null ? "—" : formatNumber(stage.orderedCustomers)),
                    h("td", { className: "num text-muted" }, stage.customerStepRate === null ? "—" : `${stage.customerStepRate}%`)
                  );
                })
              )
            )
          ),
          h(
            "p",
            { className: "text-xs text-muted mt-3 leading-relaxed flex items-start gap-2" },
            icon("Info", { size: 13, className: "flex-none mt-0.5 text-muted-soft" }),
            h(
              "span",
              null,
              funnel.monotonic
                ? "Stage customer counts decrease monotonically, so this listing behaves like a conventional funnel. "
                : "Stage customer counts are not strictly decreasing, which is expected in a marketplace: an offer can be made without a cart, and a wishlist can be saved without a cart. The counts are not adjusted to force a funnel shape. ",
              "“In order” counts only customers whose first action at a stage came after their first action at the previous stage."
            )
          ),
        ],
  });
}

/* ------------------------------------------------------------ conversion ---- */

export function ConversionPanel({ conversion, abandonment }) {
  const metrics = conversion?.metrics || [];
  return h(
    "div",
    { className: "grid grid-cols-1 lg:grid-cols-2 gap-5" },
    Panel({
      title: "Stage-to-stage conversion",
      sub: "Customer-level, numerator and denominator shown",
      children: metrics.length === 0
        ? EmptyPanel({ title: "No conversion data", message: "No tracked interactions exist for this listing." })
        : h(
            "div",
            null,
            metrics.map((metric) => ConversionRow({ key: metric.key, metric }))
          ),
    }),
    Panel({
      title: "Cart abandonment",
      sub: "Customers who carted this listing and never bought it",
      action: abandonment?.available
        ? h(
            "span",
            {
              className: `badge ${abandonment.rate >= 75 ? "badge-danger" : abandonment.rate >= 50 ? "badge-warning" : "badge-success"}`,
            },
            `${abandonment.rate}%`
          )
        : h("span", { className: "badge-neutral" }, "No data"),
      children: !abandonment?.available
        ? EmptyPanel({
            title: "No carts to evaluate",
            message: "No customer has added this listing to a cart, so there is no abandonment to measure.",
          })
        : [
            h(
              "div",
              { className: "grid grid-cols-2 gap-3 mb-4" },
              h(
                "div",
                { className: "rounded-xl border border-line px-3 py-2.5" },
                h("p", { className: "text-2xs font-bold uppercase tracking-wider text-muted" }, "Added to cart"),
                h("p", { className: "text-lg font-extrabold tabular text-ink-900 mt-1" }, formatNumber(abandonment.cartCustomers)),
                h("p", { className: "text-2xs text-muted" }, `${formatNumber(abandonment.cartAdds)} cart events`)
              ),
              h(
                "div",
                { className: "rounded-xl border border-line px-3 py-2.5" },
                h("p", { className: "text-2xs font-bold uppercase tracking-wider text-muted" }, "Went on to buy"),
                h("p", { className: "text-lg font-extrabold tabular text-ink-900 mt-1" }, formatNumber(abandonment.convertedCustomers)),
                h("p", { className: "text-2xs text-muted" }, `of ${formatNumber(abandonment.cartCustomers)} who carted`)
              )
            ),
            h(
              "div",
              { className: "h-2.5 rounded-full bg-sunken overflow-hidden" },
              h("div", {
                className: "h-full rounded-full transition-all duration-500",
                style: {
                  width: `${abandonment.rate}%`,
                  background: abandonment.rate >= 75 ? C.danger : abandonment.rate >= 50 ? C.warning : C.success,
                },
              })
            ),
            h("p", { className: "text-xs text-muted mt-2.5 leading-relaxed" }, abandonment.basis),
          ],
    })
  );
}

/** Marketplace-wide worst offenders, so a single listing is judged in context. */
export function AbandonmentLeaders({ rows }) {
  const max = Math.max(1, ...(rows || []).map((r) => r.abandonedCustomers));
  return Panel({
    title: "Worst cart abandonment marketplace-wide",
    sub: "Ranked by customers who carted a listing and never bought it",
    children: !rows?.length
      ? EmptyPanel({ title: "Nothing to rank", message: "No listing has a large enough cart sample to rank yet." })
      : h(
          "div",
          { className: "space-y-1.5" },
          rows.map((row) =>
            BarRow({
              key: row.productId,
              label: row.title,
              value: row.abandonedCustomers,
              max,
              color: C.danger,
              badge: h("span", { className: "badge-neutral" }, row.categoryName),
              sub: `${formatNumber(row.cartCustomers)} carted · ${formatNumber(row.convertedCustomers)} converted · ${row.abandonmentRate}% abandoned · ${formatINR(row.price)}`,
            })
          )
        ),
  });
}

/* --------------------------------------------------------------- personas ---- */

export function PersonaPanel({ personas }) {
  if (!personas?.available) {
    return Panel({
      title: "Customer personas",
      sub: "From the newest completed segmentation run",
      action: h("span", { className: "badge-neutral" }, "Unavailable"),
      children: EmptyPanel({
        icon: "Users",
        title: "No completed segmentation run",
        message: personas?.note || "Run the Cluster Lab to produce personas before this panel can be filled.",
      }),
    });
  }

  const segments = personas.segments || [];
  const max = Math.max(1, ...segments.map((s) => s.customers));

  return Panel({
    title: "Customer personas",
    sub: `Who engaged with this listing, mapped to run ${personas.runId}`,
    action: h(
      "span",
      { className: "badge-primary" },
      `${formatNumber(personas.mappedCustomers)}/${formatNumber(personas.totalCustomers)} mapped`
    ),
    children: [
      segments.length === 0
        ? EmptyPanel({
            icon: "Users",
            title: "No interacting customer could be assigned",
            message: `All ${personas.totalCustomers} customers who engaged with this listing were labelled as outliers in the latest run, so no persona composition can be shown. This is a statement about the sample, not about the customers.`,
          })
        : h(
            "div",
            { className: "space-y-2.5" },
            segments.map((segment, index) =>
              h(
                "div",
                { key: segment.label, className: "rounded-xl border border-line p-3.5" },
                h(
                  "div",
                  { className: "flex items-start justify-between gap-3 mb-2" },
                  h(
                    "div",
                    { className: "min-w-0" },
                    h(
                      "p",
                      { className: "text-sm font-bold text-ink-900 flex items-center gap-2" },
                      h("span", { className: "w-2.5 h-2.5 rounded-full flex-none", style: { background: seriesColor(index, index) } }),
                      segment.name
                    ),
                    segment.signature && h("p", { className: "text-2xs text-muted mt-0.5 font-mono" }, segment.signature)
                  ),
                  h(
                    "div",
                    { className: "text-right flex-none" },
                    h("p", { className: "text-base font-extrabold tabular text-ink-900" }, formatNumber(segment.customers)),
                    h("p", { className: "text-2xs text-muted tabular" }, `${segment.share}% of mapped`)
                  )
                ),
                BarRow({ label: "", value: segment.customers, max, color: seriesColor(index, index) }),
                segment.description && h("p", { className: "text-xs text-muted mt-2 leading-relaxed" }, segment.description),
                h(
                  "div",
                  { className: "flex flex-wrap gap-x-4 gap-y-1 mt-2.5 pt-2.5 border-t border-line/60" },
                  h("span", { className: "text-2xs text-muted tabular" }, "Engagement ", h("b", { className: "text-ink-900" }, segment.engagementIndex ?? "—")),
                  h("span", { className: "text-2xs text-muted tabular" }, "Purchase tendency ", h("b", { className: "text-ink-900" }, segment.purchaseTendency ?? "—")),
                  h("span", { className: "text-2xs text-muted tabular" }, "Avg spend ", h("b", { className: "text-ink-900" }, formatINR(segment.avgSpending))),
                  h("span", { className: "text-2xs text-muted tabular" }, "Match ", h("b", { className: "text-ink-900" }, segment.matchScore ?? "—"))
                )
              )
            )
          ),
      personas.unassignedCustomers > 0 &&
        h(
          "p",
          { className: "text-xs text-warning mt-3 leading-relaxed" },
          `${formatNumber(personas.unassignedCustomers)} of ${formatNumber(personas.totalCustomers)} interacting customers were labelled outliers by the clustering run and are not assigned to a persona. They are excluded from the percentages above rather than being spread across the nearest segment.`
        ),
    ],
  });
}

/* --------------------------------------------------------------- category ---- */

export function CategoryPanel({ categoryInterest, product }) {
  const rows = categoryInterest?.rows || [];
  const max = Math.max(1, ...rows.map((r) => r.attractionScore || 0));
  const own = categoryInterest;

  return Panel({
    title: "Category interest",
    sub: "Weighted demand from recorded behaviour, with listing supply beside it",
    children: rows.length === 0
      ? EmptyPanel({
          icon: "Layers",
          title: "No category interest recorded",
          message: "Category demand is built from behaviour events. None have been recorded yet.",
        })
      : [
          h(
            "div",
            { className: "grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4" },
            h(
              "div",
              { className: "rounded-xl border border-line px-3 py-2.5" },
              h("p", { className: "text-2xs font-bold uppercase tracking-wider text-muted" }, "This category"),
              h("p", { className: "text-sm font-extrabold text-ink-900 mt-1 truncate" }, own.category)
            ),
            h(
              "div",
              { className: "rounded-xl border border-line px-3 py-2.5" },
              h("p", { className: "text-2xs font-bold uppercase tracking-wider text-muted" }, "Demand rank"),
              h("p", { className: "text-lg font-extrabold tabular text-ink-900 mt-1" }, own.rank ? `${own.rank}/${own.totalCategories}` : "—")
            ),
            h(
              "div",
              { className: "rounded-xl border border-line px-3 py-2.5" },
              h("p", { className: "text-2xs font-bold uppercase tracking-wider text-muted" }, "Attraction"),
              h("p", { className: "text-lg font-extrabold tabular text-ink-900 mt-1" }, formatNumber(own.attractionScore)),
              h("p", { className: "text-2xs text-muted" }, `${formatNumber(own.listings)} listings`)
            ),
            h(
              "div",
              { className: "rounded-xl border border-line px-3 py-2.5" },
              h("p", { className: "text-2xs font-bold uppercase tracking-wider text-muted" }, "This listing's share"),
              h("p", { className: "text-lg font-extrabold tabular text-ink-900 mt-1" }, own.thisListingViewShare === null ? "—" : `${own.thisListingViewShare}%`),
              h("p", { className: "text-2xs text-muted" }, "of category views")
            )
          ),
          h(
            "div",
            { className: "space-y-1.5" },
            rows.map((row) =>
              BarRow({
                key: row.category,
                label: row.category,
                value: row.attractionScore,
                max,
                highlight: row.isThisListing,
                badge: row.isThisListing ? h("span", { className: "badge-primary" }, "This listing") : null,
                color: row.isThisListing ? C.primary : C.accent,
                sub: `${formatNumber(row.listings)} listings · ${formatNumber(row.customers)} customers · demand per listing ${row.demandPerListing ?? "—"} · conversion ${row.conversionRate === null ? "not computable" : `${row.conversionRate}%`}`,
              })
            )
          ),
          h("p", { className: "text-xs text-muted mt-3 leading-relaxed" }, own.basis),
          product &&
            h(
              "p",
              { className: "text-xs text-muted-soft mt-1.5 leading-relaxed" },
              `Supply in this category is ${formatNumber(own.listings)} listings against an attraction score of ${formatNumber(own.attractionScore)}`,
              own.demandPerListing
                ? `, or ${own.demandPerListing} weighted interest per listing — ${own.demandPerListing >= 300 ? "demand is high relative to the number of listings" : "supply is comparatively deep"}.`
                : "."
            ),
        ],
  });
}

/* ------------------------------------------------------------ negotiation ---- */

export function NegotiationPanel({ negotiation, product } = {}) {
  const offers = negotiation?.offers || { total: 0 };
  const byStatus = negotiation?.byStatus || {};
  const rows = Object.entries(byStatus);
  const max = Math.max(1, ...rows.map(([, v]) => v.count));
  const accepted = byStatus.accepted?.count || 0;
  const resolved = accepted + (byStatus.rejected?.count || 0) + (byStatus.expired?.count || 0);
  const acceptance = resolved > 0 ? (accepted / resolved) * 100 : null;

  return Panel({
    title: "Negotiation",
    sub: "Offers made on this listing and how they resolved",
    action: offers.total > 0
      ? h("span", { className: "badge-primary" }, `${formatNumber(offers.total)} offers`)
      : h("span", { className: "badge-neutral" }, "None"),
    children: offers.total === 0
      ? EmptyPanel({
          icon: "Handshake",
          title: product?.negotiable ? "No offers on a negotiable listing" : "Offers are not accepted",
          message: product?.negotiable
            ? "This listing is marked negotiable but no offer has been recorded against it. Either the listed price already matches what customers will pay, or the negotiation option is not being noticed."
            : "This listing is not negotiable, so offers are not accepted on it.",
        })
      : [
          h(
            "div",
            { className: "grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4" },
            h(
              "div",
              { className: "rounded-xl border border-line px-3 py-2.5" },
              h("p", { className: "text-2xs font-bold uppercase tracking-wider text-muted" }, "Offers"),
              h("p", { className: "text-lg font-extrabold tabular text-ink-900 mt-1" }, formatNumber(offers.total)),
              h("p", { className: "text-2xs text-muted" }, `${formatNumber(offers.uniqueBuyers)} buyers`)
            ),
            h(
              "div",
              { className: "rounded-xl border border-line px-3 py-2.5" },
              h("p", { className: "text-2xs font-bold uppercase tracking-wider text-muted" }, "Avg first offer"),
              h("p", { className: "text-lg font-extrabold tabular text-ink-900 mt-1" }, formatINR(offers.avgFirstOffer)),
              h("p", { className: "text-2xs text-muted tabular" }, `${formatINR(offers.lowestOffer)} – ${formatINR(offers.highestOffer)}`)
            ),
            h(
              "div",
              { className: "rounded-xl border border-line px-3 py-2.5" },
              h("p", { className: "text-2xs font-bold uppercase tracking-wider text-muted" }, "Acceptance"),
              h("p", { className: "text-lg font-extrabold tabular text-ink-900 mt-1" }, acceptance === null ? "—" : `${acceptance.toFixed(0)}%`),
              h("p", { className: "text-2xs text-muted" }, `${formatNumber(accepted)} of ${formatNumber(resolved)} resolved`)
            ),
            h(
              "div",
              { className: "rounded-xl border border-line px-3 py-2.5" },
              h("p", { className: "text-2xs font-bold uppercase tracking-wider text-muted" }, "Realised price"),
              h("p", { className: "text-lg font-extrabold tabular text-ink-900 mt-1" }, formatINR(negotiation.acceptedAvgFinalPrice)),
              h("p", { className: "text-2xs text-muted" }, negotiation.realisedDiscountPercent === null ? "no accepted deals" : `${negotiation.realisedDiscountPercent}% below the then-listed price`)
            )
          ),
          h(
            "div",
            { className: "space-y-1.5" },
            rows.map(([status, value]) =>
              BarRow({
                key: status,
                label: status.charAt(0).toUpperCase() + status.slice(1),
                value: value.count,
                max,
                color: status === "accepted" ? C.success : status === "pending" ? C.warning : status === "rejected" ? C.danger : C.slate,
                sub: [
                  value.avgFirstOffer ? `avg offered ${formatINR(value.avgFirstOffer)}` : null,
                  value.avgCounter ? `avg counter ${formatINR(value.avgCounter)}` : null,
                  value.avgRounds ? `${value.avgRounds} rounds avg` : null,
                  value.avgResponseMinutes ? `replied in ${value.avgResponseMinutes} min` : null,
                ]
                  .filter(Boolean)
                  .join(" · "),
              })
            )
          ),
          h("p", { className: "text-xs text-muted mt-3 leading-relaxed" }, negotiation.note),
        ],
  });
}

/* --------------------------------------------------------------- location ---- */

export function LocationPanel({ location } = {}) {
  const known = location?.knownRows || [];
  const max = Math.max(1, ...known.map((r) => r.customers));
  const shown = known.slice(0, 8);
  const rest = known.length - shown.length;

  return Panel({
    title: "Customer geography",
    sub: "Where the customers engaging with this listing are based",
    action: location?.missingLocationCustomers > 0
      ? h("span", { className: "badge-warning" }, `${formatNumber(location.missingLocationCustomers)} unlocated`)
      : null,
    children: shown.length === 0
      ? EmptyPanel({
          icon: "MapPin",
          title: "No location data",
          message: "None of the customers engaging with this listing have a location on their profile.",
        })
      : [
          h(
            "div",
            { className: "space-y-1.5" },
            shown.map((row) =>
              BarRow({
                key: row.location,
                label: row.location,
                value: row.customers,
                max,
                color: C.teal,
                sub: `${formatNumber(row.events)} tracked interactions${row.share === null ? "" : ` · ${row.share}% of engaging customers`}`,
              })
            )
          ),
          rest > 0 && h("p", { className: "text-xs text-muted mt-2.5" }, `and ${rest} more location${rest === 1 ? "" : "s"}.`),
          h("p", { className: "text-xs text-muted-soft mt-3 leading-relaxed" }, location?.basis),
        ],
  });
}

/* ---------------------------------------------------------------- related ---- */

export function RelatedPanel({ related, onSelect, currentId } = {}) {
  const rows = (related || []).filter((r) => r.productId !== currentId);
  const max = Math.max(1, ...rows.map((r) => r.sharedCustomers));

  return Panel({
    title: "Related interest",
    sub: "Other listings the same customers engaged with",
    children: rows.length === 0
      ? EmptyPanel({
          title: "No co-interest found",
          message: "No other listing was engaged with by at least two of this listing's customers, so there is no related-interest graph to show.",
        })
      : h(
          "div",
          { className: "grid grid-cols-1 sm:grid-cols-2 gap-3" },
          rows.map((row) =>
            h(
              "button",
              {
                key: row.productId,
                type: "button",
                onClick: () => onSelect?.(row.productId),
                className: "text-left rounded-xl border border-line p-3 hover:border-line-strong hover:bg-raised transition-colors",
              },
              h(
                "div",
                { className: "flex items-start gap-3" },
                h(
                  "span",
                  { className: "relative w-12 h-12 rounded-lg overflow-hidden bg-sunken flex-none" },
                  row.image ? h("img", { src: row.image, alt: "", className: "w-full h-full object-cover", loading: "lazy" }) : null
                ),
                h(
                  "span",
                  { className: "min-w-0 flex-1" },
                  h("span", { className: "block text-sm font-semibold text-ink-900 truncate" }, row.title),
                  h("span", { className: "block text-xs text-muted truncate" }, `${row.categoryName} · ${formatINR(row.price)}`)
                )
              ),
              h(
                "div",
                { className: "mt-2.5" },
                BarRow({
                  label: "",
                  value: row.sharedCustomers,
                  max,
                  color: C.violet,
                  sub: `${formatNumber(row.sharedCustomers)} shared customers (${row.share}%) · ${formatNumber(row.coEvents)} interactions`,
                })
              )
            )
          )
        ),
  });
}