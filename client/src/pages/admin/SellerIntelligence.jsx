/**
 * Seller intelligence: who is actually carrying the marketplace.
 *
 * This is an analytical leaderboard, deliberately separate from the operational
 * seller directory at `/admin/sellers`. The directory exists to *act* on a seller
 * - approve, suspend, message - and it is a search-first table of every account
 * on the platform. This page exists to answer a narrower question: of the sellers
 * with stock, who converts, who negotiates well, and whose status flag is lying
 * to them.
 *
 * Two derived numbers do most of the work here.
 *
 * Sell-through counts *listings that have sold*, derived from order history, not
 * from `Product.status === "sold"`. The stored flag drifts badly on this data,
 * and a seller with a 100% sell-through shop would otherwise read as having sold
 * nothing at all.
 *
 * Acceptance rate is offers accepted over offers received. It is null rather
 * than 0% when a seller has never received an offer, because a seller nobody has
 * bid on is not a seller who refuses bids, and rendering those as 0% would put
 * them at the bottom of a quality ranking they never had the chance to earn.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  BadgeCheck,
  Building2,
  Package,
  Search,
  ShieldCheck,
  Star,
  TrendingUp,
  X,
} from "lucide-react";
import api from "../../services/api.js";
import { formatINR, formatNumber } from "../../utils/format.js";
import { SERIES, chartAxis, chartGrid, chartTooltip } from "../../utils/theme.js";
import { EmptyPanel, InsightCard, LoadingGrid, MetricTile, NoSearchResults, Panel } from "./intel/ui.jsx";

const SORTS = [
  { key: "revenue", label: "Revenue" },
  { key: "units", label: "Units" },
  { key: "sellThrough", label: "Sell-through" },
  { key: "listings", label: "Stock" },
  { key: "rating", label: "Rating" },
  { key: "buyers", label: "Buyers" },
];

/** A rate that refuses to lie: null means "not measurable", not "zero". */
const Rate = ({ value }) =>
  value === null || value === undefined ? (
    <span className="badge-neutral" title="No denominator: this seller has no stock, or no offers received">
      n/a
    </span>
  ) : (
    <span className="tabular">{value}%</span>
  );

const StarRating = ({ rating, count }) => {
  const r = Number(rating || 0);
  if (!r) return <span className="text-muted-soft text-xs">unrated</span>;
  return (
    <span className="inline-flex items-center gap-1" title={`${r} from ${formatNumber(count || 0)} ratings`}>
      <Star size={12} className="text-rating fill-rating" />
      <span className="text-xs font-bold text-ink-900 tabular">{r.toFixed(1)}</span>
    </span>
  );
};

export default function SellerIntelligence() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sort, setSort] = useState("revenue");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    // A generous limit: the leaderboard is only useful if the whole population
    // is comparable, and the server sorts and truncates so the client filters a
    // complete set rather than an arbitrary top-N that would hide a match.
    api
      .get("/admin/seller-intelligence?limit=200&sort=revenue")
      .then(({ data: payload }) => {
        if (cancelled) return;
        setData(payload);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.response?.data?.message || err.message || "Could not load seller intelligence.");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const sellers = data?.sellers ?? [];
  const totals = data?.totals;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sellers;
    return sellers.filter(
      (s) =>
        s.name?.toLowerCase().includes(q) ||
        s.email?.toLowerCase().includes(q) ||
        s.location?.toLowerCase().includes(q)
    );
  }, [sellers, query]);

  /* Re-sorted client-side. The server already returns revenue order, but changing
     the sort must not require a round trip for a purely presentational change. */
  const rows = useMemo(() => {
    const comparators = {
      revenue: (a, b) => b.revenue - a.revenue,
      units: (a, b) => b.units - a.units,
      listings: (a, b) => b.listings - a.listings,
      sellThrough: (a, b) => (b.sellThroughRate ?? -1) - (a.sellThroughRate ?? -1),
      rating: (a, b) => b.rating - a.rating || b.ratingCount - a.ratingCount,
      buyers: (a, b) => b.buyers - a.buyers,
    };
    return [...filtered].sort(comparators[sort] ?? comparators.revenue);
  }, [filtered, sort]);

  if (loading) return <LoadingGrid rows={4} height="h-28" />;

  if (error) {
    return (
      <Panel title="Seller intelligence unavailable">
        <EmptyPanel title="Seller intelligence could not be loaded" message={error} icon={AlertTriangle} />
      </Panel>
    );
  }

  if (!data) return null;

  if (sellers.length === 0) {
    return (
      <div className="space-y-5">
        <SellerHeader query={query} onQuery={setQuery} count={0} />
        <Panel title="No sellers registered">
          <EmptyPanel
            title="No seller accounts exist yet"
            message="Seller performance appears here as soon as accounts are registered, with stock, sales and reputation derived from real orders."
            icon={Building2}
          />
        </Panel>
      </div>
    );
  }

  const withSales = sellers.filter((s) => s.units > 0);
  const driftSellers = sellers.filter((s) => s.soldFlagged < s.soldListings);
  const revenueConcentration = totals.revenue > 0 && rows.length ? Math.round((rows[0].revenue / totals.revenue) * 100) : null;

  return (
    <div className="space-y-5">
      <SellerHeader
        query={query}
        onQuery={setQuery}
        sort={sort}
        onSort={setSort}
        count={rows.length}
        of={sellers.length}
      />

      {/* ================= HEADLINE ================= */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricTile
          label="Revenue from sellers"
          value={formatINR(totals.revenue)}
          sub={`${formatNumber(totals.units)} units sold by ${formatNumber(totals.sellers)} sellers`}
        />
        <MetricTile
          label="Stock listed"
          value={formatNumber(totals.listings)}
          sub={`${formatNumber(totals.activeListings)} currently available`}
        />
        <MetricTile
          label="Listings that sold"
          value={formatNumber(totals.soldListings)}
          sub="Derived from orders, not the stored status flag"
        />
        <MetricTile
          label="Buyers served"
          value={formatNumber(totals.buyers)}
          sub={`From ${formatNumber(totals.offers)} offers received by sellers`}
        />
      </div>

      {/* Status drift is a seller-facing problem too: a seller whose sold
          listings still read as available looks like they have unsold stock. */}
      {driftSellers.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-warning/25 bg-warning-soft px-4 py-3">
          <AlertTriangle size={15} className="text-warning flex-none mt-0.5" />
          <p className="text-xs text-ink-700 leading-relaxed">
            <span className="font-bold text-ink-900">
              {formatNumber(driftSellers.length)} {driftSellers.length === 1 ? "seller has" : "sellers have"} sold
              listings that are not flagged as sold.
            </span>{" "}
            {data.basis.sellThroughNote} Sell-through below is calculated from order history, so it is accurate
            regardless of the flag.
          </p>
        </div>
      )}

      <div className="flex items-start gap-3 rounded-xl border border-line bg-raised px-4 py-3">
        <ShieldCheck size={15} className="text-primary flex-none mt-0.5" />
        <p className="text-xs text-muted leading-relaxed">
          <span className="font-bold text-ink-900">Counted in sellers, not accounts.</span>{" "}
          {data.basis.saleDefinition} {data.basis.reputationNote}
        </p>
      </div>

      {/* ================= CHART ================= */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <Panel
          title="Leading sellers by revenue"
          sub="Top sellers by agreed order value"
          className="lg:col-span-3"
        >
          {withSales.length === 0 ? (
            <EmptyPanel title="No sales yet" message="Seller revenue appears once orders exist." icon={TrendingUp} />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={withSales.slice(0, 8).map((s) => ({ name: shortName(s.name), revenue: s.revenue, units: s.units }))}
                  margin={{ top: 8, right: 8, bottom: 4, left: 0 }}
                >
                  <CartesianGrid {...chartGrid} />
                  <XAxis dataKey="name" {...chartAxis} interval={0} angle={-18} textAnchor="end" height={58} />
                  <YAxis {...chartAxis} width={54} />
                  <Tooltip
                    {...chartTooltip}
                    formatter={(v, _n, item) => [formatINR(v), `${formatNumber(item.payload.units)} units`]}
                  />
                  <Bar dataKey="revenue" radius={[6, 6, 0, 0]} maxBarSize={44}>
                    {withSales.slice(0, 8).map((s, i) => (
                      <Cell key={s.id} fill={SERIES[i % SERIES.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel title="Stock and sales" sub="Active listings against units sold, top sellers" className="lg:col-span-2">
          {withSales.length === 0 ? (
            <EmptyPanel title="Nothing to compare yet" message="Once sellers sell, their stock and volume appear side by side." icon={Package} />
          ) : (
            <div className="space-y-2">
              {withSales.slice(0, 8).map((s, i) => {
                const maxUnits = Math.max(...withSales.slice(0, 8).map((x) => x.units || 0));
                return (
                  <div key={s.id} className="flex items-center gap-3">
                    <span className="text-2xs font-extrabold text-muted-soft tabular w-4 flex-none">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-xs font-semibold text-ink-900 truncate">{s.name}</span>
                        <span className="text-2xs text-muted flex-none tabular">
                          {formatNumber(s.activeListings)} live · <b className="text-ink-900">{formatNumber(s.units)}</b> sold
                        </span>
                      </div>
                      <div className="h-1.5 bg-line rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${maxUnits > 0 ? (s.units / maxUnits) * 100 : 0}%`, background: SERIES[i % SERIES.length] }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>

      {/* ================= LEADERBOARD ================= */}
      <Panel
        title="Seller leaderboard"
        sub="Ranked by the selected measure"
        action={<span className="badge-neutral">{rows.length} sellers</span>}
      >
        {rows.length === 0 ? (
          <NoSearchResults
            query={query}
            onClear={() => setQuery("")}
            noun="seller"
            hint="Search runs against seller name, email and location."
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="w-10">#</th>
                  <th>Seller</th>
                  <th className="th-num">Listings</th>
                  <th className="th-num">Sold</th>
                  <th className="th-num">Sell-through</th>
                  <th className="th-num">Units</th>
                  <th className="th-num">Revenue</th>
                  <th className="th-num">Buyers</th>
                  <th className="th-num">Offers</th>
                  <th className="th-num">Accept rate</th>
                  <th className="th-num">Rating</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s, i) => (
                  <tr key={s.id}>
                    <td>
                      <span
                        className={`w-6 h-6 rounded-lg flex items-center justify-center text-2xs font-extrabold ${
                          i < 3 ? "bg-primary text-white" : "bg-sunken text-muted"
                        }`}
                      >
                        {i + 1}
                      </span>
                    </td>
                    <td>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-ink-900 flex items-center gap-1.5">
                          <span className="truncate max-w-[200px]">{s.name}</span>
                          {s.verified && (
                            <BadgeCheck size={13} className="text-success flex-none" aria-label="Verified seller" />
                          )}
                        </div>
                        <div className="text-2xs text-muted truncate max-w-[220px]">
                          {s.location || "Location unknown"}
                          {s.email ? ` · ${s.email}` : ""}
                        </div>
                      </div>
                    </td>
                    <td className="num text-muted">
                      {formatNumber(s.listings)}
                      <span className="text-2xs text-muted-soft"> ({formatNumber(s.activeListings)} live)</span>
                    </td>
                    <td className="num text-ink-900">{formatNumber(s.soldListings)}</td>
                    <td className="num">
                      <Rate value={s.sellThroughRate} />
                    </td>
                    <td className="num text-muted">{formatNumber(s.units)}</td>
                    <td className="num font-bold text-ink-900">{formatINR(s.revenue)}</td>
                    <td className="num text-muted">{formatNumber(s.buyers)}</td>
                    <td className="num text-muted">{formatNumber(s.offers)}</td>
                    <td className="num">
                      <Rate value={s.acceptanceRate} />
                    </td>
                    <td className="num">
                      <StarRating rating={s.rating} count={s.ratingCount} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <InsightCard insight={buildLeaderInsight(rows, revenueConcentration)} />
        <InsightCard insight={buildNegotiationInsight(sellers)} />
        <InsightCard insight={buildInventoryInsight(sellers, withSales)} />
      </div>

      <p className="text-2xs text-muted-soft">
        Need to act on a seller - approve, suspend or message?{" "}
        <Link to="/admin/sellers" className="font-bold text-primary hover:underline">
          Open the seller directory
        </Link>
        .
      </p>
    </div>
  );
}

/** Chart axis labels are narrow; full names live in the table below. */
function shortName(name = "") {
  const trimmed = String(name).trim();
  if (trimmed.length <= 12) return trimmed;
  return `${trimmed.slice(0, 11)}…`;
}

function SellerHeader({ query, onQuery, sort, onSort, count, of }) {
  return (
    <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
      <div>
        <span className="page-eyebrow">
          <TrendingUp size={12} /> Marketplace Intelligence
        </span>
        <h1 className="page-title">Seller intelligence</h1>
        <p className="page-sub">
          Who is carrying the marketplace, who is stuck, and who negotiates well.
        </p>
      </div>
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-soft pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search seller, email or location"
            className="input-field pl-9 w-full sm:w-64"
            aria-label="Search sellers"
          />
          {query && (
            <button
              type="button"
              onClick={() => onQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-soft hover:text-ink-900"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>
        {onSort && (
          <div className="tab-list">
            {SORTS.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => onSort(s.key)}
                className={`tab ${sort === s.key ? "tab-active" : ""}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {of !== undefined && (
        <p className="text-2xs text-muted-soft -mt-2">
          Showing {count} of {of} sellers
        </p>
      )}
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/* Insights                                                                    */

const pctOf = (n, d) => (d > 0 ? Math.round((n / d) * 100) : null);

function buildLeaderInsight(rows, concentration) {
  const leader = rows.find((s) => s.revenue > 0);
  if (!leader) {
    return { label: "No signal", tone: "neutral", headline: "No seller revenue yet", detail: "The leaderboard fills in as orders land." };
  }
  return {
    label: "Revenue leader",
    tone: (concentration ?? 0) > 50 ? "attention" : "positive",
    headline: `${leader.name} leads with ${formatINR(leader.revenue)} from ${formatNumber(leader.units)} units.`,
    detail:
      concentration === null
        ? "Seller revenue appears once orders exist."
        : concentration > 50
          ? `That is ${concentration}% of all seller revenue, so marketplace health currently depends heavily on this one account.`
          : `That is ${concentration}% of all seller revenue, so revenue is spread across sellers rather than concentrated in one.`,
    evidence: [
      { label: "Revenue", value: formatINR(leader.revenue) },
      { label: "Units", value: formatNumber(leader.units) },
      { label: "Buyers", value: formatNumber(leader.buyers) },
      { label: "Sell-through", value: leader.sellThroughRate === null ? "n/a" : `${leader.sellThroughRate}%` },
    ],
  };
}

function buildNegotiationInsight(sellers) {
  const negotiating = sellers.filter((s) => s.offers > 0);
  if (!negotiating.length) {
    return { label: "No signal", tone: "neutral", headline: "No offers received yet", detail: "Negotiation quality appears once customers make offers." };
  }
  const totalOffers = negotiating.reduce((s, x) => s + x.offers, 0);
  const totalAccepted = negotiating.reduce((s, x) => s + x.offersAccepted, 0);
  const rate = pctOf(totalAccepted, totalOffers);
  const fastest = negotiating
    .filter((s) => s.avgResponseHours !== null)
    .sort((a, b) => a.avgResponseHours - b.avgResponseHours)[0];
  return {
    label: "Negotiation",
    tone: (rate ?? 0) < 40 ? "attention" : "positive",
    headline: `${formatNumber(totalAccepted)} of ${formatNumber(totalOffers)} offers were accepted.`,
    detail: fastest
      ? `${fastest.name} replies fastest, at ${fastest.avgResponseHours}h on average. A low acceptance rate usually means asking price is set above what the market will bear rather than a refusal to negotiate.`
      : "Acceptance rate is the clearest signal that asking prices match what buyers will pay.",
    evidence: [
      { label: "Offers", value: formatNumber(totalOffers) },
      { label: "Accepted", value: formatNumber(totalAccepted) },
      { label: "Accept rate", value: rate === null ? "n/a" : `${rate}%` },
      { label: "Fastest reply", value: fastest ? `${fastest.avgResponseHours}h` : "n/a" },
    ],
  };
}

function buildInventoryInsight(sellers, withSales) {
  const stocked = sellers.filter((s) => s.listings > 0);
  if (!stocked.length) {
    return { label: "No signal", tone: "neutral", headline: "No seller has listed stock", detail: "Listings appear once sellers publish them." };
  }
  const idle = stocked.filter((s) => s.soldListings === 0).sort((a, b) => b.listings - a.listings);
  const totalListings = stocked.reduce((s, x) => s + x.listings, 0);
  const totalSold = stocked.reduce((s, x) => s + x.soldListings, 0);
  return {
    label: "Inventory",
    tone: idle.length ? "attention" : "positive",
    headline: idle.length
      ? `${idle.length} ${idle.length === 1 ? "seller has" : "sellers have"} stock but have never sold.`
      : "Every seller with stock has sold at least one listing.",
    detail: idle.length
      ? `${idle[0].name} is the largest of them at ${formatNumber(idle[0].listings)} unsold listings. Unsold stock still shows in catalogue counts, so it dilutes every attention and sell-through ratio on the platform.`
      : `${formatNumber(totalSold)} of ${formatNumber(totalListings)} listed listings have sold at least once.`,
    evidence: [
      { label: "Sellers stocked", value: formatNumber(stocked.length) },
      { label: "Listings", value: formatNumber(totalListings) },
      { label: "Sold", value: formatNumber(totalSold) },
      { label: "No sales", value: formatNumber(idle.length) },
    ],
  };
}
