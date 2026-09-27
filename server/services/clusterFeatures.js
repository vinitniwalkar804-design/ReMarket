/**
 * Customer feature aggregation for the Cluster Lab.
 *
 * This is the only place that turns raw marketplace activity into the numeric
 * feature matrix the ML service consumes. Two rules govern everything here:
 *
 *  1. **Every number is derived from stored data.** A feature is never
 *     defaulted to a plausible-looking value. If the marketplace has not recorded
 *     the behaviour, the feature is 0, and the ML service reports that as a
 *     zero-variance or zero-heavy feature instead of the admin being shown a
 *     fabricated segment.
 *  2. **Batched, not per-customer.** The previous implementation ran roughly a
 *     dozen queries per customer inside a loop. With ~60 customers that is fine;
 *     with a few thousand it is not. Everything below is computed in a small,
 *     fixed number of aggregate queries.
 */
import { User, BehaviorEvent, Order, Offer, Product, CustomerFeature } from "../models/index.js";

/** Canonical feature list. Must stay in step with ml-service/app/clustering/feature_schema.py. */
export const FEATURE_NAMES = [
  "totalViews",
  "totalSearches",
  "uniqueProductsViewed",
  "repeatedSearches",
  "categoryDiversity",
  "priceWatchCount",
  "priceRangePreference",
  "comparisonCount",
  "reviewsChecked",
  "sellerProfileChecks",
  "trustSignalInteractions",
  "reviewSubmissions",
  "decisionTime",
  "wishlistCount",
  "cartCount",
  "cartAbandonmentRate",
  "cartViewCount",
  "checkoutStarts",
  "purchaseCount",
  "totalSpending",
  "averageSpending",
  "purchaseFrequency",
  "repeatPurchaseRate",
  "exchangePreference",
  "negotiationCount",
  "averageOfferDiscount",
  "offerAcceptanceRate",
  "offerRejectionRate",
  "negotiationRounds",
  "discountUsage",
  "averageDiscount",
  "returnRate",
  "totalConversations",
  "localPreference",
  "sessionFrequency",
  "activeDays",
  "weekendActivity",
  "eveningActivity",
  "laptopInterest",
  "phoneInterest",
  "electronicsInterest",
  "booksInterest",
  "furnitureInterest",
  "gamingInterest",
  "cyclesInterest",
  "categoryInterestBreadth",
];

/** Marketplace category names that map onto the seven modelled interest axes. */
/**
 * Marketplace category -> modelled interest axis.
 *
 * The seven axes are fixed because the ML service consumes a fixed-width feature
 * vector, so a new marketplace category has to be folded into an existing axis
 * rather than adding one. Keys are matched case-insensitively after trimming, so
 * include the singular/plural and common synonym forms a category can arrive as.
 *
 * This map must stay in step with `CATEGORY_INTEREST_MAP` in
 * `ml-service/app/clustering/feature_schema.py`, which records the same mapping
 * using the canonical display names. That one is the reference list; this one is
 * the normaliser applied to stored event categories.
 *
 * A category missing from this map does not error - its interactions are simply
 * not counted toward any axis, which quietly biases the seven category-interest
 * features. Unmapped names are therefore collected into `stats.unmappedCategories`
 * and reported by the pipeline instead of disappearing.
 */
export const CATEGORY_INTEREST_MAP = {
  laptopInterest: ["laptop", "laptops", "notebook", "notebooks", "computers", "computer"],
  phoneInterest: ["phone", "phones", "smartphone", "smartphones", "mobile", "mobiles", "tablet", "tablets"],
  electronicsInterest: [
    "electronics",
    "electronic",
    "appliances",
    "audio",
    "tv",
    "television",
    "camera",
    "cameras",
    // Peripherals and cases are bought as electronics accessories, and the
    // feature_schema reference map already groups Accessories here.
    "accessories",
    "accessory",
  ],
  // "booksInterest" is an education/study axis rather than a books-only axis -
  // it already carries education and stationery. Calculators are study tools, so
  // they belong here; this is a modelling judgement and the reason is recorded
  // so it can be revisited rather than looking arbitrary.
  booksInterest: ["books", "book", "education", "stationery", "comics", "novels", "calculator", "calculators"],
  furnitureInterest: ["furniture", "sofa", "sofas", "chair", "chairs", "table", "tables", "bed", "beds", "home"],
  gamingInterest: ["gaming", "games", "game", "console", "consoles", "playstation", "xbox", "nintendo"],
  cyclesInterest: ["cycles", "cycle", "bicycle", "bicycles", "bike", "bikes", "scooter", "scooters", "motorcycle"],
};

const SESSION_GAP_MINUTES = 30;

const VALID_ORDER_STATUSES = ["pending", "confirmed", "shipped", "delivered"];

const count = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

const safeDiv = (numerator, denominator) => (denominator > 0 ? numerator / denominator : 0);

const round = (value, places = 4) => {
  const factor = 10 ** places;
  return Math.round(count(value) * factor) / factor;
};

const normaliseCategory = (value) => String(value || "").trim().toLowerCase();

/**
 * Build a per-category interest profile. Interest is *weighted interaction*, not
 * a raw click count: a product view is a weak signal, adding to cart is a strong
 * one, and actually buying is strongest. Counting views alone would make every
 * customer look like a browser of everything.
 */
/**
 * Exported so the admin customer-attraction chart scores a customer with the
 * same numbers the ML pipeline does, rather than a second, drifting table.
 * Adding to this object changes the feature matrix, so it stays as it is; the
 * chart's own extra signal weights live in services/customerAttraction.js.
 */
export const CATEGORY_WEIGHTS = {
  PRODUCT_VIEW: 1,
  CATEGORY_VIEW: 2,
  PRODUCT_COMPARE: 3,
  REVIEW_VIEW: 2,
  CART_VIEW: 2,
  WISHLIST_ADD: 3,
  PRICE_WATCH: 3,
  CART_ADD: 4,
  CHECKOUT_START: 5,
  PURCHASE: 8,
};

const buildCategoryAxisLookup = () => {
  const lookup = new Map();
  for (const [axis, names] of Object.entries(CATEGORY_INTEREST_MAP)) {
    for (const name of names) lookup.set(name, axis);
  }
  return lookup;
};

const CATEGORY_AXIS_LOOKUP = buildCategoryAxisLookup();

/**
 * Aggregate every customer's behaviour in a fixed number of queries.
 *
 * @returns {Promise<{features: object[], customers: object[], stats: object}>}
 */
export const buildClusterFeatureMatrix = async () => {
  const customers = await User.find({ role: "customer" })
    .select("_id name email location createdAt")
    .lean();

  if (customers.length === 0) {
    return { features: [], customers: [], stats: { customers: 0, events: 0, orders: 0, offers: 0 } };
  }

  const customerIds = customers.map((customer) => customer._id);

  // Categories seen in real events that no axis claims. Collected across every
  // customer so a newly added marketplace category shows up in the run
  // diagnostics instead of silently biasing the category-interest features.
  const unmappedCategories = new Set();

  // ---- Batch read the raw activity ------------------------------------
  // Events, orders and offers first; the product lookup needs their product ids,
  // so it has to be a second round trip rather than part of the same Promise.all.
  const [eventTotals, eventDocs, orderDocs, offerDocs] = await Promise.all([
    BehaviorEvent.aggregate([
      { $match: { userId: { $in: customerIds } } },
      { $group: { _id: { userId: "$userId", eventType: "$eventType" }, count: { $sum: 1 } } },
    ]),
    BehaviorEvent.find({ userId: { $in: customerIds } })
      .select("userId eventType category productId sessionId metadata timestamp")
      .sort({ timestamp: 1 })
      .lean(),
    Order.find({ buyerId: { $in: customerIds } }).lean(),
    Offer.find({ buyerId: { $in: customerIds } }).lean(),
  ]);

  const referencedProductIds = Array.from(
    new Set(
      [...eventDocs.map((event) => event.productId), ...orderDocs.map((order) => order.productId)]
        .filter(Boolean)
        .map(String)
    )
  );
  const productDocs = referencedProductIds.length
    ? await Product.find({ _id: { $in: referencedProductIds } })
        .select("_id categoryName location price")
        .lean()
    : [];

  const productById = new Map(productDocs.map((product) => [String(product._id), product]));

  // ---- Bucket the per-customer event counts ----------------------------
  const eventCounts = new Map();
  for (const row of eventTotals) {
    const key = String(row._id.userId);
    if (!eventCounts.has(key)) eventCounts.set(key, {});
    eventCounts.get(key)[row._id.eventType] = row.count;
  }

  const ordersByUser = new Map();
  for (const order of orderDocs) {
    const key = String(order.buyerId);
    if (!ordersByUser.has(key)) ordersByUser.set(key, []);
    ordersByUser.get(key).push(order);
  }

  const offersByUser = new Map();
  for (const offer of offerDocs) {
    const key = String(offer.buyerId);
    if (!offersByUser.has(key)) offersByUser.set(key, []);
    offersByUser.get(key).push(offer);
  }

  const eventsByUser = new Map();
  for (const event of eventDocs) {
    const key = String(event.userId);
    if (!eventsByUser.has(key)) eventsByUser.set(key, []);
    eventsByUser.get(key).push(event);
  }

  const features = [];

  for (const customer of customers) {
    const key = String(customer._id);
    const counts = eventCounts.get(key) || {};
    const events = eventsByUser.get(key) || [];
    const allOrders = ordersByUser.get(key) || [];
    const orders = allOrders.filter((order) => VALID_ORDER_STATUSES.includes(order.status));
    const offers = offersByUser.get(key) || [];
    const totalEvents = events.length;

    // ---- Discovery ----------------------------------------------------
    const totalViews = counts.PRODUCT_VIEW || 0;
    const totalSearches = counts.SEARCH || 0;

    const viewedProductIds = new Set(
      events.filter((event) => event.productId).map((event) => String(event.productId))
    );
    orders.forEach((order) => {
      if (order.productId) viewedProductIds.add(String(order.productId));
    });
    const uniqueProductsViewed = viewedProductIds.size;

    const searchQueries = events
      .filter((event) => event.eventType === "SEARCH")
      .map((event) => normaliseCategory(event.metadata?.query))
      .filter(Boolean);
    const queryFrequency = new Map();
    for (const query of searchQueries) queryFrequency.set(query, (queryFrequency.get(query) || 0) + 1);
    // "Repeated" is the number of *surplus* repeats, so searching the same thing
    // three times counts as 2, not 3.
    const repeatedSearches = Array.from(queryFrequency.values()).reduce(
      (total, occurrences) => total + Math.max(0, occurrences - 1),
      0
    );

    // ---- Category interest --------------------------------------------
    const categoryScores = Object.fromEntries(
      Object.keys(CATEGORY_INTEREST_MAP).map((axis) => [axis, 0])
    );
    const categoriesTouched = new Set();
    let localInteractions = 0;
    let totalInteractions = 0;
    const userLocation = normaliseCategory(customer.location);

    for (const event of events) {
      const product = event.productId ? productById.get(String(event.productId)) : null;
      const categoryName = event.category || product?.categoryName;
      if (categoryName) {
        categoriesTouched.add(categoryName);
        const axis = CATEGORY_AXIS_LOOKUP.get(normaliseCategory(categoryName));
        const weight = CATEGORY_WEIGHTS[event.eventType];
        if (axis && weight) categoryScores[axis] += weight;
        else if (!axis && weight) unmappedCategories.add(categoryName);
      }
      if (product) {
        // The denominator is every product interaction, local or not. Incrementing
        // both counters inside the same condition would make the ratio 1 for
        // anyone who ever matched their own city and 0 for everyone else.
        totalInteractions += 1;
        if (userLocation && normaliseCategory(product.location) === userLocation) {
          localInteractions += 1;
        }
      }
    }

    for (const order of orders) {
      const product = order.productId ? productById.get(String(order.productId)) : null;
      if (product?.categoryName) categoriesTouched.add(product.categoryName);
      if (product) {
        totalInteractions += 1;
        if (userLocation && normaliseCategory(product.location) === userLocation) {
          localInteractions += 1;
        }
      }
    }

    const categoryDiversity = categoriesTouched.size;
    const categoryInterestBreadth = Object.values(categoryScores).filter((score) => score > 0).length;
    const localPreference = round(safeDiv(localInteractions, totalInteractions));

    // ---- Consideration -------------------------------------------------
    const comparisonCount = (counts.PRODUCT_COMPARE || 0) + (counts.COMPARE_SELECTED || 0);
    const reviewsChecked = counts.REVIEW_VIEW || 0;
    const sellerProfileChecks = counts.SELLER_PROFILE_VIEW || 0;
    const reviewSubmissions = counts.REVIEW_SUBMITTED || 0;
    const trustSignalInteractions = sellerProfileChecks + reviewsChecked + reviewSubmissions;

    const decisions = allOrders
      .map((order) => count(order.decisionTimeMinutes))
      .filter((minutes) => minutes > 0);
    const decisionTime = decisions.length
      ? round(decisions.reduce((sum, value) => sum + value, 0) / decisions.length)
      : 0;

    // ---- Cart and intent ------------------------------------------------
    const wishlistAdds = counts.WISHLIST_ADD || 0;
    const wishlistCount = Math.max(0, wishlistAdds - (counts.WISHLIST_REMOVE || 0));
    const cartAdds = counts.CART_ADD || 0;
    const cartRemovals = counts.CART_REMOVE || 0;
    const cartCount = Math.max(0, cartAdds - cartRemovals);
    // Abandonment is removals over additions. A customer who never touched the
    // cart has not abandoned anything, which is why this is 0 and not 1.
    const cartAbandonmentRate = round(Math.min(1, safeDiv(cartRemovals, cartAdds)));
    const cartViewCount = counts.CART_VIEW || 0;
    const checkoutStarts = counts.CHECKOUT_START || 0;

    // ---- Purchase and value ---------------------------------------------
    const purchaseCount = Math.max(orders.length, counts.PURCHASE || 0);
    const totalSpending = round(orders.reduce((sum, order) => sum + count(order.finalPrice), 0), 2);
    const averageSpending = round(safeDiv(totalSpending, purchaseCount), 2);
    const repeatPurchaseRate = round(
      purchaseCount > 1 ? (purchaseCount - 1) / purchaseCount : 0
    );

    const sortedOrders = [...orders].sort(
      (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
    );
    // Orders per elapsed week. Zero for a single purchase because there is no
    // interval to divide by, and a fabricated rate would distort clustering.
    const purchaseFrequency =
      sortedOrders.length > 1
        ? round(
            safeDiv(
              sortedOrders.length - 1,
              (new Date(sortedOrders.at(-1).createdAt) - new Date(sortedOrders[0].createdAt)) /
                (7 * 24 * 60 * 60 * 1000)
            )
          )
        : 0;

    const discountedOrders = orders.filter((order) => count(order.discountPercent) > 0);
    const discountUsage = discountedOrders.length;
    const averageDiscount = discountedOrders.length
      ? round(
          discountedOrders.reduce((sum, order) => sum + count(order.discountPercent), 0) /
            discountedOrders.length
        )
        : 0;

    const returnRate = round(Math.min(1, safeDiv(counts.PRODUCT_RETURN || 0, Math.max(purchaseCount, 1))));
    // Exchange intent has two possible sources and they are ADDED, not
    // interchangeable fallbacks, so the same logical exchange must not land in
    // both or exchangePreference counts it twice:
    //   - EXCHANGE_REQUEST behavior events, which no controller emits at runtime;
    //     the only rows that exist come from the seed.
    //   - Orders of type "exchange", which the order API does accept, but which
    //     the current dataset happens to contain none of.
    // Today only the event term is populated, which is why the sum is correct.
    // If a controller starts emitting EXCHANGE_REQUEST, drop the orders term in
    // the same change (and vice versa).
    const exchangePreference =
      (counts.EXCHANGE_REQUEST || 0) + orders.filter((order) => order.type === "exchange").length;

    // ---- Price and negotiation ------------------------------------------
    const negotiationCount = offers.length;
    const discountsRequested = offers
      .filter((offer) => count(offer.listedPrice) > 0 && count(offer.offerAmount) > 0)
      .map((offer) => (count(offer.listedPrice) - count(offer.offerAmount)) / count(offer.listedPrice));
    const averageOfferDiscount = discountsRequested.length
      ? round(
          discountsRequested.reduce((sum, value) => sum + value, 0) / discountsRequested.length
        )
      : 0;
    const offerAcceptanceRate = round(safeDiv(offers.filter((o) => o.status === "accepted").length, offers.length));
    // An offer that was countered or expired was also not accepted. Counting only
    // explicit rejections would overstate how easy customers are to work with.
    const offerRejectionRate = round(
      Math.min(
        1,
        safeDiv(
          offers.filter((o) => o.status === "rejected" || o.status === "expired").length,
          offers.length
        )
      )
    );
    const rounds = offers.map((offer) => count(offer.rounds)).filter((value) => value > 0);
    const negotiationRounds = rounds.length
      ? round(rounds.reduce((sum, value) => sum + value, 0) / rounds.length)
      : 0;

    // What this customer actually looks at, not what they bought. Falls back to
    // the mean price of everything they viewed so a browser who never bought
    // still has a price signal, and is 0 only when they viewed nothing priced.
    const viewedPrices = Array.from(viewedProductIds)
      .map((id) => count(productById.get(id)?.price))
      .filter((price) => price > 0)
      .sort((a, b) => a - b);
    const medianViewedPrice = viewedPrices.length
      ? viewedPrices[Math.floor(viewedPrices.length / 2)]
      : 0;
    const priceRangePreference =
      medianViewedPrice > 0
        ? round(medianViewedPrice, 2)
        : averageSpending > 0
          ? averageSpending
          : 0;

    // ---- Engagement rhythm -------------------------------------------------
    // A session is a real sessionId when the client supplied one, and otherwise
    // inferred from a 30-minute idle gap. Mixing the two would double-count, so
    // each user is measured one way or the other.
    const sessionIds = new Set(events.map((event) => event.sessionId).filter(Boolean));
    let sessionFrequency;
    if (sessionIds.size > 0) {
      sessionFrequency = sessionIds.size;
    } else if (totalEvents === 0) {
      sessionFrequency = 0;
    } else {
      const gap = SESSION_GAP_MINUTES * 60 * 1000;
      let inferred = 1;
      for (let index = 1; index < events.length; index += 1) {
        if (new Date(events[index].timestamp) - new Date(events[index - 1].timestamp) > gap) inferred += 1;
      }
      sessionFrequency = inferred;
    }

    const activeDays = new Set(events.map((event) => new Date(event.timestamp).toDateString())).size;
    const weekendActivity = round(
      safeDiv(
        events.filter((event) => {
          const day = new Date(event.timestamp).getDay();
          return day === 0 || day === 6;
        }).length,
        totalEvents
      )
    );
    const eveningActivity = round(
      safeDiv(
        events.filter((event) => {
          const hour = new Date(event.timestamp).getHours();
          return hour >= 18 && hour <= 23;
        }).length,
        totalEvents
      )
    );

    const priceWatchCount = counts.PRICE_WATCH || 0;
    const totalConversations = counts.CHAT_STARTED || 0;
    const lastActive = events.length ? events.at(-1).timestamp : customer.createdAt;

    const feature = {
      userId: String(customer._id),
      totalViews,
      totalSearches,
      uniqueProductsViewed,
      repeatedSearches,
      categoryDiversity,
      priceWatchCount,
      priceRangePreference,
      comparisonCount,
      reviewsChecked,
      sellerProfileChecks,
      trustSignalInteractions,
      reviewSubmissions,
      decisionTime,
      wishlistCount,
      cartCount,
      cartAbandonmentRate,
      cartViewCount,
      checkoutStarts,
      purchaseCount,
      totalSpending,
      averageSpending,
      purchaseFrequency,
      repeatPurchaseRate,
      exchangePreference,
      negotiationCount,
      averageOfferDiscount,
      offerAcceptanceRate,
      offerRejectionRate,
      negotiationRounds,
      discountUsage,
      averageDiscount,
      returnRate,
      totalConversations,
      localPreference,
      sessionFrequency,
      activeDays,
      weekendActivity,
      eveningActivity,
      ...categoryScores,
      categoryInterestBreadth,
    };

    // Guarantee the shape the ML service validates against.
    for (const name of FEATURE_NAMES) {
      if (feature[name] === undefined) feature[name] = 0;
    }

    features.push({
      userId: feature.userId,
      features: feature,
      profile: {
        name: customer.name,
        email: customer.email,
        location: customer.location || "",
        createdAt: customer.createdAt,
        lastActive,
        eventCount: totalEvents,
        orderCount: orders.length,
        offerCount: offers.length,
        usedRealSessions: sessionIds.size > 0,
      },
    });
  }

  return {
    features: features.map((entry) => entry.features),
    customers: features.map((entry) => ({ userId: entry.userId, ...entry.profile })),
    stats: {
      customers: customers.length,
      events: eventDocs.length,
      orders: orderDocs.length,
      offers: offerDocs.length,
      products: productDocs.length,
      // Categories that contributed interactions but no interest axis. Non-empty
      // means the category-interest features are under-counting real activity and
      // CATEGORY_INTEREST_MAP needs a new entry.
      unmappedCategories: [...unmappedCategories].sort(),
    },
  };
};

/**
 * A customer is worth clustering only if they have actually done something.
 * Clustering a table of all-zero rows produces a technically valid partition with
 * no behavioural meaning.
 */
export const filterClusterable = (features) =>
  (features || []).filter((feature) =>
    [
      "totalViews",
      "totalSearches",
      "comparisonCount",
      "wishlistCount",
      "cartCount",
      "cartViewCount",
      "checkoutStarts",
      "purchaseCount",
      "negotiationCount",
      "reviewsChecked",
      "sellerProfileChecks",
      "priceWatchCount",
      "totalConversations",
      "sessionFrequency",
    ].some((name) => count(feature[name]) > 0)
  );

/** Persist the matrix so the admin console can show it and future runs can diff against it. */
export const persistFeatures = async (features) => {
  const operations = features.map((feature) => ({
    updateOne: {
      filter: { userId: feature.userId },
      update: { $set: feature },
      upsert: true,
    },
  }));
  if (operations.length === 0) return 0;
  const outcome = await CustomerFeature.bulkWrite(operations, { ordered: false });
  return outcome.modifiedCount + outcome.upsertedCount;
};

/**
 * Dominant product categories per cluster, computed from real event and order
 * data rather than from whatever the persona rules happened to score highly.
 */
export const computeDominantCategories = async (labels, categoryLimit = 3) => {
  const result = {};
  if (!labels || typeof labels !== "object") return result;

  const entries = Object.entries(labels).filter(
    ([, label]) => Number.isInteger(Number(label)) && Number(label) >= 0
  );
  if (entries.length === 0) return result;

  const clusterIds = new Set(entries.map(([, label]) => Number(label)));
  const userIds = entries.map(([userId]) => userId);

  const [events, orders, products] = await Promise.all([
    BehaviorEvent.find({ userId: { $in: userIds } }).select("userId category productId eventType").lean(),
    Order.find({ buyerId: { $in: userIds } }).select("buyerId productId").lean(),
    Product.find({}).select("_id categoryName").lean(),
  ]);

  const categoryByProductId = new Map(products.map((product) => [String(product._id), product.categoryName]));

  const counts = {};
  for (const clusterId of clusterIds) counts[clusterId] = {};

  const tally = (userId, category) => {
    const clusterId = Number(labels[String(userId)]);
    if (!Number.isInteger(clusterId) || clusterId < 0 || !counts[clusterId] || !category) return;
    counts[clusterId][category] = (counts[clusterId][category] || 0) + 1;
  };

  for (const event of events) {
    tally(event.userId, event.category || categoryByProductId.get(String(event.productId)));
  }
  for (const order of orders) {
    tally(order.buyerId, categoryByProductId.get(String(order.productId)));
  }

  for (const [clusterId, categoryCounts] of Object.entries(counts)) {
    result[Number(clusterId)] = Object.entries(categoryCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, categoryLimit)
      .map(([category]) => category);
  }
  return result;
};

export const getCustomerDirectory = async () => {
  const users = await User.find({ role: "customer" })
    .select("_id name email location avatar createdAt")
    .lean();
  return users.map((user) => ({
    userId: String(user._id),
    name: user.name,
    email: user.email,
    location: user.location || "",
    avatar: user.avatar || "",
    createdAt: user.createdAt,
  }));
};
