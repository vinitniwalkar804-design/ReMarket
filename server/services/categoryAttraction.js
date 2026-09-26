/**
 * Category attraction: how much customer *interest* each category actually
 * generates, measured from recorded behaviour.
 *
 * The admin Behavior page used to answer "which category is popular?" by
 * counting listings. That is a supply measure - it tells you what sellers
 * happen to have posted, and it would rank a category highly even if nobody
 * ever looked at it. It is the wrong question for a marketplace, where the
 * useful question is where demand is going.
 *
 * So attraction is computed from `BehaviorEvent`, not from `Product`:
 *
 *  - Events that name a category directly (CATEGORY_VIEW, and SEARCH performed
 *    inside a category) carry `category`.
 *  - Everything else identifies a product, so the category is resolved through a
 *    `$lookup`. The two are merged, otherwise the most common events -
 *    PRODUCT_VIEW, WISHLIST_ADD, CART_ADD, PURCHASE - would be attributed to
 *    "Uncategorized" simply because the writer did not denormalise the category.
 *
 * Interactions are weighted rather than counted, because a view and a purchase
 * are not the same size of signal. The weights mirror the intent scale used by
 * the feature builder in `clusterFeatures.js`, so "interest" means the same
 * thing in both places.
 *
 * Everything here is derived from stored events. A category with no recorded
 * interaction is absent from the result, never defaulted to zero-and-listed.
 */
import { BehaviorEvent, Product } from "../models/index.js";

/**
 * Relative weight of each event as evidence of interest.
 * A view is a weak signal; money and negotiation are strong ones.
 */
const ATTRACTION_WEIGHTS = {
  CATEGORY_VIEW: 2,
  SEARCH: 1,
  PRODUCT_VIEW: 1,
  REVIEW_VIEW: 1,
  PRICE_WATCH: 3,
  WISHLIST_ADD: 4,
  OFFER_SENT: 5,
  CART_ADD: 6,
  PURCHASE: 10,
};

/** Events that carry a product id and therefore need a category lookup. */
const PRODUCT_SCOPED = Object.keys(ATTRACTION_WEIGHTS).filter((e) => e !== "CATEGORY_VIEW" && e !== "SEARCH");

const UNGROUPED = "Uncategorized";

/**
 * A `$switch` yielding this event's weight, so the group stage can sum a single
 * field. `$add` cannot nest accumulators, so the weighting has to happen before
 * the group rather than inside it.
 */
const weightSwitch = {
  $switch: {
    branches: Object.entries(ATTRACTION_WEIGHTS).map(([eventType, weight]) => ({
      case: { $eq: ["$eventType", eventType] },
      then: weight,
    })),
    default: 0,
  },
};

const plainSum = (eventType) => ({
  $sum: { $cond: [{ $eq: ["$eventType", eventType] }, 1, 0] },
});

/**
 * @returns {Promise<Array<{category: string, attractionScore: number, listings: number,
 *   demandPerListing: number, conversionRate: number|null, counts: object}>>}
 */
export const getCategoryAttraction = async () => {
  const [attraction, supply] = await Promise.all([
    BehaviorEvent.aggregate([
      { $match: { eventType: { $in: Object.keys(ATTRACTION_WEIGHTS) } } },

      // Resolve the category for product-scoped events.
      { $lookup: { from: "products", localField: "productId", foreignField: "_id", as: "product" } },
      {
        $set: {
          resolvedCategory: {
            $let: {
              vars: {
                onEvent: { $trim: { input: { $ifNull: ["$category", ""] } } },
                onProduct: { $trim: { input: { $ifNull: [{ $first: "$product.categoryName" }, ""] } } },
              },
              // `category` defaults to "" rather than null, so an emptiness test
              // is needed before falling through to the product.
              in: {
                $cond: [
                  { $gt: ["$$onEvent", ""] },
                  "$$onEvent",
                  { $cond: [{ $gt: ["$$onProduct", ""] }, "$$onProduct", UNGROUPED] },
                ],
              },
            },
          },
        },
      },
      { $unset: "product" },

      // Weight each event before grouping; see weightSwitch above.
      { $set: { weighted: weightSwitch } },

      {
        $group: {
          _id: "$resolvedCategory",
          attractionScore: { $sum: "$weighted" },
          searches: plainSum("SEARCH"),
          categoryViews: plainSum("CATEGORY_VIEW"),
          productViews: plainSum("PRODUCT_VIEW"),
          reviewViews: plainSum("REVIEW_VIEW"),
          priceWatches: plainSum("PRICE_WATCH"),
          wishlistAdds: plainSum("WISHLIST_ADD"),
          offers: plainSum("OFFER_SENT"),
          cartAdds: plainSum("CART_ADD"),
          purchases: plainSum("PURCHASE"),
          customers: { $addToSet: "$userId" },
        },
      },
      {
        $project: {
          _id: 0,
          category: "$_id",
          attractionScore: { $round: ["$attractionScore", 1] },
          customers: { $size: "$customers" },
          counts: {
            searches: "$searches",
            categoryViews: "$categoryViews",
            productViews: "$productViews",
            reviewViews: "$reviewViews",
            priceWatches: "$priceWatches",
            wishlistAdds: "$wishlistAdds",
            offers: "$offers",
            cartAdds: "$cartAdds",
            purchases: "$purchases",
          },
        },
      },
      { $sort: { attractionScore: -1 } },
    ]),

    Product.aggregate([
      { $match: { status: { $ne: "removed" } } },
      { $group: { _id: "$categoryName", listings: { $sum: 1 } } },
    ]),
  ]);

  const listingsByCategory = new Map(supply.map((s) => [s._id, s.listings]));

  return attraction.map((row) => {
    const listings = listingsByCategory.get(row.category) ?? 0;
    const views = row.counts.productViews + row.counts.categoryViews;
    return {
      ...row,
      listings,
      // Interest per available listing: high means demand is under-served by
      // supply, low means the category is saturated relative to its traffic.
      demandPerListing: listings > 0 ? Number((row.attractionScore / listings).toFixed(2)) : null,
      // Null rather than 0 when nothing was viewed, so "no signal" is never
      // rendered as "terrible conversion".
      conversionRate: views > 0 ? Number(((row.counts.purchases / views) * 100).toFixed(1)) : null,
    };
  });
};

export default getCategoryAttraction;
