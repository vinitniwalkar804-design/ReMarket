/**
 * Marketplace intelligence: the three catalogue-level questions an operator
 * actually asks, answered from real recorded behaviour and real orders.
 *
 * Why this file exists
 * --------------------
 * The admin area already had three pages that each answered a *slice* of this:
 *
 *   - `getCategoryAttraction`    - categories weighted by event volume.
 *   - `getProductIntelligence`   - which listings are hot, ranked on stored counters.
 *   - `services/productIntelligence` - one listing in depth, via its own request.
 *
 * Each ranked on a different thing. Category attraction summed *events*, so one
 * power shopper clicking forty times could outrank a category that genuinely
 * reached thirty people. The catalogue ranking used `Product.views` and
 * `Product.orderCount`, which are denormalised counters maintained by a
 * different code path than `BehaviorEvent` and genuinely disagree with it. And
 * because the deep dive was per-listing, nothing answered the question an
 * operator opens the page with: *which categories and listings reach the most
 * real people, and what did those people actually do?*
 *
 * The measurement rule that fixes all three
 * -----------------------------------------
 * **Count customers, not events.** A "customer" is one distinct `userId`. One
 * person browsing forty listings is one attracted customer, counted once in
 * every category they touch. Every ranking, rate and funnel step below is built
 * from distinct-user sets. Raw event counts are still reported, but always
 * labelled as events and never used as a denominator against a customer count.
 *
 * Four further rules, because each one produced a wrong number in testing:
 *
 * 1. **Sales come from `Order`, never from `PURCHASE` events.** Buyers, units and
 *    revenue are aggregated from orders. A listing's `status: "sold"` flag is
 *    also *not* trusted for this: in the live dataset 131 orders had been placed
 *    while only 1 listing still carried the sold flag, so a sell-through rate
 *    built on that field reports 0% for sellers who have clearly sold. Sell
 *    through is therefore derived from orders, and the status flag is reported
 *    beside it as a stored counter with its drift shown.
 *
 * 2. **Every stage needs an attributable subject.** A `CART_VIEW` event records
 *    that somebody opened their cart page - it has no product and no category,
 *    so it belongs to no listing and no category. Including it produced a
 *    phantom "Uncategorized" row carrying 73 of the marketplace's 76 customers
 *    and zero listings. Events that resolve to neither a listing nor a category
 *    are now skipped for catalogue attribution, and `CART_VIEW` is not treated
 *    as an "added to cart" signal at all (that is `CART_ADD`).
 *
 * 3. **A funnel step is a distinct-customer count, and the steps are NOT
 *    nested.** Reporting "of the people who viewed, this many carted" would be
 *    false: a customer can arrive by deep link, from a saved listing, or as a
 *    repeat buyer who never viewed again this month, so the carted set is not a
 *    subset of the viewed set. Each step is reported as a share of everyone
 *    attracted, and the caveat travels with the payload so no panel can present
 *    it as a strict drop-off.
 *
 * 4. **No invented rows.** A category with no recorded interaction is absent,
 *    never listed as zero. A rate with a zero denominator is `null`, never
 *    `0%` - "nobody looked" and "nobody converted" are different facts.
 *
 * Cost: a fixed number of indexed aggregate passes. The one pass over
 * `BehaviorEvent` is grouped by (productId, category, eventType), which is
 * bounded by the catalogue rather than by traffic. Nothing here loops per
 * product in JavaScript against the database.
 */
import { BehaviorEvent, Offer, Order, Product, User } from "../models/index.js";
import { contains } from "../utils/text.js";

/**
 * Order statuses that count as a real sale.
 *
 * `cancelled` and `returned` are excluded: both mean the deal was undone, and
 * counting them as revenue is the easiest way to make a report disagree with
 * finance. Exported because the attraction, sales and seller reports must apply
 * exactly the same rule or their totals will not reconcile.
 */
export const SALE_STATUSES = ["pending", "confirmed", "shipped", "delivered"];

const UNGROUPED = "Uncategorized";

/**
 * The behaviour taxonomy, in one place.
 *
 * A single source of truth is the point: an earlier arrangement weighted events
 * in one file and counted a differently chosen subset in another, so the
 * category panel and the listing panel could disagree about the same customer.
 *
 * `funnel: false` marks a signal that is real interest but not a rung on the
 * path to a purchase - a search is discovery, and putting it in the funnel would
 * make the steps mean nothing.
 */
export const STAGES = [
  { key: "searches", label: "Searched", funnel: false, events: ["SEARCH"] },
  { key: "views", label: "Viewed a listing", funnel: true, events: ["PRODUCT_VIEW"] },
  { key: "comparisons", label: "Compared", funnel: true, events: ["PRODUCT_COMPARE", "COMPARE_SELECTED"] },
  { key: "wishlist", label: "Saved", funnel: true, events: ["WISHLIST_ADD", "PRICE_WATCH"] },
  { key: "cart", label: "Added to cart", funnel: true, events: ["CART_ADD"] },
  { key: "offers", label: "Made an offer", funnel: true, events: ["OFFER_SENT", "OFFER_ACCEPTED"] },
  { key: "purchases", label: "Purchased", funnel: true, events: ["PURCHASE"] },
];

/** Distinct-event-type -> stage key, so the aggregation can be bucketed cheaply. */
const EVENT_STAGE = new Map();
for (const stage of STAGES) for (const eventType of stage.events) EVENT_STAGE.set(eventType, stage.key);

const TRACKED_EVENT_TYPES = [...EVENT_STAGE.keys()];

/**
 * Stage keys that count as "attracted". Purchases are excluded on purpose: a
 * listing that already sold should not look more *attractive* than one currently
 * winning attention, and including purchases would make attraction a measure of
 * past revenue instead of present demand.
 */
const ATTRACTION_KEYS = STAGES.filter((s) => s.key !== "purchases").map((s) => s.key);
const FUNNEL_KEYS = STAGES.filter((s) => s.funnel).map((s) => s.key);

const round = (value, places = 2) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const factor = 10 ** places;
  const rounded = Math.round(value * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
};

/** A percentage, or `null` when there is no denominator to speak of. */
const rate = (numerator, denominator) => (denominator > 0 ? round((numerator / denominator) * 100, 1) : null);

/** Union of distinct-user collections, always returned as a Set. */
const union = (...sets) => {
  const out = new Set();
  for (const set of sets) for (const id of set) out.add(String(id));
  return out;
};

/**
 * `$addToSet` hands back an array, not a Set, and an array has no `.size`.
 * Reading `.size` off an aggregation result is a silent `undefined` that then
 * poisons every rate downstream, so results are normalised to Sets at the edge
 * and the rest of the file only ever deals in Sets.
 */
const toSet = (values) => new Set((values ?? []).map(String));

/** One pass over `BehaviorEvent`, bucketed per listing, per category, and marketplace-wide. */
const collectSignals = async () => {
  const [eventRows, products] = await Promise.all([
    BehaviorEvent.aggregate([
      { $match: { eventType: { $in: TRACKED_EVENT_TYPES } } },
      {
        $group: {
          _id: { productId: "$productId", category: "$category", eventType: "$eventType" },
          events: { $sum: 1 },
          users: { $addToSet: "$userId" },
        },
      },
    ]),
    Product.find({ status: { $ne: "removed" } })
      .select(
        "title categoryName price status brand condition seller sellerName " +
          "views orderCount wishlistCount compareCount rating reviewCount"
      )
      .lean(),
  ]);

  const productById = new Map(products.map((p) => [String(p._id), p]));
  /**
   * `null` means "this event cannot be attributed to a category" - either it
   * has no product, or the listing it names has since been deleted. Only a
   * listing that still exists but carries no category resolves to
   * `UNGROUPED`, which is a real catalogue state worth showing. Conflating the
   * two is what previously produced an "Uncategorized" row holding 12
   * customers whose listings no longer exist at all.
   */
  const categoryOf = (productId) => {
    const product = productById.get(String(productId));
    if (!product) return null;
    return product.categoryName?.trim() || UNGROUPED;
  };

  const emptyBucket = () => ({ stages: new Map(STAGES.map((s) => [s.key, { events: 0, users: new Set() }])) });
  const byProduct = new Map();
  const byCategory = new Map();
  const marketplace = emptyBucket();
  let unattributedEvents = 0;

  for (const row of eventRows) {
    const { productId, category, eventType } = row._id;
    const stageKey = EVENT_STAGE.get(eventType);
    if (!stageKey) continue;

    const onEvent = typeof category === "string" ? category.trim() : "";
    const productKey = productId ? String(productId) : null;

    // Rule 2: an event with neither a listing nor a category cannot be
    // attributed to a catalogue row. It still counts towards the marketplace
    // funnel, but it must never invent an "Uncategorized" category.
    const categoryName = onEvent || (productKey ? categoryOf(productKey) : null);
    if (!categoryName && !productKey) {
      unattributedEvents += row.events;
      continue;
    }
    if (productKey && !categoryName) unattributedEvents += row.events;

    const targets = [marketplace];
    if (productKey) {
      if (!byProduct.has(productKey)) byProduct.set(productKey, emptyBucket());
      targets.push(byProduct.get(productKey));
    }
    if (categoryName) {
      if (!byCategory.has(categoryName)) byCategory.set(categoryName, emptyBucket());
      targets.push(byCategory.get(categoryName));
    }

    for (const bucket of targets) {
      const stage = bucket.stages.get(stageKey);
      stage.events += row.events;
      for (const user of row.users) stage.users.add(String(user));
    }
  }

  return { byProduct, byCategory, marketplace, productById, unattributedEvents };
};

/** Flatten a stage bucket into `{ events, customers }` per stage. */
const readStages = (bucket) => {
  if (!bucket) {
    return Object.fromEntries(STAGES.map(({ key }) => [key, { events: 0, customers: 0 }]));
  }
  return Object.fromEntries(
    STAGES.map(({ key }) => {
      const stage = bucket.stages.get(key);
      return [key, { events: stage.events, customers: stage.users.size }];
    })
  );
};

/** Everyone who showed attraction, excluding people who only bought. */
const attractedCustomers = (bucket) =>
  bucket ? union(...ATTRACTION_KEYS.map((key) => bucket.stages.get(key).users)) : new Set();

/** The furthest stage a group of customers actually reached, for plain English. */
const leadingStage = (stages) => {
  for (const key of ["offers", "cart", "wishlist", "comparisons", "views"]) {
    if (stages[key]?.customers > 0) return STAGES.find((s) => s.key === key).label.toLowerCase();
  }
  return "searched";
};

/**
 * Compare the denormalised listing counters against the event stream.
 *
 * `Product.views` and friends are maintained by a different code path than
 * `BehaviorEvent`, so they drift. The drift is a fact about the data, not a bug
 * to hide: it tells an operator which counters can be trusted for a decision.
 */
const counterDrift = (product, stages) => {
  const rows = [
    { key: "views", stored: product.views ?? 0, fromEvents: stages.views.events },
    { key: "wishlist", stored: product.wishlistCount ?? 0, fromEvents: stages.wishlist.events },
    { key: "comparisons", stored: product.compareCount ?? 0, fromEvents: stages.comparisons.events },
  ]
    .filter((r) => Number.isFinite(r.stored))
    .map((r) => ({ ...r, drift: r.stored - r.fromEvents }));
  return rows.some((r) => r.drift !== 0) ? rows : null;
};

/** The stage funnel, with the non-nesting caveat attached to the payload. */
const buildFunnel = (bucket, buyerSet) => {
  const interested = attractedCustomers(bucket);
  const steps = FUNNEL_KEYS.map((key) => {
    const stage = bucket.stages.get(key);
    // Buyers come from orders, so the closing step uses the authoritative set
    // and still reports the event count beside it for the drift check.
    const customers = key === "purchases" ? buyerSet.size : stage.users.size;
    return {
      key,
      label: STAGES.find((s) => s.key === key).label,
      events: stage.events,
      customers,
      ofInterested: rate(customers, interested.size),
    };
  });

  return {
    interested: interested.size,
    steps,
    caveat:
      "Each step counts distinct customers who performed that action. Steps are not nested - a customer can reach a listing by deep link, from a saved item, or as a repeat buyer - so compare stages against 'Everyone attracted', not against each other.",
  };
};

/** Sales, orders, units and buyers per product, keyed by product id. */
const loadSales = async () => {
  const rows = await Order.aggregate([
    { $match: { status: { $in: SALE_STATUSES } } },
    {
      $group: {
        _id: "$productId",
        orders: { $sum: 1 },
        units: { $sum: "$quantity" },
        revenue: { $sum: "$finalPrice" },
        buyers: { $addToSet: "$buyerId" },
        lastSaleAt: { $max: "$createdAt" },
      },
    },
  ]);
  return new Map(
    rows.map((r) => [
      String(r._id),
      { orders: r.orders, units: r.units, revenue: r.revenue, buyers: toSet(r.buyers), lastSaleAt: r.lastSaleAt },
    ])
  );
};

const EMPTY_SALE = { orders: 0, units: 0, revenue: 0, buyers: new Set(), lastSaleAt: null };

/**
 * One listing row: real attraction from events, real sales from orders, both
 * expressed in customers so the two halves of the report are comparable.
 */
const buildProductRow = (product, bucket, sale) => {
  const stages = readStages(bucket);
  const customers = attractedCustomers(bucket).size;
  const buyers = sale.buyers.size;

  return {
    id: product._id,
    title: product.title,
    category: product.categoryName?.trim() || UNGROUPED,
    brand: product.brand,
    condition: product.condition,
    price: product.price,
    status: product.status,
    seller: { id: product.seller, name: product.sellerName || "" },
    rating: product.rating,
    reviewCount: product.reviewCount,
    customers,
    buyers,
    units: sale.units,
    orders: sale.orders,
    revenue: round(sale.revenue, 0),
    lastSaleAt: sale.lastSaleAt,
    stages,
    interestToPurchaseRate: rate(buyers, customers),
    cartToPurchaseRate: rate(buyers, stages.cart.customers),
    counterDrift: counterDrift(product, stages),
  };
};

/* -------------------------------------------------------------------------- */
/* Attraction report                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Which categories and listings reach the most real customers, and what those
 * customers did next.
 *
 * Backs the catalogue level of Product Intelligence - the report an operator
 * sees before drilling into any single listing.
 */
export const getAttractionAnalytics = async ({ limit = 12 } = {}) => {
  const { byProduct, byCategory, marketplace, productById, unattributedEvents } = await collectSignals();
  const [sales, supply] = await Promise.all([
    loadSales(),
    Product.aggregate([
      { $match: { status: { $ne: "removed" } } },
      {
        $group: {
          _id: "$categoryName",
          listings: { $sum: 1 },
          activeListings: { $sum: { $cond: [{ $eq: ["$status", "available"] }, 1, 0] } },
        },
      },
    ]),
  ]);

  /* Every live listing appears, not only the ones that happen to have events,
     so a listing with sales but no tracked interaction still shows up. */
  const products = [...productById.values()].map((product) =>
    buildProductRow(product, byProduct.get(String(product._id)), sales.get(String(product._id)) ?? EMPTY_SALE)
  );
  products.sort((a, b) => b.customers - a.customers || b.units - a.units);

  /* --- categories ------------------------------------------------------- */
  const supplyByCategory = new Map(
    supply.map((s) => [String(s._id ?? "").trim() || UNGROUPED, { listings: s.listings, activeListings: s.activeListings }])
  );

  const categories = [...byCategory.entries()]
    .map(([categoryName, bucket]) => {
      const stages = readStages(bucket);
      const customers = attractedCustomers(bucket).size;

      // Buyers come from the order rollup, so category buyers and category
      // revenue reconcile exactly with the marketplace headline.
      const inCategory = products.filter((p) => p.category === categoryName);
      const buyers = union(...inCategory.map((p) => sales.get(String(p.id))?.buyers ?? []));
      const units = inCategory.reduce((sum, p) => sum + p.units, 0);
      const orders = inCategory.reduce((sum, p) => sum + p.orders, 0);
      const revenue = inCategory.reduce((sum, p) => sum + p.revenue, 0);
      const supplyRow = supplyByCategory.get(categoryName) ?? {
        listings: inCategory.length,
        activeListings: inCategory.filter((p) => p.status === "available").length,
      };

      return {
        category: categoryName,
        customers,
        buyers: buyers.size,
        units,
        orders,
        revenue: round(revenue, 0),
        listings: supplyRow.listings,
        activeListings: supplyRow.activeListings,
        // Interest per available listing: high means demand is under-served by
        // supply, low means the category is saturated relative to its traffic.
        demandPerListing: supplyRow.listings > 0 ? round(customers / supplyRow.listings) : null,
        interestToPurchaseRate: rate(buyers.size, customers),
        stages,
        topListings: [...inCategory]
          .sort((a, b) => b.customers - a.customers)
          .slice(0, 3)
          .map((p) => ({ id: p.id, title: p.title, customers: p.customers, units: p.units })),
      };
    })
    .sort((a, b) => b.customers - a.customers || b.revenue - a.revenue);

  const allBuyers = union(...[...sales.values()].map((s) => s.buyers));
  const funnel = buildFunnel(marketplace, allBuyers);

  return {
    basis: {
      unit: "distinct customers",
      customerDefinition:
        "One distinct userId per category or listing. A customer is counted once however many times they interacted.",
      attractionDefinition:
        "Distinct customers with a search, view, comparison, saved item, price watch, cart or offer. Purchases are excluded so a listing that already sold does not outrank one winning present demand.",
      salesDefinition: `Aggregated from Order where status is one of ${SALE_STATUSES.join(", ")}. Cancelled and returned orders are excluded.`,
      stageDefinition: `Searches count as interest but are not a funnel step. Added-to-cart is CART_ADD; a CART_VIEW (opening the cart page) is not treated as cart interest because it identifies no listing.`,
      eventSource: "BehaviorEvent",
      saleSource: "Order",
    },
    totals: {
      categories: categories.length,
      listingsTracked: products.length,
      customers: funnel.interested,
      buyers: allBuyers.size,
      listingsWithInterest: products.filter((p) => p.customers > 0).length,
    },
    dataQuality: {
      unattributedEvents,
      note:
        unattributedEvents > 0
          ? `${unattributedEvents} tracked events name a listing that no longer exists, so they count towards the marketplace funnel but cannot be attributed to any category. They are excluded from the category table rather than filed under "Uncategorized", which is not a real category.`
          : "Every tracked event could be attributed to a live listing or a category.",
    },
    funnel,
    categories,
    products: products.slice(0, limit),
  };
};

/* -------------------------------------------------------------------------- */
/* Sales insights                                                              */
/* -------------------------------------------------------------------------- */

/**
 * What actually sold, how the money trended, and where demand and sales
 * disagree.
 *
 * The last part is why this page earns its own route: the most useful thing a
 * marketplace operator can see is a listing many people engaged with and nobody
 * bought, and no existing page surfaced that.
 */
export const getSalesInsights = async ({ limit = 10 } = {}) => {
  const { byProduct, byCategory, productById } = await collectSignals();
  const sales = await loadSales();

  const [headlineRows, reasons, paymentMix, channelMix, topSellers, monthly, statusDrift] = await Promise.all([
    Order.aggregate([
      { $match: { status: { $in: SALE_STATUSES } } },
      {
        $group: {
          _id: null,
          revenue: { $sum: "$finalPrice" },
          orders: { $sum: 1 },
          units: { $sum: "$quantity" },
          buyers: { $addToSet: "$buyerId" },
          sellers: { $addToSet: "$sellerId" },
          avgDiscount: { $avg: "$discountPercent" },
          avgDecisionMinutes: { $avg: { $cond: [{ $gt: ["$decisionTimeMinutes", 0] }, "$decisionTimeMinutes", null] } },
          firstSale: { $min: "$createdAt" },
          lastSale: { $max: "$createdAt" },
        },
      },
    ]),
    Order.aggregate([
      { $match: { purchaseReason: { $nin: ["", null] }, status: { $in: SALE_STATUSES } } },
      { $group: { _id: "$purchaseReason", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 8 },
    ]),
    Order.aggregate([
      { $match: { status: { $in: SALE_STATUSES } } },
      { $group: { _id: { $ifNull: ["$paymentMethod", "Not recorded"] }, orders: { $sum: 1 }, revenue: { $sum: "$finalPrice" } } },
      { $sort: { orders: -1 } },
    ]),
    Order.aggregate([
      { $match: { status: { $in: SALE_STATUSES } } },
      { $group: { _id: { $ifNull: ["$type", "Not recorded"] }, orders: { $sum: 1 }, units: { $sum: "$quantity" }, revenue: { $sum: "$finalPrice" } } },
      { $sort: { orders: -1 } },
    ]),
    Order.aggregate([
      { $match: { status: { $in: SALE_STATUSES } } },
      { $group: { _id: "$sellerId", orders: { $sum: 1 }, units: { $sum: "$quantity" }, revenue: { $sum: "$finalPrice" } } },
      { $sort: { revenue: -1 } },
      { $limit: limit },
    ]),
    Order.aggregate([
      { $match: { status: { $in: SALE_STATUSES } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
          revenue: { $sum: "$finalPrice" },
          units: { $sum: "$quantity" },
          orders: { $sum: 1 },
          buyers: { $addToSet: "$buyerId" },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    // Rule 1: how far the stored `status: "sold"` flag has drifted from orders.
    Product.aggregate([
      { $match: { status: "sold" } },
      { $group: { _id: null, listings: { $sum: 1 } } },
    ]),
  ]);

  const headline = headlineRows[0] ?? {
    revenue: 0, orders: 0, units: 0, buyers: [], sellers: [], avgDiscount: null,
    avgDecisionMinutes: null, firstSale: null, lastSale: null,
  };

  const products = [...productById.values()].map((product) =>
    buildProductRow(product, byProduct.get(String(product._id)), sales.get(String(product._id)) ?? EMPTY_SALE)
  );

  /* Category customers must come from the category event buckets, never from
     summing per-listing counts: nine listings each reached the same 52 people,
     so summing reported 466 "Smartphones customers" against a marketplace of
     76. Distinct-per-category is the only figure that means anything. */
  const categories = [...byCategory.entries()]
    .map(([categoryName, bucket]) => {
      const inCategory = products.filter((p) => p.category === categoryName);
      const buyers = union(...inCategory.map((p) => sales.get(String(p.id))?.buyers ?? []));
      return {
        category: categoryName,
        customers: attractedCustomers(bucket).size,
        buyers: buyers.size,
        units: inCategory.reduce((sum, p) => sum + p.units, 0),
        orders: inCategory.reduce((sum, p) => sum + p.orders, 0),
        revenue: round(inCategory.reduce((sum, p) => sum + p.revenue, 0), 0),
        listings: inCategory.length,
        interestToPurchaseRate: rate(buyers.size, attractedCustomers(bucket).size),
      };
    })
    .sort((a, b) => b.revenue - a.revenue || b.units - a.units);

  /* --- demand vs sales: the actionable split ----------------------------- */
  const engaged = products.filter((p) => p.customers > 0);
  const engagedButUnsold = engaged
    .filter((p) => p.units === 0)
    .sort((a, b) => b.customers - a.customers)
    .slice(0, limit)
    .map((p) => ({
      id: p.id, title: p.title, category: p.category, price: p.price, customers: p.customers,
      reached: leadingStage(p.stages),
      views: p.stages.views.customers, wishlists: p.stages.wishlist.customers,
      carts: p.stages.cart.customers, offers: p.stages.offers.customers,
    }));
  const converting = engaged
    .filter((p) => p.units > 0)
    .sort((a, b) => (b.interestToPurchaseRate ?? -1) - (a.interestToPurchaseRate ?? -1) || b.buyers - a.buyers)
    .slice(0, limit)
    .map((p) => ({
      id: p.id, title: p.title, category: p.category, buyers: p.buyers, customers: p.customers,
      units: p.units, revenue: p.revenue, interestToPurchaseRate: p.interestToPurchaseRate,
    }));

  return {
    basis: {
      unit: "orders",
      saleDefinition: `Order documents with status in ${SALE_STATUSES.join(", ")}. Cancelled and returned orders are excluded.`,
      revenueDefinition: "Sum of Order.finalPrice - the amount actually agreed, after any negotiated discount.",
      customerNote:
        "Attraction columns count distinct customers; sales columns count orders. They are different units and are never divided into each other except through an explicit named rate.",
    },
    totals: {
      revenue: round(headline.revenue, 0),
      orders: headline.orders,
      units: headline.units,
      buyers: toSet(headline.buyers).size,
      sellers: toSet(headline.sellers).size,
      avgOrderValue: round(headline.orders > 0 ? headline.revenue / headline.orders : null, 0),
      avgUnitsPerOrder: round(headline.orders > 0 ? headline.units / headline.orders : null),
      avgDiscount: round(headline.avgDiscount, 1),
      avgDecisionHours: round(headline.avgDecisionMinutes > 0 ? headline.avgDecisionMinutes / 60 : null, 1),
      firstSale: headline.firstSale,
      lastSale: headline.lastSale,
    },
    dataQuality: {
      note: "Product.status is a stored flag that is not kept in step with orders. Sales figures below come from Order, which is authoritative.",
      listingsFlaggedSold: statusDrift[0]?.listings ?? 0,
      listingsWithOrders: [...sales.keys()].length,
    },
    topProducts: {
      byUnits: [...products].sort((a, b) => b.units - a.units || b.revenue - a.revenue).slice(0, limit),
      byRevenue: [...products].sort((a, b) => b.revenue - a.revenue).slice(0, limit),
    },
    categories,
    monthly: monthly.map((m) => ({ month: m._id, revenue: round(m.revenue, 0), units: m.units, orders: m.orders, buyers: toSet(m.buyers).size })),
    demandVsSales: {
      engagedButUnsold: {
        label: "Engaged, never sold",
        note: "Real customer attention with no completed sale. Price, condition or availability is the usual cause - these are the listings worth acting on.",
        rows: engagedButUnsold,
      },
      converting: {
        label: "Converting well",
        note: "Ranked by share of attracted customers who went on to buy.",
        rows: converting,
      },
    },
    purchaseReasons: reasons.map((r) => ({ reason: r._id, count: r.count })),
    paymentMix: paymentMix.map((r) => ({ method: r._id, orders: r.orders, revenue: round(r.revenue, 0) })),
    channelMix: channelMix.map((r) => ({ type: r._id, orders: r.orders, units: r.units, revenue: round(r.revenue, 0) })),
    topSellers: topSellers.map((s) => ({ sellerId: s._id, orders: s.orders, units: s.units, revenue: round(s.revenue, 0) })),
  };
};

/* -------------------------------------------------------------------------- */
/* Seller intelligence                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Seller performance measured the way a marketplace cares about it: what they
 * listed, what sold, who bought it, and whether their reputation kept up.
 *
 * Listing, order and offer counts are aggregated over the whole seller set in
 * three passes and joined in memory. The earlier implementation ran one
 * aggregate per seller per metric, so fifteen rows on screen meant roughly
 * forty-five database round trips - correct, and far too slow to use.
 */
export const getSellerIntelligence = async ({ limit = 15, sort = "revenue", search = "" } = {}) => {
  const filter = { role: "customer" };
  if (search) {
    filter.$or = [{ name: contains(search) }, { email: contains(search) }, { location: contains(search) }];
  }

  const sellers = await User.find(filter).select("-password").sort({ createdAt: -1 }).limit(300).lean();
  const ids = sellers.map((s) => s._id);

  const emptyResult = {
    basis: SELLER_BASIS,
    totals: { sellers: 0, listings: 0, activeListings: 0, soldListings: 0, revenue: 0, units: 0, buyers: 0, offers: 0 },
    sellers: [],
  };
  if (ids.length === 0) return emptyResult;

  const [listingStats, orderStats, offerStats] = await Promise.all([
    Product.aggregate([
      { $match: { seller: { $in: ids } } },
      {
        $group: {
          _id: "$seller",
          listings: { $sum: 1 },
          activeListings: { $sum: { $cond: [{ $eq: ["$status", "available"] }, 1, 0] } },
          soldFlagged: { $sum: { $cond: [{ $eq: ["$status", "sold"] }, 1, 0] } },
          hiddenListings: { $sum: { $cond: [{ $in: ["$status", ["hidden", "removed"]] }, 1, 0] } },
          stockValue: { $sum: "$price" },
          avgPrice: { $avg: "$price" },
        },
      },
    ]),
    Order.aggregate([
      { $match: { sellerId: { $in: ids }, status: { $in: SALE_STATUSES } } },
      {
        $group: {
          _id: "$sellerId",
          orders: { $sum: 1 },
          units: { $sum: "$quantity" },
          revenue: { $sum: "$finalPrice" },
          buyers: { $addToSet: "$buyerId" },
          soldProductIds: { $addToSet: "$productId" },
          lastSaleAt: { $max: "$createdAt" },
        },
      },
    ]),
    Offer.aggregate([
      { $match: { sellerId: { $in: ids } } },
      {
        $group: {
          _id: "$sellerId",
          offers: { $sum: 1 },
          accepted: { $sum: { $cond: [{ $eq: ["$status", "accepted"] }, 1, 0] } },
          rejected: { $sum: { $cond: [{ $eq: ["$status", "rejected"] }, 1, 0] } },
          avgResponseMinutes: { $avg: { $cond: [{ $gt: ["$sellerResponseTime", 0] }, "$sellerResponseTime", null] } },
        },
      },
    ]),
  ]);

  const listingMap = new Map(listingStats.map((r) => [String(r._id), r]));
  const orderMap = new Map(orderStats.map((r) => [String(r._id), r]));
  const offerMap = new Map(offerStats.map((r) => [String(r._id), r]));

  const rows = sellers.map((s) => {
    const id = String(s._id);
    const listing = listingMap.get(id) ?? { listings: 0, activeListings: 0, soldFlagged: 0, hiddenListings: 0, stockValue: 0, avgPrice: null };
    const order = orderMap.get(id)
      ? { ...orderMap.get(id), buyers: toSet(orderMap.get(id).buyers), soldProductIds: toSet(orderMap.get(id).soldProductIds) }
      : { orders: 0, units: 0, revenue: 0, buyers: new Set(), soldProductIds: new Set(), lastSaleAt: null };
    const offer = offerMap.get(id) ?? { offers: 0, accepted: 0, rejected: 0, avgResponseMinutes: null };

    // Rule 1: sold is derived from orders, not from the status flag.
    const soldListings = order.soldProductIds.size;

    return {
      id: s._id,
      name: s.name,
      email: s.email,
      location: s.location,
      verified: Boolean(s.isVerifiedSeller),
      joinedAt: s.createdAt,
      lastActive: s.lastActive,
      rating: s.sellerRating ?? s.rating ?? 0,
      ratingCount: s.sellerRatingCount ?? s.ratingCount ?? 0,
      listings: listing.listings,
      activeListings: listing.activeListings,
      soldListings,
      soldFlagged: listing.soldFlagged,
      hiddenListings: listing.hiddenListings,
      stockValue: round(listing.stockValue, 0),
      avgPrice: round(listing.avgPrice, 0),
      orders: order.orders,
      units: order.units,
      revenue: round(order.revenue, 0),
      buyers: order.buyers.size,
      lastSaleAt: order.lastSaleAt,
      offers: offer.offers,
      offersAccepted: offer.accepted,
      offersRejected: offer.rejected,
      // Share of a seller's listings that have actually sold. Null when there
      // is no stock, so an empty shop never renders as a 0% seller.
      sellThroughRate: rate(soldListings, listing.listings),
      acceptanceRate: rate(offer.accepted, offer.offers),
      avgResponseHours: round(offer.avgResponseMinutes > 0 ? offer.avgResponseMinutes / 60 : null, 1),
    };
  });

  const sorters = {
    revenue: (a, b) => b.revenue - a.revenue,
    units: (a, b) => b.units - a.units,
    listings: (a, b) => b.listings - a.listings,
    sellThrough: (a, b) => (b.sellThroughRate ?? -1) - (a.sellThroughRate ?? -1),
    rating: (a, b) => b.rating - a.rating || b.ratingCount - a.ratingCount,
    buyers: (a, b) => b.buyers - a.buyers,
  };
  rows.sort(sorters[sort] ?? sorters.revenue);

  // One customer who bought from four sellers is one buyer, not four.
  const marketplaceBuyers = new Set();
  for (const order of orderStats) for (const b of toSet(order.buyers)) marketplaceBuyers.add(b);

  return {
    basis: SELLER_BASIS,
    totals: {
      sellers: rows.length,
      listings: rows.reduce((sum, r) => sum + r.listings, 0),
      activeListings: rows.reduce((sum, r) => sum + r.activeListings, 0),
      soldListings: rows.reduce((sum, r) => sum + r.soldListings, 0),
      revenue: round(rows.reduce((sum, r) => sum + r.revenue, 0), 0),
      units: rows.reduce((sum, r) => sum + r.units, 0),
      buyers: marketplaceBuyers.size,
      offers: rows.reduce((sum, r) => sum + r.offers, 0),
    },
    sellers: rows.slice(0, limit),
  };
};

const SELLER_BASIS = {
  unit: "seller",
  saleDefinition: `Order status in ${SALE_STATUSES.join(", ")}. Cancelled and returned orders are excluded.`,
  sellThroughNote:
    "Sold listings are derived from orders rather than Product.status, which is a stored flag that drifts from the order history.",
  reputationNote:
    "Ratings come from the seller's stored reputation fields, maintained by the review flow rather than recomputed here.",
};

export default { getAttractionAnalytics, getSalesInsights, getSellerIntelligence, SALE_STATUSES, STAGES };
