/**
 * Marketplace attraction: which categories and listings reach the most real
 * people, and what those people did next.
 *
 * This is the catalogue-level answer to "where is demand going", and it is the
 * first thing an operator should see on opening Product Intelligence. The
 * per-listing workspace behind it can only describe one listing at a time, so
 * before it can say anything useful an operator has to already know which
 * listing to open. This report answers that question first.
 *
 * Every figure here counts **distinct customers**, never events. A customer who
 * browsed forty listings is one attracted customer. The server sends the
 * definition it used in `basis`, and it is rendered on the page rather than kept
 * in a comment, because a percentage labelled "attraction" is meaningless unless
 * the reader knows whether the denominator is people or clicks.
 *
 * The funnel deliberately does *not* claim to be a strict drop-off. Its steps are
 * not nested - somebody can reach a listing by deep link, from a saved item, or
 * as a repeat buyer who never viewed it again this month - so each step is shown
 * as a share of everyone attracted, and the server's caveat is printed verbatim
 * rather than quietly dropped.
 */
import { useEffect, useState } from "react";
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
  ArrowRight,
  Eye,
  GitCompareArrows,
  Heart,
  Info,
  Package,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Users,
} from "lucide-react";
import api from "../../../services/api.js";
import { formatINR, formatNumber } from "../../../utils/format.js";
import { C, SERIES, chartAxis, chartGrid, chartTooltip, listingTone } from "../../../utils/theme.js";
import { BarRow, EmptyPanel, InsightCard, LoadingGrid, MetricTile, Panel } from "./ui.jsx";

/**
 * Stage chips, in funnel order.
 *
 * Each shows the *customer* count with the raw event count beside it, because the
 * gap between the two is the whole reason this report exists: a listing with 40
 * views from 9 people is very different from one with 9 views from 9 people.
 */
const STAGE_CHIPS = [
  { key: "views", label: "Viewed", icon: Eye, color: C.info },
  { key: "comparisons", label: "Compared", icon: GitCompareArrows, color: C.violet },
  { key: "wishlist", label: "Saved", icon: Heart, color: C.magenta },
  { key: "cart", label: "Carted", icon: ShoppingCart, color: C.amber },
  { key: "offers", label: "Offered", icon: Sparkles, color: C.teal },
  { key: "purchases", label: "Bought", icon: ShoppingBag, color: C.success },
];

const StageChips = ({ stages, compact = false }) => {
  if (!stages) return null;
  return (
    <div className={`flex flex-wrap gap-1.5 ${compact ? "" : "mt-2.5"}`}>
      {STAGE_CHIPS.map(({ key, label, icon: Icon, color }) => {
        const stage = stages[key];
        const customers = stage?.customers ?? 0;
        const events = stage?.events ?? 0;
        return (
          <span
            key={key}
            title={`${formatNumber(customers)} distinct customers · ${formatNumber(events)} events`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-2 py-1 text-2xs font-bold text-ink-900"
          >
            <Icon size={11} style={{ color }} />
            {formatNumber(customers)}
            <span className="font-semibold text-muted-soft">{label.toLowerCase()}</span>
          </span>
        );
      })}
    </div>
  );
};

/** A rate, or an honest "not computable" rather than a misleading 0%. */
const Rate = ({ value, suffix = "%" }) =>
  value === null || value === undefined ? (
    <span className="badge-neutral" title="No denominator: nobody reached the first step of this comparison">
      n/a
    </span>
  ) : (
    <span className="tabular">{value}{suffix}</span>
  );

export default function CatalogueAttraction({ onOpenListing }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .get("/admin/attraction?limit=12")
      .then(({ data: payload }) => {
        if (cancelled) return;
        setData(payload);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        // The failure has to be visible. A silent empty state here would be
        // indistinguishable from "this marketplace has no interest yet", which
        // is the opposite conclusion.
        setError(err?.response?.data?.message || err.message || "Could not load the attraction report.");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <LoadingGrid rows={4} height="h-28" />;

  if (error) {
    return (
      <Panel title="Attraction report unavailable">
        <EmptyPanel
          title="The attraction report could not be loaded"
          message={error}
          icon={AlertTriangle}
        />
      </Panel>
    );
  }

  if (!data) return null;

  const { basis, totals, funnel, categories, products, dataQuality } = data;
  const hasInterest = (totals?.customers ?? 0) > 0;

  /* The funnel is drawn as distinct-customer bars against the attracted
     population, so the bar length is literally "share of people attracted" and
     cannot be misread as a step-to-step retention figure. */
  const funnelChart = funnel.steps.map((s) => ({
    name: s.label,
    customers: s.customers,
    events: s.events,
    share: s.ofInterested,
  }));

  const maxCategoryCustomers = Math.max(1, ...categories.map((c) => c.customers));

  return (
    <div className="space-y-5">
      {/* ================= HEADLINE ================= */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricTile
          label="Customers attracted"
          value={formatNumber(totals.customers)}
          sub="Distinct people who searched, viewed, compared, saved, carted or offered"
        />
        <MetricTile
          label="Categories with interest"
          value={formatNumber(totals.categories)}
          sub={`${formatNumber(totals.listingsWithInterest)} of ${formatNumber(totals.listingsTracked)} listings reached someone`}
        />
        <MetricTile
          label="Customers who bought"
          value={formatNumber(totals.buyers)}
          sub={`From ${formatNumber(totals.buyers)} buyers, ${formatNumber(funnel.steps.at(-1)?.customers)} match a completed order`}
        />
        <MetricTile
          label="Attraction to purchase"
          value={<Rate value={funnel.steps.at(-1)?.ofInterested} />}
          sub="Share of attracted customers who ended up buying something"
        />
      </div>

      {/* The definition travels with the numbers. */}
      <div className="flex items-start gap-3 rounded-xl border border-line bg-raised px-4 py-3">
        <Info size={15} className="text-primary flex-none mt-0.5" />
        <p className="text-xs text-muted leading-relaxed">
          <span className="font-bold text-ink-900">Counted in people, not clicks.</span>{" "}
          {basis.customerDefinition} {basis.attractionDefinition}
        </p>
      </div>

      {!hasInterest ? (
        <Panel title="No customer interest recorded yet">
          <EmptyPanel
            title="Nothing has been measured yet"
            message="Attraction is built from recorded browsing, comparison, saving and negotiation events. Once customers interact with listings, the categories and listings they care about appear here."
            icon={Users}
          />
        </Panel>
      ) : (
        <>
          {/* ================= FUNNEL ================= */}
          <Panel
            title="Attraction to purchase"
            sub="Distinct customers at each stage, measured against everyone attracted"
          >
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
              <div className="lg:col-span-3 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={funnelChart} margin={{ top: 8, right: 8, bottom: 4, left: -18 }}>
                    <CartesianGrid {...chartGrid} />
                    <XAxis dataKey="name" {...chartAxis} interval={0} angle={-18} textAnchor="end" height={54} />
                    <YAxis {...chartAxis} allowDecimals={false} />
                    <Tooltip
                      {...chartTooltip}
                      formatter={(value, _name, item) => [
                        `${formatNumber(value)} customers`,
                        `Share of attracted: ${item.payload.share ?? "n/a"}%`,
                      ]}
                      labelFormatter={(label) => label}
                    />
                    <Bar dataKey="customers" radius={[6, 6, 0, 0]} maxBarSize={54}>
                      {funnelChart.map((entry, i) => (
                        <Cell key={entry.name} fill={SERIES[i % SERIES.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="lg:col-span-2 space-y-1">
                {funnel.steps.map((s, i) => (
                  <div key={s.key} className="flex items-center gap-3 py-2 border-b border-line last:border-b-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-none"
                      style={{ background: SERIES[i % SERIES.length] }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-ink-900 truncate">{s.label}</div>
                      <div className="text-2xs text-muted-soft tabular">
                        {formatNumber(s.events)} events recorded
                      </div>
                    </div>
                    <div className="text-right flex-none">
                      <div className="text-sm font-extrabold text-ink-900 tabular">
                        {formatNumber(s.customers)}
                      </div>
                      <div className="text-2xs text-muted-soft tabular">
                        {s.ofInterested === null ? "n/a" : `${s.ofInterested}% of attracted`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Printed rather than hidden: the non-nesting caveat is the thing
                that stops a reader treating these as a retention funnel. */}
            <p className="text-2xs text-muted-soft mt-4 pt-3 border-t border-line leading-relaxed">
              <AlertTriangle size={11} className="inline mr-1 -mt-0.5" />
              {funnel.caveat}
            </p>
          </Panel>

          {/* ================= CATEGORIES ================= */}
          <Panel
            title="Most attractive categories"
            sub="Ranked by distinct customers reached, with what they did"
          >
            {categories.length === 0 ? (
              <EmptyPanel title="No category interest yet" message="Categories appear once customers browse or search them." />
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-1">
                {categories.map((c, i) => (
                  /* StageChips renders block-level chips, so it sits beside the
                     BarRow rather than inside its caption: BarRow wraps `sub` in a
                     <p>, and a <div> inside a <p> is invalid HTML. */
                  <div key={c.category} className="px-3 py-1.5">
                    <BarRow
                      label={c.category}
                      value={c.customers}
                      max={maxCategoryCustomers}
                      color={SERIES[i % SERIES.length]}
                      badge={
                        c.demandPerListing !== null ? (
                          <span
                            className="badge-neutral"
                            title="Distinct customers attracted per listing. High means demand is under-served by supply."
                          >
                            {c.demandPerListing}/listing
                          </span>
                        ) : null
                      }
                      sub={
                        <>
                          {formatNumber(c.buyers)} bought ·{" "}
                          {c.interestToPurchaseRate === null
                            ? "no attracted customers to compare"
                            : `${c.interestToPurchaseRate}% of attracted customers bought here`}{" "}
                          · {formatNumber(c.listings)} listings
                        </>
                      }
                    />
                    <StageChips stages={c.stages} />
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {/* ================= LISTINGS ================= */}
          <Panel
            title="Listings reaching the most customers"
            sub="Unique customers per listing, and how many of them converted"
            action={<span className="badge-neutral">{products.length} listings</span>}
          >
            {products.length === 0 ? (
              <EmptyPanel title="No listing interest yet" message="Listings appear here once customers interact with them." icon={Package} />
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Listing</th>
                      <th className="th-num">Customers</th>
                      <th className="th-num">Viewed</th>
                      <th className="th-num">Saved</th>
                      <th className="th-num">Offered</th>
                      <th className="th-num">Bought</th>
                      <th className="th-num">Attraction → sale</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-ink-900 truncate max-w-[260px]">
                              {p.title}
                            </div>
                            <div className="text-2xs text-muted">
                              {p.category} · {formatINR(p.price)}
                              {p.seller?.name ? ` · ${p.seller.name}` : ""}
                            </div>
                          </div>
                        </td>
                        <td className="num font-bold text-ink-900">{formatNumber(p.customers)}</td>
                        <td className="num text-muted">{formatNumber(p.stages.views.customers)}</td>
                        <td className="num text-muted">{formatNumber(p.stages.wishlist.customers)}</td>
                        <td className="num text-muted">{formatNumber(p.stages.offers.customers)}</td>
                        <td className="num text-muted">{formatNumber(p.buyers)}</td>
                        <td className="num">
                          <Rate value={p.interestToPurchaseRate} />
                        </td>
                        <td>
                          <span className={`badge capitalize border ${listingTone(p.status)}`}>{p.status}</span>
                        </td>
                        <td className="text-right">
                          {/* Deep-links straight into the existing per-listing
                              workspace, which reads ?product= from the URL. */}
                          <button
                            type="button"
                            onClick={() => onOpenListing?.(p.id)}
                            className="btn-icon"
                            title={`Open the full workspace for ${p.title}`}
                            aria-label={`Open workspace for ${p.title}`}
                          >
                            <ArrowRight size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          {/* ================= WHAT TO DO WITH IT ================= */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <InsightCard insight={buildCategoryInsight(categories, totals)} />
            <InsightCard insight={buildStallInsight(categories)} />
            <InsightCard insight={buildStageInsight(products)} />
          </div>

          {dataQuality?.unattributedEvents > 0 && (
            <p className="text-2xs text-muted-soft leading-relaxed">
              <AlertTriangle size={11} className="inline mr-1 -mt-0.5" />
              {dataQuality.note}
            </p>
          )}
        </>
      )}
    </div>
  );
}

/**
 * The insight cards.
 *
 * Each one is derived from the rows already on screen, and each carries the
 * evidence it was computed from, so a claim can always be traced back to the
 * numbers rather than taken on trust.
 */
const pct = (n, d) => (d > 0 ? Math.round((n / d) * 100) : null);

function buildCategoryInsight(categories, totals) {
  if (!categories?.length) {
    return {
      label: "No signal",
      tone: "neutral",
      headline: "Not enough data yet",
      detail: "No category has recorded customer interest.",
    };
  }
  const top = categories[0];
  const bestPerListing = categories
    .filter((c) => c.demandPerListing !== null)
    .sort((a, b) => b.demandPerListing - a.demandPerListing)[0];
  return {
    label: "Strongest demand",
    tone: "positive",
    headline: `${top.category} reaches ${formatNumber(top.customers)} of the ${formatNumber(totals.customers)} customers attracted to the marketplace.`,
    detail:
      bestPerListing && bestPerListing.category !== top.category
        ? `${bestPerListing.category} is the tighter supply: ${bestPerListing.demandPerListing} customers per listing across just ${bestPerListing.listings} listings, versus ${top.demandPerListing ?? "n/a"} for ${top.category}.`
        : `${top.category} is also the most efficient draw, at ${top.demandPerListing ?? "n/a"} attracted customers per listing.`,
    evidence: [
      { label: "Customers", value: formatNumber(top.customers) },
      { label: "Buyers", value: formatNumber(top.buyers) },
      { label: "Listings", value: formatNumber(top.listings) },
      { label: "Per listing", value: String(top.demandPerListing ?? "n/a") },
    ],
  };
}

function buildStallInsight(categories) {
  const withInterest = (categories || []).filter((c) => c.listings > 0 && c.customers > 0);
  if (!withInterest.length) {
    return {
      label: "No signal",
      tone: "neutral",
      headline: "No supply to compare against",
      detail: "No category currently has both customer interest and listings.",
    };
  }
  // Sorted worst-first, and categories with no buyers at all rank worst. The
  // `?? 101` keeps a zero-buyer category below one that converted a single
  // customer, instead of tying them at 0%.
  const worst = [...withInterest].sort(
    (a, b) => (pct(a.buyers, a.customers) ?? 101) - (pct(b.buyers, b.customers) ?? 101)
  )[0];
  const rate = pct(worst.buyers, worst.customers);
  return {
    label: "Weakest conversion",
    tone: "attention",
    headline: `${worst.category} attracts ${formatNumber(worst.customers)} customers but only ${formatNumber(worst.buyers)} buy.`,
    detail: rate === null
      ? `Not one of the customers it reached converted, against ${formatNumber(worst.units)} units sold across ${worst.listings} listings. Interest is not the constraint here.`
      : `That is ${rate}% of the people it reaches, against ${formatNumber(worst.units)} units sold across ${worst.listings} listings.`,
    evidence: [
      { label: "Customers", value: formatNumber(worst.customers) },
      { label: "Buyers", value: formatNumber(worst.buyers) },
      { label: "Units sold", value: formatNumber(worst.units) },
      { label: "Revenue", value: formatINR(worst.revenue) },
    ],
  };
}

function buildStageInsight(products) {
  const engaged = (products || []).filter((p) => p.customers > 0);
  if (!engaged.length) {
    return { label: "No signal", tone: "neutral", headline: "No listing has reached a customer yet", detail: "Listings appear here once customers interact with them." };
  }
  const deepest = [...engaged].sort((a, b) => b.stages.offers.customers - a.stages.offers.customers)[0];
  const savesNoBuy = engaged
    .filter((p) => p.stages.wishlist.customers > 0 && p.buyers === 0)
    .sort((a, b) => b.stages.wishlist.customers - a.stages.wishlist.customers)[0];
  return {
    label: "Closest to closing",
    tone: "info",
    headline: `${deepest.title} has ${deepest.stages.offers.customers} customers negotiating.`,
    detail: savesNoBuy
      ? `${savesNoBuy.title} was saved by ${savesNoBuy.stages.wishlist.customers} customers and has never sold, which usually means price or availability rather than interest.`
      : `${deepest.title} converted ${deepest.buyers} of its ${deepest.customers} attracted customers.`,
    evidence: [
      { label: "Offers", value: formatNumber(deepest.stages.offers.customers) },
      { label: "Carts", value: formatNumber(deepest.stages.cart.customers) },
      { label: "Buyers", value: formatNumber(deepest.buyers) },
      { label: "Saved, no sale", value: savesNoBuy ? formatNumber(savesNoBuy.stages.wishlist.customers) : "none" },
    ],
  };
}
