import { h } from "../../dom.js";
import { icon } from "../../icons.js";
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
 *
 * The bars were never a chart library: the React build drew them as two 6px
 * `div`s whose `width` is a percentage of the row maximum, so they port as the
 * same two elements. Each row is its own scale pair - the intent bar runs to
 * `max` of the attraction scores, the customers bar to `maxCustomers` of the
 * distinct-customer counts - and each keeps the 2% floor the React file used, so
 * a non-zero category is never drawn as an empty track.
 */
export default function CategoryAttraction({ rows, customerRows } = {}) {
  if (!rows?.length) {
    return h(
      "p",
      { className: "text-sm text-muted py-6 text-center" },
      "No category interest recorded yet. This appears once customers start viewing, searching or buying."
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

  const row = (r, i) => {
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
    const underServed = perListing !== null && perListing >= 3 && r.listings <= 5 && customers >= 3;

    return h(
      "div",
      {
        key: r.category,
        className: "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 px-1 py-2 rounded-lg hover:bg-raised transition-colors",
      },

      h(
        "div",
        { className: "min-w-0" },
        h(
          "div",
          { className: "flex items-center gap-2" },
          h("span", { className: "truncate text-sm font-semibold text-ink-900" }, r.category),
          underServed &&
            h(
              "span",
              {
                title: `${customers} customers attracted against only ${r.listings} listings — ${perListing} people per listing`,
                /* Amber is carried by the background and border. The text
                   uses ink rather than the amber foreground, which measures
                   3.03:1 on white and would fail AA at this size. */
                className:
                  "flex-none text-[10px] font-bold px-1.5 py-0.5 rounded bg-warning-soft text-ink-900 border border-warning/30",
              },
              "under-served"
            )
        ),

        /* Two bars, deliberately: intent weight on top, real people
            beneath, because one is a sum and the other is a headcount. */
        h(
          "div",
          { className: "mt-1.5 h-1.5 rounded-full bg-sunken overflow-hidden" },
          h("div", {
            className: "h-full rounded-full transition-all duration-500",
            style: {
              width: `${Math.max((r.attractionScore / max) * 100, 2)}%`,
              background: SERIES[i % SERIES.length],
            },
          })
        ),
        customers !== null &&
          h(
            "div",
            { className: "mt-1 h-1.5 rounded-full bg-sunken overflow-hidden" },
            h("div", {
              className: "h-full rounded-full transition-all duration-500",
              style: {
                width: `${Math.max((customers / maxCustomers) * 100, 2)}%`,
                background: C.accent,
              },
            })
          ),

        h(
          "div",
          { className: "mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted" },
          h(
            "span",
            { className: "inline-flex items-center gap-1", title: "Weighted intent, summed across events" },
            icon("MousePointerClick", { size: 11 }),
            `${formatNumber(r.attractionScore)} intent`
          ),
          h(
            "span",
            { className: "inline-flex items-center gap-1", title: "Distinct customers who interacted here" },
            icon("Users", { size: 11 }),
            customers === null ? "—" : `${formatNumber(customers)} customers`
          ),
          perListing !== null &&
            h(
              "span",
              {
                className: "inline-flex items-center gap-1 font-bold text-ink-900",
                title:
                  "Distinct customers attracted per listing. High with few listings means demand is under-served.",
              },
              `${perListing}/listing`
            ),
          r.counts.cartAdds > 0 &&
            h(
              "span",
              { className: "inline-flex items-center gap-1", title: "Added-to-cart events" },
              icon("ShoppingCart", { size: 11 }),
              `${formatNumber(r.counts.cartAdds)} carts`
            ),
          r.counts.offers > 0 &&
            h(
              "span",
              { className: "inline-flex items-center gap-1", title: "Offers made on listings in this category" },
              icon("Handshake", { size: 11 }),
              `${formatNumber(r.counts.offers)} offers`
            )
        )
      ),

      h(
        "div",
        { className: "text-right flex-none tabular-nums" },
        h("div", { className: "text-sm font-bold text-ink-900" }, formatNumber(r.attractionScore)),
        h(
          "div",
          { className: "text-[11px] text-muted inline-flex items-center justify-end gap-1" },
          icon("Users", { size: 11 }),
          customers === null ? "—" : formatNumber(customers)
        ),
        h(
          "div",
          {
            className: "text-[11px] text-muted inline-flex items-center justify-end gap-1",
            title: "Live listings in this category",
          },
          icon("Package", { size: 11 }),
          formatNumber(r.listings)
        ),
        h(
          "div",
          {
            className: `text-[11px] inline-flex items-center justify-end gap-1 ${
              noSignal ? "text-muted" : rate >= 25 ? "text-success font-bold" : "text-muted"
            }`,
            title: rateIsPeople
              ? `Buyers divided by customers attracted to this category. ${buyers} of ${customers} bought.`
              : "Order events divided by view events. Distinct-customer data was unavailable for this category.",
          },
          icon("Percent", { size: 10 }),
          noSignal ? "n/a" : `${rate}%`
        ),
        h("div", { className: "text-[10px] text-muted leading-tight text-right" }, rateLabel)
      )
    );
  };

  return h(
    "div",
    { className: "space-y-2" },
    h(
      "div",
      {
        className:
          "grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 px-1 pb-1 text-[11px] font-bold uppercase tracking-wider text-muted",
      },
      h("span", null, "Category"),
      h("span", { className: "text-right" }, "Interest · customers · listings · conv.")
    ),

    h("div", { className: "space-y-1" }, rows.map(row)),

    /* Spell out that these are different units, because the two bars are
        designed to be read against each other. */
    h(
      "div",
      {
        className:
          "flex flex-wrap items-center gap-x-4 gap-y-1 pt-3 mt-1 border-t border-line text-[11px] text-muted",
      },
      h(
        "span",
        { className: "inline-flex items-center gap-1.5" },
        h("span", { className: "w-3 h-1.5 rounded-full", style: { background: C.primary } }),
        "weighted intent (sum of events)"
      ),
      h(
        "span",
        { className: "inline-flex items-center gap-1.5" },
        h("span", { className: "w-3 h-1.5 rounded-full", style: { background: C.accent } }),
        "distinct customers (people)"
      ),
      hasPeople &&
        h(
          "span",
          { className: "ml-auto" },
          `${formatNumber(rowBuyers)} buyers across ${formatNumber(rowCustomers)} category-level customers`,
          rowCustomers > rowBuyers ? " (a customer engaging in two categories is counted in both)" : ""
        )
    )
  );
}
