/**
 * Behavioural profile generation for the seed.
 *
 * The previous generator emitted events with independently randomised
 * timestamps, which produced two problems for the Cluster Lab:
 *
 *  1. `sessionFrequency` had nothing to count, because no event carried a
 *     `sessionId` and timestamps were unordered, so any idle-gap heuristic
 *     produced a meaningless number.
 *  2. Customers in the same profile were near-identical, and the gap between
 *     profiles was a difference in *volume* rather than in *behaviour*. Volume
 *     alone clusters into "heavy" and "light" users, which is not segmentation.
 *
 * So activity is generated as coherent sessions: each session has an id, a start
 * time, and an ordered burst of events that follow a funnel. The profile decides
 * the shape of that funnel, which is what the clustering then recovers.
 *
 * Every generator is seeded, so re-running the seed reproduces the same
 * marketplace -- a segmentation demo that changes on every run cannot be
 * presented or defended.
 */

/** Deterministic PRNG (mulberry32) so a given customer always behaves the same way. */
const mulberry32 = (seed) => {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const intBetween = (rng, min, max) => Math.floor(rng() * (max - min + 1)) + min;
const chance = (rng, probability) => rng() < probability;
const pick = (rng, items) => items[Math.floor(rng() * items.length)];

/**
 * The five behavioural archetypes.
 *
 * `pPurchase` is per *session*, so the purchase count of a profile is roughly
 * `sessions * pPurchase`. That is what separates a quick buyer (few sessions,
 * almost always converts) from a window shopper (many sessions, almost never
 * converts) even though both are "active" users.
 */
export const PROFILES = {
  researcher: {
    label: "Research-Heavy Buyer",
    sessions: [18, 28],
    hours: [10, 11, 14, 15, 16, 20, 21],
    pSearch: 0.85,
    views: [3, 7],
    pCategory: 0.4,
    pCompare: 0.75,
    pCompareSelected: 0.25,
    pReview: 0.7,
    pSeller: 0.5,
    pChat: 0.15,
    pPriceWatch: 0.2,
    pWishlist: 0.5,
    pCart: 0.55,
    pCartRemove: 0.3,
    pCheckout: 0.45,
    pPurchase: 0.45,
    pReviewSubmitted: 0.1,
    pOffer: 0.05,
    offerAcceptChance: 0.5,
    decisionTime: [600, 4300],
    discountChance: 0.3,
    categories: ["Laptops", "Smartphones", "Electronics", "Accessories", "Gaming", "Books"],
    queries: ["Laptop", "iPhone", "Headphones", "Monitor", "Keyboard", "Compare specs", "Best condition"],
    repeatQueryBias: 0.45,
    weekendBias: 0.2,
  },
  bargain: {
    label: "Bargain Hunter",
    sessions: [8, 14],
    hours: [9, 12, 17, 19, 20, 22, 23],
    pSearch: 0.7,
    views: [2, 5],
    pCategory: 0.3,
    pCompare: 0.45,
    pCompareSelected: 0.15,
    pReview: 0.25,
    pSeller: 0.2,
    pChat: 0.4,
    pPriceWatch: 0.45,
    pWishlist: 0.4,
    pCart: 0.7,
    pCartRemove: 0.3,
    pCheckout: 0.6,
    pPurchase: 0.6,
    pReviewSubmitted: 0.08,
    pOffer: 0.62,
    offerAcceptChance: 0.38,
    decisionTime: [5, 60],
    discountChance: 0.85,
    categories: ["Books", "Calculators", "Furniture", "Cycles", "Accessories", "Smartphones"],
    queries: ["Books", "Calculator", "Desk", "Cycle", "Chair", "Cheapest", "Under 5000"],
    repeatQueryBias: 0.5,
    weekendBias: 0.3,
  },
  quick: {
    label: "Quick Buyer",
    sessions: [8, 14],
    hours: [8, 9, 10, 13, 14, 18],
    pSearch: 0.35,
    views: [1, 3],
    pCategory: 0.2,
    pCompare: 0.12,
    pCompareSelected: 0.08,
    pReview: 0.1,
    pSeller: 0.1,
    pChat: 0.15,
    pPriceWatch: 0.1,
    pWishlist: 0.15,
    pCart: 0.8,
    pCartRemove: 0.08,
    pCheckout: 0.75,
    pPurchase: 0.85,
    pReviewSubmitted: 0.15,
    pOffer: 0.08,
    offerAcceptChance: 0.6,
    decisionTime: [2, 30],
    discountChance: 0.25,
    categories: ["Smartphones", "Electronics", "Accessories", "Gaming", "Calculators"],
    queries: ["iPhone", "Headphones", "Charge", "Urgent"],
    repeatQueryBias: 0.25,
    weekendBias: 0.35,
  },
  trust: {
    label: "Trust Seeker",
    sessions: [10, 16],
    hours: [11, 12, 15, 16, 19, 20, 21],
    pSearch: 0.6,
    views: [2, 5],
    pCategory: 0.35,
    pCompare: 0.4,
    pCompareSelected: 0.2,
    pReview: 0.85,
    pSeller: 0.8,
    pChat: 0.5,
    pPriceWatch: 0.25,
    pWishlist: 0.45,
    pCart: 0.55,
    pCartRemove: 0.25,
    pCheckout: 0.6,
    pPurchase: 0.6,
    pReviewSubmitted: 0.42,
    pOffer: 0.12,
    offerAcceptChance: 0.55,
    decisionTime: [300, 2200],
    discountChance: 0.35,
    categories: ["Laptops", "Electronics", "Smartphones", "Furniture", "Books", "Cycles"],
    queries: ["Laptop", "Headphones", "iPhone", "Is this genuine", "Seller rating", "Reviews"],
    repeatQueryBias: 0.35,
    weekendBias: 0.2,
  },
  browser: {
    label: "Window Shopper",
    sessions: [20, 32],
    hours: [19, 20, 21, 22, 23, 12, 13],
    pSearch: 0.6,
    views: [5, 11],
    pCategory: 0.55,
    pCompare: 0.22,
    pCompareSelected: 0.06,
    pReview: 0.3,
    pSeller: 0.2,
    pChat: 0.08,
    pPriceWatch: 0.5,
    pWishlist: 0.62,
    pCart: 0.3,
    pCartRemove: 0.55,
    pCheckout: 0.06,
    pPurchase: 0.03,
    pReviewSubmitted: 0.03,
    pOffer: 0.04,
    offerAcceptChance: 0.4,
    decisionTime: [600, 3000],
    discountChance: 0.2,
    categories: ["Gaming", "Smartphones", "Laptops", "Electronics", "Accessories", "Furniture", "Books"],
    queries: ["PS5", "iPhone", "Laptop", "Switch", "Headphones", "Under 20000", "New arrivals"],
    repeatQueryBias: 0.6,
    weekendBias: 0.45,
  },
};

export const PROFILE_ORDER = ["researcher", "bargain", "quick", "trust", "browser"];

/** Days back for a session, biased towards weekends for profiles that browse at leisure. */
const pickDayOffset = (rng, weekendBias) => {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const offset = intBetween(rng, 0, 44);
    const date = new Date();
    date.setDate(date.getDate() - offset);
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    if (isWeekend === chance(rng, weekendBias)) return offset;
  }
  return intBetween(rng, 0, 44);
};

const sessionStart = (rng, profile) => {
  const offset = pickDayOffset(rng, profile.weekendBias);
  const date = new Date();
  date.setDate(date.getDate() - offset);
  date.setHours(pick(rng, profile.hours), intBetween(rng, 0, 59), 0, 0);
  return date;
};

const productsInCategories = (products, categories) => {
  const pool = products.filter((product) => categories.includes(product.categoryName));
  return pool.length ? pool : products;
};

/**
 * Generate every event, order and offer for one customer.
 *
 * @returns {{events: object[], purchases: object[], offers: object[], profileType: string}}
 */
export const generateCustomerBehaviour = ({ user, profileType, products }) => {
  const rng = mulberry32(
    [...String(user._id)].reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) >>> 0, 7)
  );
  const profile = PROFILES[profileType];
  const events = [];
  const purchases = [];
  const offers = [];
  const pool = productsInCategories(products, profile.categories);

  const product = () => pick(rng, pool);
  const buyerProduct = () => product();

  const sessionCount = intBetween(rng, profile.sessions[0], profile.sessions[1]);
  // Repeat queries are what make `repeatedSearches` non-zero for some customers
  // and zero for others, instead of uniformly noisy.
  const stickyQueries = [pick(rng, profile.queries), pick(rng, profile.queries)];
  // A listing can only be sold once. Without this, a customer with enough
  // sessions eventually "buys" the same product repeatedly, which is impossible
  // in a real marketplace and inflates their purchase count and lifetime value.
  const purchasedProductIds = new Set();

  for (let sessionIndex = 0; sessionIndex < sessionCount; sessionIndex += 1) {
    const sessionId = `sess_${String(user._id).slice(-6)}_${sessionIndex.toString(36)}`;
    const start = sessionStart(rng, profile);
    let clock = start.getTime();
    const advance = (min, max) => {
      clock += intBetween(rng, min, max) * 60 * 1000;
      return new Date(clock);
    };

    const emit = (eventType, extra = {}) => {
      events.push({
        userId: user._id,
        eventType,
        sessionId,
        surface: extra.surface || "browse",
        timestamp: clock instanceof Date ? clock : new Date(clock),
        ...extra,
      });
    };

    if (chance(rng, 0.25)) {
      emit("LOGIN", { surface: "account", timestamp: new Date(clock), metadata: {} });
    }
    emit("SESSION_START", { surface: "app", metadata: { sessionIndex } });

    if (chance(rng, profile.pSearch)) {
      const query = chance(rng, profile.repeatQueryBias)
        ? pick(rng, stickyQueries)
        : pick(rng, profile.queries);
      emit("SEARCH", {
        surface: "search",
        category: pick(rng, profile.categories),
        metadata: { query },
        timestamp: advance(0, 1),
      });
    }

    if (chance(rng, profile.pCategory)) {
      emit("CATEGORY_VIEW", {
        surface: "category",
        category: pick(rng, profile.categories),
        metadata: {},
        timestamp: advance(0, 1),
      });
    }

    const viewCount = intBetween(rng, profile.views[0], profile.views[1]);
    for (let index = 0; index < viewCount; index += 1) {
      const item = buyerProduct();
      emit("PRODUCT_VIEW", {
        surface: "product",
        productId: item._id,
        category: item.categoryName,
        metadata: { source: pick(rng, ["search", "browse", "category", "recommendation"]) },
        timestamp: advance(0, 2),
      });
    }

    if (chance(rng, profile.pCompare)) {
      const item = buyerProduct();
      emit("PRODUCT_COMPARE", {
        surface: "compare",
        productId: item._id,
        category: item.categoryName,
        metadata: { compareSize: intBetween(rng, 2, 5) },
        timestamp: advance(0, 2),
      });
      if (chance(rng, profile.pCompareSelected)) {
        emit("COMPARE_SELECTED", {
          surface: "compare",
          productId: item._id,
          category: item.categoryName,
          metadata: { compareSize: intBetween(rng, 2, 4) },
          timestamp: advance(0, 1),
        });
      }
    }

    if (chance(rng, profile.pReview)) {
      const item = buyerProduct();
      emit("REVIEW_VIEW", {
        surface: "product",
        productId: item._id,
        category: item.categoryName,
        metadata: {},
        timestamp: advance(0, 2),
      });
    }

    if (chance(rng, profile.pSeller)) {
      const item = buyerProduct();
      emit("SELLER_PROFILE_VIEW", {
        surface: "seller",
        productId: item._id,
        metadata: { sellerId: item.seller, sellerRating: item.rating },
        timestamp: advance(0, 2),
      });
    }

    if (chance(rng, profile.pChat)) {
      const item = buyerProduct();
      emit("CHAT_STARTED", {
        surface: "chat",
        productId: item._id,
        metadata: { otherUserId: item.seller },
        timestamp: advance(0, 3),
      });
    }

    if (chance(rng, profile.pPriceWatch)) {
      const item = buyerProduct();
      emit("PRICE_WATCH", {
        surface: "product",
        productId: item._id,
        category: item.categoryName,
        metadata: { targetPrice: Math.round((item.price * intBetween(rng, 78, 96)) / 100) },
        timestamp: advance(0, 1),
      });
    }

    if (chance(rng, profile.pWishlist)) {
      const item = buyerProduct();
      emit("WISHLIST_ADD", {
        surface: "product",
        productId: item._id,
        category: item.categoryName,
        metadata: {},
        timestamp: advance(0, 1),
      });
      if (chance(rng, 0.25)) {
        emit("WISHLIST_REMOVE", {
          surface: "wishlist",
          productId: item._id,
          category: item.categoryName,
          metadata: {},
          timestamp: advance(0, 2),
        });
      }
    }

    let cartItem = null;
    if (chance(rng, profile.pCart)) {
      // Prefer a listing this customer has not already bought, so the cart funnel
      // does not keep pointing at sold stock.
      const unpurchased = pool.filter((item) => !purchasedProductIds.has(String(item._id)));
      cartItem = unpurchased.length ? pick(rng, unpurchased) : product();
      emit("CART_VIEW", { surface: "cart", metadata: {}, timestamp: advance(0, 1) });
      emit("CART_ADD", {
        surface: "product",
        productId: cartItem._id,
        category: cartItem.categoryName,
        metadata: {},
        timestamp: advance(0, 1),
      });
      if (chance(rng, profile.pCartRemove)) {
        emit("CART_REMOVE", {
          surface: "cart",
          productId: cartItem._id,
          category: cartItem.categoryName,
          metadata: {},
          timestamp: advance(0, 1),
        });
        cartItem = null;
      }
    }

    // Negotiation usually targets something not already in the cart.
    if (chance(rng, profile.pOffer)) {
      const target = product();
      const listed = target.originalPrice;
      const asked = Math.round((listed * intBetween(rng, 32, 72)) / 100);
      const rounds = chance(rng, 0.45) ? 2 : 1;
      emit("OFFER_SENT", {
        surface: "product",
        productId: target._id,
        category: target.categoryName,
        metadata: { offerAmount: asked, listedPrice: listed },
        timestamp: advance(0, 2),
      });

      const roll = rng();
      let status;
      if (roll < profile.offerAcceptChance) {
        status = "accepted";
        emit("OFFER_ACCEPTED", {
          surface: "negotiation",
          productId: target._id,
          metadata: { offerAmount: asked, listedPrice: listed },
          timestamp: advance(1, 6),
        });
      } else if (roll < profile.offerAcceptChance + 0.22) {
        const counter = Math.round((listed + asked) / 2);
        emit("COUNTER_OFFER", {
          surface: "negotiation",
          productId: target._id,
          metadata: { offerAmount: counter, listedPrice: listed },
          timestamp: advance(1, 5),
        });
        if (chance(rng, 0.45)) {
          status = "accepted";
          emit("OFFER_ACCEPTED", {
            surface: "negotiation",
            productId: target._id,
            metadata: { offerAmount: counter, listedPrice: listed },
            timestamp: advance(1, 5),
          });
        } else {
          status = "rejected";
          emit("OFFER_REJECTED", {
            surface: "negotiation",
            productId: target._id,
            metadata: { offerAmount: counter, listedPrice: listed },
            timestamp: advance(1, 5),
          });
        }
      } else if (roll < profile.offerAcceptChance + 0.32) {
        status = "expired";
      } else {
        status = "rejected";
        emit("OFFER_REJECTED", {
          surface: "negotiation",
          productId: target._id,
          metadata: { offerAmount: asked, listedPrice: listed },
          timestamp: advance(1, 5),
        });
      }

      offers.push({
        product: target,
        offerAmount: asked,
        listedPrice: listed,
        status,
        rounds,
        createdAt: new Date(clock),
      });
    }

    if (cartItem && chance(rng, profile.pCheckout)) {
      emit("CHECKOUT_START", {
        surface: "checkout",
        productId: cartItem._id,
        category: cartItem.categoryName,
        metadata: {},
        timestamp: advance(0, 2),
      });

      if (chance(rng, profile.pPurchase)) {
        // Only convert if the listing is still unclaimed by this customer.
        if (purchasedProductIds.has(String(cartItem._id))) {
          emit("CART_REMOVE", {
            surface: "cart",
            productId: cartItem._id,
            category: cartItem.categoryName,
            metadata: { abandonedCheckout: true, reason: "listing_already_purchased" },
            timestamp: advance(2, 20),
          });
          emit("SESSION_END", {
            surface: "app",
            metadata: { durationMinutes: Math.round((clock - start.getTime()) / 60000) },
            timestamp: advance(0, 2),
          });
          continue;
        }
        purchasedProductIds.add(String(cartItem._id));
        const discounted = chance(rng, profile.discountChance) && cartItem.negotiable;
        const finalPrice = discounted
          ? Math.round((cartItem.price * intBetween(rng, 78, 93)) / 100)
          : cartItem.price;
        const decisionTimeMinutes = intBetween(rng, profile.decisionTime[0], profile.decisionTime[1]);
        const reason = pick(rng, ["Best condition", "Brand", "Reviews", "Verified seller", "Lowest price", "Urgent requirement", "Best fit"]);
        const purchasedAt = advance(2, 12);

        emit("PURCHASE", {
          surface: "checkout",
          productId: cartItem._id,
          category: cartItem.categoryName,
          metadata: { finalPrice, decisionTimeMinutes, purchaseReason: reason },
          timestamp: purchasedAt,
        });
        purchases.push({
          product: cartItem,
          finalPrice,
          listedPrice: cartItem.originalPrice,
          decisionTimeMinutes,
          purchaseReason: reason,
          createdAt: purchasedAt,
        });

        if (chance(rng, profile.pReviewSubmitted)) {
          emit("REVIEW_SUBMITTED", {
            surface: "product",
            productId: cartItem._id,
            category: cartItem.categoryName,
            metadata: { rating: intBetween(rng, 3, 5) },
            timestamp: advance(60, 60 * 96),
          });
        }
        // Returns and exchanges are rare but must exist, otherwise `returnRate` and
        // `exchangePreference` are identically zero and carry no information.
        if (chance(rng, 0.05)) {
          emit("PRODUCT_RETURN", {
            surface: "orders",
            productId: cartItem._id,
            category: cartItem.categoryName,
            metadata: { reason: pick(rng, ["Not as described", "Damaged", "Changed mind"]) },
            timestamp: advance(60 * 24, 60 * 24 * 6),
          });
        } else if (chance(rng, 0.06) && cartItem.exchangeable) {
          emit("EXCHANGE_REQUEST", {
            surface: "orders",
            productId: cartItem._id,
            category: cartItem.categoryName,
            metadata: { reason: "Wanted different model" },
            timestamp: advance(60 * 24, 60 * 24 * 5),
          });
        }
      } else if (chance(rng, 0.5)) {
        // Abandoned checkout: started, never converted.
        emit("CART_REMOVE", {
          surface: "cart",
          productId: cartItem._id,
          category: cartItem.categoryName,
          metadata: { abandonedCheckout: true },
          timestamp: advance(2, 20),
        });
      }
    }

    emit("SESSION_END", {
      surface: "app",
      metadata: { durationMinutes: Math.round((clock - start.getTime()) / 60000) },
      timestamp: advance(0, 2),
    });
  }

  // Keep each session's events in chronological order regardless of how the
  // long tail (review after a purchase) was appended.
  events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  return { events, purchases, offers, profileType, profileLabel: profile.label };
};
