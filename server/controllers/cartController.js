import mongoose from "mongoose";
import { Product, Cart } from "../models/index.js";
import { recordEvent } from "../services/behaviorEvents.js";
const isObjectId = (value) => mongoose.isValidObjectId(String(value || ""));

const decrementCounter = async (productId, field, amount = 1) => {
  if (!amount) return;
  await Product.updateOne(
    { _id: productId, [field]: { $gte: amount } },
    { $inc: { [field]: -amount } }
  );
};

export const getCart = async (req, res) => {
  try {
    const carts = await Cart.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .populate("item.productId", "title price images condition negotiable seller status");
    const available = carts.filter((cart) => cart.item.productId?.status === "available");
    const stale = carts.filter((cart) => cart.item.productId?.status !== "available");
    if (stale.length) {
      await Cart.deleteMany({ _id: { $in: stale.map((cart) => cart._id) }, userId: req.user._id });
      const counts = new Map();
      stale.forEach((cart) => {
        const id = String(cart.item.productId?._id || "");
        if (id) counts.set(id, (counts.get(id) || 0) + 1);
      });
      await Promise.all([...counts.entries()].map(([productId, count]) => decrementCounter(productId, "cartCount", count)));
    }
    const products = available.map((cart) => ({ cartId: cart._id, product: cart.item.productId, addedAt: cart.item.addedAt }));
    res.json({ products, count: products.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const addToCart = async (req, res) => {
  try {
    const { productId } = req.body;
    if (!isObjectId(productId)) return res.status(400).json({ message: "Invalid product" });
    const product = await Product.findById(productId).select("price title images seller status");
    if (!product || product.status !== "available") return res.status(404).json({ message: "Product not available" });
    if (String(product.seller) === String(req.user._id)) return res.status(400).json({ message: "You cannot add your own listing" });
    const existing = await Cart.findOne({ userId: req.user._id, "item.productId": productId });
    if (existing) return res.status(200).json({ message: "Already in cart", cartItem: existing });
    const cart = await Cart.create({
      userId: req.user._id,
      item: {
        productId,
        price: product.price,
        title: product.title,
        image: product.images?.[0] || "",
        sellerId: product.seller,
        addedAt: new Date(),
      },
    });
    const counter = await Product.updateOne(
      { _id: productId, status: "available" },
      { $inc: { cartCount: 1 } }
    );
    if (counter.modifiedCount !== 1) {
      await Cart.deleteOne({ _id: cart._id, userId: req.user._id });
      return res.status(409).json({ message: "Product is no longer available" });
    }
    await recordEvent(req, { userId: req.user._id, eventType: "CART_ADD", productId, metadata: { price: product.price } });
    res.status(201).json({ message: "Added to cart", cartItem: cart });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message || "Product could not be added to cart" });
  }
};

export const removeFromCart = async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ message: "Invalid cart item" });
    const cart = await Cart.findOne({ _id: req.params.id, userId: req.user._id });
    if (!cart) return res.status(404).json({ message: "Cart item not found" });
    const productId = cart.item.productId;
    const deleted = await Cart.deleteOne({ _id: req.params.id, userId: req.user._id });
    if (deleted.deletedCount) {
      await decrementCounter(productId, "cartCount");
      await recordEvent(req, { userId: req.user._id, eventType: "CART_REMOVE", productId, metadata: {} });
    }
    res.json({ message: "Removed from cart" });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message || "Cart item could not be removed" });
  }
};

export const clearCart = async (req, res) => {
  try {
    const carts = await Cart.find({ userId: req.user._id }).select("item.productId").lean();
    await Cart.deleteMany({ userId: req.user._id });
    const counts = new Map();
    carts.forEach((cart) => {
      const id = String(cart.item?.productId || "");
      if (id) counts.set(id, (counts.get(id) || 0) + 1);
    });
    await Promise.all([...counts.entries()].map(([productId, count]) => decrementCounter(productId, "cartCount", count)));
    res.json({ message: "Cart cleared" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
