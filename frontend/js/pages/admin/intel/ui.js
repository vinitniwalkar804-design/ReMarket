/**
 * Shared presentational pieces for the product-intelligence workspace.
 *
 * These are the small building blocks every panel needs and that would otherwise
 * be re-declared nine times: a titled panel, a stat tile, a horizontal bar, and -
 * most importantly - the three states a data panel can be in when the backend has
 * nothing to show.
 *
 * The empty states are the reason this file exists. The temptation with an
 * analytics page is to render an empty chart and let the reader work out whether
 * "0%" means "nothing happened" or "this cannot be computed". Every rate in the
 * intelligence payload arrives with an `available` flag and a reason, and
 * `MetricTile` refuses to print a percentage unless that flag is set.
 *
 * Vanilla port of `pages/admin/intel/ui.jsx`. Nothing here has state, effects or
 * a lifecycle: each export is a function that returns the element the JSX
 * returned, so callers build their sub-trees the same way they do in React and
 * re-render by calling the function again. The only structural change is the
 * icon prop of `EmptyPanel`, which takes a lucide name ("Inbox", "Package",
 * ...) instead of a lucide component, since icons are built by `icon()` here.
 */
import { h } from "../../../dom.js";
import { icon } from "../../../icons.js";
import { formatNumber } from "../../../utils/format.js";
import { C } from "../../../utils/theme.js";

/** Panel with a consistent header; the whole workspace composes from these. */
export function Panel({ title, sub, action, children, className = "", bodyClass = "panel-body" } = {}) {
  return h(
    "section",
    { className: `panel ${className}` },
    (title || action) &&
      h(
        "div",
        { className: "panel-head" },
        h(
          "div",
          { className: "min-w-0" },
          title && h("h2", { className: "panel-title" }, title),
          sub && h("p", { className: "panel-sub" }, sub)
        ),
        action
      ),
    h("div", { className: bodyClass }, children)
  );
}

/** A rate, a count, or an honest statement that it cannot be computed. */
export function MetricTile({ label, value, sub, tone = "text-ink-900", hint } = {}) {
  return h(
    "div",
    { className: "stat-card" },
    h(
      "div",
      { className: "flex items-start justify-between gap-2" },
      h("span", { className: "metric-label" }, label),
      hint &&
        h(
          "span",
          { title: hint, "aria-label": hint, className: "text-muted-soft cursor-help" },
          icon("AlertTriangle", { size: 12 })
        )
    ),
    h("div", { className: `metric mt-1.5 ${tone}` }, value),
    sub && h("p", { className: "text-xs text-muted mt-1.5 leading-snug" }, sub)
  );
}

/**
 * One line of a conversion metric.
 *
 * The `available` flag is the whole point. When the backend could not compute a
 * rate it sends `available: false` and a reason, and this renders the reason
 * instead of a 0% that would read as "every single customer dropped out".
 */
export function ConversionRow({ metric } = {}) {
  const computed = metric.available && metric.rate !== null;
  return h(
    "div",
    { className: "py-3 border-b border-line last:border-b-0" },
    h(
      "div",
      { className: "flex items-baseline justify-between gap-3" },
      h("span", { className: "text-sm font-semibold text-ink-900" }, metric.label),
      computed
        ? h("span", { className: "text-lg font-extrabold tabular text-primary" }, `${metric.rate}%`)
        : h("span", { className: "badge-neutral" }, "Not computable")
    ),
    computed
      ? [
          h(
            "div",
            { className: "mt-2 h-2 rounded-full bg-sunken overflow-hidden" },
            h("div", {
              className: "h-full rounded-full transition-all duration-500",
              style: {
                width: `${Math.min(100, metric.rate)}%`,
                background: metric.rate >= 50 ? C.success : metric.rate >= 20 ? C.primary : C.warning,
              },
            })
          ),
          h(
            "p",
            { className: "text-xs text-muted mt-1.5 tabular" },
            `${formatNumber(metric.numerator)} of ${formatNumber(metric.denominator)} customers${
              metric.orderedCustomers !== metric.numerator
                ? ` · ${formatNumber(metric.orderedCustomers)} in this order`
                : ""
            }`
          ),
        ]
      : h(
          "p",
          { className: "text-xs text-muted mt-1.5" },
          `${metric.definition} No customer performed the first step, so there is no denominator.`
        ),
    computed &&
      metric.note &&
      h("p", { className: "text-xs text-warning mt-1.5" }, metric.note)
  );
}

/** Horizontal bar row, used for location, category and persona tables. */
export function BarRow({ label, value, max, sub, color = C.primary, badge, highlight = false } = {}) {
  const width = max > 0 ? Math.max(value > 0 ? 2 : 0, (value / max) * 100) : 0;
  return h(
    "div",
    { className: `rounded-xl px-3 py-2.5 ${highlight ? "bg-primary-soft/60" : ""}` },
    h(
      "div",
      { className: "flex items-center justify-between gap-3 mb-1.5" },
      h(
        "span",
        { className: "text-sm font-semibold text-ink-900 truncate flex items-center gap-2" },
        label,
        badge
      ),
      h("span", { className: "text-sm font-bold tabular text-ink-900 flex-none" }, formatNumber(value))
    ),
    h(
      "div",
      { className: "h-1.5 rounded-full bg-sunken overflow-hidden" },
      h("div", {
        className: "h-full rounded-full transition-all duration-500",
        style: { width: `${width}%`, background: color },
      })
    ),
    // The caption carries the denominator and the caveat, so it is allowed to
    // wrap rather than truncate: a clipped "17 of 55 customers…" hides exactly
    // the part that makes the bar interpretable.
    sub && h("p", { className: "text-xs text-muted mt-1.5 leading-snug" }, sub)
  );
}

const TONE_STYLES = {
  positive: { chip: "badge-success", border: "border-success/25 bg-success-soft", icon: C.success },
  neutral: { chip: "badge-neutral", border: "border-line bg-card", icon: C.slate },
  attention: { chip: "badge-warning", border: "border-warning/25 bg-warning-soft", icon: C.warning },
  risk: { chip: "badge-danger", border: "border-danger/25 bg-danger-soft", icon: C.danger },
};

/**
 * A single observation, with the evidence it was derived from.
 *
 * The evidence list is not decoration. Every rule on the server fires on a
 * threshold comparison and the payload carries the exact numbers it compared, so
 * a reader can always get from the claim back to the data without leaving the
 * page.
 */
export function InsightCard({ insight } = {}) {
  const tone = TONE_STYLES[insight.tone] || TONE_STYLES.neutral;
  return h(
    "article",
    { className: `rounded-2xl border p-4 ${tone.border}` },
    h(
      "div",
      { className: "flex items-center gap-2 mb-2" },
      h("span", { className: `${tone.chip} uppercase tracking-wider` }, insight.label)
    ),
    h("h3", { className: "text-sm font-bold text-ink-900 leading-snug" }, insight.headline),
    h("p", { className: "text-xs text-muted mt-1.5 leading-relaxed" }, insight.detail),
    insight.evidence?.length > 0 &&
      h(
        "dl",
        { className: "mt-3 pt-3 border-t border-line/60 flex flex-wrap gap-x-5 gap-y-1.5" },
        insight.evidence.map((item) =>
          h(
            "div",
            { key: item.label, className: "min-w-0" },
            h(
              "dt",
              { className: "text-[10px] font-bold uppercase tracking-wider text-muted-soft" },
              item.label
            ),
            h("dd", { className: "text-xs font-bold text-ink-900 tabular truncate" }, item.value)
          )
        )
      )
  );
}

/** "The backend ran and there is genuinely nothing here." */
export function EmptyPanel({ title, message, icon: Icon = "Inbox", action } = {}) {
  return h(
    "div",
    { className: "text-center py-10 px-4" },
    h("span", { className: "icon-tile-primary mx-auto mb-3" }, icon(Icon, { size: 18 })),
    h("h3", { className: "text-sm font-bold text-ink-900" }, title),
    h("p", { className: "text-xs text-muted mt-1.5 max-w-sm mx-auto leading-relaxed" }, message),
    action
  );
}

/** Skeleton grid, sized like the real thing so the page does not jump. */
export function LoadingGrid({ rows = 4, height = "h-56" } = {}) {
  return h(
    "div",
    { className: "space-y-5", "aria-busy": "true", "aria-live": "polite" },
    h("span", { className: "sr-only" }, "Loading intelligence"),
    h(
      "div",
      { className: "grid grid-cols-2 lg:grid-cols-4 gap-4" },
      Array(rows).fill(0).map((_, i) => h("div", { key: i, className: `skeleton-block ${height}` }))
    ),
    h(
      "div",
      { className: "grid grid-cols-1 lg:grid-cols-3 gap-5" },
      Array(3).fill(0).map((_, i) => h("div", { key: i, className: "skeleton-block h-72" }))
    )
  );
}

export function Spinner({ label = "Loading" } = {}) {
  return h(
    "span",
    { className: "inline-flex items-center gap-2 text-xs text-muted font-semibold" },
    icon("Loader2", { size: 13, className: "animate-spin" }),
    label
  );
}

/**
 * "Your search matched nothing".
 *
 * `noun` and `hint` exist because this is shared: the default wording is about
 * listings, and reusing it on a seller page would tell the reader that the
 * search had run against listing titles when it had not.
 */
export function NoSearchResults({
  query,
  onClear,
  noun = "listing",
  hint = "Search runs against listing titles.",
} = {}) {
  return h(
    "div",
    { className: "text-center py-8 px-4" },
    icon("SearchX", { size: 20, className: "mx-auto text-muted-soft mb-2" }),
    h("p", { className: "text-sm font-semibold text-ink-900" }, `No ${noun} matches “${query}”`),
    h("p", { className: "text-xs text-muted mt-1" }, hint),
    onClear &&
      h(
        "button",
        { type: "button", onClick: onClear, className: "btn btn-secondary btn-sm mt-3" },
        "Clear search"
      )
  );
}

/** Small key/value line used in the seller and negotiation detail panels. */
export function DetailRow({ label, value, tone } = {}) {
  return h(
    "div",
    { className: "flex items-center justify-between gap-3 py-1.5" },
    h("span", { className: "text-xs text-muted" }, label),
    h("span", { className: `text-xs font-bold tabular ${tone || "text-ink-900"}` }, value)
  );
}
