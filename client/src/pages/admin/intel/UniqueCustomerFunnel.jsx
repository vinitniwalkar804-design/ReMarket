/**
 * The unique-customer attraction funnel, shared by the Dashboard and Behavior
 * Analytics.
 *
 * It exists as its own component because the previous version of this funnel
 * lived on the Dashboard and was built from `behaviorSummary`, which is a count
 * of *events*. That produced a chart labelled "% of previous" over a
 * Searches -> Views -> Cart -> Checkout -> Purchases chain, which is wrong in two
 * separate ways: a single customer re-viewing thirty listings inflated the first
 * two stages, and the stages are not nested (a repeat buyer never searches again
 * this month, a deep link skips the search entirely) so no step-to-step retention
 * rate exists to print.
 *
 * This version counts distinct customers at each stage and measures every stage
 * against everyone attracted, which is the one comparison the data actually
 * supports. The non-nesting caveat is rendered from the server's own wording
 * rather than paraphrased, so the two can never drift apart.
 */
import { AlertTriangle, Info } from "lucide-react";
import { formatNumber } from "../../../utils/format.js";
import { C, SERIES } from "../../../utils/theme.js";
import { Panel } from "./ui.jsx";

export default function UniqueCustomerFunnel({ funnel, title = "Attraction to purchase", sub }) {
  if (!funnel?.steps?.length) return null;

  const interested = funnel.interested ?? funnel.steps[0].customers;
  const last = funnel.steps[funnel.steps.length - 1];
  const hasInterest = interested > 0;

  return (
    <Panel
      title={title}
      sub={sub || "Distinct customers at each stage, measured against everyone attracted"}
    >
      <div className="space-y-2.5">
        {funnel.steps.map((s, i) => {
          const share = hasInterest && s.ofInterested !== null ? s.ofInterested : null;
          return (
            <div key={s.key}>
              <div className="flex items-baseline justify-between gap-3 mb-1">
                <span className="text-xs font-semibold text-ink-900 flex items-center gap-2 min-w-0">
                  <span
                    className="w-2 h-2 rounded-full flex-none"
                    style={{ background: SERIES[i % SERIES.length] }}
                  />
                  <span className="truncate">{s.label}</span>
                </span>
                <span className="text-xs flex-none tabular">
                  <span className="font-extrabold text-ink-900">{formatNumber(s.customers)}</span>
                  <span className="text-muted ml-1.5">
                    {share === null ? "n/a" : `${share}% of attracted`}
                  </span>
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-sunken overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    // Bar length is share-of-attracted, so it can never be read as
                    // a step-to-step retention figure.
                    width: `${share === null ? 0 : Math.max(share, 1.5)}%`,
                    background: SERIES[i % SERIES.length],
                  }}
                />
              </div>
              <div className="text-[11px] text-muted mt-1 tabular">
                {formatNumber(s.events)} events recorded
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-start gap-2.5 mt-4 pt-3 border-t border-line">
        <AlertTriangle size={13} className="text-muted flex-none mt-0.5" />
        <p className="text-[11px] text-muted leading-relaxed">{funnel.caveat}</p>
      </div>

      {/* The one funnel number that is genuinely a rate, stated explicitly rather
          than implied by the bars. */}
      <div className="flex items-start gap-2.5 mt-3 rounded-xl bg-raised px-3 py-2.5">
        <Info size={13} className="text-primary flex-none mt-0.5" />
        <p className="text-[11px] text-muted leading-relaxed">
          <span className="font-bold text-ink-900">
            {formatNumber(interested)} customers were attracted
          </span>{" "}
          and {formatNumber(last.customers)} of them bought something, so{" "}
          <span className="font-bold text-ink-900">
            {last.ofInterested === null ? "the rate cannot be computed" : `${last.ofInterested}% converted`}
          </span>
          . Measured against everyone attracted rather than against the previous step, because the steps are not
          nested.
        </p>
      </div>
    </Panel>
  );
}

/** A rate that refuses to invent a denominator. */
export function rateOrDash(value, suffix = "%") {
  return value === null || value === undefined ? "n/a" : `${value}${suffix}`;
}

/** Colour for a stage index, kept in step with the funnel bars. */
export const stageColor = (i) => SERIES[i % SERIES.length] || C.primary;
