import { useCallback, useEffect, useMemo, useState } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { AlertCircle, MousePointerClick, PieChart as PieIcon, Package, RefreshCw } from "lucide-react";
import api from "../../services/api.js";
import { formatNumber } from "../../utils/format.js";
import { SERIES, chartAxis, chartGrid, chartTooltip } from "../../utils/theme.js";

/**
 * Customer attraction: which categories is *this* customer drawn to?
 *
 * Deliberately its own panel rather than another row in "Feature values". Those
 * are the model's own inputs; this is a readable answer to "what does this person
 * actually like", built from the same event log.
 *
 * Two views, because a customer's activity is not one shape:
 *  - Categories: a donut, and the only place a whole-to-whole share belongs. A
 *    customer with six interests is a composition, and a ring shows the
 *    composition directly.
 *  - Products: a ranked bar list. Across the seeded data a busy customer touches
 *    40+ distinct listings, which is unreadable as a ring and meaningless as an
 *    "Other" slice that swallows 70% of the chart. Naming the strongest few is
 *    the honest version of the same information.
 */

/** Below this share, an in-slice label collides with its neighbours. */
const MIN_LABELLED_SHARE = 7;

const humanise = (eventType) =>
  eventType.toLowerCase().replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

/**
 * Signal names do not all pluralise by appending an "s" - "4 searchs" in a
 * tooltip reads as a bug and undercuts the numbers printed beside it. Explicit
 * for the irregular ones, defaulting to +s for the rest.
 */
const SIGNAL_PLURALS = {
  SEARCH: "searches",
  PRICE_WATCH: "price watches",
  OFFER_SENT: "offers sent",
  OFFER_ACCEPTED: "offers accepted",
  COMPARE_SELECTED: "compares selected",
  CHAT_STARTED: "chats started",
};

const signalLabel = (eventType, n) => {
  if (n === 1) return humanise(eventType).toLowerCase();
  return SIGNAL_PLURALS[eventType] || `${humanise(eventType).toLowerCase()}s`;
};

/** The signals behind a slice, largest first, e.g. "48 views · 7 wishlists". */
const describeBreakdown = (breakdown = {}, limit = 4) =>
  Object.entries(breakdown)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([type, n]) => `${n} ${signalLabel(type, n)}`)
    .join(" · ");

function AttractionTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const slice = payload[0].payload;
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 shadow-lg" style={{ minWidth: 190 }}>
      <p className="text-xs font-extrabold text-ink-900">{slice.name}</p>
      {slice.category && <p className="text-2xs text-muted mt-0.5">{slice.category}</p>}
      <dl className="mt-2 space-y-1">
        <div className="flex items-center justify-between gap-4 text-2xs">
          <dt className="text-muted">Share of this customer</dt>
          <dd className="font-bold text-ink-900 tabular">{slice.percentage}%</dd>
        </div>
        <div className="flex items-center justify-between gap-4 text-2xs">
          <dt className="text-muted">Attraction score</dt>
          <dd className="font-bold text-ink-900 tabular">{slice.score}</dd>
        </div>
        <div className="flex items-center justify-between gap-4 text-2xs">
          <dt className="text-muted">Interactions</dt>
          <dd className="font-bold text-ink-900 tabular">{slice.interactions}</dd>
        </div>
      </dl>
      {!!Object.keys(slice.breakdown || {}).length && (
        <p className="mt-2 border-t border-line pt-1.5 text-2xs text-muted">
          {describeBreakdown(slice.breakdown)}
        </p>
      )}
    </div>
  );
}

/**
 * Renders the category name and share inside the ring, but only where the slice
 * is wide enough to hold it. A percentage crammed into a 2% wedge is worse than
 * no label at all: it overlaps the ring, it overlaps its neighbour, and it is
 * the kind of thing that makes an admin stop trusting the rest of the chart.
 */
function SliceLabel({ x, y, cx, cy, midAngle, innerRadius, outerRadius, percent, name }) {
  const share = percent * 100;
  if (share < MIN_LABELLED_SHARE) return null;

  // Midpoint of the slice's band, so the text sits in the middle of the ring
  // rather than on its edge.
  const rad = -midAngle * (Math.PI / 180);
  const r = (innerRadius + outerRadius) / 2;
  return (
    <text
      x={cx + r * Math.cos(rad)}
      y={cy + r * Math.sin(rad)}
      fill="#fff"
      textAnchor="middle"
      dominantBaseline="central"
      pointerEvents="none"
    >
      <tspan x={cx + r * Math.cos(rad)} dy="-0.35em" fontSize="11" fontWeight="800">
        {name}
      </tspan>
      <tspan x={cx + r * Math.cos(rad)} dy="1.15em" fontSize="10.5" fontWeight="700" opacity="0.92">
        {share.toFixed(0)}%
      </tspan>
    </text>
  );
}

function ProductBars({ products, totalProducts }) {
  const max = Math.max(...products.map((p) => p.score), 1);
  const truncated = totalProducts > products.length;
  return (
    <div className="space-y-2.5">
      {products.map((p, i) => (
        <div key={p.key}>
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="truncate font-semibold text-ink-900">{p.name}</span>
            <span className="flex-none tabular text-muted">
              {p.percentage}% · {p.interactions} interactions
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-sunken">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.max((p.score / max) * 100, 3)}%`, background: SERIES[i % SERIES.length] }}
            />
          </div>
        </div>
      ))}

      {/* Stated explicitly because it is the one place the two views disagree, and
          the server deliberately treats them differently. The donut partitions
          this customer and must total 100%; the product list is ranked against
          the customer's entire product history, so when it is truncated the shares
          are slices of a larger whole and will not add up. Without this line a
          reader assumes both percentages are the same kind of number. */}
      <p className="pt-1 text-2xs text-muted">
        {truncated ? (
          <>
            Showing the {products.length} strongest of {formatNumber(totalProducts)} listings. Each percentage is that
            listing&rsquo;s share of the whole {formatNumber(totalProducts)}-listing history, so this list does not
            total 100%.
          </>
        ) : (
          <>
            All {formatNumber(totalProducts)} listings this customer engaged with. Percentages are each
            listing&rsquo;s share of their combined score and total 100%.
          </>
        )}
      </p>
    </div>
  );
}

export default function CustomerAttractionChart({ customerId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [view, setView] = useState("category");

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    api
      .get(`/admin/customers/${customerId}/attraction`)
      .then(({ data: payload }) => {
        setData(payload);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, [customerId]);

  useEffect(() => {
    load();
  }, [load]);

  // Colour is assigned by rank, not by category name, so the biggest slice is
  // always the same colour and the palette never repeats mid-ring for a small
  // number of slices.
  const chartData = useMemo(
    () =>
      (data?.attraction || []).map((slice, i) => ({
        ...slice,
        fill: SERIES[i % SERIES.length],
      })),
    [data]
  );

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading customer attraction">
        <div className="mx-auto h-40 w-40 rounded-full border-4 border-line animate-pulse" />
        <div className="h-3 w-2/3 mx-auto rounded bg-sunken animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8 text-center">
        <span className="icon-tile-primary mx-auto mb-3">
          <AlertCircle size={18} />
        </span>
        <p className="text-sm font-bold text-ink-900">Could not load attraction</p>
        <p className="mt-1 text-xs text-muted">The customer's behaviour could not be read.</p>
        <button type="button" onClick={load} className="btn-secondary mt-4">
          <RefreshCw size={13} /> Try again
        </button>
      </div>
    );
  }

  if (!data?.hasData) {
    return (
      <p className="py-8 text-center text-sm text-muted">
        No customer attraction data available yet.
      </p>
    );
  }

  const { totals, insights, products, basis } = data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-2xs text-muted">
          <MousePointerClick size={12} className="text-primary" />
          <span className="tabular">
            {totals.interactions} interactions · attraction score {totals.score}
          </span>
        </div>
        <div className="flex gap-1 rounded-lg border border-line bg-sunken p-0.5">
          {[
            { key: "category", label: "Categories", icon: PieIcon },
            { key: "product", label: "Products", icon: Package },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              aria-pressed={view === key}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-2xs font-bold transition-colors ${
                view === key ? "bg-surface text-primary shadow-sm" : "text-muted hover:text-ink-900"
              }`}
            >
              <Icon size={12} /> {label}
            </button>
          ))}
        </div>
      </div>

      {view === "category" ? (
        <div className="grid items-center gap-4 sm:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="score"
                  nameKey="name"
                  innerRadius="58%"
                  outerRadius="92%"
                  paddingAngle={2}
                  stroke="#fff"
                  strokeWidth={2}
                  isAnimationActive={false}
                  label={<SliceLabel />}
                >
                  {chartData.map((slice) => (
                    <Cell key={slice.key} fill={slice.fill} />
                  ))}
                </Pie>
                <Tooltip content={<AttractionTooltip />} cursor={false} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Compact key: colour, name, share. Doubles as the legend without
              pushing a separate legend block below the fold. The header states
              the denominator, because a bare "%" next to a category name reads
              as a share of the marketplace rather than of this one customer. */}
          <ul className="space-y-1.5">
            <li className="text-2xs font-bold uppercase tracking-wider text-muted">
              Share of this customer&rsquo;s {formatNumber(totals.score)}-point score
            </li>
            {chartData.map((slice) => (
              <li key={slice.key} className="flex items-center gap-2 text-xs">
                <span className="h-2.5 w-2.5 flex-none rounded-sm" style={{ background: slice.fill }} />
                <span className="min-w-0 flex-1 truncate font-semibold text-ink-900">{slice.name}</span>
                <span className="flex-none tabular text-muted">{slice.percentage}%</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <ProductBars products={products} totalProducts={totals.products} />
      )}

      {!!insights?.length && (
        <ul className="space-y-1 border-t border-line pt-3">
          {insights.map((line) => (
            <li key={line} className="text-2xs text-muted">
              {line}
            </li>
          ))}
        </ul>
      )}

      <details className="group border-t border-line pt-2">
        <summary className="cursor-pointer list-none text-2xs font-semibold text-muted hover:text-primary">
          How this is calculated
        </summary>
        <p className="mt-1.5 text-2xs leading-relaxed text-muted">{basis}</p>
        {/* Event types are internal names, so they are humanised for display. */}
        <p className="mt-1.5 text-2xs leading-relaxed text-muted">
          {Object.entries(data.weights)
            .map(([type, weight]) => `${humanise(type).toLowerCase()} ${weight}x`)
            .join(" · ")}
        </p>
      </details>
    </div>
  );
}
