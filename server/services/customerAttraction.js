/**
 * Customer-specific attraction: which products and categories is *one* customer
 * drawn to?
 *
 * ## Why this is a weighted sum and not a click count
 *
 * The obvious implementation - "group the customer's events by category, count
 * them, draw a pie" - is wrong in a way that is hard to see. A customer who
 * browsed forty things and bought one of them produces almost the same bar
 * length for "browsing" as for "buying", so the chart ranks them as a browser
 * when the recorded evidence says they were a buyer. It also means the pie
 * changes shape every time someone opens a product page, which makes the
 * strongest signal in the system the noisiest one in the chart.
 *
 * So attraction is *weighted interaction*: every event contributes its weight,
 * and the weights are the marketplace's existing intent ladder. A view is worth
 * 1, adding to cart is worth 4, completing checkout is worth 5, and actually
 * purchasing is worth 8. That table is not invented here - it is
 * `CATEGORY_WEIGHTS` from `clusterFeatures.js`, the same one the clustering
 * pipeline consumes, imported so there is exactly one definition of what an
 * interaction is worth.
 *
 * ## The extension, and why it is not folded into the shared table
 *
 * The shared table predates a few tracked signals. Offers in particular are a
 * strong, explicit statement of intent, and leaving them out would rank a
 * customer who made five offers below one who merely browsed. The extra weights
 * below extend the ladder for signals the ML feature vector does not model.
 * They are declared *here* rather than added to `CATEGORY_WEIGHTS` because that
 * object is part of a fixed-width feature contract with the ML service
 * (`ml-service/app/clustering/feature_schema.py`); widening it would change the
 * feature matrix the existing clustering runs were trained against. The full
 * table is returned in the API payload and printed in the admin UI, so the
 * weighting is never a hidden number.
 *
 * ## Signals deliberately excluded
 *
 * Not every recorded event is evidence of attraction, and counting them would
 * make the chart lie:
 *
 *  - `SESSION_START`, `SESSION_END`, `LOGIN`, `LOGOUT`, `REGISTER` are session
 *    and account plumbing. They carry no category and no intent.
 *  - `WISHLIST_REMOVE`, `CART_REMOVE`, `OFFER_REJECTED` are *reversals*. Folding
 *    them in as negative weight would be a different and more defensible model,
 *    but it is a different model, so they are excluded rather than approximated.
 *  - `SELL_LISTING` is a seller action, not something a buyer is drawn to.
 *  - `PRODUCT_RETURN`, `EXCHANGE_REQUEST`, `PURCHASE_REASON` are post-purchase
 *    service events. They describe a completed sale, not an attraction to a
 *    category.
 *
 * ## Category resolution
 *
 * `BehaviorEvent.category` is the category as the emitting page knew it, and it
 * is empty on events fired outside a product or category context. Where it is
 * empty but the event references a product, the product's own `categoryName` is
 * used, because the listing is the authority on what it is. Events that resolve
 * to no category at all are dropped and counted in `totals.uncategorised` so the
 * admin can see that they were considered rather than silently lost.
 */
import mongoose from "mongoose";
import { BehaviorEvent, User } from "../models/index.js";
import { CATEGORY_WEIGHTS } from "./clusterFeatures.js";

/**
 * The established ladder, plus the signals it does not model.
 * Ordered weakest to strongest so the intent progression is readable in source.
 */
export const ATTRACTION_WEIGHTS = {
  // --- established CATEGORY_WEIGHTS, reused verbatim ---
  PRODUCT_VIEW: CATEGORY_WEIGHTS.PRODUCT_VIEW,
  CATEGORY_VIEW: CATEGORY_WEIGHTS.CATEGORY_VIEW,
  REVIEW_VIEW: CATEGORY_WEIGHTS.REVIEW_VIEW,
  CART_VIEW: CATEGORY_WEIGHTS.CART_VIEW,
  PRODUCT_COMPARE: CATEGORY_WEIGHTS.PRODUCT_COMPARE,
  WISHLIST_ADD: CATEGORY_WEIGHTS.WISHLIST_ADD,
  PRICE_WATCH: CATEGORY_WEIGHTS.PRICE_WATCH,
  CART_ADD: CATEGORY_WEIGHTS.CART_ADD,
  CHECKOUT_START: CATEGORY_WEIGHTS.CHECKOUT_START,
  PURCHASE: CATEGORY_WEIGHTS.PURCHASE,
  // --- extension: intent signals the ML feature vector does not model ---
  SEARCH: 2, // explicit query, comparable to browsing a category
  SELLER_PROFILE_VIEW: 2, // checking a vendor, adjacent to reading reviews
  COMPARE_SELECTED: 3, // shortlisted for comparison
  CHAT_STARTED: 3, // opened a conversation about the listing
  OFFER_SENT: 4, // named a price, same tier as adding to cart
  OFFER_ACCEPTED: 6, // deal closed, short of a completed purchase
};

export const ATTRACTION_EVENT_TYPES = Object.keys(ATTRACTION_WEIGHTS);

/** Product drill-down ceiling; anything past this is folded into "Other". */
const PRODUCT_SLICE_LIMIT = 8;

const count = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const round = (value, places = 2) => {
  const f = 10 ** places;
  return Math.round((Number(value) || 0) * f) / f;
};

/**
 * Resolve the category for an event: the event's own category wins, otherwise
 * the referenced product's categoryName, otherwise nothing.
 *
 * Written without `$size` or `$trim`, both of which reject the argument forms
 * used here on older MongoDB 4.x servers - the event log has to be groupable on
 * the oldest engine the project still supports. `$ne` against both `null` and
 * `""` is the portable way to ask "does this event carry a category".
 *
 * Kept as a shared `$addFields` stage so the category and product passes
 * classify every event identically - two definitions of "the category of this
 * event" would be two chances to disagree.
 */
const RESOLVE_CATEGORY = {
  $addFields: {
    resolvedCategory: {
      $cond: [
        { $and: [{ $ne: ["$category", null] }, { $ne: ["$category", ""] }] },
        "$category",
        { $ifNull: [{ $arrayElemAt: ["$product.categoryName", 0] }, ""] },
      ],
    },
  },
};

/** Guard for "resolved to a real, non-empty string category". */
const HAS_CATEGORY = { resolvedCategory: { $type: "string", $ne: "" } };

const LOOKUP_PRODUCT = {
  $lookup: {
    from: "products",
    localField: "productId",
    foreignField: "_id",
    as: "product",
  },
};

/**
 * Turn `(key, eventType) -> count` rows into scored, percentage-bearing slices.
 * Scoring happens here rather than in the pipeline so the weight table stays the
 * only place a weight is defined, and so the arithmetic is inspectable.
 */
const buildSlices = (rows, { getKey, getName, getCategory }) => {
  const merged = new Map();

  for (const row of rows) {
    // Both pipelines group by `{ ...fields, eventType }`, so the event type
    // arrives nested under `_id` alongside the grouping key.
    const eventType = row._id.eventType;
    const key = getKey(row);
    if (!key) continue;
    let slice = merged.get(key);
    if (!slice) {
      slice = { key, name: getName(row), category: getCategory(row), interactions: 0, score: 0, breakdown: {} };
      merged.set(key, slice);
    }
    const n = count(row.n);
    const weight = ATTRACTION_WEIGHTS[eventType] || 0;
    slice.interactions += n;
    slice.score += n * weight;
    slice.breakdown[eventType] = (slice.breakdown[eventType] || 0) + n;
  }

  const slices = [...merged.values()].filter((s) => s.score > 0);

  // Percentages are assigned by the caller, because the denominator differs: the
  // category donut partitions one customer across a handful of slices and should
  // read 100%, while the product list is a top-N ranking against the customer's
  // entire product history and deliberately does not.
  return slices
    .map((s) => ({ ...s, score: round(s.score) }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
};

/**
 * Largest-remainder rounding: turn exact shares into whole numbers of percent
 * that add up to exactly 100.
 *
 * A pie labelled with independently rounded percentages reads as broken the
 * moment the numbers do not sum to 100 ("17.8 + 17.2 + 16.1 ... = 100.01"), and
 * the admin has no way to tell that is the rounding rather than the data. Each
 * slice takes the floor of its share, and the leftover percent is handed out one
 * at a time to whichever slices lost the most in the floor.
 */
const percentagesSummingTo100 = (slices, totalScore) => {
  if (totalScore <= 0 || !slices.length) return slices.map(() => 0);

  const exact = slices.map((s) => (s.score / totalScore) * 100);
  const floored = exact.map(Math.floor);
  let leftover = 100 - floored.reduce((a, b) => a + b, 0);

  const byRemainder = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder);

  for (const { index } of byRemainder) {
    if (leftover <= 0) break;
    floored[index] += 1;
    leftover -= 1;
  }

  return floored;
};

/**
 * Attraction for one customer.
 *
 * @param {string} userId
 * @returns {Promise<object|null>} null when the customer does not exist.
 */
export const getCustomerAttraction = async (userId) => {
  if (!mongoose.isValidObjectId(userId)) return null;

  const customer = await User.findById(userId).select("name email role location createdAt").lean();
  if (!customer) return null;

  // The ObjectId cast is load-bearing, not decoration. `BehaviorEvent.userId` is
  // stored as an ObjectId, and Mongoose casts the string for `find()` and
  // `countDocuments()` but *not* inside an aggregation pipeline - a string
  // `$match` on an ObjectId field matches nothing and returns an empty chart
  // with no error to explain it.
  const match = { userId: new mongoose.Types.ObjectId(userId), eventType: { $in: ATTRACTION_EVENT_TYPES } };

  // One pass over the customer's own events serves both the category chart and
  // the product drill-down: the two differ only in the grouping key, and the
  // event log is the largest collection in the database. The existing
  // `{ userId, eventType }` index serves this match directly.
  const byCategoryAndType = await BehaviorEvent.aggregate([
    { $match: match },
    LOOKUP_PRODUCT,
    RESOLVE_CATEGORY,
    { $match: HAS_CATEGORY },
    { $group: { _id: { category: "$resolvedCategory", eventType: "$eventType" }, n: { $sum: 1 } } },
  ]);

  const byProductAndType = await BehaviorEvent.aggregate([
    { $match: { ...match, productId: { $ne: null } } },
    LOOKUP_PRODUCT,
    RESOLVE_CATEGORY,
    // Excludes events whose listing has since been deleted, so a removed product
    // does not linger in the drill-down as an untitled slice. Expressed as
    // `$size` rather than the terser `"product.0": { $ne: null }`, which matches
    // nothing against a `$lookup` result on this server.
    { $match: { $expr: { $gt: [{ $size: "$product" }, 0] }, ...HAS_CATEGORY } },
    {
      $group: {
        _id: {
          productId: "$productId",
          title: { $arrayElemAt: ["$product.title", 0] },
          category: "$resolvedCategory",
          eventType: "$eventType",
        },
        n: { $sum: 1 },
      },
    },
  ]);

  // Uncategorised tally, so a category that only ever fired without a category
  // still shows up in the totals instead of quietly shrinking the pie.
  const uncategorised = await BehaviorEvent.aggregate([
    { $match: match },
    LOOKUP_PRODUCT,
    RESOLVE_CATEGORY,
    { $match: { resolvedCategory: { $in: [null, ""] } } },
    { $count: "n" },
  ]);

  const attraction = buildSlices(byCategoryAndType, {
    getKey: (r) => r._id.category,
    getName: (r) => r._id.category,
    getCategory: () => null,
  });

  const products = buildSlices(byProductAndType, {
    getKey: (r) => String(r._id.productId),
    getName: (r) => r._id.title || "Untitled listing",
    getCategory: (r) => r._id.category,
  });

  // The category donut is a partition of one customer, so its shares must read
  // as a whole: 100% across the ring.
  const totalScore = round(attraction.reduce((s, r) => s + r.score, 0));
  const shares = percentagesSummingTo100(attraction, totalScore);
  attraction.forEach((slice, i) => {
    slice.percentage = shares[i];
  });

  // The product list is a top-N ranking, not a partition. A customer here
  // engaged with 47 distinct listings, so folding the tail into an "Other" slice
  // produced a single 72% segment that said nothing - and a 47-slice donut would
  // be unreadable. Instead the strongest few are named, each scored against the
  // customer's whole product history, so the numbers are comparable across
  // customers instead of being an artefact of where the cutoff fell.
  const productTotalScore = products.reduce((s, r) => s + r.score, 0);
  const topProducts = products.slice(0, PRODUCT_SLICE_LIMIT).map((p) => ({
    ...p,
    percentage: productTotalScore > 0 ? round((p.score / productTotalScore) * 100) : 0,
  }));

  const totalInteractions = attraction.reduce((s, r) => s + r.interactions, 0);
  const eventTypeTotals = {};
  for (const row of byCategoryAndType) {
    eventTypeTotals[row._id.eventType] = (eventTypeTotals[row._id.eventType] || 0) + row.n;
  }

  const strongestSignal = Object.entries(eventTypeTotals).sort((a, b) => b[1] - a[1])[0] || null;
  const [lead] = attraction;
  const purchaseEvents = eventTypeTotals.PURCHASE || 0;

  return {
    customer: {
      _id: customer._id,
      name: customer.name,
      email: customer.email,
      role: customer.role,
      location: customer.location || null,
      joinedAt: customer.createdAt,
    },
    hasData: attraction.length > 0,
    attraction,
    products: topProducts,
    totals: {
      score: totalScore,
      interactions: totalInteractions,
      categories: attraction.length,
      products: products.length,
      uncategorised: count(uncategorised[0]?.n),
      strongestSignal: strongestSignal
        ? { eventType: strongestSignal[0], interactions: strongestSignal[1], weight: ATTRACTION_WEIGHTS[strongestSignal[0]] }
        : null,
    },
    eventBreakdown: eventTypeTotals,
    weights: ATTRACTION_WEIGHTS,
    // Everything below is derived only from counted rows, and the conditional
    // falls back to a plain summary when there is nothing to assert.
    insights: lead
      ? [
          `${lead.name} is ${customer.name.split(" ")[0]}'s strongest category at ${lead.percentage}% of their attraction, from ${lead.interactions} interactions.`,
          strongestSignal
            ? `Their most frequent signal is ${humanise(strongestSignal[0])} (${strongestSignal[1]}x).`
            : null,
          purchaseEvents > 0
            ? `They have completed ${purchaseEvents} purchase${purchaseEvents === 1 ? "" : "s"}, which is weighted ${ATTRACTION_WEIGHTS.PURCHASE}x higher than a view.`
            : `No completed purchase is recorded, so their attraction is read as browsing and intent rather than buying.`,
        ].filter(Boolean)
      : [],
    basis:
      "Attraction is weighted interaction, not a raw click count: each tracked event adds its weight, and the weights are the marketplace's existing intent ladder (view 1, compare 3, cart 4, checkout 5, purchase 8). Percentages are this customer's share of their own weighted total, so they describe this customer only. Sessions, logins, removals and post-purchase service events are excluded because they are not evidence of attraction.",
    generatedAt: new Date().toISOString(),
  };
};

/** PRODUCT_VIEW -> "product view", for sentences that read like English. */
const humanise = (eventType) =>
  eventType
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^./, (c) => c.toUpperCase());

export default getCustomerAttraction;
