import { Handshake, MousePointerClick, Package, Percent, ShoppingCart, TrendingUp, Users } from "lucide-react";
import { formatNumber } from "../../utils/format.js";
import { C, SERIES } from "../../utils/theme.js";

/**
 * Category demand vs. supply.
 *
 * Two measures are shown side by side because they answer different questions and
 * neither is sufficient alone:
 *
 * - **Attraction score** is a weighted intent total. A view counts, but so does an
 *   offer, and an offer counts for more. It is good for ranking *how hard* people
 *   are pushing on a category, and it is a sum of events, so it is not a count of
 *   people and is never presented as one.
 * - **Customers, buyers and demand per listing** are counts of distinct people and
 *   of real orders. These are what make an under-served category visible: a high
 *   score with many customers and few listings is a gap in supply, whereas a high
 *   score driven by a handful of repeat customers is not.
 *
 * The columns are merged by category name, so a category that appears in one
 * source but not the other still renders, with an explicit dash rather than a zero
 * that would read as "nobody is interested".
 */
const CategoryAttraction = ({ rows, customerRows }) => {
  if (!rows?.length) {
    return (
      <p className="text-sm text-muted py-6 text-center">
        No category interest recorded yet. This appears once customers start viewing, searching or buying.
      </p>
    );
  }

  // Unique-customer figures come from the marketplace attraction service, keyed
  // by category name. Absent entries mean the two sources disagree, not zero.
  const byCategory = new Map((customerRows || []).map((c) => [c.category, c]));

  const max = Math.max(...rows.map((r) => r.attractionScore), 1);
  const maxCustomers = Math.max(1, ...rows.map((r) => byCategory.get(r.category)?.customers ?? 0));

  /* Marketplace-level customer/buyer totals, for the footer. These are sums of
     per-category *distinct* counts, which can double-count a customer who engaged
     in two categories, so the footer is labelled as a count of the rows above
     rather than as a unique marketplace population. */
  const rowCustomers = rows.reduce((sum, r) => sum + (byCategory.get(r.category)?.customers ?? 0), 0);
  const rowBuyers = rows.reduce((sum, r) => sum + (byCategory.get(r.category)?.buyers ?? 0), 0);
  const hasPeople = (customerRows || []).length > 0;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 px-1 pb-1 text-[11px] font-bold uppercase tracking-wider text-muted">
        <span>Category</span>
        <span className="text-right">Interest &middot; customers &middot; listings &middot; conv.</span>
      </div>

      <div className="space-y-1">
        {rows.map((r, i) => {
          const people = byCategory.get(r.category);
          const customers = people?.customers ?? null;
          const buyers = people?.buyers ?? null;
          const perListing = people?.demandPerListing ?? null;
          const buyRate = people?.interestToPurchaseRate ?? null;

          /* Prefer the people-based rate, and say which one is being shown.
             The two are different quantities: `buyRate` is buyers divided by
             customers who engaged here, while `r.conversionRate` is order events
             divided by view events. Printing them under one label would let a
             reader assume they are the same number. */
          const rate = buyRate ?? r.conversionRate;
          const rateIsPeople = buyRate !== null && buyRate !== undefined;
          const rateLabel = rateIsPeople ? "of customers bought" : "of views ordered";
          const noSignal = rate === null || rate === undefined;

          /* Under-served means supply is thin relative to real people asking for
             it. Keyed off distinct customers per listing rather than the event
             rate, so one heavy repeater cannot trigger the badge, and so a
             category with no interest at all cannot either. */
          const underServed =
            perListing !== null && perListing >= 3 && r.listings <= 5 && customers >= 3;

          return (
            <div
              key={r.category}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 px-1 py-2 rounded-lg hover:bg-raised transition-colors"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-ink-900">{r.category}</span>
                  {underServed && (
                    <span
                      title={`${customers} customers attracted against only ${r.listings} listings — ${perListing} people per listing`}
                      /* Amber is carried by the background and border. The text
                         uses ink rather than the amber foreground, which measures
                         3.03:1 on white and would fail AA at this size. */
                      className="flex-none text-[10px] font-bold px-1.5 py-0.5 rounded bg-warning-soft text-ink-900 border border-warning/30"
                    >
                      under-served
                    </span>
                  )}
                </div>

                {/* Two bars, deliberately: intent weight on top, real people
                    beneath, because one is a sum and the other is a headcount. */}
                <div className="mt-1.5 h-1.5 rounded-full bg-sunken overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.max((r.attractionScore / max) * 100, 2)}%`, background: SERIES[i % SERIES.length] }}
                  />
                </div>
                {customers !== null && (
                  <div className="mt-1 h-1.5 rounded-full bg-sunken overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.max((customers / maxCustomers) * 100, 2)}%`, background: C.accent }}
                    />
                  </div>
                )}

                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted">
                  <span className="inline-flex items-center gap-1" title="Weighted intent, summed across events">
                    <MousePointerClick size={11} />
                    {formatNumber(r.attractionScore)} intent
                  </span>
                  <span className="inline-flex items-center gap-1" title="Distinct customers who interacted here">
                    <Users size={11} />
                    {customers === null ? "—" : `${formatNumber(customers)} customers`}
                  </span>
                  {perListing !== null && (
                    <span
                      className="inline-flex items-center gap-1 font-bold text-ink-900"
                      title="Distinct customers attracted per listing. High with few listings means demand is under-served."
                    >
                      {perListing}/listing
                    </span>
                  )}
                  {r.counts.cartAdds > 0 && (
                    <span className="inline-flex items-center gap-1" title="Added-to-cart events">
                      <ShoppingCart size={11} />
                      {formatNumber(r.counts.cartAdds)} carts
                    </span>
                  )}
                  {r.counts.offers > 0 && (
                    <span className="inline-flex items-center gap-1" title="Offers made on listings in this category">
                      <Handshake size={11} />
                      {formatNumber(r.counts.offers)} offers
                    </span>
                  )}
                </div>
              </div>

              <div className="text-right flex-none tabular-nums">
                <div className="text-sm font-bold text-ink-900">{formatNumber(r.attractionScore)}</div>
                <div className="text-[11px] text-muted inline-flex items-center justify-end gap-1">
                  <Users size={11} />
                  {customers === null ? "—" : formatNumber(customers)}
                </div>
                <div className="text-[11px] text-muted inline-flex items-center justify-end gap-1" title="Live listings in this category">
                  <Package size={11} />
                  {formatNumber(r.listings)}
                </div>
                <div
                  className={`text-[11px] inline-flex items-center justify-end gap-1 ${
                    noSignal ? "text-muted" : rate >= 25 ? "text-success font-bold" : "text-muted"
                  }`}
                  title={
                    rateIsPeople
                      ? `Buyers divided by customers attracted to this category. ${buyers} of ${customers} bought.`
                      : "Order events divided by view events. Distinct-customer data was unavailable for this category."
                  }
                >
                  <Percent size={10} />
                  {noSignal ? "n/a" : `${rate}%`}
                </div>
                <div className="text-[10px] text-muted leading-tight text-right">{rateLabel}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Spell out that these are different units, because the two bars are
          designed to be read against each other. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-3 mt-1 border-t border-line text-[11px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-1.5 rounded-full" style={{ background: C.primary }} />
          weighted intent (sum of events)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-1.5 rounded-full" style={{ background: C.accent }} />
          distinct customers (people)
        </span>
        {hasPeople && (
          <span className="ml-auto">
            {formatNumber(rowBuyers)} buyers across {formatNumber(rowCustomers)} category-level customers
            {rowCustomers > rowBuyers ? " (a customer engaging in two categories is counted in both)" : ""}
          </span>
        )}
      </div>
    </div>
  );
};

export default CategoryAttraction;
