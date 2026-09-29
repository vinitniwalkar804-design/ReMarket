/**
 * Product-level intelligence workspace.
 *
 * Vanilla port of `pages/admin/intel/ProductIntelWorkspace.jsx`.
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
 *
 * The selection lives in the URL (`?product=<id>`). The sidebar's select,
 * clear and follow-a-related-listing all navigate, so the router remounts this
 * page with the new id and the chain of compared listings stays in history. The
 * only in-page state is the interaction-mix tab, which repaints just the right
 * column rather than the fixed sidebar.
 */
import { h, mount } from "../../../dom.js";
import { icon } from "../../../icons.js";
import { navigate } from "../../../navigation.js";
import api from "../../../services/api.js";
import { formatDate, formatINR, formatNumber } from "../../../utils/format.js";
import { listingTone } from "../../../utils/theme.js";
import ProductSelector from "./product-selector.js";
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
} from "./panels.js";
import { DetailRow, EmptyPanel, InsightCard, LoadingGrid, MetricTile, Panel } from "./ui.js";

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
      icon: "MousePointerClick",
      value: formatNumber(tracked.views),
      sub: caption(tracked.views, `${formatNumber(overview.uniqueCustomers)} customers · ${formatNumber(overview.sessions)} sessions`),
      muted: !tracked.views,
    },
    {
      key: "uniqueCustomers",
      label: "Interacting customers",
      icon: "Users",
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
      icon: "Heart",
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
      icon: "Handshake",
      value: formatNumber(tracked.offers),
      sub: caption(tracked.offers, tracked.offers ? "price negotiation attempted" : "no offers recorded"),
      muted: !tracked.offers,
    },
    {
      key: "purchases",
      label: "Purchases",
      icon: "ShoppingBag",
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
  return h(
    "div",
    { className: "card overflow-hidden" },
    h(
      "div",
      { className: "flex flex-col md:flex-row" },
      h(
        "div",
        { className: "relative md:w-56 h-44 md:h-auto bg-sunken flex-none" },
        product.image
          ? h("img", { src: product.image, alt: "", className: "w-full h-full object-cover" })
          : h(
              "span",
              { className: "w-full h-full flex items-center justify-center text-muted-soft" },
              icon("Package", { size: 28 })
            )
      ),

      h(
        "div",
        { className: "flex-1 min-w-0 p-5" },
        h(
          "div",
          { className: "flex flex-wrap items-start justify-between gap-3" },
          h(
            "div",
            { className: "min-w-0" },
            h(
              "div",
              { className: "flex flex-wrap items-center gap-2 mb-1.5" },
              h("span", { className: `badge ${listingTone(product.status)}` }, product.status),
              product.isFeatured && h("span", { className: "badge-primary" }, "Featured"),
              product.negotiable && h("span", { className: "badge-accent" }, "Negotiable"),
              product.exchangeable && h("span", { className: "badge-info" }, "Exchange")
            ),
            h("h2", { className: "text-lg font-extrabold text-ink-900 leading-tight" }, product.title),
            h("p", { className: "text-xs text-muted mt-1" }, listingSubtitle(product))
          ),

          h(
            "div",
            { className: "flex items-start gap-4 flex-none" },
            h(
              "div",
              { className: "text-right" },
              h("p", { className: "text-xl font-extrabold text-ink-900 tabular" }, formatINR(product.price)),
              product.originalPrice > product.price &&
                h("p", { className: "text-xs text-muted line-through tabular" }, formatINR(product.originalPrice))
            ),
            h(
              "button",
              {
                type: "button",
                onClick: onRefresh,
                disabled: refreshing,
                className: "btn btn-secondary btn-sm",
                "aria-label": "Refresh analysis",
              },
              refreshing
                ? icon("RefreshCw", { size: 13, className: "animate-spin" })
                : icon("RefreshCw", { size: 13 })
            )
          )
        ),

        h(
          "div",
          { className: "grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1.5 mt-4 pt-4 border-t border-line" },
          DetailRow({ label: "Seller", value: product.sellerName || "—" }),
          DetailRow({ label: "Listed", value: `${formatDate(product.createdAt)}` }),
          DetailRow({ label: "Listing age", value: product.ageDays === null ? "—" : `${product.ageDays}d` }),
          DetailRow({
            label: "Rating",
            value: product.reviewCount > 0 ? `${product.rating} (${product.reviewCount})` : "No reviews",
          })
        ),

        data?.dataQuality?.firstEventAt &&
          h(
            "p",
            { className: "text-2xs text-muted-soft mt-3" },
            "Behaviour tracked ",
            formatDate(data.dataQuality.firstEventAt),
            " → ",
            formatDate(data.dataQuality.lastEventAt),
            " · ",
            formatNumber(data.dataQuality.daysTracked),
            " days · ",
            formatNumber(data.dataQuality.sessions),
            " sessions · ",
            data.dataQuality.avgEventsPerCustomer,
            " events per customer"
          )
      )
    )
  );
};

const DataQualityPanel = ({ dataQuality }) => {
  const rows = dataQuality?.counterComparison || [];
  if (!rows.length) return null;
  const mismatches = dataQuality.counterMismatches || [];

  return Panel({
    title: "Data quality",
    sub: "Stored listing counters against the tracked event log",
    action:
      mismatches.length > 0 ? (
        h("span", { className: "badge-warning" }, `${mismatches.length} disagree`)
      ) : (
        h("span", { className: "badge-success" }, "Agree")
      ),
    children: [
      h(
        "div",
        { className: "overflow-x-auto" },
        h(
          "table",
          { className: "data-table" },
          h(
            "thead",
            null,
            h(
              "tr",
              null,
              h("th", null, "Signal"),
              h("th", { className: "th-num" }, "Stored counter"),
              h("th", { className: "th-num" }, "Tracked events"),
              h("th", null, "Status")
            )
          ),
          h(
            "tbody",
            null,
            rows.map((row) =>
              h(
                "tr",
                { key: row.field },
                h("td", { className: "font-semibold text-ink-900" }, row.label),
                h("td", { className: "num text-muted" }, formatNumber(row.listing)),
                h("td", { className: "num text-ink-900" }, formatNumber(row.events)),
                h(
                  "td",
                  null,
                  row.mismatch ? h("span", { className: "badge-warning" }, "Drifted") : h("span", { className: "badge-success" }, "Agrees")
                )
              )
            )
          )
        )
      ),
      h("p", { className: "text-xs text-muted mt-3 leading-relaxed" }, dataQuality.note),
    ],
  });
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

  return Panel({
    title: "Sales record",
    sub: "Completed orders on this listing, and what happened after them",
    action:
      orders > 0 ? (
        h("span", { className: "badge-success" }, formatINR(overview.revenue))
      ) : (
        h("span", { className: "badge-neutral" }, "No orders")
      ),
    children: [
      h(
        "div",
        { className: "grid grid-cols-2 sm:grid-cols-4 gap-3" },
        h(
          "div",
          { className: "rounded-xl border border-line px-3 py-2.5" },
          h(
            "p",
            { className: "text-2xs font-bold uppercase tracking-wider text-muted flex items-center gap-1.5" },
            icon("TrendingUp", { size: 11 }),
            " Revenue"
          ),
          h("p", { className: "text-lg font-extrabold tabular text-ink-900 mt-1" }, formatINR(overview.revenue)),
          h("p", { className: "text-2xs text-muted" }, "from ", formatNumber(orders), " orders")
        ),
        h(
          "div",
          { className: "rounded-xl border border-line px-3 py-2.5" },
          h("p", { className: "text-2xs font-bold uppercase tracking-wider text-muted" }, "Buyers"),
          h("p", { className: "text-lg font-extrabold tabular text-ink-900 mt-1" }, formatNumber(overview.uniqueBuyers)),
          h("p", { className: "text-2xs text-muted" }, "distinct purchasers")
        ),
        h(
          "div",
          { className: "rounded-xl border border-line px-3 py-2.5" },
          h(
            "p",
            { className: "text-2xs font-bold uppercase tracking-wider text-muted flex items-center gap-1.5" },
            icon("Star", { size: 11 }),
            " Reviews"
          ),
          h("p", { className: "text-lg font-extrabold tabular text-ink-900 mt-1" }, overview.reviews > 0 ? overview.avgRating : "—"),
          h("p", { className: "text-2xs text-muted" }, formatNumber(overview.reviews), " written")
        ),
        h(
          "div",
          { className: "rounded-xl border border-line px-3 py-2.5" },
          h(
            "p",
            { className: "text-2xs font-bold uppercase tracking-wider text-muted flex items-center gap-1.5" },
            icon("RotateCcw", { size: 11 }),
            " After sale"
          ),
          h(
            "p",
            { className: "text-lg font-extrabold tabular text-ink-900 mt-1" },
            formatNumber((tracked.returns || 0) + (tracked.exchanges || 0))
          ),
          h("p", { className: "text-2xs text-muted" }, "returns and exchanges")
        )
      ),

      hasAfterSale &&
        h(
          "div",
          { className: "flex flex-wrap gap-x-6 gap-y-1.5 mt-4 pt-3 border-t border-line" },
          afterSale.map((row) =>
            h(
              "span",
              { key: row.key, className: "text-xs text-muted tabular" },
              row.label,
              " ",
              h("b", { className: "text-ink-900" }, formatNumber(row.value))
            )
          )
        ),

      orders > 0 &&
        overview.uniqueBuyers > overview.orders &&
        h(
          "p",
          { className: "text-xs text-muted-soft mt-3 leading-relaxed" },
          "More distinct buyers than orders: ",
          formatNumber(overview.uniqueBuyers - overview.orders),
          " of them made more than one purchase of this listing, so the listing has repeat buyers rather than one-off traffic."
        ),
    ],
  });
};

const SellerPanel = ({ seller }) => {
  if (!seller) return null;
  return Panel({
    title: "Seller trust signals",
    sub: `${seller.name}${seller.isVerified ? " · verified seller" : ""}`,
    action: seller.isVerified ? h("span", { className: "badge-success" }, "Verified") : h("span", { className: "badge-neutral" }, "Unverified"),
    children: [
      h(
        "div",
        { className: "grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4" },
        h(
          "div",
          { className: "rounded-xl border border-line px-3 py-2.5" },
          h("p", { className: "text-2xs font-bold uppercase tracking-wider text-muted" }, "Listings"),
          h("p", { className: "text-lg font-extrabold tabular text-ink-900 mt-1" }, formatNumber(seller.listings.total)),
          h("p", { className: "text-2xs text-muted" }, formatNumber(seller.listings.live), " live")
        ),
        h(
          "div",
          { className: "rounded-xl border border-line px-3 py-2.5" },
          h("p", { className: "text-2xs font-bold uppercase tracking-wider text-muted" }, "Sales"),
          h("p", { className: "text-lg font-extrabold tabular text-ink-900 mt-1" }, formatNumber(seller.sales.orders)),
          h("p", { className: "text-2xs text-muted" }, formatINR(seller.sales.revenue))
        ),
        h(
          "div",
          { className: "rounded-xl border border-line px-3 py-2.5" },
          h("p", { className: "text-2xs font-bold uppercase tracking-wider text-muted" }, "Reviews"),
          h("p", { className: "text-lg font-extrabold tabular text-ink-900 mt-1" }, seller.reviews.count > 0 ? seller.reviews.avgRating : "—"),
          h("p", { className: "text-2xs text-muted" }, formatNumber(seller.reviews.count), " reviews")
        ),
        h(
          "div",
          { className: "rounded-xl border border-line px-3 py-2.5" },
          h("p", { className: "text-2xs font-bold uppercase tracking-wider text-muted" }, "Offers answered"),
          h(
            "p",
            { className: "text-lg font-extrabold tabular text-ink-900 mt-1" },
            formatNumber(seller.offers.accepted),
            "/",
            formatNumber(seller.offers.total)
          ),
          h(
            "p",
            { className: "text-2xs text-muted" },
            seller.offers.avgResponseMinutes === null
              ? "no response time recorded"
              : `${seller.offers.avgResponseMinutes} min avg`
          )
        )
      ),

      h(
        "div",
        { className: "grid grid-cols-2 gap-x-6" },
        DetailRow({ label: "Member since", value: formatDate(seller.memberSince) }),
        DetailRow({ label: "Seller rating", value: seller.sellerRatingCount > 0 ? `${seller.sellerRating} (${seller.sellerRatingCount})` : "—" }),
        DetailRow({ label: "Buyers served", value: formatNumber(seller.sales.uniqueBuyers) }),
        DetailRow({ label: "Profile views", value: formatNumber(seller.engagementOnThisListing.sellerProfileViews) }),
        DetailRow({ label: "Chats started", value: formatNumber(seller.engagementOnThisListing.chats) }),
        DetailRow({ label: "Review reads", value: formatNumber(seller.engagementOnThisListing.reviewReads) })
      ),

      seller.offers.avgResponseMinutes === null &&
        seller.offers.total > 0 &&
        h(
          "p",
          { className: "text-xs text-muted-soft mt-3 leading-relaxed" },
          "Response time is only recorded when a seller answers an offer. None of this seller's ",
          formatNumber(seller.offers.total),
          " offers have a recorded response, so no average is shown."
        ),
    ],
  });
};

export default function ProductIntelWorkspace({ location, query: q } = {}) {
  const productId = q?.product || new URLSearchParams(location?.search || "").get("product");

  const st = { data: null, loading: false, error: null, mixMode: "events" };
  let disposed = false;
  const cleanups = [];
  let ticket = 0;

  const root = h(
    "div",
    { className: "grid grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)] gap-5 items-start" }
  );
  const sideHost = h("div", { className: "min-w-0" });
  const contentHost = h("div", { className: "min-w-0 space-y-5" });
  root.appendChild(sideHost);
  root.appendChild(contentHost);

  function ensureAlive() {
    if (root.isConnected) return true;
    if (!disposed) {
      disposed = true;
      for (const fn of cleanups.splice(0)) fn();
    }
    return false;
  }

  const observer = new MutationObserver(() => {
    if (!ensureAlive()) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  const load = async (id) => {
    if (!id) {
      st.data = null;
      st.loading = false;
      st.error = null;
      repaint();
      return;
    }
    const mine = ++ticket;
    st.loading = true;
    st.error = null;
    repaint();
    try {
      const { data } = await api.get(`/admin/products/${id}/intelligence`);
      if (!ensureAlive() || mine !== ticket) return;
      st.data = data;
      st.loading = false;
      st.error = null;
      repaint();
    } catch (err) {
      if (!ensureAlive() || mine !== ticket) return;
      st.data = null;
      st.loading = false;
      st.error =
        err.response?.status === 404
          ? "That listing no longer exists."
          : err.response?.data?.message || "Could not load the analysis for this listing.";
      repaint();
    }
  };

  /**
   * Following a related listing reuses the same `?product=` contract as the
   * sidebar. In the React build this pushed a search-param update through the
   * router; here the sidebar and related panel navigate, so the router remounts
   * this page with the new id and the back button walks the compared chain.
   * setMixMode is the only in-page state and only repaints this column.
   */
  const selectProduct = (nextId) => {
    const next = new URLSearchParams(location?.search || "");
    next.set("product", nextId);
    navigate(`${location.path}?${next.toString()}`, { replace: true });
  };

  const insights = () => (st.data?.insights || []).filter((insight) => insight.id !== "no-behaviour");
  const product = () => st.data?.product || null;
  const overview = () => st.data?.overview;
  const noBehaviour = () => Boolean(st.data) && !overview()?.hasEnoughData;

  const onModeChange = (mode) => {
    st.mixMode = mode;
    repaint();
  };

  function repaint() {
    const data = st.data;
    const productIdNow = productId;
    const currentProduct = product();
    const currentOverview = overview();
    const currentNoBehaviour = noBehaviour();
    const currentInsights = insights();

    let content;
    if (!productIdNow) {
      content = h(
        "div",
        null,
        Panel({
          children: EmptyPanel({
            icon: "BarChart3",
            title: "Choose a listing to analyse",
            message:
              "Pick any listing from the list to load its interest mix, funnel, persona composition, category demand, negotiation behaviour, customer geography and seller signals. The selection is kept in the URL, so a specific listing's analysis can be shared.",
          }),
        })
      );
    } else if (st.loading && !st.data) {
      content = LoadingGrid();
    } else if (st.error) {
      content = h(
        "div",
        { className: "alert alert-danger" },
        icon("AlertTriangle", { size: 16, className: "flex-none mt-0.5" }),
        h(
          "div",
          { className: "flex-1" },
          h("p", { className: "font-bold" }, st.error),
          h(
            "button",
            {
              type: "button",
              onClick: () => load(productIdNow),
              className: "btn btn-secondary btn-sm mt-3",
            },
            icon("RefreshCw", { size: 12 }),
            " Try again"
          )
        )
      );
    } else if (!st.data) {
      content = null;
    } else {
      content = h(
        "div",
        { className: "space-y-5" },
        Masthead({ product: currentProduct, data, onRefresh: () => load(productIdNow), refreshing: st.loading }),

        st.loading &&
          h(
            "div",
            { className: "flex items-center gap-2 text-xs text-muted font-semibold" },
            icon("RefreshCw", { size: 12, className: "animate-spin" }),
            " Refreshing…"
          ),

        currentNoBehaviour &&
          h(
            "div",
            { className: "alert alert-warning" },
            icon("AlertTriangle", { size: 16, className: "flex-none mt-0.5" }),
            h(
              "div",
              null,
              h("p", { className: "font-bold" }, "No behavioural data for this listing"),
              h(
                "p",
                { className: "mt-0.5 leading-relaxed" },
                "No interaction event references it, so interest, funnel and persona panels cannot be computed.",
                " This is an absence of data, not a poor result. The listing's own counters and its seller",
                " record below are still real."
              )
            )
          ),

        h(
          "div",
          { className: "grid grid-cols-2 lg:grid-cols-5 gap-4" },
          overviewTiles(currentOverview, st.data.dataQuality).map((tile) =>
            MetricTile({
              key: tile.key,
              label: tile.label,
              value: tile.value,
              sub: tile.sub,
              tone: tile.muted ? "text-muted" : "text-ink-900",
            })
          )
        ),

        currentInsights.length > 0 &&
          Panel({
            title: "Key insights",
            sub: "Derived from the figures on this page, with the supporting numbers",
            action: h("span", { className: "badge-primary" }, currentInsights.length),
            children: h(
              "div",
              { className: "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3" },
              currentInsights.map((insight) => InsightCard({ key: insight.id, insight }))
            ),
          }),

        InteractionMix({
          mix: st.data.interactionMix,
          mode: st.mixMode,
          onModeChange,
          totalEvents: st.data.interactionMix?.totalEvents,
          otherEvents: st.data.interactionMix?.otherEvents,
        }),

        FunnelPanel({ funnel: st.data.funnel }),

        ConversionPanel({ conversion: st.data.conversion, abandonment: st.data.cartAbandonment }),

        AbandonmentLeaders({ rows: st.data.cartAbandonment?.marketplaceLeaders }),

        h(
          "div",
          { className: "grid grid-cols-1 lg:grid-cols-2 gap-5" },
          PersonaPanel({ personas: st.data.personas }),
          CategoryPanel({ categoryInterest: st.data.categoryInterest, product: currentProduct }),
          NegotiationPanel({ negotiation: st.data.negotiation, product: currentProduct }),
          LocationPanel({ location: st.data.location })
        ),

        SignalStrip({ support: st.data.interactionMix?.support }),

        RelatedPanel({
          related: st.data.relatedProducts,
          currentId: productIdNow,
          onSelect: selectProduct,
        }),

        SalesRecordPanel({ overview: currentOverview }),

        SellerPanel({ seller: st.data.sellerSignals }),

        DataQualityPanel({ dataQuality: st.data.dataQuality }),

        st.data.limitations?.length > 0 &&
          Panel({
            title: "How to read this page",
            sub: "Limits of the underlying data",
            children: [
              h(
                "ul",
                { className: "space-y-2" },
                st.data.limitations.map((limitation, index) =>
                  h(
                    "li",
                    { key: index, className: "flex items-start gap-2.5 text-xs text-muted leading-relaxed" },
                    icon("Info", { size: 13, className: "flex-none mt-0.5 text-muted-soft" }),
                    h("span", null, limitation)
                  )
                )
              ),
              h(
                "p",
                { className: "text-2xs text-muted-soft mt-3 pt-3 border-t border-line" },
                "Generated ",
                formatDate(st.data.generatedAt),
                ". Every figure is derived from stored behaviour events, orders, offers, reviews and the newest completed segmentation run."
              ),
            ],
          })
      );
    }

    mount(contentHost, content);
  }

  // The sidebar is fixed once mounted; it keeps its own search, debounce and
  // pagination state across the right column's repaints. Navigating (select,
  // clear, related) remounts the whole page through the router.
  sideHost.appendChild(ProductSelector({ selectedId: productId }));

  repaint();
  load(productId);

  return root;
}