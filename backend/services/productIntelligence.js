/**
 * Product intelligence: one listing, every signal the marketplace has about it.
 *
 * The catalogue-level `getProductIntelligence` in `adminController` answers
 * "which listings are hot?". That question is answerable from denormalised
 * counters, and it is also the weaker one - it can only rank what already
 * happened. This module answers the question an operator actually has when a
 * specific listing is in front of them: *who is interested in this, how far do
 * they get, and what do they do instead?*
 *
 * Three rules govern everything below.
 *
 * 1. **Events are the source of truth, counters are shown beside them.**
 *    `Product.views`, `wishlistCount`, `compareCount`, `cartCount` and
 *    `orderCount` are denormalised and maintained by a different code path than
 *    `BehaviorEvent`. They genuinely disagree - a listing whose counters were
 *    never backfilled reports zero wishlists while hundreds of WISHLIST_ADD
 *    events sit in the collection. So every metric here is computed from events,
 *    and the drift against the stored counters is reported as a data-quality
 *    fact instead of being silently reconciled in either direction.
 *
 * 2. **Customers, not events, carry intent.** One customer can generate forty
 *    PRODUCT_VIEW events. Every rate below is therefore a customer-level set
 *    intersection (or a documented per-event rate), never one event type divided
 *    by another unless both sides are the same kind of number. That is the whole
 *    reason the funnel reports "ordered customers" next to raw counts: a customer
 *    who wished after buying did not progress through the funnel, and dividing
 *    event counts would hide that.
 *
 * 3. **Absence is reported, never invented.** A metric whose denominator is zero
 *    comes back as `rate: null, available: false` with a reason. A listing with
 *    no offers is not a listing with a 0% offer rate, and the UI has to be able
 *    to tell those apart.
 *
 * The whole thing is one HTTP call. The alternative - a dashboard that fires a
 * request per panel - needs the browser to join eleven payloads by product id and
 * re-derives "unique customers" differently in each panel. Every aggregate here
 * is bounded: the only unbounded one is scoped to a single `productId` via a
 * compound index, and the co-interest pass is bounded by the number of customers
 * who touched this listing (tens, not millions).
 */
import mongoose from "mongoose";
import { BehaviorEvent, CustomerPersona, Offer, Order, Product, Review, User } from "../models/index.js";
import { getCategoryAttraction } from "./categoryAttraction.js";
import { getLatestCompleteClusterRun } from "../controllers/mlController.js";

/** Round to `places` and drop -0, so JSON never carries "-0". */
const round = (value, places = 2) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const factor = 10 ** places;
  const rounded = Math.round(value * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
};

/**
 * Indian-grouped rupees for insight evidence, or an explicit "no value".
 *
 * Insight text has to render a number or say it has none; a bare `null` in a
 * sentence reads as a bug, and "n/a" appearing where a figure was expected is
 * itself informative.
 */
const inr = (value) =>
  value === null || value === undefined || !Number.isFinite(value) ? "n/a" : `\u20b9${Math.round(value).toLocaleString("en-IN")}`;

/**
 * A rate, or an explicit "cannot be computed".
 *
 * Returning `null` alone is ambiguous: it reads as zero everywhere except where
 * somebody is careful. The `available` flag and `reason` travel with the value so
 * the renderer has to make a decision instead of formatting a null as a percent.
 *
 * `isShare` exists because a customer can compare a listing straight from a
 * search results page without ever "viewing" it, so the compared set is not
 * necessarily a subset of the viewed set. When the numerator exceeds the
 * denominator the quotient is still a true fact about the data, but it is no
 * longer "a share of the denominator" and must not be worded as one - which is
 * how a 200% conversion rate ends up on a dashboard.
 */
const rate = (numerator, denominator) => {
  if (!denominator || denominator <= 0) {
    return { numerator, denominator, rate: null, available: false, isShare: false, reason: "no denominator" };
  }
  return {
    numerator,
    denominator,
    rate: round((numerator / denominator) * 100, 1),
    available: true,
    isShare: numerator <= denominator,
    reason: null,
  };
};

/** "1 customer" / "4 customers" - insight headlines are read as sentences. */
const plural = (count, singular, pluralForm = `${singular}s`) =>
  `${count} ${count === 1 ? singular : pluralForm}`;

/**
 * The six interaction signals the workspace charts.
 *
 * Ordered weakest-to-strongest intent, which is also the funnel order. Removal
 * events (CART_REMOVE, WISHLIST_REMOVE) are deliberately excluded from the mix:
 * they are corrections, not interest, and mixing them into a "share of
 * interaction" donut would flatter a listing that people kept undoing.
 */
const MIX_SIGNALS = [
  { key: "views", label: "Views", event: "PRODUCT_VIEW", color: "#2f6fed" },
  { key: "comparisons", label: "Comparisons", event: "PRODUCT_COMPARE", color: "#7b5cf0" },
  { key: "wishlists", label: "Wishlists", event: "WISHLIST_ADD", color: "#e0568a" },
  { key: "cartAdds", label: "Cart additions", event: "CART_ADD", color: "#f2994a" },
  { key: "offers", label: "Offers", event: "OFFER_SENT", color: "#12a594" },
  { key: "purchases", label: "Purchases", event: "PURCHASE", color: "#1f9d55" },
];

/**
 * Secondary signals surfaced as a stat strip rather than as donut slices: they
 * are real intent, but they are not steps on the way to a purchase, so mixing
 * them into the funnel would be wrong.
 */
const SUPPORT_SIGNALS = [
  { key: "priceWatches", label: "Price watches", event: "PRICE_WATCH" },
  { key: "reviewViews", label: "Review reads", event: "REVIEW_VIEW" },
  { key: "sellerViews", label: "Seller profile views", event: "SELLER_PROFILE_VIEW" },
  { key: "chats", label: "Chats started", event: "CHAT_STARTED" },
  { key: "checkouts", label: "Checkout starts", event: "CHECKOUT_START" },
  { key: "compareSelections", label: "Compare selections", event: "COMPARE_SELECTED" },
  { key: "cartRemoves", label: "Cart removals", event: "CART_REMOVE" },
  { key: "wishlistRemoves", label: "Wishlist removals", event: "WISHLIST_REMOVE" },
  { key: "counterOffers", label: "Counter offers", event: "COUNTER_OFFER" },
  { key: "offersAccepted", label: "Offers accepted", event: "OFFER_ACCEPTED" },
  { key: "offersRejected", label: "Offers rejected", event: "OFFER_REJECTED" },
  { key: "returns", label: "Returns", event: "PRODUCT_RETURN" },
  { key: "exchanges", label: "Exchange requests", event: "EXCHANGE_REQUEST" },
  { key: "reviewsWritten", label: "Reviews written", event: "REVIEW_SUBMITTED" },
];

/**
 * The steps of the consideration funnel, in the order customers can take them.
 *
 * Offers sit after cart in the chart because a marketplace customer can negotiate
 * without ever touching a cart - that is the whole point of a "make offer" flow.
 * The flag records that the sequence is one of the common paths, not a mandatory
 * one, so the renderer can label it honestly.
 */
const FUNNEL_STAGES = [
  { key: "views", label: "Viewed", event: "PRODUCT_VIEW" },
  { key: "comparisons", label: "Compared", event: "PRODUCT_COMPARE" },
  { key: "wishlists", label: "Wishlisted", event: "WISHLIST_ADD" },
  { key: "cartAdds", label: "Added to cart", event: "CART_ADD" },
  { key: "offers", label: "Made an offer", event: "OFFER_SENT" },
  { key: "purchases", label: "Purchased", event: "PURCHASE" },
];

/**
 * Stage-to-stage conversion. Each is a customer-level intersection, so the
 * numerator can never exceed the denominator and a single enthusiastic clicker
 * cannot produce a 400% conversion rate.
 */
const CONVERSION_STEPS = [
  {
    key: "viewToCompare",
    label: "Viewed \u2192 compared",
    from: "PRODUCT_VIEW",
    to: "PRODUCT_COMPARE",
    definition: "Distinct customers who compared this listing, as a share of the customers who viewed it.",
  },
  {
    key: "viewToWishlist",
    label: "Viewed \u2192 wishlisted",
    from: "PRODUCT_VIEW",
    to: "WISHLIST_ADD",
    definition: "Distinct customers who wishlisted this listing, as a share of the customers who viewed it.",
  },
  {
    key: "viewToCart",
    label: "Viewed \u2192 cart",
    from: "PRODUCT_VIEW",
    to: "CART_ADD",
    definition: "Distinct customers who added this listing to a cart, as a share of the customers who viewed it.",
  },
  {
    key: "cartToPurchase",
    label: "Cart \u2192 purchased",
    from: "CART_ADD",
    to: "PURCHASE",
    definition: "Customers who both added this listing to a cart and went on to buy it, as a share of the customers who carted it.",
  },
  {
    key: "offerToPurchase",
    label: "Offer \u2192 purchased",
    from: "OFFER_SENT",
    to: "PURCHASE",
    definition: "Customers who offered on this listing and then bought it, as a share of the customers who made an offer.",
  },
  {
    key: "wishlistToPurchase",
    label: "Wishlist \u2192 purchased",
    from: "WISHLIST_ADD",
    to: "PURCHASE",
    definition: "Customers who wishlisted this listing and then bought it, as a share of the customers who wishlisted it.",
  },
];

/**
 * Denominator fields in the listing document that have an event-based twin.
 * Reported side by side so an operator can see which numbers to trust and why
 * they differ, instead of picking one and hoping.
 */
const COUNTER_PAIRS = [
  { field: "views", label: "Views", event: "PRODUCT_VIEW" },
  { field: "wishlistCount", label: "Wishlists", event: "WISHLIST_ADD" },
  { field: "compareCount", label: "Comparisons", event: "PRODUCT_COMPARE" },
  { field: "cartCount", label: "Cart additions", event: "CART_ADD" },
  { field: "orderCount", label: "Purchases", event: "PURCHASE" },
];

/**
 * Thresholds for the deterministic insight rules.
 *
 * Deliberately round numbers, and all relative to unique customers rather than
 * raw events, so a rule fires at the same place whether the listing has 200
 * views or 20,000. They live here, as data, because a number that decides whether
 * a listing is "healthy" is a policy choice and belongs where it can be argued
 * about rather than buried in a JSX ternary.
 */
const INSIGHT_THRESHOLDS = {
  attention: { strong: 400, moderate: 120, thin: 20 },
  intentRate: { strong: 0.12, moderate: 0.04 },
  purchaseRate: { strong: 0.04, moderate: 0.015, weak: 0.005 },
  abandonment: { leaky: 0.75 },
  offerAcceptance: { healthy: 0.5, poor: 0.25 },
  leaderMinSharedCustomers: 2,
  leaderMinCartCustomers: 3,
};

const DAY_MS = 24 * 60 * 60 * 1000;

const daysBetween = (from, to) => Math.max(0, Math.round((to.getTime() - from.getTime()) / DAY_MS));

/**
 * Set of `userId` strings that produced at least one `eventType` for this product.
 *
 * `byEventUser` is the flat array of grouped rows, not a map, because the
 * aggregation's `_id` is a compound key and rebuilding the same information into
 * a Map here would only be unpacking what the database just packed.
 */
const customerSetFor = (eventType, byEventUser) => {
  const set = new Set();
  for (const row of byEventUser) {
    if (row.eventType === eventType) set.add(row.userId);
  }
  return set;
};

const intersectSize = (a, b) => {
  let count = 0;
  for (const value of a) if (b.has(value)) count += 1;
  return count;
};

/** Intersection of two customer sets, for "then did X" conversions. */
const intersect = (a, b) => {
  const out = new Set();
  for (const value of a) if (b.has(value)) out.add(value);
  return out;
};

/**
 * The single pass that powers most of this module.
 *
 * Grouping to `(eventType, userId)` and keeping the earliest timestamp gives,
 * for one query over one product's events, every count and every customer set
 * the workspace needs. The obvious alternative - one aggregate per event type,
 * then one more per funnel stage for "ordered" progression - is a dozen passes
 * that each have to agree with each other; if any of them disagreed about what a
 * customer did, the panels would contradict each other on screen. There is no
 * such failure mode when they all come out of the same grouped rows.
 */
const aggregateProductSignals = (productId) =>
  BehaviorEvent.aggregate([
    { $match: { productId } },
    {
      $group: {
        _id: { eventType: "$eventType", userId: "$userId" },
        events: { $sum: 1 },
        firstAt: { $min: "$timestamp" },
        lastAt: { $max: "$timestamp" },
        sessions: { $addToSet: "$sessionId" },
      },
    },
    { $sort: { "_id.eventType": 1, firstAt: 1 } },
  ]);

/**
 * Where this listing's customers live.
 *
 * The `$lookup` resolves the location inside the database so no customer record
 * - and certainly no name, email or address - ever reaches the admin client. Only
 * the group key and two counts come back. "Not specified" is kept as a bucket
 * rather than dropped, because a large unlocated bucket is itself the finding.
 *
 * Grouping is on an upper-cased, whitespace-collapsed key so that "Amravati",
 * "amravati" and " Amravati " are one city rather than three. Real location data
 * collected from free-text profile fields is inconsistent about case, and without
 * this the same city splits into several rows and each row understates it. The
 * displayed label is re-cased from the key, so a chart never shows "amravati"
 * next to "Ahmedabad" and looks broken.
 */
const aggregateCustomerLocations = (productId) =>
  BehaviorEvent.aggregate([
    { $match: { productId } },
    { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "customer" } },
    { $unwind: "$customer" },
    {
      $project: {
        userId: 1,
        locationKey: {
          $toUpper: {
            $trim: { input: { $ifNull: ["$customer.location", ""] } },
          },
        },
      },
    },
    { $group: { _id: { location: "$locationKey", userId: "$userId" } } },
    { $group: { _id: "$_id.location", events: { $sum: 1 }, customers: { $sum: 1 } } },
    { $sort: { customers: -1, events: -1 } },
  ]);

/** "AMRAVATI" -> "Amravati"; already-cased input is left alone. */
const titleCase = (value) =>
  value
    .toLowerCase()
    .replace(/(^|[\s-])(\p{L})/gu, (match, prefix, letter) => prefix + letter.toUpperCase());

/**
 * What else the same customers looked at.
 *
 * This is a real co-interest graph, not a tag guess: two listings are related
 * here only if at least one customer actually touched both. The `sharedCustomers`
 * threshold is applied in the pipeline rather than after a `$limit` so a listing
 * with three overlapping events cannot outrank one with forty, and the product
 * `$lookup` happens before the limit is finally trimmed so deleted listings are
 * not returned as blank rows.
 */
const aggregateRelatedProducts = (productId, userIds) =>
  BehaviorEvent.aggregate([
    // Only product-scoped events can express co-interest: SEARCH and CATEGORY_VIEW
    // have no product, and SESSION_START would count every customer as related.
    { $match: { userId: { $in: userIds }, productId: { $ne: null, $nin: [productId] } } },
    { $group: { _id: { productId: "$productId", userId: "$userId" }, events: { $sum: 1 } } },
    { $group: { _id: "$_id.productId", sharedCustomers: { $sum: 1 }, coEvents: { $sum: "$events" } } },
    { $match: { sharedCustomers: { $gte: INSIGHT_THRESHOLDS.leaderMinSharedCustomers } } },
    { $sort: { sharedCustomers: -1, coEvents: -1 } },
    { $limit: 10 },
    { $lookup: { from: "products", localField: "_id", foreignField: "_id", as: "product" } },
    { $unwind: "$product" },
    {
      $project: {
        _id: 0,
        productId: "$_id",
        title: "$product.title",
        categoryName: "$product.categoryName",
        price: "$product.price",
        image: { $arrayElemAt: [{ $ifNull: ["$product.images", []] }, 0] },
        status: "$product.status",
        sharedCustomers: 1,
        coEvents: 1,
      },
    },
  ]);

/**
 * Where carts are being abandoned across the whole marketplace.
 *
 * Live cart state cannot answer this: the checkout flow deletes the cart row, so
 * the `carts` collection is empty after a completed purchase and contains only
 * people who have not checked out yet. The durable signal is the event history -
 * customers who carted a listing and, across all time, never bought it. That is
 * an inference, and it is reported as one.
 */
const aggregateCartAbandonmentLeaders = () =>
  BehaviorEvent.aggregate([
    { $match: { eventType: { $in: ["CART_ADD", "PURCHASE"] }, productId: { $ne: null } } },
    {
      $group: {
        _id: { productId: "$productId", userId: "$userId" },
        carted: { $sum: { $cond: [{ $eq: ["$eventType", "CART_ADD"] }, 1, 0] } },
        bought: { $sum: { $cond: [{ $eq: ["$eventType", "PURCHASE"] }, 1, 0] } },
      },
    },
    {
      $project: {
        productId: "$_id.productId",
        cartCustomers: { $cond: [{ $gt: ["$carted", 0] }, 1, 0] },
        boughtCustomers: { $cond: [{ $gt: ["$bought", 0] }, 1, 0] },
        // Only customers who carted *and* bought count as converted. Counting
        // everyone who ever bought would make abandonment negative for a listing
        // that is bought by people who never used a cart.
        convertedCustomers: {
          $cond: [{ $and: [{ $gt: ["$carted", 0] }, { $gt: ["$bought", 0] }] }, 1, 0],
        },
        cartAdds: "$carted",
        purchases: "$bought",
      },
    },
    {
      $group: {
        _id: "$productId",
        cartCustomers: { $sum: "$cartCustomers" },
        purchasedCustomers: { $sum: "$boughtCustomers" },
        convertedCustomers: { $sum: "$convertedCustomers" },
        cartAdds: { $sum: "$cartAdds" },
        purchases: { $sum: "$purchases" },
      },
    },
    {
      $project: {
        productId: "$_id",
        cartCustomers: 1,
        purchasedCustomers: 1,
        convertedCustomers: 1,
        cartAdds: 1,
        purchases: 1,
        abandonedCustomers: { $subtract: ["$cartCustomers", "$convertedCustomers"] },
      },
    },
    { $match: { cartCustomers: { $gte: INSIGHT_THRESHOLDS.leaderMinCartCustomers } } },
    { $sort: { abandonedCustomers: -1, cartCustomers: -1 } },
    { $limit: 10 },
    { $lookup: { from: "products", localField: "productId", foreignField: "_id", as: "product" } },
    { $unwind: "$product" },
    {
      $project: {
        _id: 0,
        productId: 1,
        title: "$product.title",
        categoryName: "$product.categoryName",
        price: "$product.price",
        cartCustomers: 1,
        abandonedCustomers: 1,
        convertedCustomers: 1,
        abandonmentRate: {
          $cond: [
            { $gt: ["$cartCustomers", 0] },
            { $round: [{ $multiply: [{ $divide: [{ $subtract: ["$cartCustomers", "$convertedCustomers"] }, "$cartCustomers"] }, 100] }, 1] },
            null,
          ],
        },
      },
    },
  ]);

/** Negotiation state of one listing, in one grouped pass. */
const aggregateProductOffers = (productId) =>
  Offer.aggregate([
    { $match: { productId } },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        buyers: { $addToSet: "$buyerId" },
        avgFirstOffer: { $avg: "$offerAmount" },
        avgCounter: { $avg: "$counterAmount" },
        avgRounds: { $avg: "$rounds" },
        avgResponseMinutes: { $avg: "$sellerResponseTime" },
        firstOffers: { $push: "$offerAmount" },
        finalPrices: { $push: "$finalPrice" },
        listedPrices: { $push: "$listedPrice" },
        responseTimes: { $push: "$sellerResponseTime" },
      },
    },
  ]);

const aggregateProductOrders = (productId) =>
  Order.aggregate([
    { $match: { productId } },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        revenue: { $sum: "$finalPrice" },
        avgFinalPrice: { $avg: "$finalPrice" },
        avgDiscountPercent: { $avg: "$discountPercent" },
        avgDecisionMinutes: { $avg: "$decisionTimeMinutes" },
        buyers: { $addToSet: "$buyerId" },
      },
    },
  ]);

/**
 * Build the intersection of two event-customer sets that respects time order.
 *
 * `orderedCustomers` in the funnel and the "then" wording in conversion are only
 * meaningful if the second event happened after the first. Someone who bought on
 * Monday and wishlisted on Friday has not moved through the funnel, and counting
 * them as a convert is how a real funnel quietly becomes a popularity contest.
 */
const countOrderedPairs = (byEventUser, fromEvent, toEvent) => {
  const firstFrom = new Map();
  const firstTo = new Map();
  for (const row of byEventUser) {
    if (row.eventType === fromEvent) {
      const current = firstFrom.get(row.userId);
      if (!current || row.firstAt < current) firstFrom.set(row.userId, row.firstAt);
    } else if (row.eventType === toEvent) {
      const current = firstTo.get(row.userId);
      if (!current || row.firstAt < current) firstTo.set(row.userId, row.firstAt);
    }
  }
  let ordered = 0;
  for (const [userId, fromAt] of firstFrom) {
    const toAt = firstTo.get(userId);
    if (toAt && toAt >= fromAt) ordered += 1;
  }
  return ordered;
};

/**
 * Map interacting customers onto the newest completed segmentation run.
 *
 * The hybrid `ClusterResult` holds a label per user; label `-1` is DBSCAN's
 * noise marker and means "this run did not consider them part of a segment", not
 * "zero interest". Those customers are reported as unassigned rather than being
 * spread across the nearest persona, because quietly reassigning them would
 * inflate whichever persona happened to be closest.
 */
const resolvePersonaMix = async (customerIds, countsByPersona) => {
  const latest = await getLatestCompleteClusterRun();
  if (!latest) {
    return {
      available: false,
      runId: null,
      runAt: null,
      algorithm: null,
      totalCustomers: customerIds.size,
      mappedCustomers: 0,
      unassignedCustomers: 0,
      segments: [],
      note: "No completed segmentation run exists yet. Run the ML Lab to cluster customers before persona composition is available.",
    };
  }

  const runId = latest.run.runId;
  const personas = await CustomerPersona.find({ runId }).lean();
  const byPersonaId = new Map(personas.map((p) => [p.personaId, p]));

  /* `ClusterResult.labels` is a Mixed field holding an object keyed by userId
     string, not an array of {userId, label} pairs - it is a label *map*, written
     by the clustering pipeline. Reading it as a keyed object also means an
     unrecognised id simply misses, which is the same outcome as an explicit
     null check further down. */
  const labels = latest.run.labels || {};
  const labelByUser = new Map();
  for (const [userId, label] of Object.entries(labels)) {
    labelByUser.set(String(userId), label);
  }

  let unassigned = 0;
  const perSegment = new Map();
  for (const userId of customerIds) {
    const label = labelByUser.get(userId);
    if (label === undefined || label === -1) {
      unassigned += 1;
      continue;
    }
    const persona = byPersonaId.get(label);
    if (!persona) {
      unassigned += 1;
      continue;
    }
    const row = perSegment.get(label) || { label, customers: 0, events: 0 };
    row.customers += 1;
    row.events += countsByPersona.events.get(userId) || 0;
    perSegment.set(label, row);
  }

  const segments = [...perSegment.values()]
    .map((row) => {
      const persona = byPersonaId.get(row.label);
      return {
        label: row.label,
        name: persona?.name || `Cluster ${row.label}`,
        signature: persona?.signature || "",
        description: persona?.description || "",
        marketingStrategy: persona?.marketingStrategy || "",
        matchScore: round(persona?.matchScore ?? null, 1),
        confidence: round(persona?.confidence ?? null, 1),
        engagementIndex: round(persona?.engagementIndex ?? null, 1),
        purchaseTendency: round(persona?.purchaseTendency ?? null, 1),
        avgSpending: round(persona?.avgSpending ?? null, 0),
        characteristics: persona?.characteristics || {},
        customers: row.customers,
        events: row.events,
        share: null,
      };
    })
    .sort((a, b) => b.customers - a.customers || b.events - a.events);

  const mappedCustomers = segments.reduce((sum, s) => sum + s.customers, 0);
  for (const segment of segments) {
    segment.share = round((segment.customers / Math.max(mappedCustomers, 1)) * 100, 1);
  }

  return {
    available: true,
    runId,
    runAt: latest.run.createdAt || null,
    algorithm: latest.run.algorithm || "hybrid",
    totalCustomers: customerIds.size,
    mappedCustomers,
    unassignedCustomers: unassigned,
    segments,
    note: null,
  };
};

/**
 * Deterministic, evidence-carrying observations about one listing.
 *
 * Every rule is a threshold comparison over numbers already computed above, and
 * every rule that fires brings the exact figures it fired on. No rule is allowed
 * to emit a claim whose supporting number is not in the payload - that is the
 * whole reason these are generated here rather than composed in the view, where
 * they would be free to drift away from the data.
 */
const buildInsights = ({ product, totals, mix, funnel, conversion, personas, negotiation, locations, related, abandonment, reviewStats, dataQuality }) => {
  const insights = [];
  const customers = totals.uniqueCustomers;

  const add = (insight) => insights.push(insight);

  if (totals.trackedEvents === 0) {
    add({
      id: "no-behaviour",
      tone: "attention",
      label: "No behavioural data",
      headline: "Nothing has been tracked against this listing yet",
      detail:
        "No interaction events reference this listing, so interest, conversion and persona panels cannot be computed. Listing counters are shown separately and may still carry view data.",
      evidence: [{ label: "Tracked events", value: 0 }],
    });
    return insights;
  }

  if (customers === 0) {
    add({
      id: "no-customers",
      tone: "attention",
      label: "Unattributed activity",
      headline: `${totals.trackedEvents} tracked events are not linked to a customer`,
      detail:
        "The events exist but carry no usable customer id, so they cannot be mapped to personas, locations or conversion. This usually means the listing predates behavioural tracking.",
      evidence: [{ label: "Tracked events", value: totals.trackedEvents }],
    });
  } else {
    const viewEvents = mix.views.events;
    const attention =
      viewEvents >= INSIGHT_THRESHOLDS.attention.strong
        ? { tone: "positive", word: "Strong" }
        : viewEvents >= INSIGHT_THRESHOLDS.attention.moderate
          ? { tone: "positive", word: "Steady" }
          : viewEvents >= INSIGHT_THRESHOLDS.attention.thin
            ? { tone: "neutral", word: "Modest" }
            : { tone: "attention", word: "Very light" };
    add({
      id: "attention",
      tone: attention.tone,
      label: "Attention",
      headline: `${attention.word} view volume (${viewEvents.toLocaleString("en-IN")} tracked views)`,
      detail:
        viewEvents >= INSIGHT_THRESHOLDS.attention.strong
          ? "This listing is being surfaced to customers at a scale worth protecting - price changes and stock decisions here have wide reach."
          : viewEvents >= INSIGHT_THRESHOLDS.attention.moderate
            ? "The listing is consistently reaching customers without being a top-of-market draw."
            : "Few customers are reaching this listing, so any conversion figure is based on a small sample.",
      evidence: [
        { label: "Tracked views", value: viewEvents },
        { label: "Unique viewers", value: mix.views.customers },
        { label: "Sessions", value: totals.sessions },
      ],
    });

    const compareIntent = rate(mix.comparisons.customers, mix.views.customers);
    if (compareIntent.available && mix.views.customers > 0) {
      const strong = compareIntent.isShare && compareIntent.rate >= INSIGHT_THRESHOLDS.intentRate.strong;
      add({
        id: "comparison",
        tone: strong ? "positive" : "neutral",
        label: "Research depth",
        // Wording changes with the relationship between the two sets. "N% of
        // viewers" is only true when comparers are a subset of viewers, and they
        // are not: the compare tray can be used from a results page.
        headline: compareIntent.isShare
          ? `${compareIntent.rate}% of viewers put this listing in a comparison`
          : `${plural(mix.comparisons.customers, "customer")} compared this listing, more than the ${plural(mix.views.customers, "customer")} who opened it`,
        detail: compareIntent.isShare
          ? strong
            ? "Viewers are actively evaluating this item against alternatives rather than browsing passively."
            : "Comparisons are limited, so viewers are mostly treating this listing in isolation."
          : "Comparing is possible without opening a listing, so the compared group is not a subset of the viewers. Treat the two counts as reach, not as a conversion between stages.",
        evidence: [
          { label: "Compared", value: `${mix.comparisons.customers} customers` },
          { label: "Opened", value: `${mix.views.customers} customers` },
          { label: "Compare events", value: mix.comparisons.events },
        ],
      });
    }

    const wishlistIntent = rate(mix.wishlists.customers, mix.views.customers);
    if (wishlistIntent.available && mix.wishlists.customers > 0) {
      add({
        id: "wishlist",
        tone: wishlistIntent.isShare && wishlistIntent.rate >= INSIGHT_THRESHOLDS.intentRate.moderate ? "positive" : "neutral",
        label: "Save intent",
        headline: wishlistIntent.isShare
          ? `${plural(mix.wishlists.customers, "customer")} saved this listing (${wishlistIntent.rate}% of viewers)`
          : `${plural(mix.wishlists.customers, "customer")} saved this listing, more than the ${plural(mix.views.customers, "customer")} who opened it`,
        detail:
          wishlistIntent.isShare && wishlistIntent.rate >= INSIGHT_THRESHOLDS.intentRate.moderate
            ? "A meaningful share of viewers intend to return to this item - a price drop would be expected to convert here."
            : "Interest is mostly passing rather than saved for later.",
        evidence: [
          { label: "Wishlists", value: mix.wishlists.customers },
          { label: "Removed later", value: totals.supportSignals.wishlistRemoves?.events ?? 0 },
        ],
      });
    }
  }

  const purchaseRate = rate(mix.purchases.customers, mix.views.customers);
  if (purchaseRate.available && purchaseRate.isShare && purchaseRate.denominator >= 10) {
    const tone =
      purchaseRate.rate >= INSIGHT_THRESHOLDS.purchaseRate.strong
        ? "positive"
        : purchaseRate.rate >= INSIGHT_THRESHOLDS.purchaseRate.moderate
          ? "neutral"
          : "risk";
    add({
      id: "conversion",
      tone,
      label: "Conversion",
      headline: `${purchaseRate.rate}% of viewers purchased this listing`,
      detail:
        tone === "positive"
          ? "View-to-purchase conversion is strong for this catalogue."
          : tone === "neutral"
            ? "Conversion is in the normal range; the remaining loss sits between cart and checkout."
            : "Attention is not converting into sales. Price, condition or description are the usual suspects at this rate.",
      evidence: [
        { label: "Purchased", value: `${purchaseRate.numerator} of ${purchaseRate.denominator} viewers` },
        { label: "Orders", value: totals.orders.count },
        { label: "Revenue", value: totals.orders.revenue },
      ],
    });
  } else if (purchaseRate.available && !purchaseRate.isShare) {
    // Buyers can complete from a wishlist, a cart or a shared link without ever
    // registering a view, so this set is not a subset either. Saying "120% of
    // viewers bought" would be arithmetically true and completely misleading.
    add({
      id: "conversion-behind-views",
      tone: "neutral",
      label: "Conversion",
      headline: `${plural(mix.purchases.customers, "buyer")} bought this listing who are not counted among its viewers`,
      detail:
        "Purchases can be completed from a saved wishlist, an open cart or a shared link, none of which require opening the listing. A view-to-purchase percentage would exceed 100% here, so the two counts are reported side by side instead.",
      evidence: [
        { label: "Buyers", value: mix.purchases.customers },
        { label: "Viewers", value: mix.views.customers },
        { label: "Orders", value: totals.orders.count },
      ],
    });
  } else if (purchaseRate.denominator > 0 && purchaseRate.denominator < 10) {
    add({
      id: "conversion-small-sample",
      tone: "neutral",
      label: "Conversion",
      headline: `Only ${plural(purchaseRate.denominator, "customer")} ${purchaseRate.denominator === 1 ? "has" : "have"} viewed this listing`,
      detail: "Too small a sample for the conversion rate to mean anything. It is reported for completeness, not as a verdict.",
      evidence: [{ label: "Unique viewers", value: purchaseRate.denominator }],
    });
  }

  const largestDrop = funnel.stages
    .slice(1)
    .map((stage, index) => {
      const previous = funnel.stages[index];
      return {
        from: previous,
        to: stage,
        drop: previous.customers > 0 ? round((1 - stage.customers / previous.customers) * 100, 1) : null,
      };
    })
    // A 100% drop between two customers and zero customers is arithmetic, not a
    // finding. Both stages need a real audience before the gap means anything.
    .filter((step) => step.drop !== null && step.drop > 0 && step.from.customers >= 5)
    .sort((a, b) => b.drop - a.drop)[0];
  if (largestDrop && largestDrop.drop >= 40) {
    add({
      id: "dropoff",
      tone: "attention",
      label: "Largest drop-off",
      headline: `${largestDrop.drop}% of customers stop between "${largestDrop.from.label.toLowerCase()}" and "${largestDrop.to.label.toLowerCase()}"`,
      detail: "This is the step where the most interested customers are lost. It is the first place to look when conversion is disappointing.",
      evidence: [
        { label: largestDrop.from.label, value: `${largestDrop.from.customers} customers` },
        { label: largestDrop.to.label, value: `${largestDrop.to.customers} customers` },
      ],
    });
  }

  if (negotiation.offers.total > 0) {
    const accepted = negotiation.byStatus.accepted?.count || 0;
    const resolved = accepted + (negotiation.byStatus.rejected?.count || 0) + (negotiation.byStatus.expired?.count || 0);
    const acceptance = rate(accepted, resolved);
    add({
      id: "negotiation",
      tone: negotiation.offers.total >= 3 ? "neutral" : "attention",
      label: "Negotiation",
      headline: `${negotiation.offers.total} offer${negotiation.offers.total === 1 ? "" : "s"} from ${negotiation.offers.uniqueBuyers} customer${negotiation.offers.uniqueBuyers === 1 ? "" : "s"}`,
      detail: acceptance.available
        ? `${acceptance.rate}% of resolved offers were accepted. ${
            acceptance.rate < INSIGHT_THRESHOLDS.offerAcceptance.poor
              ? "A low acceptance rate usually means the listed price is above what this audience considers fair."
              : acceptance.rate >= INSIGHT_THRESHOLDS.offerAcceptance.healthy
                ? "Most buyers and the seller are meeting in the middle."
                : "Acceptance is mixed, which is normal while a price is being found."
          }`
        : "No offer has been resolved yet, so an acceptance rate cannot be computed.",
      evidence: [
        { label: "Offers", value: negotiation.offers.total },
        { label: "Accepted", value: accepted },
        { label: "Pending", value: negotiation.byStatus.pending?.count || 0 },
        { label: "Avg first offer", value: inr(negotiation.offers.avgFirstOffer) },
        ...(negotiation.avgResponseMinutes === null
          ? []
          : [{ label: "Avg seller response", value: `${negotiation.avgResponseMinutes} min` }]),
      ],
    });

    if (negotiation.realisedDiscountPercent !== null) {
      add({
        id: "realised-price",
        tone: negotiation.realisedDiscountPercent > 5 ? "attention" : "neutral",
        label: "Realised price",
        headline:
          negotiation.realisedDiscountPercent > 5
            ? `Accepted deals closed ${negotiation.realisedDiscountPercent}% below the price that was listed when they were made`
            : "Accepted deals closed close to the price listed at the time",
        detail:
          negotiation.realisedDiscountPercent > 5
            ? `Buyers who negotiated paid about ${inr(negotiation.acceptedAvgFinalPrice)} on average against an average listed price of ${inr(negotiation.avgListedSnapshot)} at the time. That is the price this audience actually accepts.`
            : "Negotiation is not the main route to a lower price on this listing; the listed price is broadly holding.",
        evidence: [
          { label: "Listed now", value: inr(product.price) },
          { label: "Listed when offered", value: inr(negotiation.avgListedSnapshot) },
          { label: "Accepted average", value: inr(negotiation.acceptedAvgFinalPrice) },
          { label: "Avg rounds", value: negotiation.avgRounds ?? "n/a" },
        ],
      });
    }
  } else if (product.negotiable) {
    add({
      id: "no-offers",
      tone: "neutral",
      label: "Negotiation",
      headline: "This listing is negotiable but has received no offers",
      detail:
        "No offer has been recorded against this listing. Either the listed price is already at what customers will pay, or the negotiation affordance is not being noticed.",
      evidence: [{ label: "Offers", value: 0 }],
    });
  }

  if (abandonment.available && abandonment.cartCustomers > 0) {
    add({
      id: "cart-abandonment",
      tone: abandonment.rate >= INSIGHT_THRESHOLDS.abandonment.leaky ? "risk" : "positive",
      label: "Cart abandonment",
      headline: `${abandonment.abandonedCustomers} of ${abandonment.cartCustomers} customers carted this listing without buying`,
      detail: `An abandonment rate of ${abandonment.rate}% measured from event history, since live carts are cleared at checkout. Price changes at checkout and stock anxiety are the usual causes.`,
      evidence: [
        { label: "Carted", value: `${abandonment.cartCustomers} customers` },
        { label: "Converted", value: abandonment.convertedCustomers },
        { label: "Abandonment", value: `${abandonment.rate}%` },
      ],
    });
  }

  if (personas.available && personas.segments.length) {
    const top = personas.segments[0];
    add({
      id: "persona-mix",
      tone: "neutral",
      label: "Audience",
      headline: `${top.name} is the dominant audience - ${top.customers} of ${personas.mappedCustomers} mapped customers (${top.share}%)`,
      detail:
        personas.segments.length === 1
          ? "Every mapped customer who interacted with this listing falls into a single segment, so the interest is very homogeneous."
          : `Interest is spread across ${personas.segments.length} segments. ${
              personas.segments[1].customers
            } customers sit in the runner-up, ${personas.segments[1].name}.`,
      evidence: personas.segments.slice(0, 3).map((s) => ({ label: s.name, value: `${s.customers} customers` })),
    });
  }

  const knownLocations = locations.filter((row) => row.location !== "Not specified");
  if (knownLocations.length && knownLocations[0].customers >= 3) {
    const top = knownLocations[0];
    add({
      id: "location",
      tone: "neutral",
      label: "Geography",
      headline: `${top.customers} customers viewing this listing are based in ${top.location}`,
      detail:
        knownLocations.length > 1
          ? `Other concentrations: ${knownLocations.slice(1, 4).map((r) => `${r.location} (${r.customers})`).join(", ")}.`
          : "Interest is concentrated in a single city, so local logistics and handover convenience matter more than shipping reach.",
      evidence: knownLocations.slice(0, 4).map((r) => ({ label: r.location, value: `${r.customers} customers` })),
    });
  }

  if (related.length) {
    const top = related[0];
    add({
      id: "co-interest",
      tone: "neutral",
      label: "Co-interest",
      headline: `${top.sharedCustomers} customers who engaged with this listing also engaged with "${top.title}"`,
      detail: "Customers browse in sets. Cross-listing these with comparable stock, or bundling them, matches how the interest actually arrives.",
      evidence: related.slice(0, 3).map((r) => ({ label: r.title, value: `${r.sharedCustomers} shared customers` })),
    });
  }

  if (reviewStats.reviews > 0) {
    add({
      id: "trust",
      tone: reviewStats.avgRating >= 4 ? "positive" : reviewStats.avgRating >= 3 ? "neutral" : "risk",
      label: "Trust",
      headline: `${reviewStats.reviews} review${reviewStats.reviews === 1 ? "" : "s"} averaging ${reviewStats.avgRating} out of 5`,
      detail:
        totals.supportSignals.reviewViews?.events > 0
          ? `${totals.supportSignals.reviewViews.events} customers opened the reviews on this listing, so reputation is being read before a decision is made.`
          : "Review content is rarely read on this listing, so it is not currently influencing the decision.",
      evidence: [
        { label: "Average rating", value: reviewStats.avgRating },
        { label: "Review reads", value: totals.supportSignals.reviewViews?.events ?? 0 },
        { label: "Listing rating", value: product.rating },
      ],
    });
  }

  if (dataQuality.counterMismatches.length) {
    add({
      id: "counter-drift",
      tone: "attention",
      label: "Data quality",
      headline: `${dataQuality.counterMismatches.length} stored listing counter${dataQuality.counterMismatches.length === 1 ? "" : "s"} disagree with tracked events`,
      detail:
        "This page reports tracked events. The stored counters are maintained by a different code path and have drifted, so any report built on the listing counters will understate interest.",
      evidence: dataQuality.counterMismatches.map((m) => ({ label: m.label, value: `listing ${m.listing} vs ${m.events} tracked` })),
    });
  }

  return insights;
};

/**
 * Full intelligence payload for one listing.
 *
 * @param {string} productId
 * @returns {Promise<object|null>} null when the id is malformed or the listing does
 *   not exist, so the controller can answer 400 and 404 respectively.
 */
export const getProductIntelligenceDetail = async (productId) => {
  // Guarded here as well as in the controller: this function is exported, and an
  // unvalidated id would otherwise surface as a raw CastError from deep inside
  // mongoose rather than as a "not found".
  if (!mongoose.isValidObjectId(productId)) return null;

  const product = await Product.findById(productId).lean();
  if (!product) return null;

  const productObjectId = product._id;
  const sellerId = product.seller;

  const [signals, locations, categoryAttraction, productOffers, productOrders, productReviews, sellerListings, sellerOrders, sellerReviews, sellerOffers] =
    await Promise.all([
      aggregateProductSignals(productObjectId),
      aggregateCustomerLocations(productObjectId),
      getCategoryAttraction().catch(() => []),
      aggregateProductOffers(productObjectId),
      aggregateProductOrders(productObjectId),
      Review.aggregate([
        { $match: { productId: productObjectId } },
        { $group: { _id: null, reviews: { $sum: 1 }, avgRating: { $avg: "$rating" } } },
      ]),
      Product.aggregate([
        { $match: { seller: sellerId } },
        { $group: { _id: "$status", listings: { $sum: 1 } } },
      ]),
      Order.aggregate([
        { $match: { sellerId } },
        {
          $group: {
            _id: null,
            orders: { $sum: 1 },
            revenue: { $sum: "$finalPrice" },
            customers: { $addToSet: "$buyerId" },
          },
        },
      ]),
      Review.aggregate([{ $match: { sellerId } }, { $group: { _id: null, reviews: { $sum: 1 }, avgRating: { $avg: "$rating" } } }]),
      Offer.aggregate([
        { $match: { sellerId } },
        { $group: { _id: "$status", count: { $sum: 1 }, responseTimes: { $push: "$sellerResponseTime" } } },
      ]),
    ]);

  /* ---- reshape the one grouped pass into per-event totals and customer sets ---- */
  const counts = new Map();
  const byEventUser = [];
  const customerEventCounts = new Map();
  const customerSessions = new Map();
  const allCustomers = new Set();
  const allSessions = new Set();
  let firstEventAt = null;
  let lastEventAt = null;
  let trackedEvents = 0;

  for (const row of signals) {
    const eventType = row._id.eventType;
    const userId = String(row._id.userId);
    const entry = counts.get(eventType) || { events: 0, customers: 0, sessions: 0, firstAt: null, lastAt: null };
    entry.events += row.events;
    entry.customers += 1;
    entry.sessions += (row.sessions || []).length;
    entry.firstAt = entry.firstAt && entry.firstAt < row.firstAt ? entry.firstAt : row.firstAt;
    entry.lastAt = entry.lastAt && entry.lastAt > row.lastAt ? entry.lastAt : row.lastAt;
    counts.set(eventType, entry);

    byEventUser.push({ userId, eventType, events: row.events, firstAt: row.firstAt });
    customerEventCounts.set(userId, (customerEventCounts.get(userId) || 0) + row.events);
    for (const sessionId of row.sessions || []) {
      customerSessions.set(userId, (customerSessions.get(userId) || 0) + 1);
      allSessions.add(sessionId);
    }
    allCustomers.add(userId);
    trackedEvents += row.events;
    if (!firstEventAt || row.firstAt < firstEventAt) firstEventAt = row.firstAt;
    if (!lastEventAt || row.lastAt > lastEventAt) lastEventAt = row.lastAt;
  }

  const countFor = (eventType) => counts.get(eventType) || { events: 0, customers: 0, sessions: 0 };

  /* ---- interaction mix: same events, two honest denominators ---- */
  const mixSignals = MIX_SIGNALS.map((signal) => {
    const row = countFor(signal.event);
    return { key: signal.key, label: signal.label, event: signal.event, color: signal.color, events: row.events, customers: row.customers };
  });
  const mixTotalEvents = mixSignals.reduce((sum, s) => sum + s.events, 0);
  const mixTotalCustomers = mixSignals.reduce((sum, s) => sum + s.customers, 0);
  for (const signal of mixSignals) {
    signal.eventShare = mixTotalEvents > 0 ? round((signal.events / mixTotalEvents) * 100, 1) : null;
    signal.customerShare = mixTotalCustomers > 0 ? round((signal.customers / mixTotalCustomers) * 100, 1) : null;
  }

  /* Keyed once and reused: the insight rules and the limitations list both need
     to reach signals by name, and two different lookups over the same array are
     two chances to disagree about what a listing's view count is. */
  const mix = Object.fromEntries(mixSignals.map((s) => [s.key, s]));

  const supportSignals = {};
  for (const signal of SUPPORT_SIGNALS) {
    const row = countFor(signal.event);
    supportSignals[signal.key] = { label: signal.label, event: signal.event, events: row.events, customers: row.customers };
  }

  /* ---- funnel ---- */
  const stages = FUNNEL_STAGES.map((stage, index) => {
    const row = countFor(stage.event);
    const previous = index > 0 ? countFor(FUNNEL_STAGES[index - 1].event) : null;
    return {
      key: stage.key,
      label: stage.label,
      event: stage.event,
      events: row.events,
      customers: row.customers,
      orderedCustomers: previous ? countOrderedPairs(byEventUser, FUNNEL_STAGES[index - 1].event, stage.event) : null,
      eventStepRate: previous && previous.events > 0 ? round((row.events / previous.events) * 100, 1) : null,
      customerStepRate: previous && previous.customers > 0 ? round((row.customers / previous.customers) * 100, 1) : null,
    };
  });
  const funnelCounts = stages.map((s) => s.customers);
  const funnelMonotonic = funnelCounts.every((value, index) => index === 0 || value <= funnelCounts[index - 1]);

  /* ---- conversion, all customer-level ---- */
  const sets = {};
  for (const stage of FUNNEL_STAGES) sets[stage.event] = customerSetFor(stage.event, byEventUser);

  const conversion = CONVERSION_STEPS.map((step) => {
    const from = sets[step.from] || new Set();
    const to = sets[step.to] || new Set();
    const both = intersect(from, to);
    const ordered = countOrderedPairs(byEventUser, step.from, step.to);
    const computed = rate(both.size, from.size);
    return {
      key: step.key,
      label: step.label,
      definition: step.definition,
      ...computed,
      orderedCustomers: ordered,
      /* The numerator here is an intersection, so it can never exceed the
         denominator and `isShare` is structurally true - the "not a share" wording
         in buildInsights exists for the *reach* ratios, which do compare two
         non-nested groups. The note that matters for these is the ordering one. */
      note: ordered < computed.numerator ? `${computed.numerator - ordered} of these customers did the later action before the earlier one` : null,
    };
  });

  /* ---- cart abandonment for this listing, and the marketplace league table ---- */
  const cartSet = sets.CART_ADD || new Set();
  const purchaseSet = sets.PURCHASE || new Set();
  const cartAndPurchase = intersect(cartSet, purchaseSet);
  const abandonmentRate = cartSet.size > 0 ? round(((cartSet.size - cartAndPurchase.size) / cartSet.size) * 100, 1) : null;
  const abandonment = {
    available: cartSet.size > 0,
    cartCustomers: cartSet.size,
    cartAdds: countFor("CART_ADD").events,
    purchasedCustomers: purchaseSet.size,
    convertedCustomers: cartAndPurchase.size,
    abandonedCustomers: cartSet.size - cartAndPurchase.size,
    rate: abandonmentRate,
    basis: "BehaviourEvent history (CART_ADD vs PURCHASE), because live carts are deleted at checkout.",
  };

  /* BehaviourEvent.productId is stored as an ObjectId, so the interacting customers
     have to be re-typed before they can be matched back in a $in - one malformed
     legacy id would otherwise invalidate the whole pipeline. */
  const customerObjectIds = [...allCustomers]
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  const [leaders, related, personas] = await Promise.all([
    aggregateCartAbandonmentLeaders(),
    customerObjectIds.length > 1
      ? aggregateRelatedProducts(productObjectId, customerObjectIds).catch(() => [])
      : Promise.resolve([]),
    resolvePersonaMix(allCustomers, { events: customerEventCounts }),
  ]);

  /* ---- orders, revenue ---- */
  const orderRows = productOrders;
  const orders = {
    count: orderRows.reduce((sum, r) => sum + r.count, 0),
    revenue: round(orderRows.reduce((sum, r) => sum + (r.revenue || 0), 0), 0),
    uniqueBuyers: new Set(orderRows.flatMap((r) => (r.buyers || []).map(String))).size,
    byStatus: Object.fromEntries(
      orderRows.map((r) => [
        r._id,
        {
          count: r.count,
          revenue: round(r.revenue || 0, 0),
          avgFinalPrice: round(r.avgFinalPrice, 0),
          avgDiscountPercent: round(r.avgDiscountPercent, 1),
          avgDecisionMinutes: round(r.avgDecisionMinutes, 1),
        },
      ])
    ),
  };

  /* ---- negotiation ---- */
  const offerRows = productOffers;
  const offerTotal = offerRows.reduce((sum, r) => sum + r.count, 0);
  const byStatus = {};
  let allFirstOffers = [];
  let allListedPrices = [];
  let responseTimes = [];
  for (const row of offerRows) {
    byStatus[row._id] = {
      count: row.count,
      avgFirstOffer: round(row.avgFirstOffer, 0),
      avgCounter: round(row.avgCounter, 0),
      avgRounds: round(row.avgRounds, 1),
      avgResponseMinutes: round(row.avgResponseMinutes, 1),
    };
    allFirstOffers = allFirstOffers.concat((row.firstOffers || []).filter((v) => typeof v === "number"));
    allListedPrices = allListedPrices.concat((row.listedPrices || []).filter((v) => typeof v === "number"));
    // `sellerResponseTime` is only written when a seller actually answers, and it
    // defaults to 0. Seeded and imported offers therefore carry 0 as "never
    // recorded", which is indistinguishable from a genuine instant reply unless it
    // is filtered out here. Averaging it in would report a seller responding in
    // zero minutes on every offer, which is worse than reporting nothing.
    responseTimes = responseTimes.concat(
      (row.responseTimes || []).filter((v) => typeof v === "number" && v > 0)
    );
  }
  const acceptedRow = offerRows.find((r) => r._id === "accepted");
  const acceptedFinals = (acceptedRow?.finalPrices || []).filter((v) => typeof v === "number");
  const acceptedListed = (acceptedRow?.listedPrices || []).filter((v) => typeof v === "number");
  const avgFirst = allFirstOffers.length ? round(allFirstOffers.reduce((a, b) => a + b, 0) / allFirstOffers.length, 0) : null;
  const minFirst = allFirstOffers.length ? round(Math.min(...allFirstOffers), 0) : null;
  const maxFirst = allFirstOffers.length ? round(Math.max(...allFirstOffers), 0) : null;
  const avgListedSnapshot = allListedPrices.length ? round(allListedPrices.reduce((a, b) => a + b, 0) / allListedPrices.length, 0) : null;
  const acceptedAvgFinalPrice = acceptedFinals.length ? round(acceptedFinals.reduce((a, b) => a + b, 0) / acceptedFinals.length, 0) : null;
  const realisedDiscountPercent =
    acceptedAvgFinalPrice !== null && avgListedSnapshot !== null && avgListedSnapshot > 0
      ? round(((avgListedSnapshot - acceptedAvgFinalPrice) / avgListedSnapshot) * 100, 1)
      : null;

  const negotiation = {
    offers: {
      total: offerTotal,
      uniqueBuyers: new Set(offerRows.flatMap((r) => (r.buyers || []).map(String))).size,
      avgFirstOffer: avgFirst,
      lowestOffer: minFirst,
      highestOffer: maxFirst,
    },
    byStatus,
    acceptedAvgFinalPrice,
    realisedDiscountPercent,
    avgListedSnapshot,
    avgRounds: acceptedRow ? round(acceptedRow.avgRounds, 1) : null,
    avgResponseMinutes: responseTimes.length ? round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length, 1) : null,
    responsesRecorded: responseTimes.length,
    responsesMissing: offerTotal - responseTimes.length,
    counterOfferEvents: countFor("COUNTER_OFFER").events,
    note: "Offer prices are snapshotted when the offer is sent, so a discount here can reflect a price that has since changed. Seller response time is only recorded when a seller answers an offer, so a listing with unanswered offers reports no average rather than zero.",
  };

  /* ---- location ---- */
  const locationRows = locations.map((row) => ({
    location: row._id ? titleCase(row._id) : "Not specified",
    customers: row.customers,
    events: row.events,
  }));
  const locatedCustomers = locationRows.reduce((sum, r) => sum + r.customers, 0);
  const knownLocationRows = locationRows.filter((r) => r.location !== "Not specified");
  for (const row of locationRows) {
    row.share = allCustomers.size > 0 ? round((row.customers / allCustomers.size) * 100, 1) : null;
  }
  const location = {
    rows: locationRows,
    knownRows: knownLocationRows,
    topKnown: knownLocationRows[0] || null,
    locatedCustomers,
    missingLocationCustomers: allCustomers.size - locatedCustomers,
    basis: "Aggregated inside MongoDB from the interacting customers' saved location. No customer identity is returned.",
  };

  /* ---- category interest, reusing the platform's own attraction model ---- */
  const categoryRows = categoryAttraction;
  const categoryRank = categoryRows.findIndex((row) => row.category === product.categoryName);
  const ownRow = categoryRank >= 0 ? categoryRows[categoryRank] : null;
  const categoryViews = ownRow ? ownRow.counts.productViews + ownRow.counts.categoryViews : 0;
  const ownEventShare = categoryViews > 0 ? round((countFor("PRODUCT_VIEW").events / categoryViews) * 100, 1) : null;
  const categoryInterest = {
    category: product.categoryName,
    rank: categoryRank >= 0 ? categoryRank + 1 : null,
    totalCategories: categoryRows.length,
    attractionScore: ownRow?.attractionScore ?? null,
    listings: ownRow?.listings ?? null,
    demandPerListing: ownRow?.demandPerListing ?? null,
    conversionRate: ownRow?.conversionRate ?? null,
    categoryCustomers: ownRow?.customers ?? null,
    categoryViews,
    thisListingViewShare: ownEventShare,
    rows: categoryRows.map((row) => ({
      category: row.category,
      attractionScore: row.attractionScore,
      listings: row.listings,
      customers: row.customers,
      demandPerListing: row.demandPerListing,
      conversionRate: row.conversionRate,
      isThisListing: row.category === product.categoryName,
    })),
    basis: "Category demand is the shared weighted-interest model from services/categoryAttraction.js, not a count of listings.",
  };

  /* ---- seller trust signals ---- */
  const listingsByStatus = Object.fromEntries(sellerListings.map((r) => [r._id, r.listings]));
  const sellerListingTotal = sellerListings.reduce((sum, r) => sum + r.listings, 0);
  const sellerOrdersRow = sellerOrders[0];
  const sellerOfferCounts = Object.fromEntries(sellerOffers.map((r) => [r._id, r.count]));
  const sellerOfferTotal = sellerOffers.reduce((sum, r) => sum + r.count, 0);
  const sellerResponseTimes = sellerOffers
    .flatMap((r) => r.responseTimes || [])
    .filter((v) => typeof v === "number" && v > 0);

  const seller = await User.findById(sellerId, "name isVerifiedSeller sellerRating sellerRatingCount rating ratingCount location createdAt").lean();

  const sellerSignals = {
    name: product.sellerName || seller?.name || "Unknown seller",
    isVerified: Boolean(seller?.isVerifiedSeller),
    sellerRating: round(seller?.sellerRating ?? null, 1),
    sellerRatingCount: seller?.sellerRatingCount ?? 0,
    averageRating: round(seller?.rating ?? null, 1),
    ratingCount: seller?.ratingCount ?? 0,
    memberSince: seller?.createdAt || null,
    listings: {
      total: sellerListingTotal,
      byStatus: listingsByStatus,
      live: listingsByStatus.available || 0,
    },
    sales: {
      orders: sellerOrdersRow?.orders ?? 0,
      revenue: round(sellerOrdersRow?.revenue ?? 0, 0),
      uniqueBuyers: new Set((sellerOrdersRow?.customers || []).map(String)).size,
    },
    reviews: {
      count: sellerReviews[0]?.reviews ?? 0,
      avgRating: round(sellerReviews[0]?.avgRating, 1),
    },
    offers: {
      total: sellerOfferTotal,
      accepted: sellerOfferCounts.accepted || 0,
      byStatus: sellerOfferCounts,
      avgResponseMinutes: sellerResponseTimes.length
        ? round(sellerResponseTimes.reduce((a, b) => a + b, 0) / sellerResponseTimes.length, 1)
        : null,
      responsesRecorded: sellerResponseTimes.length,
    },
    engagementOnThisListing: {
      sellerProfileViews: countFor("SELLER_PROFILE_VIEW").customers,
      chats: countFor("CHAT_STARTED").customers,
      reviewReads: countFor("REVIEW_VIEW").customers,
    },
  };

  /* ---- listing counters vs tracked events ---- */
  const counterMismatches = [];
  const counterComparison = COUNTER_PAIRS.map((pair) => {
    const listing = product[pair.field] ?? 0;
    const events = countFor(pair.event).events;
    // A 20% tolerance absorbs ordinary double-counting and async lag without
    // hiding the systematic under-reporting that a never-backfilled counter has.
    const tolerance = Math.max(3, events * 0.2);
    const mismatch = Math.abs(listing - events) > tolerance;
    const row = { label: pair.label, field: pair.field, listing, events, mismatch };
    if (mismatch) counterMismatches.push(row);
    return row;
  });

  const dataQuality = {
    trackedEvents,
    trackedCustomers: allCustomers.size,
    firstEventAt,
    lastEventAt,
    daysTracked: firstEventAt && lastEventAt ? daysBetween(new Date(firstEventAt), new Date(lastEventAt)) : 0,
    sessions: allSessions.size,
    avgEventsPerCustomer: allCustomers.size > 0 ? round(trackedEvents / allCustomers.size, 1) : null,
    counterMismatches,
    counterComparison,
    note: "Counters live on the listing document and are maintained separately from the event log. Tracked events are used for every metric on this page.",
  };

  const totals = {
    trackedEvents,
    uniqueCustomers: allCustomers.size,
    sessions: allSessions.size,
    eventsPerCustomer: dataQuality.avgEventsPerCustomer,
    firstEventAt,
    lastEventAt,
    daysTracked: dataQuality.daysTracked,
    orders,
    supportSignals,
  };

  const reviewStats = {
    reviews: productReviews[0]?.reviews ?? 0,
    avgRating: round(productReviews[0]?.avgRating, 1),
  };

  const insights = buildInsights({
    product,
    totals,
    mix,
    funnel: { stages, monotonic: funnelMonotonic },
    conversion,
    personas,
    negotiation,
    locations: locationRows,
    related,
    abandonment,
    reviewStats,
    dataQuality,
  });

  const limitations = [];
  if (trackedEvents === 0) {
    limitations.push("No interaction events reference this listing, so every behaviour-based panel is empty.");
  }
  if (personas.available && personas.unassignedCustomers > 0) {
    limitations.push(
      `${personas.unassignedCustomers} of ${personas.totalCustomers} interacting customers are unassigned in the latest segmentation run (outliers are labelled -1 and are not assigned to a persona).`
    );
  } else if (!personas.available) {
    limitations.push(personas.note);
  }
  if (location.missingLocationCustomers > 0) {
    limitations.push(`${location.missingLocationCustomers} interacting customers have no location on file, so they appear as "Not specified".`);
  }
  if (counterMismatches.length) {
    limitations.push("Stored listing counters disagree with the event log; see the data-quality comparison. This page uses the event log.");
  }
  if (cartSet.size === 0 && trackedEvents > 0) {
    limitations.push("No customer has added this listing to a cart, so cart abandonment cannot be computed for it.");
  }
  /* Reach ratios - compared-vs-viewed, bought-vs-viewed - are not intersections,
     so those groups can be non-nested. The affected insights are worded as counts
     rather than percentages; this records the fact for anyone reading the raw
     numbers on the panels. */
  const reachRatios = [
    { label: "compared vs viewed", compared: mix.comparisons.customers, viewed: mix.views.customers },
    { label: "wishlisted vs viewed", compared: mix.wishlists.customers, viewed: mix.views.customers },
    { label: "purchased vs viewed", compared: mix.purchases.customers, viewed: mix.views.customers },
  ].filter((r) => r.compared > r.viewed);
  if (reachRatios.length) {
    limitations.push(
      `${reachRatios
        .map((r) => `${r.label} (${r.compared} vs ${r.viewed})`)
        .join(", ")}: the later action can happen without opening the listing, so these groups are not nested and a percentage between them would exceed 100%.`
    );
  }
  limitations.push(
    "Search and category-browsing events are not scoped to a listing, so they cannot be attributed to this product and are excluded from every panel here."
  );
  limitations.push("Live cart state is deleted at checkout, so abandonment is inferred from event history, not from open carts.");

  return {
    product: {
      id: String(product._id),
      title: product.title,
      categoryName: product.categoryName,
      brand: product.brand,
      price: product.price,
      originalPrice: product.originalPrice,
      condition: product.condition,
      location: product.location,
      status: product.status,
      negotiable: product.negotiable,
      exchangeable: product.exchangeable,
      image: (product.images || [])[0] || null,
      images: product.images || [],
      sellerName: product.sellerName || seller?.name || "Unknown seller",
      rating: product.rating,
      reviewCount: product.reviewCount,
      isVerified: product.isVerified,
      isFeatured: product.isFeatured,
      createdAt: product.createdAt,
      ageDays: product.createdAt ? daysBetween(new Date(product.createdAt), new Date()) : null,
      counters: Object.fromEntries(COUNTER_PAIRS.map((pair) => [pair.field, product[pair.field] ?? 0])),
    },
    overview: {
      tracked: {
        views: countFor("PRODUCT_VIEW").events,
        comparisons: countFor("PRODUCT_COMPARE").events,
        wishlists: countFor("WISHLIST_ADD").events,
        cartAdds: countFor("CART_ADD").events,
        offers: countFor("OFFER_SENT").events,
        purchases: countFor("PURCHASE").events,
        priceWatches: countFor("PRICE_WATCH").events,
        chats: countFor("CHAT_STARTED").events,
        reviewViews: countFor("REVIEW_VIEW").events,
        sellerViews: countFor("SELLER_PROFILE_VIEW").events,
        checkouts: countFor("CHECKOUT_START").events,
        returns: countFor("PRODUCT_RETURN").events,
        exchanges: countFor("EXCHANGE_REQUEST").events,
      },
      uniqueCustomers: allCustomers.size,
      sessions: allSessions.size,
      orders: orders.count,
      revenue: orders.revenue,
      uniqueBuyers: orders.uniqueBuyers,
      reviews: reviewStats.reviews,
      avgRating: reviewStats.avgRating,
      conversion: rate(countFor("PURCHASE").events, countFor("PRODUCT_VIEW").events),
      hasEnoughData: trackedEvents > 0,
    },
    interactionMix: {
      signals: mixSignals,
      totalEvents: mixTotalEvents,
      totalCustomerActions: mixTotalCustomers,
      otherEvents: Math.max(0, trackedEvents - mixTotalEvents),
      support: Object.values(supportSignals),
      basis: "Event volume counts every recorded action. Unique-customer mode counts each customer once per signal, which is the honest measure of reach.",
    },
    funnel: {
      stages,
      monotonic: funnelMonotonic,
      basis: "Customers are distinct per stage. Ordered customers are those whose first action at a stage happened after their first action at the previous stage, so a customer who bought before wishing is not counted as a progression. A marketplace funnel is not strictly monotonic: customers can offer without carting, so stage counts are not forced into a decreasing shape.",
    },
    conversion: {
      metrics: conversion,
      note: "Every rate is a customer-level intersection. Numerator and denominator are returned so each figure can be checked.",
    },
    cartAbandonment: {
      ...abandonment,
      marketplaceLeaders: leaders.filter((row) => String(row.productId) !== String(productObjectId)).slice(0, 6),
      note: "Ranked by customers who added the listing to a cart and never purchased it, across all time. Low-sample listings are excluded so one abandoned cart cannot top the table.",
    },
    personas,
    categoryInterest,
    negotiation,
    location,
    sellerSignals,
    relatedProducts: related.slice(0, 6).map((row) => ({
      ...row,
      price: row.price,
      share: allCustomers.size > 0 ? round((row.sharedCustomers / allCustomers.size) * 100, 1) : null,
    })),
    dataQuality,
    insights,
    limitations: limitations.filter(Boolean),
    generatedAt: new Date(),
  };
};

export default getProductIntelligenceDetail;
