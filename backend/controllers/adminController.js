import mongoose from "mongoose";
import {
  User, Product, ProductReport, Order, BehaviorEvent, Review, Offer, PriceHistory,
  CustomerFeature, ClusterResult, ClusterRun, CustomerPersona, Category, Wishlist, Chat, PriceWatch,
} from "../models/index.js";
import { getLatestCompleteClusterRun } from "./mlController.js";
import { getCategoryAttraction } from "../services/categoryAttraction.js";
import { getProductIntelligenceDetail } from "../services/productIntelligence.js";
import { getCustomerAttraction } from "../services/customerAttraction.js";
import {
  getAttractionAnalytics,
  getSalesInsights,
  getSellerIntelligence,
} from "../services/marketplaceIntelligence.js";
import {
  applyModeration,
  countProductReferences,
  normalizeModerationReason,
} from "../services/moderation.js";
import { LISTING_STATUSES, MODERATION_STATUSES } from "../utils/listingStatus.js";
import { contains, pagination } from "../utils/text.js";

export const getDashboardStats = async (req, res) => {
  try {
    const [totalCustomers, totalProducts, totalOrders, activeCustomers, repeatCustomers, totalSellers, productCategories] = await Promise.all([
      User.countDocuments({ role: "customer" }),
      Product.countDocuments({ status: { $ne: "removed" } }),
      Order.countDocuments(),
      User.countDocuments({ role: "customer", lastActive: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }),
      Order.aggregate([
        { $group: { _id: "$buyerId", count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } },
        { $count: "total" },
      ]).then(r => (r[0] ? r[0].total : 0)),
      User.countDocuments({ role: "customer", isVerifiedSeller: true }),
      Category.countDocuments(),
    ]);

    const totalRevenue = await Order.aggregate([
      { $group: { _id: null, total: { $sum: "$finalPrice" } } },
    ]).then(r => (r[0] ? r[0].total : 0));

    const conversionRate = totalOrders > 0 && totalCustomers > 0 ? ((totalOrders / totalCustomers) * 100).toFixed(2) : 0;
    const avgOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

    const eventsLast7 = await BehaviorEvent.countDocuments({ timestamp: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } });

    res.json({
      totalCustomers,
      totalSellers,
      totalProducts,
      productCategories,
      totalOrders,
      totalRevenue,
      activeCustomers,
      repeatCustomers,
      conversionRate: Number(conversionRate),
      avgOrderValue,
      eventsLast7,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getTrends = async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 14, 90);
    const start = new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000);
    start.setHours(0, 0, 0, 0);

    const dayKey = { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } };
    const orderDayKey = { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } };

    const [activity, sales, searches, purchases, signups] = await Promise.all([
      BehaviorEvent.aggregate([
        { $match: { timestamp: { $gte: start } } },
        { $group: { _id: dayKey, events: { $sum: 1 } } },
      ]),
      Order.aggregate([
        { $match: { createdAt: { $gte: start } } },
        { $group: { _id: orderDayKey, orders: { $sum: 1 }, revenue: { $sum: "$finalPrice" } } },
      ]),
      BehaviorEvent.aggregate([
        { $match: { timestamp: { $gte: start }, eventType: "SEARCH" } },
        { $group: { _id: dayKey, count: { $sum: 1 } } },
      ]),
      BehaviorEvent.aggregate([
        { $match: { timestamp: { $gte: start }, eventType: "PURCHASE" } },
        { $group: { _id: dayKey, count: { $sum: 1 } } },
      ]),
      User.aggregate([
        { $match: { createdAt: { $gte: start }, role: "customer" } },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
      ]),
    ]);

    const toMap = (agg, key) => { const m = new Map(); agg.forEach((r) => m.set(String(r._id), r)); return m; };
    const activityMap = toMap(activity);
    const salesMap = toMap(sales);
    const searchMap = toMap(searches);
    const purchaseMap = toMap(purchases);
    const signupMap = toMap(signups);

    const trend = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      trend.push({
        date: key,
        label: d.toLocaleDateString(undefined, { day: "numeric", month: "short" }),
        events: activityMap.get(key)?.events || 0,
        orders: salesMap.get(key)?.orders || 0,
        revenue: salesMap.get(key)?.revenue || 0,
        searches: searchMap.get(key)?.count || 0,
        purchases: purchaseMap.get(key)?.count || 0,
        signups: signupMap.get(key)?.count || 0,
      });
    }

    const categoryTrend = await Product.aggregate([
      { $match: { status: { $ne: "removed" }, categoryName: { $ne: "" } } },
      { $group: { _id: "$categoryName", products: { $sum: 1 }, avgPrice: { $avg: "$price" }, avgViews: { $avg: "$views" } } },
      { $sort: { products: -1 } },
    ]);

    res.json({ trend, categoryTrend });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getCustomers = async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const filter = { role: "customer" };
    if (search) filter.name = { $regex: new RegExp(search, "i") };
    const latestRun = await getLatestCompleteClusterRun();
    const latestHybrid = latestRun?.run || null;
    const personaMap = {};
    if (latestHybrid && latestHybrid.labels) {
      const personas = await CustomerPersona.find({ runId: latestHybrid.runId }).lean();
      personas.forEach((p) => { personaMap[p.personaId] = p.name; });
    }

    const customers = await User.find(filter).select("-password").sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean();
    const enriched = await Promise.all(customers.map(async (c) => {
      const [features, orderAgg] = await Promise.all([
        CustomerFeature.findOne({ userId: c._id }).lean(),
        Order.aggregate([{ $match: { buyerId: c._id } }, { $group: { _id: null, orders: { $sum: 1 }, spent: { $sum: "$finalPrice" } } }]),
      ]);
      const cluster = latestHybrid?.labels?.[String(c._id)];
      return {
        ...c,
        totalSpent: orderAgg[0]?.spent || 0,
        orderCount: orderAgg[0]?.orders || 0,
        decisionTime: features?.decisionTime || 0,
        persona: cluster !== undefined && cluster !== -1 ? personaMap[String(cluster)] || null : null,
        clusterId: cluster === undefined ? null : cluster,
      };
    }));
    const total = await User.countDocuments(filter);
    res.json({ customers: enriched, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getCustomerDetail = async (req, res) => {
  try {
    const userId = req.params.id;
    const [user, features, clusterResult, orders, timeline, wishlistItems, offers, watches] = await Promise.all([
      User.findById(userId).select("-password").lean(),
      CustomerFeature.findOne({ userId }).lean(),
       getLatestCompleteClusterRun().then((latest) => latest?.run || null),

      Order.find({ buyerId: userId }).populate("productId", "title price images").sort({ createdAt: -1 }).lean(),
      BehaviorEvent.find({ userId }).sort({ timestamp: -1 }).limit(80).populate("productId", "title price").lean(),
      Wishlist.findOne({ userId }).lean(),
      Offer.find({ buyerId: userId }).sort({ createdAt: -1 }).populate("productId", "title").lean(),
      PriceWatch.find({ userId }).lean(),
    ]);
    if (!user) return res.status(404).json({ message: "Customer not found" });

    let assignedPersona = null;
    let clusterId = null;
    if (clusterResult && clusterResult.labels) {
      clusterId = clusterResult.labels[String(userId)];
      if (clusterId !== undefined && clusterId !== null && clusterId !== -1) {
        assignedPersona = await CustomerPersona.findOne({ runId: clusterResult.runId, personaId: Number(clusterId) }).lean();
      }
    }

    const purchaseCount = orders.length;
    const totalSpending = orders.reduce((s, o) => s + (o.finalPrice || 0), 0);

    const searchBehavior = await BehaviorEvent.aggregate([
      { $match: { userId, eventType: "SEARCH" } },
      { $group: { _id: "$metadata.query", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 8 },
    ]);

    const viewedCategories = await BehaviorEvent.aggregate([
      { $match: { userId, eventType: "PRODUCT_VIEW", category: { $ne: "" } } },
      { $group: { _id: "$category", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 6 },
    ]);

    res.json({
      user,
      features: features || {},
      clusterId,
      persona: assignedPersona,
      timeline,
      orders,
      purchaseCount,
      totalSpending,
      wishlistCount: wishlistItems?.products?.length || 0,
      offers,
      priceWatches: watches.length,
      searchBehavior,
      viewedCategories,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /api/admin/customers/:id/attraction
 *
 * Which categories and listings is this one customer drawn to? Scored from their
 * own recorded behaviour, so the shares describe this customer and are not a
 * slice of some overall ranking.
 *
 * A separate endpoint from `getCustomerDetail` on purpose: the detail page
 * already answers "who is this customer" and answers it in a single round trip,
 * while this is an expensive behavioural aggregation. Folding it in would make
 * every customer page load scan and join the whole event log, and a customer
 * with no activity would still cost the same as a power shopper's page. The
 * client loads it alongside the detail, and it carries its own loading and
 * no-data states.
 */
export const getCustomerAttractionAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid customer id" });
    }
    const attraction = await getCustomerAttraction(id);
    if (!attraction) return res.status(404).json({ message: "Customer not found" });
    res.json(attraction);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /api/admin/products
 *
 * The listings console's data source. Two things changed from the old read-only
 * version: `removed` listings are included again (an admin has to be able to see
 * and audit a takedown, not just the ones still on sale), and the moderation
 * picture - live counts per status, and open-report counts per listing - is
 * included in the same round trip so the table can show why a row is red without
 * an N+1 query per row.
 */
export const getProductsAdmin = async (req, res) => {
  try {
    const { page, limit, skip } = pagination(req.query, { defaultLimit: 20, maxLimit: 100 });
    const { search, status, category, seller } = req.query;

    const filter = {};
    if (status && LISTING_STATUSES.includes(status)) {
      filter.status = status;
    } else if (status === "moderated") {
      filter.status = { $in: MODERATION_STATUSES };
    }
    if (category) filter.categoryName = category;
    if (mongoose.isValidObjectId(String(seller))) filter.seller = seller;
    const title = contains(search);
    if (title) filter.title = title;

    const [products, total, byStatus] = await Promise.all([
      Product.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("seller", "name email isVerifiedSeller")
        .populate("category", "name")
        .lean(),
      Product.countDocuments(filter),
      Product.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    ]);

    // Open reports per listing, for the rows on this page only.
    const pageIds = products.map((p) => p._id);
    const openReports = pageIds.length
      ? await ProductReport.aggregate([
          { $match: { productId: { $in: pageIds }, status: { $in: ["open", "reviewing"] } } },
          { $group: { _id: "$productId", count: { $sum: 1 } } },
        ])
      : [];
    const reportCountById = new Map(openReports.map((row) => [String(row._id), row.count]));

    res.json({
      products: products.map((p) => ({ ...p, openReportCount: reportCountById.get(String(p._id)) || 0 })),
      total,
      page,
      limit,
      statuses: LISTING_STATUSES,
      facets: { byStatus: Object.fromEntries(byStatus.map((r) => [r._id, r.count])) },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /api/admin/products/:id
 *
 * Everything about one listing in a single call, including whether it can be
 * permanently deleted. The reference counts are not informational: they are the
 * input to the delete guard on the listings page, and they are the honest answer
 * to "what would actually break if I removed this?".
 */
export const getProductDetailAdmin = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid listing" });
    }
    const product = await Product.findById(req.params.id)
      .populate("seller", "name email isVerifiedSeller createdAt")
      .populate("category", "name")
      .lean();
    if (!product) return res.status(404).json({ message: "Listing not found" });

    const [references, orders, offers, reviews, reports] = await Promise.all([
      countProductReferences(product._id),
      Order.find({ productId: product._id }).sort({ createdAt: -1 }).limit(10)
        .populate("buyerId", "name").lean(),
      Offer.find({ productId: product._id }).sort({ createdAt: -1 }).limit(10)
        .populate("buyerId", "name").lean(),
      Review.find({ productId: product._id }).sort({ createdAt: -1 }).limit(5)
        .populate("userId", "name").lean(),
      ProductReport.find({ productId: product._id }).sort({ createdAt: -1 }).limit(20).lean(),
    ]);

    res.json({ product, references, orders, offers, reviews, reports, canDelete: references.canDelete });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * PATCH /api/admin/products/:id/status
 *
 * Takes a listing off the storefront, or puts it back. The work happens in
 * `applyModeration` so the reasons, the audit trail, the offer expiry and the
 * seller notification are identical whether the admin acted from this table, the
 * detail panel, or the report queue.
 */
export const updateProductStatusAdmin = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid listing" });
    }
    const { status, reason, note } = req.body || {};
    if (!LISTING_STATUSES.includes(status)) {
      return res.status(400).json({ message: "Choose a valid status for this listing" });
    }
    if (reason && !normalizeModerationReason(reason)) {
      return res.status(400).json({ message: "Unknown moderation reason" });
    }

    const { product, previousStatus, changed } = await applyModeration({
      productId: req.params.id,
      status,
      reason,
      note,
      admin: req.user,
    });
    res.json({
      product,
      previousStatus,
      changed,
      message: changed
        ? `"${product.title}" is now ${status}`
        : `"${product.title}" was already ${status}`,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * DELETE /api/admin/products/:id
 *
 * Permanent deletion, and it is the last option rather than the first. A listing
 * is refused while anything another party owns points at it - an order, an
 * offer, a review, a conversation - because those belong to customers and
 * sellers, not to the listing, and deleting the listing would leave their records
 * dangling. When that happens the seller-visible answer is a takedown, which is
 * reversible and keeps every record intact.
 *
 * Two things are cleaned up or kept deliberately rather than treated as blockers:
 * price history is deleted with the listing because it belongs to the listing,
 * and behaviour events are kept because they are the segmentation training data
 * - so the response reports what was removed and what was retained, and the
 * delete is never silent.
 */
export const removeProductAdmin = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid listing" });
    }
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Listing not found" });

    const references = await countProductReferences(product._id);
    if (references.blockers.length) {
      return res.status(409).json({
        message: `"${product.title}" cannot be deleted: it is referenced by ${references.blockers
          .map((b) => `${b.count} ${b.label}${b.count === 1 ? "" : "s"}`)
          .join(", ")}. Take it off the marketplace instead - that is reversible.`,
        references,
        canDelete: false,
      });
    }

    if (references.removable.length) {
      await PriceHistory.deleteMany({ productId: product._id });
    }
    await Product.findByIdAndDelete(product._id);
    res.json({
      message: `"${product.title}" was permanently deleted`,
      deleted: true,
      removedWithListing: references.removable,
      // Behaviour events are intentionally orphaned, not orphaned by accident.
      retainedByDesign: references.retained,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /api/admin/moderation/stats
 *
 * The counts the moderation header shows, and the reason most listings came off
 * the market this month - the number that tells an admin whether the policy work
 * is actually working.
 */
export const getModerationStats = async (req, res) => {
  try {
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [byStatus, openReports, resolvedThisMonth, reasonsThisMonth, moderatedListings] = await Promise.all([
      Product.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      ProductReport.countDocuments({ status: { $in: ["open", "reviewing"] } }),
      ProductReport.countDocuments({ status: "resolved", resolvedAt: { $gte: monthAgo } }),
      Product.aggregate([
        { $match: { status: { $in: MODERATION_STATUSES } } },
        { $group: { _id: "$moderationReason", count: { $sum: 1 } } },
      ]),
      Product.countDocuments({ status: { $in: MODERATION_STATUSES } }),
    ]);

    res.json({
      byStatus: Object.fromEntries(byStatus.map((r) => [r._id, r.count])),
      moderatedListings,
      openReports,
      resolvedThisMonth,
      topReasons: Object.fromEntries(reasonsThisMonth.map((r) => [r._id || "unspecified", r.count])),
      statuses: LISTING_STATUSES,
      moderationStatuses: MODERATION_STATUSES,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getOrdersAdmin = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const orders = await Order.find().sort({ createdAt: -1 }).skip(skip).limit(Number(limit))
      .populate("buyerId", "name email")
      .populate("sellerId", "name email")
      .populate("productId", "title price images")
      .lean();
    const total = await Order.countDocuments();
    res.json({ orders, total });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /api/admin/products/:productId/intelligence
 *
 * The product-level workspace, and the counterpart to the catalogue rankings
 * above. Those answer "which listings are hot" from denormalised counters; this
 * answers "what is actually happening around *this* listing" from the event log,
 * orders, offers and the newest segmentation run - in a single response, because
 * the panels have to agree with each other and eleven independent requests would
 * let them disagree.
 *
 * The aggregation itself lives in services/productIntelligence.js. The controller
 * only distinguishes a malformed id from a missing listing, so a client never has
 * to guess which of the two it got.
 */
export const getProductIntelligenceDetailAdmin = async (req, res) => {
  try {
    const { productId } = req.params;
    if (!mongoose.isValidObjectId(productId)) {
      return res.status(400).json({ message: "Invalid listing id" });
    }
    const intelligence = await getProductIntelligenceDetail(productId);
    if (!intelligence) return res.status(404).json({ message: "Listing not found" });
    res.json(intelligence);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getProductIntelligence = async (req, res) => {
  try {
    const base = { status: { $ne: "removed" } };
    const proj = "title categoryName category price views orderCount wishlistCount compareCount reviewCount seller";
    const [mostViewed, mostCompared, mostWishlisted, mostPurchased, categoryIntelligence, priceBands] = await Promise.all([
      Product.find(base).sort({ views: -1 }).limit(10).select(proj).populate("seller", "name").lean(),
      Product.find(base).sort({ compareCount: -1 }).limit(10).select(proj).populate("seller", "name").lean(),
      Product.find(base).sort({ wishlistCount: -1 }).limit(10).select(proj).populate("seller", "name").lean(),
      Product.find(base).sort({ orderCount: -1 }).limit(10).select(proj).populate("seller", "name").lean(),
      Product.aggregate([
        { $match: { status: { $ne: "removed" }, categoryName: { $ne: "" } } },
        {
          $group: {
            _id: "$categoryName",
            products: { $sum: 1 },
            totalViews: { $sum: "$views" },
            totalOrders: { $sum: "$orderCount" },
            totalWishlists: { $sum: "$wishlistCount" },
            totalCompared: { $sum: "$compareCount" },
            avgPrice: { $avg: "$price" },
            avgDiscount: {
              $avg: {
                $cond: [
                  { $and: [{ $gt: ["$originalPrice", 0] }, { $lt: ["$price", "$originalPrice"] }] },
                  { $multiply: [{ $divide: [{ $subtract: ["$originalPrice", "$price"] }, "$originalPrice"] }, 100] },
                  0,
                ],
              },
            },
          },
        },
        { $sort: { products: -1 } },
      ]),
      Product.aggregate([
        { $match: { status: { $ne: "removed" }, originalPrice: { $gt: 0 } } },
        {
          $project: {
            label: {
              $switch: {
                branches: [
                  { case: { $eq: ["$price", "$originalPrice"] }, then: "At list price (0%)" },
                  { case: { $lt: [{ $multiply: [{ $divide: [{ $subtract: ["$originalPrice", "$price"] }, "$originalPrice"] }, 100] }, 15] }, then: "Slight discount (<15%)" },
                  { case: { $lt: [{ $multiply: [{ $divide: [{ $subtract: ["$originalPrice", "$price"] }, "$originalPrice"] }, 100] }, 35] }, then: "Good discount (15-35%)" },
                ],
                // MongoDB requires every entry in `branches` to carry a `case`,
                // so the catch-all band has to be expressed as the default
                // rather than as a fourth caseless branch. The caseless branch
                // made this whole aggregation fail to parse, which took the
                // entire catalogue payload down with it.
                default: "Deep discount (>35%)",
              },
            },
            views: 1,
            orderCount: 1,
            wishlistCount: 1,
            price: 1,
          },
        },
        {
          $group: {
            _id: "$label",
            products: { $sum: 1 },
            views: { $sum: "$views" },
            orders: { $sum: "$orderCount" },
            wishlists: { $sum: "$wishlistCount" },
            avgPrice: { $avg: "$price" },
          },
        },
      ]),
    ]);

    const withConversion = (list) => list.map((p) => ({
      ...p,
      attentionRatio: p.views > 0 ? Number(((p.orderCount / Math.max(p.views, 1)) * 1000).toFixed(2)) : 0,
    }));

    res.json({
      mostViewed: withConversion(mostViewed),
      mostCompared: withConversion(mostCompared),
      mostWishlisted: withConversion(mostWishlisted),
      mostPurchased: withConversion(mostPurchased),
      categoryIntelligence,
      priceBands,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /api/admin/sellers
 *
 * The seller directory. The shape it returned before (listings / sold / orders)
 * is kept so the existing marketplace page keeps working, and the per-seller
 * counts are now computed in three aggregate passes over the page's seller IDs
 * instead of three count queries per row - fifteen rows used to mean forty-five
 * round trips. Flagged listings and open reports are added because "who is
 * creating problems" is the question this page exists to answer.
 */
export const getSellersAdmin = async (req, res) => {
  try {
    const { page, limit, skip } = pagination(req.query, { defaultLimit: 15, maxLimit: 100 });
    const { search, verified, flagged } = req.query;

    const filter = { role: "customer" };
    if (search) filter.name = contains(search);
    if (verified === "true") filter.isVerifiedSeller = true;

    /* "Needs a look" has to be resolved before pagination, not after it.
       Filtering the enriched page instead would report the unfiltered total and
       hand out pages that are mostly empty, so the seller ids that have a
       moderated listing or an open report are resolved first and used as a
       proper $in filter. */
    if (flagged === "true") {
      const [moderatedSellers, reportedSellers] = await Promise.all([
        Product.distinct("seller", { status: { $in: MODERATION_STATUSES } }),
        ProductReport.distinct("sellerId", { status: { $in: ["open", "reviewing"] } }),
      ]);
      const troubled = [...new Set([...moderatedSellers, ...reportedSellers].map(String))];
      filter._id = { $in: troubled.map((id) => new mongoose.Types.ObjectId(id)) };
    }

    const sellers = await User.find(filter)
      .select("-password")
      .sort({ sellerRating: -1, createdAt: -1 })
      .skip(skip).limit(limit).lean();
    const total = await User.countDocuments(filter);
    const ids = sellers.map((s) => s._id);

    const [listingStats, orderStats, reportStats] = ids.length
      ? await Promise.all([
          Product.aggregate([
            { $match: { seller: { $in: ids } } },
            {
              $group: {
                _id: "$seller",
                listings: { $sum: 1 },
                soldCount: { $sum: { $cond: [{ $eq: ["$status", "sold"] }, 1, 0] } },
                removedCount: { $sum: { $cond: [{ $eq: ["$status", "removed"] }, 1, 0] } },
                flaggedCount: {
                  $sum: { $cond: [{ $in: ["$status", MODERATION_STATUSES] }, 1, 0] },
                },
                revenue: { $sum: { $cond: [{ $eq: ["$status", "sold"] }, "$price", 0] } },
              },
            },
          ]),
          Order.aggregate([
            { $match: { sellerId: { $in: ids } } },
            { $group: { _id: "$sellerId", orderCount: { $sum: 1 } } },
          ]),
          ProductReport.aggregate([
            { $match: { sellerId: { $in: ids }, status: { $in: ["open", "reviewing"] } } },
            { $group: { _id: "$sellerId", openReports: { $sum: 1 } } },
          ]),
        ])
      : [[], [], []];

    const listingMap = new Map(listingStats.map((r) => [String(r._id), r]));
    const orderMap = new Map(orderStats.map((r) => [String(r._id), r]));
    const reportMap = new Map(reportStats.map((r) => [String(r._id), r]));

    let enriched = sellers.map((s) => ({
      ...s,
      listings: listingMap.get(String(s._id))?.listings || 0,
      soldCount: listingMap.get(String(s._id))?.soldCount || 0,
      removedCount: listingMap.get(String(s._id))?.removedCount || 0,
      flaggedCount: listingMap.get(String(s._id))?.flaggedCount || 0,
      orderCount: orderMap.get(String(s._id))?.orderCount || 0,
      openReports: reportMap.get(String(s._id))?.openReports || 0,
    }));

    res.json({ sellers: enriched, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /api/admin/sellers/:id
 *
 * One seller's whole footprint: their listings grouped by status, their orders,
 * their open reports, and their reviews. This is the "is this seller a problem,
 * and is it one listing or a pattern?" view, which the sellers table cannot show.
 */
export const getSellerDetailAdmin = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid seller" });
    }
    const seller = await User.findById(req.params.id).select("-password").lean();
    if (!seller) return res.status(404).json({ message: "Seller not found" });

    const [listings, listingBreakdown, listingIds, orders, reports, revenue] = await Promise.all([
      Product.find({ seller: seller._id })
        .sort({ createdAt: -1 })
        .populate("category", "name")
        .lean(),
      Product.aggregate([
        { $match: { seller: seller._id } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      // Needed up front so the review query can match "reviews of this seller's
      // listings" without a second lookup inside the aggregation.
      Product.distinct("_id", { seller: seller._id }),
      Order.find({ sellerId: seller._id }).sort({ createdAt: -1 }).limit(20)
        .populate("buyerId", "name")
        .populate("productId", "title price images status")
        .lean(),
      ProductReport.find({ sellerId: seller._id }).sort({ createdAt: -1 }).limit(20).lean(),
      Order.aggregate([
        { $match: { sellerId: seller._id, status: { $nin: ["cancelled", "returned"] } } },
        { $group: { _id: null, total: { $sum: "$finalPrice" } } },
      ]).then((r) => r[0]?.total || 0),
    ]);

    const reviews = await Review.find({
      $or: [{ userId: seller._id }, { productId: { $in: listingIds } }],
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate("userId", "name")
      .lean();

    res.json({
      seller,
      listings,
      listingBreakdown: Object.fromEntries(listingBreakdown.map((r) => [r._id, r.count])),
      orders,
      reviews,
      reports,
      revenue,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * PATCH /api/admin/sellers/:id
 *
 * Verification only. This is deliberately narrow: it does not touch the seller's
 * listings, orders or reviews, because "this account is no longer a verified
 * seller" and "these listings are wrong" are separate decisions and an admin may
 * well want the first without the second. Existing listings are left exactly as
 * they are and simply lose the badge.
 */
export const updateSellerAdmin = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid seller" });
    }
    const { isVerifiedSeller } = req.body || {};
    if (typeof isVerifiedSeller !== "boolean") {
      return res.status(400).json({ message: "Provide isVerifiedSeller as true or false" });
    }
    const seller = await User.findById(req.params.id);
    if (!seller) return res.status(404).json({ message: "Seller not found" });
    if (String(seller.role) === "admin") {
      return res.status(400).json({ message: "This account is an administrator, not a seller" });
    }
    seller.isVerifiedSeller = isVerifiedSeller;
    await seller.save();
    res.json({
      seller: { _id: seller._id, name: seller.name, email: seller.email, isVerifiedSeller: seller.isVerifiedSeller },
      message: isVerifiedSeller
        ? `${seller.name} is now a verified seller`
        : `${seller.name} is no longer a verified seller`,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getMarketplaceReports = async (req, res) => {
  try {
    const [reviewsLast7, offersByStatus, ordersByStatus, categoryOfferRate] = await Promise.all([
      Review.find().sort({ createdAt: -1 }).limit(6)
        .populate("userId", "name")
        .populate("productId", "title")
        .lean()
        .then((r) => r.map((x) => ({ ...x, userName: x.userId?.name, productTitle: x.productId?.title }))),
      Offer.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Order.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Product.aggregate([
        { $match: { status: { $ne: "removed" }, categoryName: { $ne: "" } } },
        {
          $group: {
            _id: "$categoryName",
            negotiableShare: { $avg: { $cond: [{ $eq: ["$negotiable", true] }, 1, 0] } },
            avgDiscount: {
              $avg: {
                $cond: [
                  { $and: [{ $gt: ["$originalPrice", 0] }, { $lt: ["$price", "$originalPrice"] }] },
                  { $multiply: [{ $divide: [{ $subtract: ["$originalPrice", "$price"] }, "$originalPrice"] }, 100] },
                  0,
                ],
              },
            },
            products: { $sum: 1 },
          },
        },
        { $sort: { products: -1 } },
      ]),
    ]);
    res.json({ reviewsLast7, offersByStatus, ordersByStatus, categoryOfferRate });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getAnalytics = async (req, res) => {
  try {
    const [mostSearched, mostViewed, mostCompared, mostWishlisted, categoryPopularity, categoryAttraction, orderStats, mostNegotiated] = await Promise.all([
      BehaviorEvent.aggregate([
        { $match: { eventType: "SEARCH" } },
        { $group: { _id: "$metadata.query", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      Product.find({ status: { $ne: "removed" } }).sort({ views: -1 }).limit(10).select("title views price category").lean(),
      Product.find({ status: { $ne: "removed" } }).sort({ compareCount: -1 }).limit(10).select("title compareCount price").lean(),
      Product.find({ status: { $ne: "removed" } }).sort({ wishlistCount: -1 }).limit(10).select("title wishlistCount price").lean(),
    Product.aggregate([
      { $match: { status: { $ne: "removed" } } },
      { $group: { _id: "$categoryName", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    getCategoryAttraction(),
    Order.aggregate([

        {
          $group: {
            _id: null,
            totalRevenue: { $sum: "$finalPrice" },
            avgOrderValue: { $avg: "$finalPrice" },
            avgDiscount: { $avg: "$discountPercent" },
          },
        },
      ]),
      Product.find({ status: { $ne: "removed" } }).sort({ orderCount: -1 }).limit(10).select("title orderCount price categoryName").lean(),
    ]);

    const totalSearches = await BehaviorEvent.countDocuments({ eventType: "SEARCH" });
    const cartAdds = await BehaviorEvent.countDocuments({ eventType: "CART_ADD" });
    const cartRemoves = await BehaviorEvent.countDocuments({ eventType: "CART_REMOVE" });
    const checkouts = await BehaviorEvent.countDocuments({ eventType: "CHECKOUT_START" });
    const purchases = await BehaviorEvent.countDocuments({ eventType: "PURCHASE" });
    const productViews = await BehaviorEvent.countDocuments({ eventType: "PRODUCT_VIEW" });
    const comparisons = await BehaviorEvent.countDocuments({ eventType: "PRODUCT_COMPARE" });
    const wishlistAdds = await BehaviorEvent.countDocuments({ eventType: "WISHLIST_ADD" });
    const offerSents = await BehaviorEvent.countDocuments({ eventType: "OFFER_SENT" });
    const offerAccepted = await BehaviorEvent.countDocuments({ eventType: "OFFER_ACCEPTED" });
    const offerRejected = await BehaviorEvent.countDocuments({ eventType: "OFFER_REJECTED" });
    const counterOffers = await BehaviorEvent.countDocuments({ eventType: "COUNTER_OFFER" });
    const sellerChecks = await BehaviorEvent.countDocuments({ eventType: "SELLER_PROFILE_VIEW" });
    const reviewViews = await BehaviorEvent.countDocuments({ eventType: "REVIEW_VIEW" });
    const reviewSubmits = await BehaviorEvent.countDocuments({ eventType: "REVIEW_SUBMITTED" });
    const priceWatchCount = await BehaviorEvent.countDocuments({ eventType: "PRICE_WATCH" });
    const chatStarts = await BehaviorEvent.countDocuments({ eventType: "CHAT_STARTED" });

    const rawAbandonment = cartAdds > 0 ? (((cartAdds - purchases) / cartAdds) * 100).toFixed(1) : 0;
    const cartAbandonmentRate = Math.max(0, Number(rawAbandonment));

    const avgDecisionTime = await Order.aggregate([
      { $match: { decisionTimeMinutes: { $gt: 0 } } },
      { $group: { _id: null, avg: { $avg: "$decisionTimeMinutes" } } },
    ]);

    const negotiationRounds = await Offer.aggregate([
      { $group: { _id: "$sellerId", rounds: { $sum: "$rounds" } } },
      { $group: { _id: null, avg: { $avg: "$rounds" } } },
    ]);

    const repeatPurchases = await Order.aggregate([
      { $group: { _id: "$buyerId", count: { $sum: 1 } } },
      { $group: { _id: null, total: { $sum: 1 }, repeat: { $sum: { $cond: [{ $gt: ["$count", 1] }, 1, 0] } } } },
    ]);

    const behaviorSummary = [
      { key: "Searches", value: totalSearches },
      { key: "Product Views", value: productViews },
      { key: "Comparisons", value: comparisons },
      { key: "Wishlist Adds", value: wishlistAdds },
      { key: "Cart Adds", value: cartAdds },
      { key: "Cart Removes", value: cartRemoves },
      { key: "Checkout Starts", value: checkouts },
      { key: "Purchases", value: purchases },
      { key: "Offers Sent", value: offerSents },
      { key: "Offers Accepted", value: offerAccepted },
      { key: "Offers Rejected", value: offerRejected },
      { key: "Counter Offers", value: counterOffers },
      { key: "Seller Checks", value: sellerChecks },
      { key: "Review Views", value: reviewViews },
      { key: "Reviews Submitted", value: reviewSubmits },
      { key: "Price Watches", value: priceWatchCount },
      { key: "Chats Started", value: chatStarts },
    ];

    const purchaseReasons = await Order.aggregate([
      { $match: { purchaseReason: { $ne: "" } } },
      { $group: { _id: "$purchaseReason", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    res.json({
      mostSearched,
      mostViewed,
      mostCompared,
      mostWishlisted,
      mostNegotiated,
      // Supply-side: how many listings exist per category.
      categoryPopularity,
      // Demand-side: how much real customer interest each category has
      // attracted. Derived from behaviour events, not listing counts.
      categoryAttraction,
      behaviorSummary,
      purchaseReasons,
      cartAbandonmentRate: Number(cartAbandonmentRate),
      avgDecisionTime: avgDecisionTime[0]?.avg?.toFixed(1) || 0,
      avgNegotiationRounds: negotiationRounds[0]?.avg?.toFixed(1) || 0,
      avgDiscount: orderStats[0]?.avgDiscount?.toFixed(1) || 0,
      repeatPurchaseRate: repeatPurchases[0]?.total
        ? ((repeatPurchases[0].repeat / repeatPurchases[0].total) * 100).toFixed(1)
        : 0,
      totalRevenue: orderStats[0]?.totalRevenue || 0,
      avgOrderValue: orderStats[0]?.avgOrderValue?.toFixed(0) || 0,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getCustomerJourney = async (req, res) => {
  try {
    const { customerId } = req.query;
    const filter = {};
    if (customerId) filter.userId = customerId;

    const STAGES = [
      { event: "SEARCH", stage: "Search" },
      { event: "PRODUCT_VIEW", stage: "View" },
      { event: "PRODUCT_COMPARE", stage: "Compare" },
      { event: "SELLER_PROFILE_VIEW", stage: "Trust" },
      { event: "WISHLIST_ADD", stage: "Wishlist" },
      { event: "CART_ADD", stage: "Cart" },
      { event: "OFFER_SENT", stage: "Offer" },
      { event: "CHECKOUT_START", stage: "Checkout" },
      { event: "PURCHASE", stage: "Purchase" },
    ];

    const [funnel, recentEvents, journeys] = await Promise.all([
      Promise.all(STAGES.map(async (s) => ({
        stage: s.stage,
        event: s.event,
        count: await BehaviorEvent.countDocuments({ ...filter, eventType: s.event }),
      }))),
      BehaviorEvent.find({ ...filter }).sort({ timestamp: -1 }).limit(60).populate("productId", "title").lean(),
      BehaviorEvent.aggregate([
        ...(customerId ? [{ $match: { userId: mongoose.Types.ObjectId.createFromHexString(customerId) } }] : [{ $match: {} }]),
        { $sort: { timestamp: 1 } },
        { $group: { _id: "$userId", first: { $first: "$eventType" }, last: { $last: "$eventType" }, count: { $sum: 1 } } },
        { $limit: 200 },
      ]),
    ]);

    res.json({ funnel, recentEvents, journeys: journeys.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * The personas for the current segmentation, plus enough context about the run
 * that produced them to explain where they came from.
 *
 * The page this feeds is the "who are our customers" answer, so it has to be
 * able to say which algorithm, how many customers, how many clusters and when.
 * That context is read from the run rather than hard-coded in the UI, so the page
 * can never describe a run it is not showing.
 */
export const getPersonas = async (req, res) => {
  try {
    const latest = await getLatestCompleteClusterRun();
    if (!latest) return res.json({ personas: [] });

    const runId = latest.run.runId;
    const personas = await CustomerPersona.find({ runId }).sort({ personaId: 1 }).lean();
    const run = await ClusterRun.findOne({ runId }).lean();

    // Which algorithm actually produced the stored personas? This is read off the
    // persona documents themselves, not off the run's primary flag. Runs made before
    // K-Means became the reported result stored personas derived from the hybrid
    // consensus partition, and those documents carry no sourceAlgorithm. Trusting the
    // run's primary would relabel that legacy consensus as "K-Means" and pair it with
    // the K-Means distribution, describing a partition the personas were never drawn
    // from. So the personas decide which result describes them.
    const recordedSources = new Set(
      personas.map((p) => p.sourceAlgorithm).filter(Boolean),
    );
    const primaryAlgorithm = latest.run.algorithm ?? "kmeans";
    const personaAlgorithm =
      recordedSources.size === 1
        ? [...recordedSources][0]
        : personas.length > 0
          ? "hybrid" // legacy personas with no recorded source came from the consensus run
          : primaryAlgorithm;

    // Distribution, metrics and methodology all describe the partition the personas
    // were read off, so they are taken from the same algorithm as the personas.
    const source =
      latest.results.find((result) => result.algorithm === personaAlgorithm) ?? latest.run;
    const isKMeansPrimary = personaAlgorithm === "kmeans";
    // Flagged when the stored personas did not come from the K-Means primary, so the
    // page can prompt a re-run rather than presenting a legacy run as current.
    const needsRerun = personas.length === 0 || !isKMeansPrimary;

    // Clusters come from the same result the personas describe, so the distribution
    // shown next to them is the real partition, including any cluster too weak to
    // earn a name.
    const sizes = Array.isArray(source.clusterSizes) ? source.clusterSizes : [];
    const clusterDistribution = sizes.map((count, index) => ({
      clusterId: index,
      count,
      // A persona exists only for clusters that earned one, so an unnamed cluster
      // is normal and must not look like missing data.
      personaName: personas.find((persona) => persona.personaId === index)?.name ?? null,
    }));

    res.json({
      personas,
      runId,
      runDate: latest.run.createdAt ?? run?.createdAt ?? null,
      sourceAlgorithm: personaAlgorithm,
      sourceLabel: isKMeansPrimary
        ? "K-Means"
        : personaAlgorithm === "hybrid"
          ? "Legacy hybrid consensus"
          : personaAlgorithm,
      needsRerun,
      // The number of customers the distribution actually adds up to. A partition can
      // hold points back as noise (the legacy consensus did: 5 of 64), so reporting
      // nSamples here would make every cluster's share on the page understate its
      // real proportion. `nSamples` and `unclusteredCustomers` are exposed too so
      // the page can say how many were held out rather than silently shrinking the
      // denominator.
      totalCustomers: clusterDistribution.reduce((sum, c) => sum + (Number(c.count) || 0), 0),
      nSamples: source.nSamples ?? 0,
      unclusteredCustomers: source.noiseCount ?? 0,
      numClusters: source.numClusters ?? clusterDistribution.length,
      clusterDistribution,
      metrics: source.metrics ?? null,
      metricNotes: source.metricNotes ?? {},
      kSelection: source.kSelection ?? null,
      // The feature count, preprocessing and scaling live on whichever document
      // carries the methodology. Newer runs put it on the K-Means primary; the legacy
      // consensus run put it on the hybrid document, which is the source here.
      featureCount: source.methodology?.featureCount ?? run?.featureCount ?? null,
      preprocessing: source.methodology?.preprocessing ?? null,
      scaling: source.methodology?.scaling ?? null,
      featureSchemaVersion: run?.featureSchemaVersion ?? null,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getClusters = async (req, res) => {
  try {
    const results = await ClusterResult.find().sort({ createdAt: -1 }).limit(20).lean();
    res.json({ results });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getClusteringVisualization = async (req, res) => {
  try {
    const latest = await getLatestCompleteClusterRun();
    const byAlgorithm = new Map((latest?.results || []).map((result) => [result.algorithm, result]));
    const latestHybrid = byAlgorithm.get("hybrid") || null;
    const latestKmeans = byAlgorithm.get("kmeans") || null;
    const latestAgglo = byAlgorithm.get("agglomerative") || null;
    const latestDbscan = byAlgorithm.get("dbscan") || null;

    const distribution = (labels = {}) => {
      const counts = {};
      Object.values(labels).forEach((l) => { counts[l] = (counts[l] || 0) + 1; });
      return Object.entries(counts).map(([cluster, count]) => ({ cluster: Number(cluster), count }));
    };

    res.json({
      hybrid: latestHybrid ? { ...latestHybrid, distribution: distribution(latestHybrid.labels) } : null,
      kmeans: latestKmeans ? { ...latestKmeans, distribution: distribution(latestKmeans.labels) } : null,
      agglomerative: latestAgglo ? { ...latestAgglo, distribution: distribution(latestAgglo.labels) } : null,
      dbscan: latestDbscan ? { ...latestDbscan, distribution: distribution(latestDbscan.labels) } : null,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


/* -------------------------------------------------------------------------- */
/* Marketplace intelligence: catalogue-level attraction, sales, sellers       */
/* -------------------------------------------------------------------------- */

/**
 * GET /api/admin/attraction
 *
 * Which categories and listings reach the most distinct customers, and what
 * those customers did next. Counts people rather than events, so the ranking
 * answers "how many real shoppers care" instead of "which page generated the
 * most clicks" - see services/marketplaceIntelligence.js for why that
 * distinction is load-bearing.
 */
export const getAttractionAnalyticsAdmin = async (req, res) => {
  try {
    const { limit } = pagination(req.query, { defaultLimit: 12, maxLimit: 50 });
    res.json(await getAttractionAnalytics({ limit }));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /api/admin/sales-insights
 *
 * Revenue, units, trends, and the demand-versus-sales split that makes the page
 * worth opening: listings real customers engaged with that never sold.
 */
export const getSalesInsightsAdmin = async (req, res) => {
  try {
    const { limit } = pagination(req.query, { defaultLimit: 10, maxLimit: 50 });
    res.json(await getSalesInsights({ limit }));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /api/admin/seller-intelligence
 *
 * Seller performance over the whole set in three aggregate passes. `sort` is
 * whitelisted rather than interpolated, and an unrecognised value falls back to
 * revenue instead of throwing.
 */
export const getSellerIntelligenceAdmin = async (req, res) => {
  try {
    const { limit } = pagination(req.query, { defaultLimit: 15, maxLimit: 100 });
    const sort = ["revenue", "units", "listings", "rating", "buyers", "sellThrough"].includes(req.query.sort)
      ? req.query.sort
      : "revenue";
    res.json(await getSellerIntelligence({ limit, sort, search: req.query.search || "" }));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

