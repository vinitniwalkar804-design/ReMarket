import { TrendingUp, Package, MousePointerClick, Handshake, Percent } from "lucide-react";
import { formatNumber } from "../../utils/format.js";

/**
 * Category demand vs. supply, built from recorded behaviour.
 *
 * Deliberately a table rather than another pie: the interesting comparison is
 * between two different units (weighted interest and listing count), and a pie
 * can only show one series. Ranking by attraction and showing supply next to it
 * is what makes the under-served categories visible.
 */
const CategoryAttraction = ({ rows }) => {
  if (!rows?.length) {
    return (
      <p className="text-sm text-white/40 py-6 text-center">
        No category interest recorded yet. This appears once customers start
        viewing, searching or buying.
      </p>
    );
  }

  const max = Math.max(...rows.map((r) => r.attractionScore), 1);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 px-2 text-[11px] uppercase tracking-wider text-white/35">
        <span>Category</span>
        <span className="text-right">Interest &middot; listings &middot; conv.</span>
      </div>

      <div className="space-y-1">
        {rows.map((r) => {
          // No views recorded means no conversion signal. Showing 0% would read
          // as "every visitor left without buying", which is a different claim.
          const noSignal = r.conversionRate === null;
          const underServed = !noSignal && r.conversionRate >= 3 && r.listings <= 5;

          return (
            <div
              key={r.category}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 px-2 py-2 rounded-lg hover:bg-white/[0.03] transition-colors"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm text-white/90">{r.category}</span>
                  {underServed && (
                    <span
                      title={`${r.conversionRate}% of views converted with only ${r.listings} listings`}
                      className="flex-none text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-300 border border-amber-400/25"
                    >
                      under-served
                    </span>
                  )}
                </div>
                {/* Bar is share of total interest, so relative weight is readable
                    without reading every number. */}
                <div className="mt-1.5 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-brand-500/70 to-brand-400"
                    style={{ width: `${Math.max((r.attractionScore / max) * 100, 2)}%` }}
                  />
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-white/40">
                  <span className="inline-flex items-center gap-1">
                    <MousePointerClick size={11} />
                    {formatNumber(r.counts.productViews + r.counts.categoryViews)} views
                  </span>
                  {r.counts.cartAdds > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <ShoppingCartIcon />
                      {formatNumber(r.counts.cartAdds)} carts
                    </span>
                  )}
                  {r.counts.offers > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <Handshake size={11} />
                      {formatNumber(r.counts.offers)} offers
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1">
                    <TrendingUp size={11} />
                    {formatNumber(r.customers)} customers
                  </span>
                </div>
              </div>

              <div className="text-right flex-none tabular-nums">
                <div className="text-sm text-white/90">{formatNumber(r.attractionScore)}</div>
                <div className="text-[11px] text-white/40 inline-flex items-center gap-1">
                  <Package size={11} />
                  {formatNumber(r.listings)}
                </div>
                <div
                  className={`text-[11px] inline-flex items-center gap-1 ${
                    noSignal ? "text-white/25" : r.conversionRate >= 3 ? "text-emerald-300" : "text-white/50"
                  }`}
                >
                  <Percent size={10} />
                  {noSignal ? "&ndash;" : `${r.conversionRate}%`}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Kept local so the icon set stays consistent with the row it sits in.
const ShoppingCartIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="8" cy="21" r="1" />
    <circle cx="19" cy="21" r="1" />
    <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
  </svg>
);

export default CategoryAttraction;
