/**
 * The chart panels of the product-intelligence workspace.
 *
 * Two rules are enforced here rather than left to the caller.
 *
 * **Every chart is allowed to be empty.** Recharts renders an empty plot with no
 * explanation when the data array is empty, which looks like a broken page. Each
 * panel checks its own data first and renders a stated reason instead.
 *
 * **The funnel is not drawn as a funnel.** Customer counts through a
 * marketplace funnel are routinely non-monotonic - people offer without carting,
 * they buy from a wishlist they never carted - so a classic tapering funnel
 * would have to lie about the shape. It is drawn as a labelled stage chart with
 * the real value printed on every bar, and the payload's own `monotonic` flag
 * decides whether to warn that the stages are not nested.
 */
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Handshake, Info, Layers, MapPin, PieChart as PieIcon, Users } from "lucide-react";
import { formatINR, formatNumber } from "../../../utils/format.js";
import { C, chartAxis, chartGrid, chartLegend, chartTooltip, seriesColor } from "../../../utils/theme.js";
import { BarRow, ConversionRow, EmptyPanel, Panel } from "./ui.jsx";

const modeLabel = (mode) => (mode === "customers" ? "Unique customers" : "Event volume");

/* ------------------------------------------------------------------ mix ---- */

export function InteractionMix({ mix, mode, onModeChange, totalEvents, otherEvents }) {
  const signals = (mix?.signals || []).filter((s) => (mode === "customers" ? s.customers : s.events) > 0);
  const chartData = signals.map((s) => ({
    name: s.label,
    key: s.key,
    value: mode === "customers" ? s.customers : s.events,
    color: s.color,
  }));
  const total = chartData.reduce((sum, row) => sum + row.value, 0);
  const hasData = chartData.length > 0;

  return (
    <Panel
      title="Product interaction mix"
      sub="Views, research and intent for this listing"
      action={
        <div className="tab-list flex-none">
          {[
            { key: "events", label: "Events" },
            { key: "customers", label: "Customers" },
          ].map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => onModeChange(option.key)}
              className={`tab ${mode === option.key ? "tab-active" : ""}`}
              aria-pressed={mode === option.key}
            >
              {option.label}
            </button>
          ))}
        </div>
      }
    >
      {!hasData ? (
        <EmptyPanel
          icon={PieIcon}
          title="No interactions recorded"
          message="Nothing has been tracked against this listing yet, so there is no mix to chart. Its listing counters are shown separately on the overview."
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-center">
          <div className="lg:col-span-2 h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="58%"
                  outerRadius="92%"
                  paddingAngle={2}
                  stroke="none"
                >
                  {chartData.map((row) => (
                    <Cell key={row.key} fill={row.color} />
                  ))}
                </Pie>
                <Tooltip
                  {...chartTooltip}
                  formatter={(value, name) => [`${formatNumber(value)} ${modeLabel(mode).toLowerCase()}`, name]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="lg:col-span-3 space-y-2.5">
            {chartData.map((row) => {
              const share = total > 0 ? (row.value / total) * 100 : 0;
              return (
                <li key={row.key}>
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="flex items-center gap-2 font-semibold text-ink-900 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full flex-none" style={{ background: row.color }} />
                      <span className="truncate">{row.name}</span>
                    </span>
                    <span className="tabular text-muted flex-none">
                      <b className="text-ink-900">{formatNumber(row.value)}</b> · {share.toFixed(1)}%
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {hasData && otherEvents > 0 && (
        <p className="text-xs text-muted mt-4 pt-3 border-t border-line leading-relaxed">
          {formatNumber(otherEvents)} further tracked interactions on this listing are not in the chart
          {totalEvents ? ` (${formatNumber(totalEvents)} in total, of which ${formatNumber(total)} are the six signals above)` : ""}.
          Price watches, review reads and checkout starts are shown in the signals strip below.
        </p>
      )}
    </Panel>
  );
}

export function SignalStrip({ support }) {
  const rows = (support || []).filter((s) => s.events > 0);
  if (!rows.length) {
    return (
      <Panel title="Additional signals" sub="Secondary intent that is not a step toward a purchase">
        <p className="text-xs text-muted py-3 text-center">
          No secondary signals have been recorded for this listing.
        </p>
      </Panel>
    );
  }
  return (
    <Panel title="Additional signals" sub="Secondary intent that is not a step toward a purchase">
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
        {rows.map((s) => (
          <div key={s.event || s.label} className="rounded-xl border border-line px-3 py-2.5">
            <p className="text-2xs font-bold uppercase tracking-wider text-muted truncate">{s.label}</p>
            <p className="text-base font-extrabold tabular text-ink-900 mt-1">{formatNumber(s.events)}</p>
            <p className="text-2xs text-muted tabular">{formatNumber(s.customers)} customers</p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/* ---------------------------------------------------------------- funnel ---- */

export function FunnelPanel({ funnel }) {
  const stages = funnel?.stages || [];
  const rows = stages.map((s) => ({
    label: s.label,
    Customers: s.customers,
    Events: s.events,
    "In order": s.orderedCustomers,
    color: s.customers > 0 ? C.primary : C.grid,
  }));
  const max = Math.max(1, ...stages.map((s) => Math.max(s.customers, s.events)));
  const hasData = stages.some((s) => s.events > 0);

  return (
    <Panel
      title="Consideration funnel"
      sub="Distinct customers reaching each stage"
    >
      {!hasData ? (
        <EmptyPanel
          title="No funnel to draw"
          message="No interaction events reference this listing, so no customer can be placed at any stage."
        />
      ) : (
        <>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} barGap={2}>
                <CartesianGrid {...chartGrid} />
                <XAxis dataKey="label" {...chartAxis} interval={0} angle={-12} textAnchor="end" height={52} />
                <YAxis {...chartAxis} allowDecimals={false} />
                <Tooltip {...chartTooltip} />
                <Legend {...chartLegend} />
                <Bar dataKey="Customers" fill={C.primary} radius={[5, 5, 0, 0]} maxBarSize={34} />
                <Bar dataKey="Events" fill={C.accent} radius={[5, 5, 0, 0]} maxBarSize={34} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Stage</th>
                  <th className="th-num">Customers</th>
                  <th className="th-num">Events</th>
                  <th className="th-num">In order</th>
                  <th className="th-num">From previous</th>
                </tr>
              </thead>
              <tbody>
                {stages.map((stage, index) => {
                  const previous = index > 0 ? stages[index - 1] : null;
                  return (
                    <tr key={stage.key}>
                      <td className="font-semibold text-ink-900">{stage.label}</td>
                      <td className="num">{formatNumber(stage.customers)}</td>
                      <td className="num text-muted">{formatNumber(stage.events)}</td>
                      <td className="num text-muted">
                        {stage.orderedCustomers === null ? "—" : formatNumber(stage.orderedCustomers)}
                      </td>
                      <td className="num text-muted">
                        {stage.customerStepRate === null ? "—" : `${stage.customerStepRate}%`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-muted mt-3 leading-relaxed flex items-start gap-2">
            <Info size={13} className="flex-none mt-0.5 text-muted-soft" />
            <span>
              {funnel.monotonic
                ? "Stage customer counts decrease monotonically, so this listing behaves like a conventional funnel. "
                : "Stage customer counts are not strictly decreasing, which is expected in a marketplace: an offer can be made without a cart, and a wishlist can be saved without a cart. The counts are not adjusted to force a funnel shape. "}
              “In order” counts only customers whose first action at a stage came after their first action at the
              previous stage.
            </span>
          </p>
        </>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------ conversion ---- */

export function ConversionPanel({ conversion, abandonment }) {
  const metrics = conversion?.metrics || [];
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <Panel title="Stage-to-stage conversion" sub="Customer-level, numerator and denominator shown">
        {metrics.length === 0 ? (
          <EmptyPanel title="No conversion data" message="No tracked interactions exist for this listing." />
        ) : (
          <div>
            {metrics.map((metric) => (
              <ConversionRow key={metric.key} metric={metric} />
            ))}
          </div>
        )}
      </Panel>

      <Panel
        title="Cart abandonment"
        sub="Customers who carted this listing and never bought it"
        action={
          abandonment?.available ? (
            <span className={`badge ${abandonment.rate >= 75 ? "badge-danger" : abandonment.rate >= 50 ? "badge-warning" : "badge-success"}`}>
              {abandonment.rate}%
            </span>
          ) : (
            <span className="badge-neutral">No data</span>
          )
        }
      >
        {!abandonment?.available ? (
          <EmptyPanel
            title="No carts to evaluate"
            message="No customer has added this listing to a cart, so there is no abandonment to measure."
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="rounded-xl border border-line px-3 py-2.5">
                <p className="text-2xs font-bold uppercase tracking-wider text-muted">Added to cart</p>
                <p className="text-lg font-extrabold tabular text-ink-900 mt-1">{formatNumber(abandonment.cartCustomers)}</p>
                <p className="text-2xs text-muted">{formatNumber(abandonment.cartAdds)} cart events</p>
              </div>
              <div className="rounded-xl border border-line px-3 py-2.5">
                <p className="text-2xs font-bold uppercase tracking-wider text-muted">Went on to buy</p>
                <p className="text-lg font-extrabold tabular text-ink-900 mt-1">{formatNumber(abandonment.convertedCustomers)}</p>
                <p className="text-2xs text-muted">of {formatNumber(abandonment.cartCustomers)} who carted</p>
              </div>
            </div>
            <div className="h-2.5 rounded-full bg-sunken overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${abandonment.rate}%`,
                  background: abandonment.rate >= 75 ? C.danger : abandonment.rate >= 50 ? C.warning : C.success,
                }}
              />
            </div>
            <p className="text-xs text-muted mt-2.5 leading-relaxed">{abandonment.basis}</p>
          </>
        )}
      </Panel>
    </div>
  );
}

/** Marketplace-wide worst offenders, so a single listing is judged in context. */
export function AbandonmentLeaders({ rows }) {
  const max = Math.max(1, ...(rows || []).map((r) => r.abandonedCustomers));
  return (
    <Panel
      title="Worst cart abandonment marketplace-wide"
      sub="Ranked by customers who carted a listing and never bought it"
    >
      {!rows?.length ? (
        <EmptyPanel title="Nothing to rank" message="No listing has a large enough cart sample to rank yet." />
      ) : (
        <div className="space-y-1.5">
          {rows.map((row) => (
            <BarRow
              key={row.productId}
              label={row.title}
              value={row.abandonedCustomers}
              max={max}
              color={C.danger}
              badge={<span className="badge-neutral">{row.categoryName}</span>}
              sub={`${formatNumber(row.cartCustomers)} carted · ${formatNumber(row.convertedCustomers)} converted · ${row.abandonmentRate}% abandoned · ${formatINR(row.price)}`}
            />
          ))}
        </div>
      )}
    </Panel>
  );
}

/* --------------------------------------------------------------- personas ---- */

export function PersonaPanel({ personas }) {
  if (!personas?.available) {
    return (
      <Panel
        title="Customer personas"
        sub="From the newest completed segmentation run"
        action={<span className="badge-neutral">Unavailable</span>}
      >
        <EmptyPanel
          icon={Users}
          title="No completed segmentation run"
          message={personas?.note || "Run the Cluster Lab to produce personas before this panel can be filled."}
        />
      </Panel>
    );
  }

  const segments = personas.segments || [];
  const max = Math.max(1, ...segments.map((s) => s.customers));

  return (
    <Panel
      title="Customer personas"
      sub={`Who engaged with this listing, mapped to run ${personas.runId}`}
      action={
        <span className="badge-primary">
          {formatNumber(personas.mappedCustomers)}/{formatNumber(personas.totalCustomers)} mapped
        </span>
      }
    >
      {segments.length === 0 ? (
        <EmptyPanel
          icon={Users}
          title="No interacting customer could be assigned"
          message={`All ${personas.totalCustomers} customers who engaged with this listing were labelled as outliers in the latest run, so no persona composition can be shown. This is a statement about the sample, not about the customers.`}
        />
      ) : (
        <div className="space-y-2.5">
          {segments.map((segment, index) => (
            <div key={segment.label} className="rounded-xl border border-line p-3.5">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-ink-900 flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-none"
                      style={{ background: seriesColor(index, index) }}
                    />
                    {segment.name}
                  </p>
                  {segment.signature && (
                    <p className="text-2xs text-muted mt-0.5 font-mono">{segment.signature}</p>
                  )}
                </div>
                <div className="text-right flex-none">
                  <p className="text-base font-extrabold tabular text-ink-900">{formatNumber(segment.customers)}</p>
                  <p className="text-2xs text-muted tabular">{segment.share}% of mapped</p>
                </div>
              </div>
              <BarRow label="" value={segment.customers} max={max} color={seriesColor(index, index)} />
              {segment.description && (
                <p className="text-xs text-muted mt-2 leading-relaxed">{segment.description}</p>
              )}
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5 pt-2.5 border-t border-line/60">
                <span className="text-2xs text-muted tabular">
                  Engagement <b className="text-ink-900">{segment.engagementIndex ?? "—"}</b>
                </span>
                <span className="text-2xs text-muted tabular">
                  Purchase tendency <b className="text-ink-900">{segment.purchaseTendency ?? "—"}</b>
                </span>
                <span className="text-2xs text-muted tabular">
                  Avg spend <b className="text-ink-900">{formatINR(segment.avgSpending)}</b>
                </span>
                <span className="text-2xs text-muted tabular">
                  Match <b className="text-ink-900">{segment.matchScore ?? "—"}</b>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {personas.unassignedCustomers > 0 && (
        <p className="text-xs text-warning mt-3 leading-relaxed">
          {formatNumber(personas.unassignedCustomers)} of {formatNumber(personas.totalCustomers)} interacting
          customers were labelled outliers by the clustering run and are not assigned to a persona. They are
          excluded from the percentages above rather than being spread across the nearest segment.
        </p>
      )}
    </Panel>
  );
}

/* --------------------------------------------------------------- category ---- */

export function CategoryPanel({ categoryInterest, product }) {
  const rows = categoryInterest?.rows || [];
  const max = Math.max(1, ...rows.map((r) => r.attractionScore || 0));
  const own = categoryInterest;

  return (
    <Panel
      title="Category interest"
      sub="Weighted demand from recorded behaviour, with listing supply beside it"
    >
      {rows.length === 0 ? (
        <EmptyPanel
          icon={Layers}
          title="No category interest recorded"
          message="Category demand is built from behaviour events. None have been recorded yet."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="rounded-xl border border-line px-3 py-2.5">
              <p className="text-2xs font-bold uppercase tracking-wider text-muted">This category</p>
              <p className="text-sm font-extrabold text-ink-900 mt-1 truncate">{own.category}</p>
            </div>
            <div className="rounded-xl border border-line px-3 py-2.5">
              <p className="text-2xs font-bold uppercase tracking-wider text-muted">Demand rank</p>
              <p className="text-lg font-extrabold tabular text-ink-900 mt-1">
                {own.rank ? `${own.rank}/${own.totalCategories}` : "—"}
              </p>
            </div>
            <div className="rounded-xl border border-line px-3 py-2.5">
              <p className="text-2xs font-bold uppercase tracking-wider text-muted">Attraction</p>
              <p className="text-lg font-extrabold tabular text-ink-900 mt-1">{formatNumber(own.attractionScore)}</p>
              <p className="text-2xs text-muted">{formatNumber(own.listings)} listings</p>
            </div>
            <div className="rounded-xl border border-line px-3 py-2.5">
              <p className="text-2xs font-bold uppercase tracking-wider text-muted">This listing's share</p>
              <p className="text-lg font-extrabold tabular text-ink-900 mt-1">
                {own.thisListingViewShare === null ? "—" : `${own.thisListingViewShare}%`}
              </p>
              <p className="text-2xs text-muted">of category views</p>
            </div>
          </div>

          <div className="space-y-1.5">
            {rows.map((row) => (
              <BarRow
                key={row.category}
                label={row.category}
                value={row.attractionScore}
                max={max}
                highlight={row.isThisListing}
                badge={row.isThisListing ? <span className="badge-primary">This listing</span> : null}
                color={row.isThisListing ? C.primary : C.accent}
                sub={`${formatNumber(row.listings)} listings · ${formatNumber(row.customers)} customers · demand per listing ${
                  row.demandPerListing ?? "—"
                } · conversion ${row.conversionRate === null ? "not computable" : `${row.conversionRate}%`}`}
              />
            ))}
          </div>

          <p className="text-xs text-muted mt-3 leading-relaxed">{own.basis}</p>
          {product && (
            <p className="text-xs text-muted-soft mt-1.5 leading-relaxed">
              Supply in this category is {formatNumber(own.listings)} listings against an attraction score of{" "}
              {formatNumber(own.attractionScore)}
              {own.demandPerListing
                ? `, or ${own.demandPerListing} weighted interest per listing — ${
                    own.demandPerListing >= 300 ? "demand is high relative to the number of listings" : "supply is comparatively deep"
                  }.`
                : "."}
            </p>
          )}
        </>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------ negotiation ---- */

export function NegotiationPanel({ negotiation, product }) {
  const offers = negotiation?.offers || { total: 0 };
  const byStatus = negotiation?.byStatus || {};
  const rows = Object.entries(byStatus);
  const max = Math.max(1, ...rows.map(([, v]) => v.count));
  const accepted = byStatus.accepted?.count || 0;
  const resolved = accepted + (byStatus.rejected?.count || 0) + (byStatus.expired?.count || 0);
  const acceptance = resolved > 0 ? (accepted / resolved) * 100 : null;

  return (
    <Panel
      title="Negotiation"
      sub="Offers made on this listing and how they resolved"
      action={
        offers.total > 0 ? (
          <span className="badge-primary">{formatNumber(offers.total)} offers</span>
        ) : (
          <span className="badge-neutral">None</span>
        )
      }
    >
      {offers.total === 0 ? (
        <EmptyPanel
          icon={Handshake}
          title={product?.negotiable ? "No offers on a negotiable listing" : "Offers are not accepted"}
          message={
            product?.negotiable
              ? "This listing is marked negotiable but no offer has been recorded against it. Either the listed price already matches what customers will pay, or the negotiation option is not being noticed."
              : "This listing is not negotiable, so offers are not accepted on it."
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="rounded-xl border border-line px-3 py-2.5">
              <p className="text-2xs font-bold uppercase tracking-wider text-muted">Offers</p>
              <p className="text-lg font-extrabold tabular text-ink-900 mt-1">{formatNumber(offers.total)}</p>
              <p className="text-2xs text-muted">{formatNumber(offers.uniqueBuyers)} buyers</p>
            </div>
            <div className="rounded-xl border border-line px-3 py-2.5">
              <p className="text-2xs font-bold uppercase tracking-wider text-muted">Avg first offer</p>
              <p className="text-lg font-extrabold tabular text-ink-900 mt-1">{formatINR(offers.avgFirstOffer)}</p>
              <p className="text-2xs text-muted tabular">
                {formatINR(offers.lowestOffer)} – {formatINR(offers.highestOffer)}
              </p>
            </div>
            <div className="rounded-xl border border-line px-3 py-2.5">
              <p className="text-2xs font-bold uppercase tracking-wider text-muted">Acceptance</p>
              <p className="text-lg font-extrabold tabular text-ink-900 mt-1">
                {acceptance === null ? "—" : `${acceptance.toFixed(0)}%`}
              </p>
              <p className="text-2xs text-muted">
                {formatNumber(accepted)} of {formatNumber(resolved)} resolved
              </p>
            </div>
            <div className="rounded-xl border border-line px-3 py-2.5">
              <p className="text-2xs font-bold uppercase tracking-wider text-muted">Realised price</p>
              <p className="text-lg font-extrabold tabular text-ink-900 mt-1">
                {formatINR(negotiation.acceptedAvgFinalPrice)}
              </p>
              <p className="text-2xs text-muted">
                {negotiation.realisedDiscountPercent === null
                  ? "no accepted deals"
                  : `${negotiation.realisedDiscountPercent}% below the then-listed price`}
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            {rows.map(([status, value]) => (
              <BarRow
                key={status}
                label={status.charAt(0).toUpperCase() + status.slice(1)}
                value={value.count}
                max={max}
                color={status === "accepted" ? C.success : status === "pending" ? C.warning : status === "rejected" ? C.danger : C.slate}
                sub={[
                  value.avgFirstOffer ? `avg offered ${formatINR(value.avgFirstOffer)}` : null,
                  value.avgCounter ? `avg counter ${formatINR(value.avgCounter)}` : null,
                  value.avgRounds ? `${value.avgRounds} rounds avg` : null,
                  value.avgResponseMinutes ? `replied in ${value.avgResponseMinutes} min` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              />
            ))}
          </div>

          <p className="text-xs text-muted mt-3 leading-relaxed">{negotiation.note}</p>
        </>
      )}
    </Panel>
  );
}

/* --------------------------------------------------------------- location ---- */

export function LocationPanel({ location }) {
  const known = location?.knownRows || [];
  // Scaled against the rows actually shown: the "Not specified" bucket is
  // usually the largest and is not displayed, so including it would shrink every
  // real bar to a fraction of its true length.
  const max = Math.max(1, ...known.map((r) => r.customers));
  const shown = known.slice(0, 8);
  const rest = known.length - shown.length;

  return (
    <Panel
      title="Customer geography"
      sub="Where the customers engaging with this listing are based"
      action={
        location?.missingLocationCustomers > 0 ? (
          <span className="badge-warning">{formatNumber(location.missingLocationCustomers)} unlocated</span>
        ) : null
      }
    >
      {shown.length === 0 ? (
        <EmptyPanel
          icon={MapPin}
          title="No location data"
          message="None of the customers engaging with this listing have a location on their profile."
        />
      ) : (
        <>
          <div className="space-y-1.5">
            {shown.map((row) => (
              <BarRow
                key={row.location}
                label={row.location}
                value={row.customers}
                max={max}
                color={C.teal}
                sub={`${formatNumber(row.events)} tracked interactions${
                  row.share === null ? "" : ` · ${row.share}% of engaging customers`
                }`}
              />
            ))}
          </div>
          {rest > 0 && (
            <p className="text-xs text-muted mt-2.5">and {rest} more location{rest === 1 ? "" : "s"}.</p>
          )}
          <p className="text-xs text-muted-soft mt-3 leading-relaxed">{location?.basis}</p>
        </>
      )}
    </Panel>
  );
}

/* ---------------------------------------------------------------- related ---- */

export function RelatedPanel({ related, onSelect, currentId }) {
  const rows = (related || []).filter((r) => r.productId !== currentId);
  const max = Math.max(1, ...rows.map((r) => r.sharedCustomers));

  return (
    <Panel title="Related interest" sub="Other listings the same customers engaged with">
      {rows.length === 0 ? (
        <EmptyPanel
          title="No co-interest found"
          message="No other listing was engaged with by at least two of this listing's customers, so there is no related-interest graph to show."
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {rows.map((row) => (
            <button
              key={row.productId}
              type="button"
              onClick={() => onSelect?.(row.productId)}
              className="text-left rounded-xl border border-line p-3 hover:border-line-strong hover:bg-raised transition-colors"
            >
              <div className="flex items-start gap-3">
                <span className="relative w-12 h-12 rounded-lg overflow-hidden bg-sunken flex-none">
                  {row.image ? <img src={row.image} alt="" className="w-full h-full object-cover" loading="lazy" /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink-900 truncate">{row.title}</span>
                  <span className="block text-xs text-muted truncate">
                    {row.categoryName} · {formatINR(row.price)}
                  </span>
                </span>
              </div>
              <div className="mt-2.5">
                <BarRow
                  label=""
                  value={row.sharedCustomers}
                  max={max}
                  color={C.violet}
                  sub={`${formatNumber(row.sharedCustomers)} shared customers (${row.share}%) · ${formatNumber(row.coEvents)} interactions`}
                />
              </div>
            </button>
          ))}
        </div>
      )}
    </Panel>
  );
}
