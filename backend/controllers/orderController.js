import mongoose from "mongoose";
import { Product, BehaviorEvent, Cart, Offer, Order, Notification } from "../models/index.js";
import { recordEvent } from "../services/behaviorEvents.js";
const isObjectId = (value) => mongoose.isValidObjectId(String(value || ""));
const requestError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const normalizeAddress = (address, fallbackLocation = "") => {
  if (!address || typeof address !== "object" || Array.isArray(address)) {
    return { city: String(fallbackLocation || "").trim().slice(0, 100) };
  }
  return {
    line1: String(address.line1 || "").trim().slice(0, 200),
    city: String(address.city || fallbackLocation || "").trim().slice(0, 100),
    postalCode: String(address.postalCode || "").trim().slice(0, 12),
    phone: String(address.phone || "").trim().slice(0, 20),
  };
};

const getOrderPrice = async ({ product, offerId, buyerId }) => {
  if (!offerId) return { offer: null, finalPrice: product.price };
  if (!isObjectId(offerId)) throw requestError("Invalid offer");
  const offer = await Offer.findOne({ _id: offerId, productId: product._id, buyerId });
  if (!offer || !["accepted", "countered"].includes(offer.status)) {
    throw requestError("This offer is no longer available");
  }
  const finalPrice = offer.status === "countered" ? offer.counterAmount : offer.finalPrice || offer.offerAmount;
  if (!Number.isFinite(Number(finalPrice)) || Number(finalPrice) <= 0 || Number(finalPrice) > product.price) {
    throw requestError("The offer price is no longer valid");
  }
  return { offer, finalPrice: Number(finalPrice) };
};

const reserveProduct = async ({ product, buyerId, offerId }) => {
  const existingReservation = product.status === "reserved"
    && String(product.reservedBuyerId || "") === String(buyerId)
    && String(product.reservedOfferId || "") === String(offerId || "");
  const reservationFilter = offerId
    ? {
        _id: product._id,
        seller: { $ne: buyerId },
        $or: [
          { status: "available", reservedBuyerId: null, reservedOfferId: null },
          { status: "reserved", reservedBuyerId: buyerId, reservedOfferId: offerId },
        ],
      }
    : {
        _id: product._id,
        seller: { $ne: buyerId },
        status: "available",
        reservedBuyerId: null,
        reservedOfferId: null,
      };
  const reserved = await Product.findOneAndUpdate(
    reservationFilter,
    { $set: { status: "reserved", reservedBuyerId: buyerId, reservedOfferId: offerId || null } },
    { new: true }
  );
  if (!reserved) throw requestError("Product is no longer available", 409);
  return { product: reserved, createdReservation: !existingReservation };
};

const releaseReservation = async ({ productId, buyerId, offerId }) => {
  await Product.updateOne(
    {
      _id: productId,
      status: "reserved",
      reservedBuyerId: buyerId,
      reservedOfferId: offerId || null,
    },
    { $set: { status: "available" }, $unset: { reservedBuyerId: 1, reservedOfferId: 1 } }
  );
};

const createOrdersForUser = async (req, rawItems, common = {}) => {
  if (!Array.isArray(rawItems) || rawItems.length < 1 || rawItems.length > 20) {
    throw requestError("Checkout must contain between 1 and 20 items");
  }
  const items = rawItems.map((item) => ({
    productId: item?.productId,
    offerId: item?.offerId || undefined,
  }));
  if (items.some((item) => !isObjectId(item.productId))) throw requestError("Invalid product");
  const productIds = items.map((item) => String(item.productId));
  if (new Set(productIds).size !== productIds.length) throw requestError("A product can only be checked out once");
  const offerIds = items.map((item) => item.offerId).filter(Boolean);
  if (offerIds.some((offerId) => !isObjectId(offerId))) throw requestError("Invalid offer");

  const type = common.type || "buy";
  if (!["buy", "exchange"].includes(type)) throw requestError("Invalid order type");
  const paymentMethod = common.paymentMethod || "cod";
  if (!["cod", "card", "upi"].includes(paymentMethod)) throw requestError("Invalid payment method");
  const purchaseReason = String(common.purchaseReason || "").trim().slice(0, 200);
  const shippingAddress = normalizeAddress(common.shippingAddress, req.user.location);

  const products = await Product.find({ _id: { $in: productIds } });
  const productById = new Map(products.map((product) => [String(product._id), product]));
  const activeOrders = await Order.find({
    buyerId: req.user._id,
    productId: { $in: productIds },
    status: { $nin: ["cancelled", "returned"] },
  }).select("productId").lean();
  if (activeOrders.length) throw requestError("One or more products are already in an active order", 409);
  const offers = offerIds.length
    ? await Offer.find({ _id: { $in: offerIds }, buyerId: req.user._id })
    : [];
  const offerById = new Map(offers.map((offer) => [String(offer._id), offer]));

  const prepared = [];
  for (const item of items) {
    const product = productById.get(String(item.productId));
    if (!product || ["sold", "removed"].includes(product.status)) throw requestError("Product not available", 409);
    if (String(product.seller) === String(req.user._id)) throw requestError("You cannot purchase your own listing");
    if (type === "exchange" && !product.exchangeable) throw requestError("This product is not exchangeable");
    if (!item.offerId && product.status !== "available") throw requestError("Product is no longer available", 409);
    const { offer, finalPrice } = await getOrderPrice({ product, offerId: item.offerId, buyerId: req.user._id });
    prepared.push({ product, offer, finalPrice });
  }

  const reservations = [];
  const createdOrderIds = [];
  const soldProductIds = [];
  const offerStateBefore = prepared
    .map((item) => item.offer ? { id: item.offer._id, status: item.offer.status } : null)
    .filter(Boolean);
  try {
    for (const item of prepared) {
      const reservation = await reserveProduct({ product: item.product, buyerId: req.user._id, offerId: item.offer?._id });
      reservations.push({ ...reservation, productId: item.product._id, offerId: item.offer?._id });
    }

    const orders = [];
    for (const item of prepared) {
      const firstView = await BehaviorEvent.findOne({ userId: req.user._id, eventType: "PRODUCT_VIEW", productId: item.product._id }).sort({ timestamp: 1 });
      const decisionTimeMinutes = firstView ? Math.max(0, Math.round((Date.now() - firstView.timestamp.getTime()) / 60000)) : 0;
      const order = await Order.create({
        buyerId: req.user._id,
        sellerId: item.product.seller,
        productId: item.product._id,
        productTitle: item.product.title,
        quantity: 1,
        listedPrice: item.product.price,
        finalPrice: item.finalPrice,
        discount: Math.max(0, item.product.price - item.finalPrice),
        discountPercent: item.product.price > 0 ? Math.round(((item.product.price - item.finalPrice) / item.product.price) * 100) : 0,
        type,
        paymentMethod,
        shippingAddress,
        purchaseReason,
        firstViewAt: firstView ? firstView.timestamp : new Date(),
        decisionTimeMinutes,
      });
      createdOrderIds.push(order._id);
      orders.push(order);
    }

    for (const item of prepared) {
      const result = await Product.updateOne(
        {
          _id: item.product._id,
          status: "reserved",
          reservedBuyerId: req.user._id,
          reservedOfferId: item.offer?._id || null,
        },
        { $set: { status: "sold" }, $inc: { orderCount: 1 }, $unset: { reservedBuyerId: 1, reservedOfferId: 1 } }
      );
      if (result.modifiedCount !== 1) throw requestError("Product could not be reserved for checkout", 409);
      soldProductIds.push(item.product._id);
    }

    const offerIdsToAccept = prepared.map((item) => item.offer?._id).filter(Boolean);
    if (offerIdsToAccept.length) {
      const offerUpdate = await Offer.updateMany(
        { _id: { $in: offerIdsToAccept }, buyerId: req.user._id, status: { $in: ["accepted", "countered"] } },
        { $set: { status: "accepted" } }
      );
      if (offerUpdate.matchedCount !== offerIdsToAccept.length) throw requestError("One or more offers changed during checkout", 409);
    }

    const sideEffects = [];
    for (const order of orders) {
      const item = prepared.find((entry) => String(entry.product._id) === String(order.productId));
      const product = item.product;
      sideEffects.push(
        Cart.deleteOne({ userId: req.user._id, "item.productId": order.productId }).then((result) => (
          result.deletedCount ? Product.updateOne({ _id: order.productId, cartCount: { $gt: 0 } }, { $inc: { cartCount: -1 } }) : null
        )),
        recordEvent(req, {
          userId: req.user._id,
          eventType: "PURCHASE",
          productId: order.productId,
          metadata: { finalPrice: order.finalPrice, listedPrice: order.listedPrice, type, decisionTimeMinutes: order.decisionTimeMinutes, purchaseReason },
        }),
        Notification.create({
          userId: product.seller,
          type: "order",
          title: "New order",
          message: `${req.user.name} purchased "${product.title}" for ₹${order.finalPrice}`,
          link: "/orders",
        })
      );
      if (purchaseReason) {
        sideEffects.push(recordEvent(req, {
          userId: req.user._id,
          eventType: "PURCHASE_REASON",
          productId: order.productId,
          metadata: { reason: purchaseReason },
        }));
      }
    }
    await Promise.allSettled(sideEffects);
    return orders;
  } catch (error) {
    const cleanup = reservations
      .filter((reservation) => reservation.createdReservation)
      .map((reservation) => releaseReservation(reservation));
    for (const state of offerStateBefore) {
      if (state.status !== "accepted") {
        cleanup.push(Offer.updateOne(
          { _id: state.id, buyerId: req.user._id, status: "accepted" },
          { $set: { status: state.status } }
        ));
      }
    }
    if (soldProductIds.length) {
      cleanup.push(Product.updateMany(
        { _id: { $in: soldProductIds }, status: "sold", orderCount: { $gt: 0 } },
        { $set: { status: "available" }, $inc: { orderCount: -1 }, $unset: { reservedBuyerId: 1, reservedOfferId: 1 } }
      ));
    }
    if (createdOrderIds.length) cleanup.unshift(Order.deleteMany({ _id: { $in: createdOrderIds } }));
    await Promise.allSettled(cleanup);
    throw error;
  }
};

export const createOrder = async (req, res) => {
  try {
    const orders = await createOrdersForUser(req, [{ productId: req.body.productId, offerId: req.body.offerId }], req.body);
    res.status(201).json({ order: orders[0] });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message || "Order could not be created" });
  }
};

export const createOrders = async (req, res) => {
  try {
    const orders = await createOrdersForUser(req, req.body.items, req.body);
    res.status(201).json({ orders });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message || "Orders could not be created" });
  }
};

export const myOrders = async (req, res) => {
  try {
    const orders = await Order.find({ buyerId: req.user._id })
      .sort({ createdAt: -1 })
      .populate({ path: "productId", select: "title price images condition seller", populate: { path: "seller", select: "_id name" } });
    res.json({ orders });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const sellerOrders = async (req, res) => {
  try {
    const orders = await Order.find({ sellerId: req.user._id })
      .sort({ createdAt: -1 })
      .populate({ path: "productId", select: "title price images condition seller", populate: { path: "seller", select: "_id name" } });
    res.json({ orders });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const allowedTransitions = {
  pending: new Set(["confirmed", "cancelled"]),
  confirmed: new Set(["shipped", "cancelled"]),
  shipped: new Set(["delivered", "cancelled"]),
  delivered: new Set(["returned"]),
  returned: new Set(),
  cancelled: new Set(),
};

export const updateOrderStatus = async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ message: "Invalid order" });
    const { status } = req.body;
    const current = await Order.findById(req.params.id).select("status sellerId buyerId productId productTitle");
    if (!current) return res.status(404).json({ message: "Order not found" });
    if (String(current.sellerId) !== String(req.user._id) && req.user.role !== "admin") {
      return res.status(403).json({ message: "Not authorized" });
    }
    if (!allowedTransitions[current.status] || !allowedTransitions[current.status].has(status)) {
      return res.status(400).json({ message: `Cannot change an order from ${current.status} to ${status}` });
    }
    const order = await Order.findOneAndUpdate(
      { _id: current._id, status: current.status },
      { $set: { status } },
      { new: true }
    );
    if (!order) return res.status(409).json({ message: "Order status changed; refresh and try again" });
    if (["cancelled", "returned"].includes(status)) {
      const hasOtherActiveOrder = await Order.exists({
        productId: current.productId,
        _id: { $ne: current._id },
        status: { $nin: ["cancelled", "returned"] },
      });
      if (!hasOtherActiveOrder) {
        await Product.updateOne(
          { _id: current.productId, status: "sold", orderCount: { $gt: 0 } },
          { $set: { status: "available" }, $inc: { orderCount: -1 }, $unset: { reservedBuyerId: 1, reservedOfferId: 1 } }
        );
      }
      await Promise.allSettled([
        recordEvent(req, { userId: current.buyerId, eventType: "PRODUCT_RETURN", productId: current.productId, metadata: { orderId: current._id, status } }),
        Notification.create({
          userId: current.buyerId,
          type: "order",
          title: status === "returned" ? "Return processed" : "Order cancelled",
          message: status === "returned" ? `Your return for "${current.productTitle}" was processed` : `Your order for "${current.productTitle}" was cancelled`,
          link: "/orders",
        }),
      ]);
    }
    res.json({ order });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

