import mongoose from "mongoose";
import { Product, Wishlist } from "../models/index.js";
import { recordEvent } from "../services/behaviorEvents.js";
const isObjectId = (value) => mongoose.isValidObjectId(String(value || ""));
const decrementCounter = (productId) => Product.updateOne(
  { _id: productId, wishlistCount: { $gt: 0 } },
  { $inc: { wishlistCount: -1 } }
);

export const getWishlist = async (req, res) => {
  try {
    const wishlist = await Wishlist.findOne({ userId: req.user._id }).lean();
    if (!wishlist?.products?.length) return res.json({ products: [] });
    const productIds = wishlist.products.map((entry) => entry.productId).filter(Boolean);
    const products = await Product.find({ _id: { $in: productIds }, status: "available" })
      .populate("seller", "name sellerRating sellerRatingCount location")
      .lean();
    const availableIds = new Set(products.map((product) => String(product._id)));
    const staleIds = productIds.filter((id) => !availableIds.has(String(id)));
    if (staleIds.length) {
      await Wishlist.updateOne(
        { userId: req.user._id },
        { $pull: { products: { productId: { $in: staleIds } } } }
      );
      const counts = new Map();
      staleIds.forEach((id) => counts.set(String(id), (counts.get(String(id)) || 0) + 1));
      await Promise.all([...counts.entries()].map(([id, count]) => Product.updateOne(
        { _id: id, wishlistCount: { $gte: count } },
        { $inc: { wishlistCount: -count } }
      )));
    }
    res.json({ products });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const addToWishlist = async (req, res) => {
  try {
    const { productId } = req.body;
    if (!isObjectId(productId)) return res.status(400).json({ message: "Invalid product" });
    const product = await Product.findById(productId).select("seller status");
    if (!product || product.status !== "available") return res.status(404).json({ message: "Product not available" });
    if (String(product.seller) === String(req.user._id)) return res.status(400).json({ message: "You cannot save your own listing" });
    let wishlist = await Wishlist.findOne({ userId: req.user._id });
    if (!wishlist) {
      try {
        wishlist = await Wishlist.create({ userId: req.user._id, products: [] });
      } catch (err) {
        if (err.code !== 11000) throw err;
        wishlist = await Wishlist.findOne({ userId: req.user._id });
      }
    }
    const exists = wishlist.products.some((entry) => String(entry.productId) === String(productId));
    if (exists) return res.json({ message: "Already in wishlist", inWishlist: true });
    wishlist.products.push({ productId });
    await wishlist.save();
    const counter = await Product.updateOne(
      { _id: productId, status: "available" },
      { $inc: { wishlistCount: 1 } }
    );
    if (counter.modifiedCount !== 1) {
      wishlist.products = wishlist.products.filter((entry) => String(entry.productId) !== String(productId));
      await wishlist.save();
      return res.status(409).json({ message: "Product is no longer available" });
    }
    await recordEvent(req, { userId: req.user._id, eventType: "WISHLIST_ADD", productId, metadata: {} });
    res.status(201).json({ message: "Added to wishlist", inWishlist: true });
  } catch (err) {
    res.status(err.statusCode || (err.code === 11000 ? 409 : 500)).json({ message: err.message || "Product could not be saved" });
  }
};

export const removeFromWishlist = async (req, res) => {
  try {
    const { id: productId } = req.params;
    if (!isObjectId(productId)) return res.status(400).json({ message: "Invalid product" });
    const wishlist = await Wishlist.findOne({ userId: req.user._id });
    if (!wishlist) return res.json({ message: "Removed from wishlist", inWishlist: false });
    const before = wishlist.products.length;
    wishlist.products = wishlist.products.filter((entry) => String(entry.productId) !== String(productId));
    if (wishlist.products.length !== before) {
      await wishlist.save();
      await decrementCounter(productId);
      await recordEvent(req, { userId: req.user._id, eventType: "WISHLIST_REMOVE", productId, metadata: {} });
    }
    res.json({ message: "Removed from wishlist", inWishlist: false });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message || "Product could not be removed" });
  }
};

export const isInWishlist = async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ message: "Invalid product" });
    const wishlist = await Wishlist.findOne({ userId: req.user._id }).select("products.productId").lean();
    const inWishlist = Boolean(wishlist?.products?.some((entry) => String(entry.productId) === String(req.params.id)));
    res.json({ inWishlist });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
