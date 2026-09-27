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
 */
import { AlertTriangle, Inbox, Loader2, SearchX } from "lucide-react";
import { formatNumber } from "../../../utils/format.js";
import { C } from "../../../utils/theme.js";

/** Panel with a consistent header; the whole workspace composes from these. */
export function Panel({ title, sub, action, children, className = "", bodyClass = "panel-body" }) {
  return (
    <section className={`panel ${className}`}>
      {(title || action) && (
        <div className="panel-head">
          <div className="min-w-0">
            {title && <h2 className="panel-title">{title}</h2>}
            {sub && <p className="panel-sub">{sub}</p>}
          </div>
          {action}
        </div>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

/** A rate, a count, or an honest statement that it cannot be computed. */
export function MetricTile({ label, value, sub, tone = "text-ink-900", hint }) {
  return (
    <div className="stat-card">
      <div className="flex items-start justify-between gap-2">
        <span className="metric-label">{label}</span>
        {hint && (
          <span title={hint} aria-label={hint} className="text-muted-soft cursor-help">
            <AlertTriangle size={12} />
          </span>
        )}
      </div>
      <div className={`metric mt-1.5 ${tone}`}>{value}</div>
      {sub && <p className="text-xs text-muted mt-1.5 leading-snug">{sub}</p>}
    </div>
  );
}

/**
 * One line of a conversion metric.
 *
 * The `available` flag is the whole point. When the backend could not compute a
 * rate it sends `available: false` and a reason, and this renders the reason
 * instead of a 0% that would read as "every single customer dropped out".
 */
export function ConversionRow({ metric }) {
  const computed = metric.available && metric.rate !== null;
  return (
    <div className="py-3 border-b border-line last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold text-ink-900">{metric.label}</span>
        {computed ? (
          <span className="text-lg font-extrabold tabular text-primary">{metric.rate}%</span>
        ) : (
          <span className="badge-neutral">Not computable</span>
        )}
      </div>
      {computed ? (
        <>
          <div className="mt-2 h-2 rounded-full bg-sunken overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(100, metric.rate)}%`,
                background: metric.rate >= 50 ? C.success : metric.rate >= 20 ? C.primary : C.warning,
              }}
            />
          </div>
          <p className="text-xs text-muted mt-1.5 tabular">
            {formatNumber(metric.numerator)} of {formatNumber(metric.denominator)} customers
            {metric.orderedCustomers !== metric.numerator
              ? ` · ${formatNumber(metric.orderedCustomers)} in this order`
              : ""}
          </p>
        </>
      ) : (
        <p className="text-xs text-muted mt-1.5">
          {metric.definition} No customer performed the first step, so there is no denominator.
        </p>
      )}
      {computed && metric.note && <p className="text-xs text-warning mt-1.5">{metric.note}</p>}
    </div>
  );
}

/** Horizontal bar row, used for location, category and persona tables. */
export function BarRow({ label, value, max, sub, color = C.primary, badge, highlight = false }) {
  const width = max > 0 ? Math.max(value > 0 ? 2 : 0, (value / max) * 100) : 0;
  return (
    <div className={`rounded-xl px-3 py-2.5 ${highlight ? "bg-primary-soft/60" : ""}`}>
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <span className="text-sm font-semibold text-ink-900 truncate flex items-center gap-2">
          {label}
          {badge}
        </span>
        <span className="text-sm font-bold tabular text-ink-900 flex-none">{formatNumber(value)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-sunken overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${width}%`, background: color }}
        />
      </div>
      {/* The caption carries the denominator and the caveat, so it is allowed to
          wrap rather than truncate: a clipped "17 of 55 customers…" hides exactly
          the part that makes the bar interpretable. */}
      {sub && <p className="text-xs text-muted mt-1.5 leading-snug">{sub}</p>}
    </div>
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
export function InsightCard({ insight }) {
  const tone = TONE_STYLES[insight.tone] || TONE_STYLES.neutral;
  return (
    <article className={`rounded-2xl border p-4 ${tone.border}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className={`${tone.chip} uppercase tracking-wider`}>{insight.label}</span>
      </div>
      <h3 className="text-sm font-bold text-ink-900 leading-snug">{insight.headline}</h3>
      <p className="text-xs text-muted mt-1.5 leading-relaxed">{insight.detail}</p>
      {insight.evidence?.length > 0 && (
        <dl className="mt-3 pt-3 border-t border-line/60 flex flex-wrap gap-x-5 gap-y-1.5">
          {insight.evidence.map((item) => (
            <div key={item.label} className="min-w-0">
              <dt className="text-[10px] font-bold uppercase tracking-wider text-muted-soft">{item.label}</dt>
              <dd className="text-xs font-bold text-ink-900 tabular truncate">{item.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </article>
  );
}

/** "The backend ran and there is genuinely nothing here." */
export function EmptyPanel({ title, message, icon: Icon = Inbox, action }) {
  return (
    <div className="text-center py-10 px-4">
      <span className="icon-tile-primary mx-auto mb-3">
        <Icon size={18} />
      </span>
      <h3 className="text-sm font-bold text-ink-900">{title}</h3>
      <p className="text-xs text-muted mt-1.5 max-w-sm mx-auto leading-relaxed">{message}</p>
      {action}
    </div>
  );
}

/** Skeleton grid, sized like the real thing so the page does not jump. */
export function LoadingGrid({ rows = 4, height = "h-56" }) {
  return (
    <div className="space-y-5" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading intelligence</span>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array(rows).fill(0).map((_, i) => (
          <div key={i} className={`skeleton-block ${height}`} />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {Array(3).fill(0).map((_, i) => (
          <div key={i} className="skeleton-block h-72" />
        ))}
      </div>
    </div>
  );
}

export function Spinner({ label = "Loading" }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs text-muted font-semibold">
      <Loader2 size={13} className="animate-spin" />
      {label}
    </span>
  );
}

/**
 * "Your search matched nothing".
 *
 * `noun` and `hint` exist because this is shared: the default wording is about
 * listings, and reusing it on a seller page would tell the reader that the
 * search had run against listing titles when it had not.
 */
export function NoSearchResults({ query, onClear, noun = "listing", hint = "Search runs against listing titles." }) {
  return (
    <div className="text-center py-8 px-4">
      <SearchX size={20} className="mx-auto text-muted-soft mb-2" />
      <p className="text-sm font-semibold text-ink-900">
        No {noun} matches &ldquo;{query}&rdquo;
      </p>
      <p className="text-xs text-muted mt-1">{hint}</p>
      {onClear && (
        <button type="button" onClick={onClear} className="btn btn-secondary btn-sm mt-3">
          Clear search
        </button>
      )}
    </div>
  );
}

/** Small key/value line used in the seller and negotiation detail panels. */
export function DetailRow({ label, value, tone }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-xs text-muted">{label}</span>
      <span className={`text-xs font-bold tabular ${tone || "text-ink-900"}`}>{value}</span>
    </div>
  );
}
