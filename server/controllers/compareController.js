import mongoose from "mongoose";
import { Product, Comparison } from "../models/index.js";
import { recordEvent } from "../services/behaviorEvents.js";

/**
 * Comparison tray.
 *
 * A customer's tray is a single `Comparison` document per user (the one with
 * `endedAt: null`). It survives reloads, logout/login and server restarts
 * because it lives in MongoDB, so the compare page can render from one query
 * instead of N per-product requests.
 *
 * This controller is the only writer of the tray, which is why it is also the
 * only place the `PRODUCT_COMPARE` behaviour event is recorded. The client
 * deliberately does *not* send that event itself, so the engagement features
 * the segmentation model reads are never double counted.
 */
export const COMPARE_MAX = 5;

const isObjectId = (value) => mongoose.isValidObjectId(String(value || ""));
const decrementCounter = (productId) => Product.updateOne(
  { _id: productId, compareCount: { $gt: 0 } },
  { $inc: { compareCount: -1 } }
);

/** Sellers are populated identically everywhere so comparison rows are never blank. */
const SELLER_FIELDS = "name sellerRating sellerRatingCount location isVerifiedSeller";

export const getCompare = async (req, res) => {
  try {
    const session = await Comparison.findOne({ userId: req.user._id, endedAt: null }).lean();
    if (!session?.products?.length) {
      return res.json({ products: [], compareIds: [], unavailable: [], max: COMPARE_MAX, startedAt: null });
    }

    // ONE query for the whole tray, regardless of status. Doing it this way is
    // what keeps the endpoint at a single round trip and still lets us tell the
    // customer *why* a listing disappeared instead of silently dropping a column.
    const all = await Product.find({ _id: { $in: session.products } })
      .populate("seller", SELLER_FIELDS)
      .lean();
    const byId = new Map(all.map((p) => [String(p._id), p]));

    // `session.products` order is the order the customer added them in, so
    // columns stay in the same place between reloads instead of shuffling.
    const ordered = session.products.map((id) => byId.get(String(id))).filter(Boolean);
    const products = ordered.filter((p) => p.status === "available");

    // Anything that went away between the tray write and this read (sold,
    // reserved, or deleted outright) is repaired here and reported back.
    const unavailable = [];
    const staleIds = [];
    session.products.forEach((id) => {
      const found = byId.get(String(id));
      if (found?.status === "available") return;
      staleIds.push(id);
      unavailable.push({
        id: String(id),
        title: found?.title || null,
        // "removed" means the listing no longer exists at all; anything else is
        // a real listing in a non-available state (sold / reserved).
        reason: found?.status || "removed",
      });
    });
    if (staleIds.length) {
      await Comparison.updateOne(
        { userId: req.user._id, endedAt: null },
        { $pull: { products: { $in: staleIds } } }
      );
      const counts = new Map();
      staleIds.forEach((id) => counts.set(String(id), (counts.get(String(id)) || 0) + 1));
      await Promise.all([...counts.entries()].map(([id, count]) => Product.updateOne(
        { _id: id, compareCount: { $gte: count } },
        { $inc: { compareCount: -count } }
      )));
    }

    res.json({
      products,
      // Always strings. The toggle endpoint used to answer with raw ObjectIds,
      // which made a client-side `ids.includes(routeParam)` silently fail after
      // the first add. One shape for both endpoints removes that class of bug.
      compareIds: products.map((product) => String(product._id)),
      unavailable,
      max: COMPARE_MAX,
      startedAt: session.startedAt || null,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const toggleCompare = async (req, res) => {
  try {
    const { productId } = req.body;
    if (!isObjectId(productId)) return res.status(400).json({ message: "Invalid product" });
    const product = await Product.findById(productId).select("seller status title categoryName");
    if (!product || product.status !== "available") return res.status(404).json({ message: "Product not available" });
    if (String(product.seller) === String(req.user._id)) return res.status(400).json({ message: "You cannot compare your own listing" });

    let session = await Comparison.findOne({ userId: req.user._id, endedAt: null });
    if (!session) session = await Comparison.create({ userId: req.user._id, products: [], startedAt: new Date() });

    const idx = session.products.findIndex((id) => String(id) === String(productId));
    const removing = idx > -1;
    if (removing) {
      session.products.splice(idx, 1);
    } else {
      if (session.products.length >= COMPARE_MAX) {
        return res.status(400).json({ message: `You can compare up to ${COMPARE_MAX} products` });
      }
      session.products.push(productId);
    }
    await session.save();

    if (removing) {
      await decrementCounter(productId);
    } else {
      const counter = await Product.updateOne(
        { _id: productId, status: "available" },
        { $inc: { compareCount: 1 } }
      );
      if (counter.modifiedCount !== 1) {
        session.products = session.products.filter((id) => String(id) !== String(productId));
        await session.save();
        return res.status(409).json({ message: "Product is no longer available" });
      }
    }

    if (!removing) {
      // The single source of the comparison signal for the ML pipeline. It is
      // fired here, at the moment the tray actually changes, so the client
      // cannot skip it and cannot fire it twice for one add.
      await recordEvent(req, {
        userId: req.user._id,
        eventType: "PRODUCT_COMPARE",
        productId,
        category: product.categoryName || "",
        metadata: { compareSize: session.products.length, action: "add" },
      });
    }

    res.json({
      compareIds: session.products.map(String),
      added: !removing,
      count: session.products.length,
      max: COMPARE_MAX,
      // Enough for the client to render a specific toast without a second fetch.
      product: { _id: String(productId), title: product.title, categoryName: product.categoryName || "" },
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message || "Comparison could not be updated" });
  }
};

export const compareSelect = async (req, res) => {
  try {
    const { productId } = req.body;
    if (!isObjectId(productId)) return res.status(400).json({ message: "Invalid product" });
    const requestedDuration = Number(req.body.durationSec);
    const durationSec = Number.isFinite(requestedDuration) ? Math.min(3600, Math.max(0, Math.round(requestedDuration))) : 0;
    const session = await Comparison.findOneAndUpdate(
      { userId: req.user._id, endedAt: null, products: productId },
      { $set: { endedAt: new Date(), selectedProductId: productId, durationSec } },
      { new: true }
    );
    if (!session) return res.status(400).json({ message: "Select a product from the active comparison" });
    await recordEvent(req, {
      userId: req.user._id,
      eventType: "COMPARE_SELECTED",
      productId,
      metadata: { durationSec },
    });
    res.json({ message: "Comparison completed", session });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const clearCompare = async (req, res) => {
  try {
    await Comparison.updateOne({ userId: req.user._id, endedAt: null }, { $set: { endedAt: new Date() } });
    res.json({ message: "Comparison cleared" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
