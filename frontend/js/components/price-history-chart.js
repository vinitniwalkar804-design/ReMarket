import { h, mount } from "../dom.js";
import { C, chartAxis, chartGrid, chartTooltip } from "../utils/theme.js";
import { formatINR, formatDate } from "../utils/format.js";

/**
 * Price history chart - the Recharts `<AreaChart>` from the React build's
 * `pages/ProductDetail.jsx`, drawn as inline SVG.
 *
 * Recharts is not available in this build and no chart library is added for one
 * panel, so the same chart is rendered directly. Everything the original drew is
 * reproduced from the same tokens (`chartAxis`, `chartGrid`, `chartTooltip`, `C`)
 * and the same margins and domain, so it reads identically:
 *
 *   margin  top 6 / right 6 / left -14 / bottom 0, YAxis width 52, XAxis height 30
 *   domain  [dataMin - 100, dataMax + 100] so the line never touches the frame
 *   series  monotone area, 2.5px stroke, 3px dots, vertical gradient fill
 *   hover   nearest-point tooltip and a 5px active dot, as `activeDot` did
 *
 * The data is passed oldest-first. `GET /products/:id/price-history` sorts
 * ascending, which is the only order a price line should be read in.
 */

const MARGIN = { top: 6, right: 6, left: -14, bottom: 0 };
const Y_AXIS_WIDTH = 52;
/**
 * Recharts' default `XAxis` height, subtracted from the plot area even though the
 * margin bottom is 0. Without it the baseline lands on the bottom edge of the
 * 192px frame and the date labels fall outside the viewBox.
 */
const X_AXIS_HEIGHT = 30;
const TICK_COUNT = 5;
const GRADIENT_ID = "priceGrad";

/** Used before the element is in the document, and by any layout-less test. */
const FALLBACK_WIDTH = 640;

const shortDate = (value) =>
  new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

/** Recharts' `tickFormatter`: thousands collapse to `12.5k`. */
const axisPrice = (value) =>
  `₹${Number(value) >= 1000 ? (Number(value) / 1000).toFixed(1) + "k" : Number(value)}`;

/**
 * A monotone cubic path through `points`, which is what `type="monotone"`
 * produced. Straight segments would kink at every repricing and overshoot
 * between them; this is the same Fritsch-Carlson construction Recharts uses.
 */
function monotonePath(points) {
  const n = points.length;
  if (n === 0) return "";
  if (n === 1) return `M${points[0].x},${points[0].y}`;
  if (n === 2) return `M${points[0].x},${points[0].y}L${points[1].x},${points[1].y}`;

  const dx = [];
  const slope = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = points[i + 1].x - points[i].x;
    slope[i] = dx[i] ? (points[i + 1].y - points[i].y) / dx[i] : 0;
  }

  const tangent = new Array(n);
  tangent[0] = slope[0];
  tangent[n - 1] = slope[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (slope[i - 1] * slope[i] <= 0) {
      tangent[i] = 0;
    } else {
      const w1 = 2 * dx[i] + dx[i - 1];
      const w2 = dx[i] + 2 * dx[i - 1];
      tangent[i] = (w1 + w2) / (w1 / slope[i - 1] + w2 / slope[i]);
    }
  }

  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const k = dx[i] / 3;
    d +=
      ` C${points[i].x + k},${points[i].y + tangent[i] * k}` +
      ` ${points[i + 1].x - k},${points[i + 1].y - tangent[i + 1] * k}` +
      ` ${points[i + 1].x},${points[i + 1].y}`;
  }
  return d;
}

/**
 * Which point indices get a label. Recharts dropped ticks that would collide, so
 * this keeps an even stride rather than drawing every date on top of its
 * neighbour.
 */
const tickIndices = (count, plotWidth) => {
  const room = Math.max(2, Math.floor(plotWidth / 74));
  if (count <= room) return [...Array(count).keys()];
  const stride = Math.ceil((count - 1) / (room - 1));
  const out = [];
  for (let i = 0; i < count - 1; i += stride) out.push(i);
  if (out[out.length - 1] !== count - 1) out.push(count - 1);
  return out;
};

export default function PriceHistoryChart({ data = [] } = {}) {
  const rows = (data || []).filter((d) => d && Number.isFinite(Number(d.price)));

  const svgHost = h("div", { className: "absolute inset-0" });

  const tip = h("div", {
    className: "pointer-events-none absolute z-10 hidden whitespace-nowrap",
    style: {
      background: chartTooltip.contentStyle.background,
      border: chartTooltip.contentStyle.border,
      borderRadius: String(chartTooltip.contentStyle.borderRadius),
      boxShadow: chartTooltip.contentStyle.boxShadow,
      fontSize: String(chartTooltip.contentStyle.fontSize),
      fontWeight: String(chartTooltip.contentStyle.fontWeight),
      padding: chartTooltip.contentStyle.padding,
    },
  });
  const tipLabel = h("div", {
    style: {
      color: chartTooltip.labelStyle.color,
      fontWeight: String(chartTooltip.labelStyle.fontWeight),
      marginBottom: String(chartTooltip.labelStyle.marginBottom),
    },
  });
  const tipValue = h("div", { style: { color: chartTooltip.itemStyle.color } });
  tip.append(tipLabel, tipValue);

  const el = h(
    "div",
    { className: "relative h-48", "data-price-history": "true" },
    svgHost,
    tip
  );

  /**
   * Redraw at the element's current width.
   *
   * `ResponsiveContainer` measured its parent and redrew on resize, so this does
   * too: once after the page is in the document (the first build happens before
   * it is attached and would otherwise size itself to nothing), and again on a
   * real window resize, which is the one the customer can see.
   */
  const redraw = () => {
    const width = el.clientWidth || FALLBACK_WIDTH;
    const height = el.clientHeight || 192;
    mount(svgHost, build(rows, width, height, { tip, tipLabel, tipValue }));
  };

  let resizeTimer = null;
  const onResize = () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(redraw, 120);
  };

  window.addEventListener("resize", onResize);
  const initial = setTimeout(redraw, 0);

  return {
    el,
    dispose() {
      clearTimeout(initial);
      clearTimeout(resizeTimer);
      window.removeEventListener("resize", onResize);
    },
  };
}

/** The chart itself: one <svg> plus the hover behaviour Recharts provided. */
function build(rows, width, height, tipRefs) {
  const plotX = MARGIN.left + Y_AXIS_WIDTH; // -14 + 52
  const plotW = Math.max(10, width - plotX - MARGIN.right);
  const plotY = MARGIN.top;
  const plotH = Math.max(10, height - MARGIN.top - X_AXIS_HEIGHT);
  const baseline = plotY + plotH;

  const values = rows.map((d) => Number(d.price));
  const lo = Math.min(...values) - 100;
  const hi = Math.max(...values) + 100;
  const span = hi - lo || 1;

  const xAt = (i) => plotX + (rows.length > 1 ? (plotW * i) / (rows.length - 1) : plotW / 2);
  const yAt = (v) => baseline - ((v - lo) / span) * plotH;

  const points = rows.map((d, i) => ({ x: xAt(i), y: yAt(Number(d.price)), i }));

  // ---------- grid, axes, ticks ----------

  const ticks = [];
  for (let k = 0; k < TICK_COUNT; k++) {
    const value = lo + (span * k) / (TICK_COUNT - 1);
    const y = yAt(value);
    ticks.push(
      h("line", {
        x1: plotX,
        x2: plotX + plotW,
        y1: String(y),
        y2: String(y),
        stroke: chartGrid.stroke,
        "stroke-dasharray": chartGrid.strokeDasharray,
      }),
      h(
        "text",
        {
          x: plotX - 8,
          y: String(y),
          dy: "0.32em",
          fill: chartAxis.tick.fill,
          "font-size": String(chartAxis.tick.fontSize),
          "font-weight": String(chartAxis.tick.fontWeight),
          "text-anchor": "end",
        },
        axisPrice(value)
      )
    );
  }

  const labels = tickIndices(rows.length, plotW).map((i) =>
    h(
      "text",
      {
        x: String(xAt(i)),
        y: String(baseline + 15),
        fill: chartAxis.tick.fill,
        "font-size": String(chartAxis.tick.fontSize),
        "font-weight": String(chartAxis.tick.fontWeight),
        "text-anchor": "middle",
      },
      shortDate(rows[i].createdAt)
    )
  );

  // ---------- series ----------

  const line = monotonePath(points);
  const area = `${line} L${points[points.length - 1].x},${baseline} L${points[0].x},${baseline} Z`;

  const dots = points.map((p) =>
    h("circle", {
      cx: String(p.x),
      cy: String(p.y),
      r: 3,
      fill: C.primary,
      "stroke-width": 0,
      "data-price-dot": String(p.i),
    })
  );

  // Recharts drew the tooltip cursor as the band belonging to the active point,
  // not as a hairline, so the width follows the point spacing.
  const bandW = rows.length > 1 ? Math.max(12, plotW / (rows.length - 1)) : plotW;
  const cursor = h("rect", {
    x: "0",
    y: String(plotY),
    width: "0",
    height: String(plotH),
    fill: chartTooltip.cursor.fill,
    "pointer-events": "none",
    className: "hidden",
  });

  const activeDot = h("circle", {
    cx: "0",
    cy: "0",
    r: 5,
    fill: C.primary,
    stroke: "#fff",
    "stroke-width": 2,
    "pointer-events": "none",
    className: "hidden",
  });

  const svg = h(
    "svg",
    {
      className: "block",
      width: String(width),
      height: String(height),
      viewBox: `0 0 ${width} ${height}`,
      role: "img",
      "aria-label": `Price history across ${rows.length} recorded prices`,
    },
    h(
      "defs",
      null,
      h(
        "linearGradient",
        { id: GRADIENT_ID, x1: "0", y1: "0", x2: "0", y2: "1" },
        h("stop", { offset: "0%", "stop-color": C.primary, "stop-opacity": "0.28" }),
        h("stop", { offset: "100%", "stop-color": C.primary, "stop-opacity": "0.02" })
      )
    ),
    ...ticks,
    h("line", {
      x1: String(plotX),
      x2: String(plotX),
      y1: String(plotY),
      y2: String(baseline),
      stroke: chartAxis.axisLine.stroke,
    }),
    h("line", {
      x1: String(plotX),
      x2: String(plotX + plotW),
      y1: String(baseline),
      y2: String(baseline),
      stroke: chartAxis.axisLine.stroke,
    }),
    ...labels,
    h("path", { d: area, fill: `url(#${GRADIENT_ID})` }),
    h("path", {
      d: line,
      fill: "none",
      stroke: C.primary,
      "stroke-width": "2.5",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    }),
    ...dots,
    cursor,
    activeDot,
    // The capture layer: one overlay for the whole plot, so the nearest point is
    // found from the pointer position rather than from per-dot hit testing.
    h("rect", {
      x: String(plotX),
      y: String(plotY),
      width: String(plotW),
      height: String(plotH),
      fill: "transparent",
      "data-price-surface": "true",
    })
  );

  const hide = () => {
    cursor.classList.add("hidden");
    activeDot.classList.add("hidden");
    tipRefs.tip.classList.add("hidden");
  };

  const nearest = (clientX) => {
    const rect = svg.getBoundingClientRect?.() || { left: 0 };
    const scale = rect.width ? rect.width / width : 1;
    const x = (clientX - rect.left) / (scale || 1);
    let best = 0;
    let bestGap = Infinity;
    for (let i = 0; i < points.length; i++) {
      const gap = Math.abs(points[i].x - x);
      if (gap < bestGap) {
        bestGap = gap;
        best = i;
      }
    }
    return best;
  };

  const show = (i) => {
    const p = points[i];
    if (!p) return;
    const left = Math.max(plotX, Math.min(p.x - bandW / 2, plotX + plotW - bandW));
    cursor.setAttribute("x", String(left));
    cursor.setAttribute("width", String(bandW));
    cursor.classList.remove("hidden");
    activeDot.setAttribute("cx", String(p.x));
    activeDot.setAttribute("cy", String(p.y));
    activeDot.classList.remove("hidden");

    tipRefs.tipLabel.textContent = formatDate(rows[i].createdAt);
    tipRefs.tipValue.textContent = formatINR(Number(rows[i].price));
    tipRefs.tip.classList.remove("hidden");
    const flip = p.x > width / 2;
    tipRefs.tip.style.left = `${flip ? p.x - 12 : p.x + 12}px`;
    tipRefs.tip.style.top = `${Math.max(0, p.y - 14)}px`;
    tipRefs.tip.style.transform = flip ? "translateX(-100%)" : "";
  };

  svg.addEventListener("pointermove", (e) => show(nearest(e.clientX)));
  svg.addEventListener("pointerleave", hide);

  return svg;
}
