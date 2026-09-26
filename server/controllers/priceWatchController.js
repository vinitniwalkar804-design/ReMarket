import mongoose from "mongoose";
import { Product, PriceWatch } from "../models/index.js";
import { recordEvent } from "../services/behaviorEvents.js";
const isObjectId = (value) => mongoose.isValidObjectId(String(value || ""));

export const getMyPriceWatches = async (req, res) => {
  try {
    const watches = await PriceWatch.find({ userId: req.user._id }).sort({ createdAt: -1 }).lean();
    const productIds = watches.map((watch) => watch.productId);
    const products = productIds.length
      ? await Product.find({ _id: { $in: productIds } }).populate("seller", "name sellerRating sellerRatingCount location").lean()
      : [];
    const byId = new Map(products.map((product) => [String(product._id), product]));
    const result = watches
      .map((watch) => {
        const product = byId.get(String(watch.productId));
        return {
          watchId: watch._id,
          triggered: watch.triggered,
          targetPrice: watch.targetPrice,
          watchedAt: watch.createdAt,
          product: product || null,
          priceDropped: Boolean(product && watch.targetPrice !== null && product.status === "available" && product.price <= watch.targetPrice),
        };
      })
      .filter((entry) => entry.product);
    res.json({ watches: result });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const addPriceWatch = async (req, res) => {
  try {
    const { productId, targetPrice: rawTargetPrice } = req.body;
    if (!isObjectId(productId)) return res.status(400).json({ message: "Invalid product" });
    const product = await Product.findById(productId).select("price seller status");
    if (!product || product.status !== "available") return res.status(404).json({ message: "Product not available" });
    if (String(product.seller) === String(req.user._id)) return res.status(400).json({ message: "You cannot watch your own product" });
    const targetPrice = rawTargetPrice === undefined || rawTargetPrice === null || rawTargetPrice === ""
      ? null
      : Number(rawTargetPrice);
    if (targetPrice !== null && (!Number.isFinite(targetPrice) || targetPrice <= 0 || targetPrice >= product.price)) {
      return res.status(400).json({ message: "Target price must be positive and below the listed price" });
    }
    let watch = await PriceWatch.findOne({ userId: req.user._id, productId });
    const created = !watch;
    if (watch) {
      watch.targetPrice = targetPrice;
      watch.triggered = false;
      watch.purchasedAfterTrigger = false;
      await watch.save();
    } else {
      watch = await PriceWatch.create({ userId: req.user._id, productId, targetPrice });
    }
    await recordEvent(req, { userId: req.user._id, eventType: "PRICE_WATCH", productId, metadata: { targetPrice } });
    res.status(created ? 201 : 200).json({ message: "Price watch saved", watch });
  } catch (err) {
    res.status(err.statusCode || (err.code === 11000 ? 409 : 500)).json({ message: err.message || "Price watch could not be saved" });
  }
};

export const removePriceWatch = async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ message: "Invalid price watch" });
    const watch = await PriceWatch.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!watch) return res.status(404).json({ message: "Price watch not found" });
    res.json({ message: "Price watch removed", removed: true });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message || "Price watch could not be removed" });
  }
};

export const priceDropClick = async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ message: "Invalid price watch" });
    const watch = await PriceWatch.findOne({ _id: req.params.id, userId: req.user._id }).select("productId targetPrice");
    if (!watch) return res.status(404).json({ message: "Price watch not found" });
    const product = await Product.findById(watch.productId).select("price status");
    if (!product) return res.status(404).json({ message: "Product not found" });
    await recordEvent(req, {
      userId: req.user._id,
      eventType: "PRICE_DROP_CLICK",
      productId: watch.productId,
      metadata: { targetPrice: watch.targetPrice, currentPrice: product.price, scope: "notify" },
    });
    res.json({ message: "tracked" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
