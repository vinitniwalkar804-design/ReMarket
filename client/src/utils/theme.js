/**
 * MERIDIAN 2026 — runtime visual tokens.
 * Single place for chart series colours, condition tones and status maps so
 * that no page has to invent its own hex values.
 */

export const C = {
  primary: "#4F3ED0",
  primaryHover: "#4031AC",
  primarySoft: "#F1F0FE",
  primaryLight: "#8574EE",
  accent: "#0B7489",
  accentSoft: "#E8F8FB",
  accentLight: "#24AAC2",
  success: "#0A7A59",
  successSoft: "#E8F7F1",
  warning: "#D2820C",
  warningSoft: "#FEF6E7",
  danger: "#C51B3D",
  dangerSoft: "#FEECEF",
  info: "#2567DF",
  infoSoft: "#EBF3FE",
  rating: "#E5A728",
  magenta: "#CE3D86",
  violet: "#6753E0",
  teal: "#0F8EA9",
  amber: "#EE9E1B",
  rose: "#EC516D",
  slate: "#5B6580",
  neutral: "#A9B1C7",
  grid: "#E4E7F0",
  axis: "#7C86A1",
  ink: "#1B2137",
  canvas: "#F4F5FA",
  white: "#FFFFFF",
  deepA: "#17143C",
  deepB: "#241A63",
  deepC: "#0D2B3D",
};

/** Ordered categorical series for charts — harmonious with the palette. */
export const SERIES = [
  C.primary,
  C.accent,
  C.violet,
  C.teal,
  C.amber,
  C.magenta,
  C.info,
  C.rose,
  C.success,
  C.slate,
];

/** Stable colour per ML cluster / persona id. */
export function seriesColor(key, index) {
  if (typeof key === "number") return SERIES[index % SERIES.length];
  const str = String(key ?? "");
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  return SERIES[hash % SERIES.length];
}

export const clusterColors = SERIES;

/** Condition → badge classes (tokens only, no ad-hoc colours). */
export const CONDITION_TONE = {
  "like new": "bg-primary-soft text-primary border-brand-200",
  "like new sealed": "bg-primary-soft text-primary border-brand-200",
  good: "bg-info-soft text-info border-info/20",
  average: "bg-warning-soft text-warning border-warning/20",
  acceptable: "bg-accent-soft text-accent border-accent/20",
  fair: "bg-warning-soft text-warning border-warning/20",
  default: "bg-sunken text-muted border-line",
};

export function conditionTone(condition = "") {
  const c = String(condition).toLowerCase().trim();
  if (c.includes("like new") || c.includes("sealed")) return CONDITION_TONE["like new"];
  if (c.includes("good")) return CONDITION_TONE.good;
  if (c.includes("average")) return CONDITION_TONE.average;
  if (c.includes("acceptable")) return CONDITION_TONE.acceptable;
  if (c.includes("fair")) return CONDITION_TONE.fair;
  return CONDITION_TONE.default;
}

/** Order status → badge classes used across Offers / Orders / Admin. */
export const ORDER_TONE = {
  pending: "badge-warning",
  offered: "badge-info",
  accepted: "badge-success",
  rejected: "badge-danger",
  declined: "badge-danger",
  countered: "badge-accent",
  cancelled: "badge-neutral",
  completed: "badge-success",
  delivered: "badge-success",
  shipped: "badge-info",
  confirmed: "badge-success",
  paid: "badge-success",
  processing: "badge-warning",
  active: "badge-success",
  sold: "badge-neutral",
  expired: "badge-neutral",
};

export const orderTone = (status = "") => ORDER_TONE[String(status).toLowerCase()] || "badge-neutral";

/** Listing status → badge classes (product catalogue + seller studio). */
export const LISTING_TONE = {
  available: "bg-success-soft text-success border-success/25",
  active: "bg-success-soft text-success border-success/25",
  sold: "bg-sunken text-muted border-line",
  reserved: "bg-warning-soft text-warning border-warning/25",
  removed: "bg-danger-soft text-danger border-danger/25",
  rejected: "bg-danger-soft text-danger border-danger/25",
  deleted: "bg-danger-soft text-danger border-danger/25",
  suspended: "bg-warning-soft text-warning border-warning/25",
  hidden: "bg-sunken text-muted border-line",
};

export const listingTone = (status = "") =>
  LISTING_TONE[String(status).toLowerCase()] || "bg-sunken text-muted border-line";

/** Shared Recharts props so every chart in the app is styled identically. */
export const chartAxis = {
  stroke: C.axis,
  tick: { fill: C.axis, fontSize: 11, fontWeight: 600 },
  tickLine: false,
  axisLine: { stroke: C.grid },
};

export const chartGrid = {
  stroke: C.grid,
  strokeDasharray: "3 3",
  vertical: false,
};

export const chartTooltip = {
  cursor: { fill: "rgba(79,62,208,0.05)" },
  contentStyle: {
    background: "#FFFFFF",
    border: `1px solid ${C.grid}`,
    borderRadius: 12,
    boxShadow: "0 18px 40px -14px rgba(12,17,34,0.22)",
    fontSize: 12,
    fontWeight: 600,
    padding: "8px 12px",
  },
  labelStyle: { color: C.ink, fontWeight: 700, marginBottom: 4 },
  itemStyle: { color: C.slate },
};

export const chartLegend = {
  wrapperStyle: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: C.slate,
    paddingTop: 8,
  },
};
