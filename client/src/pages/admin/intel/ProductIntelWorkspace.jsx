/**
 * Product-level intelligence workspace.
 *
 * Everything on this screen comes from one request to
 * `GET /api/admin/products/:productId/intelligence`. That is a deliberate
 * constraint rather than a convenience: the panels share a denominator (unique
 * customers on this listing) and, in a few places, share a number - the funnel's
 * first stage, the mix's views slice and the overview's view count are the same
 * figure. Fetching them separately would let the same quantity appear three
 * times with three different values the moment one request lagged or one panel
 * recomputed it slightly differently.
 *
 * The overlay states are explicit: loading, error with retry, "no listing chosen",
 * and a listing with no tracked behaviour. The last one is the easy one to get
 * wrong and the most misleading - an analytics page that renders an empty chart
 * for a listing nobody has looked at reads as "this listing is performing badly",
 * when the truth is "nobody has interacted with it yet". Those are opposite
 * findings and they get different treatments.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  BarChart3,
  Handshake,
  Heart,
  Info,
  MousePointerClick,
  Package,
  RefreshCw,
  RotateCcw,
  ShoppingBag,
  Star,
  TrendingUp,
  Users,
} from "lucide-react";
import api from "../../../services/api.js";
import { formatDate, formatINR, formatNumber } from "../../../utils/format.js";
import { listingTone } from "../../../utils/theme.js";
import ProductSelector from "./ProductSelector.jsx";
import {
  AbandonmentLeaders,
  CategoryPanel,
  ConversionPanel,
  FunnelPanel,
  InteractionMix,
  LocationPanel,
  NegotiationPanel,
  PersonaPanel,
  RelatedPanel,
  SignalStrip,
} from "./panels.jsx";
import { DetailRow, EmptyPanel, InsightCard, LoadingGrid, MetricTile, Panel } from "./ui.jsx";

/**
 * The overview row.
 *
 * Every tile's caption is derived from a *different* field rather than repeated
 * text: "0 tracked views" and "0 recorded wishlists" mean completely different
 * things, and a caption that said the same thing under all five would hide which
 * of the signals is actually missing.
 */
const overviewTiles = (overview, dataQuality) => {
  const tracked = overview?.tracked || {};
  const enough = Boolean(overview?.hasEnoughData);
  const eventsEach = dataQuality?.avgEventsPerCustomer;

  const caption = (present, meaningful) => (enough ? meaningful : "no behaviour tracked");

  return [
    {
      key: "views",
      label: "Tracked views",
      icon: MousePointerClick,
      value: formatNumber(tracked.views),
      sub: caption(tracked.views, `${formatNumber(overview.uniqueCustomers)} customers · ${formatNumber(overview.sessions)} sessions`),
      muted: !tracked.views,
    },
    {
      key: "uniqueCustomers",
      label: "Interacting customers",
      icon: Users,
      value: formatNumber(overview?.uniqueCustomers),
      sub: caption(
        overview?.uniqueCustomers,
        eventsEach ? `${eventsEach} events each` : "one event each"
      ),
      muted: !overview?.uniqueCustomers,
    },
    {
      key: "wishlists",
      label: "Saved to wishlist",
      icon: Heart,
      value: formatNumber(tracked.wishlists),
      sub: caption(
        tracked.wishlists,
        tracked.wishlists ? "intent to return" : "nobody has saved this listing"
      ),
      muted: !tracked.wishlists,
    },
    {
      key: "offers",
      label: "Offers made",
      icon: Handshake,
      value: formatNumber(tracked.offers),
      sub: caption(tracked.offers, tracked.offers ? "price negotiation attempted" : "no offers recorded"),
      muted: !tracked.offers,
    },
    {
      key: "purchases",
      label: "Purchases",
      icon: ShoppingBag,
      value: formatNumber(tracked.purchases),
      sub: caption(
        tracked.purchases,
        `${formatNumber(overview.orders)} orders · ${formatINR(overview.revenue)} revenue`
      ),
      muted: !tracked.purchases,
    },
  ];
};

const listingSubtitle = (product) => {
  if (!product) return "";
  const bits = [product.categoryName, product.condition, product.location].filter(Boolean);
  return bits.join(" · ");
};

const Masthead = ({ product, data, onRefresh, refreshing }) => {
  if (!product) return null;
  return (
    <div className="card overflow-hidden">
      <div className="flex flex-col md:flex-row">
        <div className="relative md:w-56 h-44 md:h-auto bg-sunken flex-none">
          {product.image ? (
            <img src={product.image} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="w-full h-full flex items-center justify-center text-muted-soft">
              <Package size={28} />
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <span className={`badge ${listingTone(product.status)}`}>{product.status}</span>
                {product.isFeatured && <span className="badge-primary">Featured</span>}
                {product.negotiable && <span className="badge-accent">Negotiable</span>}
                {product.exchangeable && <span className="badge-info">Exchange</span>}
              </div>
              <h2 className="text-lg font-extrabold text-ink-900 leading-tight">{product.title}</h2>
              <p className="text-xs text-muted mt-1">{listingSubtitle(product)}</p>
            </div>

            <div className="flex items-start gap-4 flex-none">
              <div className="text-right">
                <p className="text-xl font-extrabold text-ink-900 tabular">{formatINR(product.price)}</p>
                {product.originalPrice > product.price && (
                  <p className="text-xs text-muted line-through tabular">{formatINR(product.originalPrice)}</p>
                )}
              </div>
              <button
                type="button"
                onClick={onRefresh}
                disabled={refreshing}
                className="btn btn-secondary btn-sm"
                aria-label="Refresh analysis"
              >
                <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1.5 mt-4 pt-4 border-t border-line">
            <DetailRow label="Seller" value={product.sellerName || "—"} />
            <DetailRow label="Listed" value={`${formatDate(product.createdAt)}`} />
            <DetailRow label="Listing age" value={product.ageDays === null ? "—" : `${product.ageDays}d`} />
            <DetailRow
              label="Rating"
              value={product.reviewCount > 0 ? `${product.rating} (${product.reviewCount})` : "No reviews"}
            />
          </div>

          {data?.dataQuality?.firstEventAt && (
            <p className="text-2xs text-muted-soft mt-3">
              Behaviour tracked {formatDate(data.dataQuality.firstEventAt)} → {formatDate(data.dataQuality.lastEventAt)} ·{" "}
              {formatNumber(data.dataQuality.daysTracked)} days · {formatNumber(data.dataQuality.sessions)} sessions ·{" "}
              {data.dataQuality.avgEventsPerCustomer} events per customer
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

const DataQualityPanel = ({ dataQuality }) => {
  const rows = dataQuality?.counterComparison || [];
  if (!rows.length) return null;
  const mismatches = dataQuality.counterMismatches || [];

  return (
    <Panel
      title="Data quality"
      sub="Stored listing counters against the tracked event log"
      action={
        mismatches.length > 0 ? (
          <span className="badge-warning">{mismatches.length} disagree</span>
        ) : (
          <span className="badge-success">Agree</span>
        )
      }
    >
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Signal</th>
              <th className="th-num">Stored counter</th>
              <th className="th-num">Tracked events</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.field}>
                <td className="font-semibold text-ink-900">{row.label}</td>
                <td className="num text-muted">{formatNumber(row.listing)}</td>
                <td className="num text-ink-900">{formatNumber(row.events)}</td>
                <td>
                  {row.mismatch ? (
                    <span className="badge-warning">Drifted</span>
                  ) : (
                    <span className="badge-success">Agrees</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted mt-3 leading-relaxed">{dataQuality.note}</p>
    </Panel>
  );
};

const SalesRecordPanel = ({ overview }) => {
  if (!overview) return null;
  const tracked = overview.tracked || {};
  const orders = overview.orders || 0;
  const afterSale = [
    { key: "checkouts", label: "Checkout starts", value: tracked.checkouts || 0 },
    { key: "returns", label: "Returns", value: tracked.returns || 0 },
    { key: "exchanges", label: "Exchange requests", value: tracked.exchanges || 0 },
  ];
  const hasAfterSale = afterSale.some((row) => row.value > 0);

  return (
    <Panel
      title="Sales record"
      sub="Completed orders on this listing, and what happened after them"
      action={
        orders > 0 ? (
          <span className="badge-success">{formatINR(overview.revenue)}</span>
        ) : (
          <span className="badge-neutral">No orders</span>
        )
      }
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-line px-3 py-2.5">
          <p className="text-2xs font-bold uppercase tracking-wider text-muted flex items-center gap-1.5">
            <TrendingUp size={11} /> Revenue
          </p>
          <p className="text-lg font-extrabold tabular text-ink-900 mt-1">{formatINR(overview.revenue)}</p>
          <p className="text-2xs text-muted">from {formatNumber(orders)} orders</p>
        </div>
        <div className="rounded-xl border border-line px-3 py-2.5">
          <p className="text-2xs font-bold uppercase tracking-wider text-muted">Buyers</p>
          <p className="text-lg font-extrabold tabular text-ink-900 mt-1">{formatNumber(overview.uniqueBuyers)}</p>
          <p className="text-2xs text-muted">distinct purchasers</p>
        </div>
        <div className="rounded-xl border border-line px-3 py-2.5">
          <p className="text-2xs font-bold uppercase tracking-wider text-muted flex items-center gap-1.5">
            <Star size={11} /> Reviews
          </p>
          <p className="text-lg font-extrabold tabular text-ink-900 mt-1">
            {overview.reviews > 0 ? overview.avgRating : "—"}
          </p>
          <p className="text-2xs text-muted">{formatNumber(overview.reviews)} written</p>
        </div>
        <div className="rounded-xl border border-line px-3 py-2.5">
          <p className="text-2xs font-bold uppercase tracking-wider text-muted flex items-center gap-1.5">
            <RotateCcw size={11} /> After sale
          </p>
          <p className="text-lg font-extrabold tabular text-ink-900 mt-1">
            {formatNumber((tracked.returns || 0) + (tracked.exchanges || 0))}
          </p>
          <p className="text-2xs text-muted">returns and exchanges</p>
        </div>
      </div>

      {hasAfterSale && (
        <div className="flex flex-wrap gap-x-6 gap-y-1.5 mt-4 pt-3 border-t border-line">
          {afterSale.map((row) => (
            <span key={row.key} className="text-xs text-muted tabular">
              {row.label} <b className="text-ink-900">{formatNumber(row.value)}</b>
            </span>
          ))}
        </div>
      )}

      {orders > 0 && overview.uniqueBuyers > overview.orders && (
        <p className="text-xs text-muted-soft mt-3 leading-relaxed">
          More distinct buyers than orders: {formatNumber(overview.uniqueBuyers - overview.orders)} of them made
          more than one purchase of this listing, so the listing has repeat buyers rather than one-off traffic.
        </p>
      )}
    </Panel>
  );
};

const SellerPanel = ({ seller }) => {
  if (!seller) return null;
  return (
    <Panel
      title="Seller trust signals"
      sub={`${seller.name}${seller.isVerified ? " · verified seller" : ""}`}
      action={seller.isVerified ? <span className="badge-success">Verified</span> : <span className="badge-neutral">Unverified</span>}
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="rounded-xl border border-line px-3 py-2.5">
          <p className="text-2xs font-bold uppercase tracking-wider text-muted">Listings</p>
          <p className="text-lg font-extrabold tabular text-ink-900 mt-1">{formatNumber(seller.listings.total)}</p>
          <p className="text-2xs text-muted">{formatNumber(seller.listings.live)} live</p>
        </div>
        <div className="rounded-xl border border-line px-3 py-2.5">
          <p className="text-2xs font-bold uppercase tracking-wider text-muted">Sales</p>
          <p className="text-lg font-extrabold tabular text-ink-900 mt-1">{formatNumber(seller.sales.orders)}</p>
          <p className="text-2xs text-muted">{formatINR(seller.sales.revenue)}</p>
        </div>
        <div className="rounded-xl border border-line px-3 py-2.5">
          <p className="text-2xs font-bold uppercase tracking-wider text-muted">Reviews</p>
          <p className="text-lg font-extrabold tabular text-ink-900 mt-1">
            {seller.reviews.count > 0 ? seller.reviews.avgRating : "—"}
          </p>
          <p className="text-2xs text-muted">{formatNumber(seller.reviews.count)} reviews</p>
        </div>
        <div className="rounded-xl border border-line px-3 py-2.5">
          <p className="text-2xs font-bold uppercase tracking-wider text-muted">Offers answered</p>
          <p className="text-lg font-extrabold tabular text-ink-900 mt-1">
            {formatNumber(seller.offers.accepted)}/{formatNumber(seller.offers.total)}
          </p>
          <p className="text-2xs text-muted">
            {seller.offers.avgResponseMinutes === null
              ? "no response time recorded"
              : `${seller.offers.avgResponseMinutes} min avg`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-6">
        <DetailRow label="Member since" value={formatDate(seller.memberSince)} />
        <DetailRow label="Seller rating" value={seller.sellerRatingCount > 0 ? `${seller.sellerRating} (${seller.sellerRatingCount})` : "—"} />
        <DetailRow label="Buyers served" value={formatNumber(seller.sales.uniqueBuyers)} />
        <DetailRow label="Profile views" value={formatNumber(seller.engagementOnThisListing.sellerProfileViews)} />
        <DetailRow label="Chats started" value={formatNumber(seller.engagementOnThisListing.chats)} />
        <DetailRow label="Review reads" value={formatNumber(seller.engagementOnThisListing.reviewReads)} />
      </div>

      {seller.offers.avgResponseMinutes === null && seller.offers.total > 0 && (
        <p className="text-xs text-muted-soft mt-3 leading-relaxed">
          Response time is only recorded when a seller answers an offer. None of this seller's{" "}
          {formatNumber(seller.offers.total)} offers have a recorded response, so no average is shown.
        </p>
      )}
    </Panel>
  );
};

export default function ProductIntelWorkspace() {
  const [searchParams, setSearchParams] = useSearchParams();
  const productId = searchParams.get("product");

  const [state, setState] = useState({ data: null, loading: false, error: null });
  const [mixMode, setMixMode] = useState("events");
  const ticket = useRef(0);

  const load = useCallback(
    async (id) => {
      if (!id) {
        setState({ data: null, loading: false, error: null });
        return;
      }
      const mine = ++ticket.current;
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const { data } = await api.get(`/admin/products/${id}/intelligence`);
        if (mine !== ticket.current) return;
        setState({ data, loading: false, error: null });
      } catch (err) {
        if (mine !== ticket.current) return;
        setState({
          data: null,
          loading: false,
          error:
            err.response?.status === 404
              ? "That listing no longer exists."
              : err.response?.data?.message || "Could not load the analysis for this listing.",
        });
      }
    },
    []
  );

  useEffect(() => {
    load(productId);
  }, [productId, load]);

  /**
   * Following a related listing reuses the same `?product=` contract as the
   * sidebar, so the browser back button walks the chain of listings that were
   * compared. Going through the router rather than `history.replaceState` keeps
   * the tab state and the router's own bookkeeping consistent.
   */
  const selectProduct = useCallback(
    (nextId) => {
      const next = new URLSearchParams(searchParams);
      next.set("product", nextId);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const insights = (state.data?.insights || []).filter((insight) => insight.id !== "no-behaviour");
  const product = state.data?.product || null;
  const overview = state.data?.overview;
  const noBehaviour = Boolean(state.data) && !overview?.hasEnoughData;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)] gap-5 items-start">
      <ProductSelector selectedId={productId} />

      <div className="min-w-0 space-y-5">
        {!productId ? (
          <Panel>
            <EmptyPanel
              icon={BarChart3}
              title="Choose a listing to analyse"
              message="Pick any listing from the list to load its interest mix, funnel, persona composition, category demand, negotiation behaviour, customer geography and seller signals. The selection is kept in the URL, so a specific listing's analysis can be shared."
            />
          </Panel>
        ) : state.loading && !state.data ? (
          <LoadingGrid />
        ) : state.error ? (
          <div className="alert alert-danger">
            <AlertTriangle size={16} className="flex-none mt-0.5" />
            <div className="flex-1">
              <p className="font-bold">{state.error}</p>
              <button type="button" onClick={() => load(productId)} className="btn btn-secondary btn-sm mt-3">
                <RefreshCw size={12} /> Try again
              </button>
            </div>
          </div>
        ) : !state.data ? null : (
          <>
            <Masthead product={product} data={state.data} onRefresh={() => load(productId)} refreshing={state.loading} />

            {state.loading && (
              <div className="flex items-center gap-2 text-xs text-muted font-semibold">
                <RefreshCw size={12} className="animate-spin" /> Refreshing…
              </div>
            )}

            {noBehaviour && (
              <div className="alert alert-warning">
                <AlertTriangle size={16} className="flex-none mt-0.5" />
                <div>
                  <p className="font-bold">No behavioural data for this listing</p>
                  <p className="mt-0.5 leading-relaxed">
                    No interaction event references it, so interest, funnel and persona panels cannot be computed.
                    This is an absence of data, not a poor result. The listing's own counters and its seller
                    record below are still real.
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              {overviewTiles(overview, state.data.dataQuality).map((tile) => (
                <MetricTile
                  key={tile.key}
                  label={tile.label}
                  value={tile.value}
                  sub={tile.sub}
                  tone={tile.muted ? "text-muted" : "text-ink-900"}
                />
              ))}
            </div>

            {insights.length > 0 && (
              <Panel
                title="Key insights"
                sub="Derived from the figures on this page, with the supporting numbers"
                action={<span className="badge-primary">{insights.length}</span>}
              >
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {insights.map((insight) => (
                    <InsightCard key={insight.id} insight={insight} />
                  ))}
                </div>
              </Panel>
            )}

            <InteractionMix
              mix={state.data.interactionMix}
              mode={mixMode}
              onModeChange={setMixMode}
              totalEvents={state.data.interactionMix?.totalEvents}
              otherEvents={state.data.interactionMix?.otherEvents}
            />

            <FunnelPanel funnel={state.data.funnel} />

            <ConversionPanel conversion={state.data.conversion} abandonment={state.data.cartAbandonment} />

            <AbandonmentLeaders rows={state.data.cartAbandonment?.marketplaceLeaders} />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <PersonaPanel personas={state.data.personas} />
              <CategoryPanel categoryInterest={state.data.categoryInterest} product={product} />
              <NegotiationPanel negotiation={state.data.negotiation} product={product} />
              <LocationPanel location={state.data.location} />
            </div>

            <SignalStrip support={state.data.interactionMix?.support} />

            <RelatedPanel
              related={state.data.relatedProducts}
              currentId={productId}
              onSelect={selectProduct}
            />

            <SalesRecordPanel overview={overview} />

            <SellerPanel seller={state.data.sellerSignals} />

            <DataQualityPanel dataQuality={state.data.dataQuality} />

            {state.data.limitations?.length > 0 && (
              <Panel title="How to read this page" sub="Limits of the underlying data">
                <ul className="space-y-2">
                  {state.data.limitations.map((limitation, index) => (
                    <li key={index} className="flex items-start gap-2.5 text-xs text-muted leading-relaxed">
                      <Info size={13} className="flex-none mt-0.5 text-muted-soft" />
                      <span>{limitation}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-2xs text-muted-soft mt-3 pt-3 border-t border-line">
                  Generated {formatDate(state.data.generatedAt)}. Every figure is derived from stored behaviour events,
                  orders, offers, reviews and the newest completed segmentation run.
                </p>
              </Panel>
            )}
          </>
        )}
      </div>
    </div>
  );
}
