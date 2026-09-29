import fs from "fs/promises";
import path from "path";
import mongoose from "mongoose";
import { uploadsDir } from "../routes/uploadRoutes.js";
import { Category, Product, BehaviorEvent, Wishlist, Comparison, Cart, Offer, Order, PriceWatch, PriceHistory } from "../models/index.js";
import { recordEvent } from "../services/behaviorEvents.js";
import { isModerated } from "../utils/listingStatus.js";

const isObjectId = (value) => mongoose.isValidObjectId(String(value || ""));
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const asBoolean = (value, fallback) => {
  if (value === undefined) return fallback;
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return null;
};
const positiveNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};
const boundedLimit = (value, fallback, max = 100) => {
  const number = Number.parseInt(value, 10);
  return Math.min(max, Math.max(1, Number.isFinite(number) ? number : fallback));
};
const validImageUrl = (value) => {
  const image = String(value || "").trim();
  if (!image || image.length > 2048) return false;
  if (/^\/uploads\/[a-zA-Z0-9._-]+$/.test(image)) return true;
  try {
    const parsed = new URL(image);
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
};
const normalizeImages = (value) => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 8) return null;
  const images = [...new Set(value.map((image) => String(image || "").trim()).filter(Boolean))];
  return images.every(validImageUrl) ? images : null;
};
const normalizeSpecifications = (value) => {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) return null;
  try {
    if (JSON.stringify(value).length > 20000) return null;
  } catch {
    return null;
  }
  return value;
};

const buildFilter = (query) => {
  const filter = { status: "available" };
  if (isObjectId(query.category)) filter.category = query.category;
  if (typeof query.categoryName === "string" && query.categoryName.trim()) filter.categoryName = { $regex: new RegExp(escapeRegex(query.categoryName.trim().slice(0, 100)), "i") };
  if (typeof query.condition === "string" && query.condition.trim()) {
    const conditions = query.condition.split(",").map((value) => value.trim()).filter((value) => ["Like New", "Good", "Average", "Used"].includes(value));
    if (conditions.length) filter.condition = { $in: conditions };
  }
  const minPrice = positiveNumber(query.minPrice);
  const maxPrice = positiveNumber(query.maxPrice);
  if (minPrice !== null) filter.price = { ...(filter.price || {}), $gte: minPrice };
  if (maxPrice !== null) filter.price = { ...(filter.price || {}), $lte: maxPrice };
  if (typeof query.brand === "string" && query.brand.trim()) filter.brand = { $regex: new RegExp(`^${escapeRegex(query.brand.trim().slice(0, 100))}$`, "i") };
  if (typeof query.location === "string" && query.location.trim()) filter.location = { $regex: new RegExp(escapeRegex(query.location.trim().slice(0, 100)), "i") };
  if (query.negotiable === "true") filter.negotiable = true;
  if (query.exchangeable === "true") filter.exchangeable = true;
  if (isObjectId(query.seller)) filter.seller = query.seller;
  if (isObjectId(query.exclude)) filter._id = { $ne: query.exclude };
  const minRating = positiveNumber(query.minRating);
  if (minRating !== null) filter.rating = { $gte: Math.min(5, minRating) };
  return filter;
};

export const getProducts = async (req, res) => {
  try {
    const { sort = "newest" } = req.query;
    const page = boundedLimit(req.query.page, 1, 100000);
    const limit = boundedLimit(req.query.limit, 20, 100);
    const query = buildFilter(req.query);
    const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 200) : "";
    if (search) query.$text = { $search: search };
    const sortMap = {
      newest: { createdAt: -1 },
      price_asc: { price: 1 },
      price_desc: { price: -1 },
      popular: { views: -1 },
      rating: { rating: -1 },
    };
    const products = await Product.find(query).sort(sortMap[sort] || sortMap.newest).skip((page - 1) * limit).limit(limit).lean();
    const total = await Product.countDocuments(query);
    let categories = [];
    try {
      categories = await Category.find().lean();
    } catch {}
    res.json({ products, total, page, limit, categories });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /api/products/:id
 *
 * Availability gate. The catalogue, search, suggestions and category facets all
 * filter on `status: "available"`, but a direct URL to an off-market listing used
 * to still render it in full - which meant a hidden or removed item was one
 * guessed link away from being fully visible, and a sold item was relistable by
 * refreshing the page it had been bought from.
 *
 * A non-live listing is reported as 404 to everyone except the two parties who
 * legitimately need to see it: the seller it belongs to, and an administrator.
 * 404 rather than 403 on purpose - to a stranger the listing should not exist,
 * and a 403 would confirm that the id is real.
 */
export const getProduct = async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ message: "Invalid product" });
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });

    const isAdmin = req.user?.role === "admin";
    const isOwner = Boolean(req.user) && String(product.seller) === String(req.user._id);
    if (product.status !== "available" && !isAdmin && !isOwner) {
      return res.status(404).json({ message: "Product not found" });
    }

    if (req.user) {
      await Promise.allSettled([
        recordEvent(req, { userId: req.user._id, eventType: "PRODUCT_VIEW", productId: product._id, metadata: { source: String(req.query.source || "browse").slice(0, 50) } }),
        Product.findByIdAndUpdate(product._id, { $inc: { views: 1 } }),
      ]);
    }
    const populated = await product.populate("seller", "name email location avatar sellerRating sellerRatingCount isVerifiedSeller isVerified");
    res.json({
      product: populated,
      // Tells the detail page whether it is showing a live listing or explaining
      // why it is not, without the page having to re-derive ownership.
      viewer: { isOwner, isAdmin, canSeeOffMarket: isOwner || isAdmin },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const createProduct = async (req, res) => {
  try {
    const {
      title, description, category, brand, model, originalPrice, price, condition, location,
      images, specifications, negotiable, exchangeable,
    } = req.body;
    const normalizedTitle = String(title || "").trim();
    const normalizedDescription = String(description || "").trim();
    const sellingPrice = positiveNumber(price);
    const listedOriginalPrice = positiveNumber(originalPrice === undefined || originalPrice === null || originalPrice === "" ? price : originalPrice);
    if (!normalizedTitle || normalizedTitle.length > 120 || !normalizedDescription || normalizedDescription.length > 5000) return res.status(400).json({ message: "Enter a valid title and description" });
    if (!isObjectId(category)) return res.status(400).json({ message: "Choose a valid category" });
    if (!sellingPrice || !listedOriginalPrice || listedOriginalPrice < sellingPrice) return res.status(400).json({ message: "Prices must be positive and original price cannot be lower than selling price" });
    if (condition !== undefined && !["Like New", "Good", "Average", "Used"].includes(condition)) return res.status(400).json({ message: "Invalid condition" });
    const normalizedImages = normalizeImages(images);
    if (normalizedImages === null) return res.status(400).json({ message: "Use up to 8 valid image URLs" });
    const normalizedSpecifications = normalizeSpecifications(specifications);
    if (normalizedSpecifications === null) return res.status(400).json({ message: "Invalid specifications" });
    const normalizedNegotiable = asBoolean(negotiable, true);
    const normalizedExchangeable = asBoolean(exchangeable, false);
    if (normalizedNegotiable === null || normalizedExchangeable === null) return res.status(400).json({ message: "Invalid listing options" });
    const cat = await Category.findById(category).select("name").lean();
    if (!cat) return res.status(404).json({ message: "Category not found" });
    const product = await Product.create({
      title: normalizedTitle,
      description: normalizedDescription,
      category,
      categoryName: cat.name,
      brand: String(brand || "Other").trim().slice(0, 80) || "Other",
      model: String(model || "").trim().slice(0, 100),
      originalPrice: listedOriginalPrice,
      price: sellingPrice,
      condition: condition || "Good",
      location: String(location || req.user.location || "").trim().slice(0, 120),
      images: normalizedImages,
      specifications: normalizedSpecifications,
      negotiable: normalizedNegotiable,
      exchangeable: normalizedExchangeable,
      seller: req.user._id,
      sellerName: req.user.name,
    });
    await Promise.allSettled([
      recordEvent(req, { userId: req.user._id, eventType: "SELL_LISTING", productId: product._id, metadata: { price: sellingPrice, category: cat.name } }),
      PriceHistory.create({ productId: product._id, price: sellingPrice, source: "listing", note: "Initial listing" }),
    ]);
    res.status(201).json({ product });
  } catch (err) {
    res.status(err.name === "ValidationError" ? 400 : 500).json({ message: err.message });
  }
};

export const updateProduct = async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ message: "Invalid product" });
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });
    const isAdmin = req.user.role === "admin";
    if (!isAdmin && String(product.seller) !== String(req.user._id)) return res.status(403).json({ message: "Not authorized" });

    /**
     * Only the two commercial states are settable through the general edit form.
     * The moderation states (hidden / suspended / rejected / removed) are
     * deliberately not on this whitelist, for admins included: they are applied
     * only by the moderation endpoint, which requires a reason, writes an audit
     * entry, expires open offers and notifies the seller. Allowing an admin to
     * flip a listing to `hidden` from here would be the exact same action
     * implemented twice, and the version without the reason and the audit trail
     * is the one that would quietly win.
     */
    const requestedStatus = req.body.status;
    if (requestedStatus !== undefined && !["available", "sold"].includes(requestedStatus)) {
      return res.status(400).json({
        message: isModerated(requestedStatus)
          ? "Moderation statuses are set from the moderation panel, which records a reason and notifies the seller"
          : "Invalid listing status",
      });
    }

    /**
     * A seller may correct the content of a listing an admin took down - that is
     * how a rejection gets fixed - but may not relist it. Relisting is the
     * administrator's decision, otherwise "moderation" is just a message the
     * seller can edit past.
     */
    if (!isAdmin && isModerated(product.status) && requestedStatus !== undefined) {
      return res.status(409).json({
        message: "An administrator took this listing off the marketplace. Update the details above, then wait for it to be restored.",
      });
    }

    if (product.status === "reserved") return res.status(409).json({ message: "Reserved listings cannot be edited" });
    if (["sold"].includes(product.status) && req.body.status === undefined) return res.status(409).json({ message: "Sold listings cannot be edited" });

    const updates = {};
    if (req.body.title !== undefined) {
      const title = String(req.body.title).trim();
      if (!title || title.length > 120) return res.status(400).json({ message: "Invalid title" });
      updates.title = title;
    }
    if (req.body.description !== undefined) {
      const description = String(req.body.description).trim();
      if (!description || description.length > 5000) return res.status(400).json({ message: "Invalid description" });
      updates.description = description;
    }
    if (req.body.brand !== undefined) updates.brand = String(req.body.brand || "Other").trim().slice(0, 80) || "Other";
    if (req.body.model !== undefined) updates.model = String(req.body.model || "").trim().slice(0, 100);
    if (req.body.location !== undefined) updates.location = String(req.body.location || "").trim().slice(0, 120);
    if (req.body.condition !== undefined) {
      if (!["Like New", "Good", "Average", "Used"].includes(req.body.condition)) return res.status(400).json({ message: "Invalid condition" });
      updates.condition = req.body.condition;
    }
    if (req.body.images !== undefined) {
      const images = normalizeImages(req.body.images);
      if (images === null) return res.status(400).json({ message: "Use up to 8 valid image URLs" });
      updates.images = images;
    }
    if (req.body.specifications !== undefined) {
      const specifications = normalizeSpecifications(req.body.specifications);
      if (specifications === null) return res.status(400).json({ message: "Invalid specifications" });
      updates.specifications = specifications;
    }
    if (req.body.negotiable !== undefined) {
      const value = asBoolean(req.body.negotiable, product.negotiable);
      if (value === null) return res.status(400).json({ message: "Invalid listing options" });
      updates.negotiable = value;
    }
    if (req.body.exchangeable !== undefined) {
      const value = asBoolean(req.body.exchangeable, product.exchangeable);
      if (value === null) return res.status(400).json({ message: "Invalid listing options" });
      updates.exchangeable = value;
    }
    if (req.body.price !== undefined) {
      const price = positiveNumber(req.body.price);
      if (!price) return res.status(400).json({ message: "Invalid selling price" });
      updates.price = price;
    }
    if (req.body.originalPrice !== undefined) {
      const original = positiveNumber(req.body.originalPrice);
      if (!original) return res.status(400).json({ message: "Invalid original price" });
      updates.originalPrice = original;
    }
    const finalPrice = updates.price ?? product.price;
    const finalOriginal = updates.originalPrice ?? product.originalPrice;
    if (finalOriginal < finalPrice) return res.status(400).json({ message: "Original price cannot be lower than selling price" });
    const oldPrice = product.price;
    Object.assign(product, updates);
    if (requestedStatus !== undefined) {
      if (requestedStatus !== product.status) {
        const activeOrder = await mongoose.model("Order").exists({ productId: product._id, status: { $nin: ["cancelled", "returned"] } });
        if (activeOrder) return res.status(409).json({ message: "Orders are still active for this listing" });
        if (requestedStatus === "sold") {
          await Offer.updateMany({ productId: product._id, status: { $in: ["pending", "countered"] } }, { $set: { status: "expired" } });
        }
      }
      product.status = requestedStatus;
      // Assigning undefined is how a Mongoose *document* drops a path; `$unset` is
      // an update-operator and only exists on queries, so calling product.$unset()
      // here threw a 500 on every seller mark-as-sold.
      if (requestedStatus === "available" || requestedStatus === "sold") {
        product.reservedBuyerId = undefined;
        product.reservedOfferId = undefined;
      }
    }
    await product.save();
    if (oldPrice !== product.price) await PriceHistory.create({ productId: product._id, price: product.price, source: "update", note: "Seller updated price" });
    res.json({ product });
  } catch (err) {
    res.status(err.name === "ValidationError" ? 400 : 500).json({ message: err.message });
  }
};

const isLocalUpload = (url = "") => /^https?:\/\/[^/]+\/uploads\/[^/?#]+$/i.test(url) || /^\/uploads\/[^/?#]+$/i.test(url);
const uploadFileName = (url = "") => {
  const match = String(url).match(/\/uploads\/([^/?#]+)$/i);
  return match ? match[1] : null;
};

export const deleteProduct = async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ message: "Invalid product" });
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "This listing no longer exists" });
    if (req.user.role !== "admin" && String(product.seller) !== String(req.user._id)) return res.status(403).json({ message: "You can only delete your own listings" });
    if (product.status === "reserved") return res.status(409).json({ message: "Reserved listings cannot be deleted" });
    /* A seller deleting their own listing has to meet the same history rules an
       admin does, otherwise the two entry points disagree about what "safe to
       delete" means. Reviews and conversations are deliberately narrow blockers:
       they are what keep a seller's rating history and chat transcript intact.
       Offers are not - a declined offer carries no commitment, so open ones are
       expired below instead of blocking, which keeps "someone declined my offer,
       let me take the listing down" working. */
    const [activeOrder, reviewCount, chatCount] = await Promise.all([
      Order.exists({ productId: product._id, status: { $nin: ["cancelled", "returned"] } }),
      mongoose.model("Review").countDocuments({ productId: product._id }),
      mongoose.model("Chat").countDocuments({ productId: product._id }),
    ]);
    if (activeOrder) return res.status(409).json({ message: "Orders are still active for this listing" });
    const blockers = [];
    if (reviewCount > 0) blockers.push({ name: "reviews", label: "review", count: reviewCount });
    if (chatCount > 0) blockers.push({ name: "chats", label: "conversation", count: chatCount });
    if (blockers.length > 0) {
      return res.status(409).json({
        message: "This listing has history attached and cannot be deleted",
        blockers,
        hint: "Mark it sold instead, or ask an administrator to remove it.",
      });
    }
    const deletedImages = [];
    const imageUrls = (product.images || []).filter(Boolean);
    await Product.findByIdAndDelete(product._id);
    await Promise.allSettled([
      Wishlist.updateMany({}, { $pull: { products: { productId: product._id } } }),
      Cart.deleteMany({ "item.productId": product._id }),
      Comparison.updateMany({}, { $pull: { products: product._id } }),
      Comparison.updateMany({ selectedProductId: product._id }, { $set: { selectedProductId: null } }),
      PriceWatch.deleteMany({ productId: product._id }),
      PriceHistory.deleteMany({ productId: product._id }),
      Offer.updateMany({ productId: product._id, status: { $in: ["pending", "countered"] } }, { $set: { status: "expired" } }),
    ]);
    await Comparison.deleteMany({ products: { $size: 0 } });
    for (const url of imageUrls) {
      if (!isLocalUpload(url)) continue;
      const name = uploadFileName(url);
      if (!name || name.includes("/") || name.includes("\\")) continue;
      const stillUsed = await Product.countDocuments({ images: url });
      if (stillUsed > 0) continue;
      const absolute = path.join(uploadsDir, name);
      if (path.dirname(absolute).replace(/[\\/]+$/, "") !== uploadsDir.replace(/[\\/]+$/, "")) continue;
      try {
        await fs.unlink(absolute);
        deletedImages.push(name);
      } catch {}
    }
    res.json({ message: "Listing deleted", deleted: true, deletedImages });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getFeatured = async (req, res) => {
  try {
    const products = await Product.find({ status: "available" }).sort({ views: -1, createdAt: -1 }).limit(boundedLimit(req.query.limit, 8, 30)).lean();
    res.json({ products });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getTrending = async (req, res) => {
  try {
    const products = await Product.find({ status: "available" }).sort({ orderCount: -1, views: -1, wishlistCount: -1 }).limit(boundedLimit(req.query.limit, 6, 30)).populate("seller", "name sellerRating sellerRatingCount isVerifiedSeller").lean();
    res.json({ products });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getRecent = async (req, res) => {
  try {
    const products = await Product.find({ status: "available" }).sort({ createdAt: -1 }).limit(boundedLimit(req.query.limit, 6, 30)).populate("seller", "name sellerRating sellerRatingCount isVerifiedSeller").lean();
    res.json({ products });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getDeals = async (req, res) => {
  try {
    const products = await Product.aggregate([
      { $match: { status: "available", originalPrice: { $gt: 0 } } },
      { $addFields: { discountPercent: { $round: [{ $multiply: [{ $divide: [{ $subtract: ["$originalPrice", "$price"] }, "$originalPrice"] }, 100] }, 0] } } },
      { $match: { discountPercent: { $gte: 10 } } },
      { $sort: { discountPercent: -1, views: -1 } },
      { $limit: boundedLimit(req.query.limit, 8, 30) },
    ]);
    res.json({ products });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getSimilarProducts = async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ message: "Invalid product" });
    const product = await Product.findById(req.params.id).select("category").lean();
    if (!product) return res.status(404).json({ message: "Product not found" });
    const products = await Product.find({ status: "available", _id: { $ne: product._id }, category: product.category }).sort({ rating: -1, views: -1 }).limit(boundedLimit(req.query.limit, 4, 20)).populate("seller", "name sellerRating sellerRatingCount isVerifiedSeller").lean();
    res.json({ products });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getPriceHistory = async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ message: "Invalid product" });
    const history = await PriceHistory.find({ productId: req.params.id }).sort({ createdAt: 1 }).lean();
    res.json({ history });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getNearby = async (req, res) => {
  try {
    const location = String(req.query.location || "").trim().slice(0, 100);
    if (!location) return res.json({ products: [] });
    const products = await Product.find({ status: "available", location: { $regex: new RegExp(escapeRegex(location), "i") } }).sort({ views: -1, createdAt: -1 }).limit(boundedLimit(req.query.limit, 8, 30)).populate("seller", "name sellerRating sellerRatingCount isVerifiedSeller").lean();
    res.json({ products });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getCategories = async (req, res) => {
  try {
    const categories = await Category.find().lean();
    res.json({ categories });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getMyProducts = async (req, res) => {
  try {
    const products = await Product.find({ seller: req.user._id }).sort({ createdAt: -1 }).lean();
    res.json({ products });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getRecommended = async (req, res) => {
  try {
    const userBehavior = await BehaviorEvent.find({ userId: req.user._id, eventType: { $in: ["PRODUCT_VIEW", "SEARCH", "PURCHASE", "WISHLIST_ADD"] } }).select("category metadata").lean();
    const preferredCategories = new Map();
    userBehavior.forEach((event) => {
      const category = event.category || event.metadata?.category;
      if (category) preferredCategories.set(String(category).toLowerCase(), (preferredCategories.get(String(category).toLowerCase()) || 0) + 1);
    });
    const totalActions = [...preferredCategories.values()].reduce((sum, value) => sum + value, 0) || 1;
    const topCategories = [...preferredCategories.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);
    const behaviorStyle = await BehaviorEvent.countDocuments({ userId: req.user._id, eventType: { $in: ["OFFER_SENT", "COUNTER_OFFER", "CART_ADD"] } });
    const query = { status: "available" };
    if (isObjectId(req.query.exclude)) query._id = { $ne: req.query.exclude };
    if (topCategories.length) query.categoryName = { $in: topCategories.map(([category]) => new RegExp(`^${escapeRegex(category)}$`, "i")) };
    const recommendations = behaviorStyle > 5
      ? await Product.aggregate([
          { $match: { ...query, negotiable: true, originalPrice: { $gt: 0 } } },
          { $addFields: { discountPercent: { $round: [{ $multiply: [{ $divide: [{ $subtract: ["$originalPrice", "$price"] }, "$originalPrice"] }, 100] }, 0] } } },
          { $sort: { discountPercent: -1 } },
          { $limit: boundedLimit(req.query.limit, 6, 20) },
        ])
      : await Product.find(query).sort({ reviewCount: -1, rating: -1 }).limit(boundedLimit(req.query.limit, 6, 20)).lean();
    res.json({
      recommendations,
      strategy: behaviorStyle > 5 ? "discount_focused" : "quality_focused",
      preferredCategories: [...preferredCategories.entries()].map(([name, weight]) => ({ name, weight, share: Math.round((weight / totalActions) * 100) })),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
