import mongoose from "mongoose";
import { User, Product, Order, Review } from "../models/index.js";
import { recordEvent } from "../services/behaviorEvents.js";
const isObjectId = (value) => mongoose.isValidObjectId(String(value || ""));

export const getProductReviews = async (req, res) => {
  try {
    if (!isObjectId(req.params.productId)) return res.status(400).json({ message: "Invalid product" });
    const reviews = await Review.find({ productId: req.params.productId })
      .sort({ createdAt: -1 })
      .populate("userId", "name avatar");
    res.json({ reviews });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const createReview = async (req, res) => {
  try {
    const { productId } = req.body;
    const rating = Number(req.body.rating);
    const comment = String(req.body.comment || "").trim().slice(0, 2000);
    if (!isObjectId(productId) || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ message: "Rating must be between 1 and 5" });
    }
    const product = await Product.findById(productId).select("seller");
    if (!product) return res.status(404).json({ message: "Product not found" });
    const order = await Order.findOne({ buyerId: req.user._id, productId, status: "delivered" }).select("_id");
    if (!order && req.user.role !== "admin") {
      return res.status(403).json({ message: "You can only review products you purchased" });
    }
    const review = await Review.create({ userId: req.user._id, productId, sellerId: product.seller, rating, comment });
    const [productAggregate, sellerAggregate] = await Promise.all([
      Review.aggregate([
        { $match: { productId: new mongoose.Types.ObjectId(String(productId)) } },
        { $group: { _id: null, avg: { $avg: "$rating" }, count: { $sum: 1 } } },
      ]),
      Review.aggregate([
        { $match: { sellerId: product.seller } },
        { $group: { _id: null, avg: { $avg: "$rating" }, count: { $sum: 1 } } },
      ]),
    ]);
    if (productAggregate.length) {
      await Product.findByIdAndUpdate(productId, { rating: productAggregate[0].avg, reviewCount: productAggregate[0].count });
    }
    if (sellerAggregate.length) {
      await User.findByIdAndUpdate(product.seller, { sellerRating: sellerAggregate[0].avg, sellerRatingCount: sellerAggregate[0].count });
    }
    await recordEvent(req, { userId: req.user._id, eventType: "REVIEW_SUBMITTED", productId, metadata: { rating } });
    res.status(201).json({ review });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: "You already reviewed this product" });
    res.status(500).json({ message: err.message });
  }
};
