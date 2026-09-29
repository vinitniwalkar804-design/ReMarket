import mongoose from "mongoose";
import { Product, Offer, Notification } from "../models/index.js";
import { recordEvent } from "../services/behaviorEvents.js";
const isObjectId = (value) => mongoose.isValidObjectId(String(value || ""));
const requestError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

export const sendOffer = async (req, res) => {
  try {
    const { productId, offerAmount: rawOfferAmount } = req.body;
    const offerAmount = Number(rawOfferAmount);
    if (!isObjectId(productId) || !Number.isFinite(offerAmount)) throw requestError("Invalid offer");
    if (offerAmount <= 0) throw requestError("Offer amount must be greater than zero");
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: "Product not found" });
    if (product.status !== "available") return res.status(409).json({ message: "Product is no longer available" });
    if (!product.negotiable) return res.status(400).json({ message: "This product does not accept offers" });
    if (String(product.seller) === String(req.user._id)) {
      return res.status(400).json({ message: "You cannot make an offer on your own product" });
    }
    if (offerAmount >= product.price) return res.status(400).json({ message: "Offer must be below the listed price" });
    const existing = await Offer.findOne({
      buyerId: req.user._id,
      productId,
      status: { $in: ["pending", "countered"] },
    });
    if (existing) return res.status(409).json({ message: "You already have an active offer on this product" });
    const offer = await Offer.create({
      buyerId: req.user._id,
      sellerId: product.seller,
      productId,
      listedPrice: product.price,
      offerAmount,
      status: "pending",
      rounds: 1,
    });
    await Promise.allSettled([
      recordEvent(req, {
        userId: req.user._id,
        eventType: "OFFER_SENT",
        productId,
        metadata: { offerAmount, listedPrice: product.price, discountPercent: Number(((1 - offerAmount / product.price) * 100).toFixed(1)) },
      }),
      Notification.create({
        userId: product.seller,
        type: "offer",
        title: "New offer received",
        message: `${req.user.name} offered ₹${offerAmount} on "${product.title}"`,
        link: "/offers",
      }),
    ]);
    res.status(201).json({ offer });
  } catch (err) {
    res.status(err.statusCode || (err.code === 11000 ? 409 : 500)).json({ message: err.message || "Offer could not be sent" });
  }
};

export const myOffers = async (req, res) => {
  try {
    const offers = await Offer.find({ buyerId: req.user._id })
      .sort({ createdAt: -1 })
      .populate("productId", "title price images location seller")
      .populate("sellerId", "name sellerRating");
    res.json({ offers });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const incomingOffers = async (req, res) => {
  try {
    const offers = await Offer.find({ sellerId: req.user._id })
      .sort({ createdAt: -1 })
      .populate("productId", "title price images location seller")
      .populate("buyerId", "name sellerRating");
    res.json({ offers });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const respondOffer = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!isObjectId(id) || !["accepted", "rejected", "countered"].includes(status)) {
      throw requestError("Invalid offer response");
    }
    const counterAmount = status === "countered" ? Number(req.body.counterAmount) : null;
    if (status === "countered" && (!Number.isFinite(counterAmount) || counterAmount <= 0)) {
      throw requestError("Enter a valid counter-offer amount");
    }
    const offer = await Offer.findById(id);
    if (!offer) return res.status(404).json({ message: "Offer not found" });
    if (String(offer.sellerId) !== String(req.user._id) && req.user.role !== "admin") {
      return res.status(403).json({ message: "Not authorized" });
    }
    if (!["pending", "countered"].includes(offer.status)) {
      return res.status(409).json({ message: "This offer has already been resolved" });
    }
    if (status === "countered" && counterAmount >= offer.listedPrice) {
      return res.status(400).json({ message: "Counter-offer must be below the listed price" });
    }

    let reservation = null;
    let createdReservation = false;
    if (status === "accepted") {
      const product = await Product.findById(offer.productId);
      if (!product) return res.status(404).json({ message: "Product not found" });
      const finalPrice = Number(offer.counterAmount || offer.offerAmount);
      if (!Number.isFinite(finalPrice) || finalPrice <= 0 || finalPrice > product.price) {
        return res.status(409).json({ message: "The product price changed; ask the buyer to send a new offer" });
      }
      const alreadyReserved = product.status === "reserved"
        && String(product.reservedBuyerId || "") === String(offer.buyerId)
        && String(product.reservedOfferId || "") === String(offer._id);
      reservation = await Product.findOneAndUpdate(
        {
          _id: product._id,
          seller: { $ne: offer.buyerId },
          $or: [
            { status: "available", reservedBuyerId: null, reservedOfferId: null },
            { status: "reserved", reservedBuyerId: offer.buyerId, reservedOfferId: offer._id },
          ],
        },
        { $set: { status: "reserved", reservedBuyerId: offer.buyerId, reservedOfferId: offer._id } },
        { new: true }
      );
      if (!reservation) return res.status(409).json({ message: "Product is no longer available" });
      createdReservation = !alreadyReserved;
    }

    const updatedOffer = await Offer.findOneAndUpdate(
      { _id: offer._id, sellerId: offer.sellerId, status: { $in: ["pending", "countered"] } },
      {
        $set: {
          status,
          ...(status === "countered" ? { counterAmount, rounds: offer.rounds + 1, finalPrice: null } : {}),
          ...(status === "accepted" ? { finalPrice: Number(offer.counterAmount || offer.offerAmount) } : {}),
          sellerResponseTime: Math.max(1, Math.round((Date.now() - new Date(offer.updatedAt || offer.createdAt).getTime()) / 60000)),
        },
      },
      { new: true }
    );
    if (!updatedOffer) {
      if (reservation && createdReservation) {
        await Product.updateOne(
          { _id: reservation._id, status: "reserved", reservedBuyerId: offer.buyerId, reservedOfferId: offer._id },
          { $set: { status: "available" }, $unset: { reservedBuyerId: 1, reservedOfferId: 1 } }
        );
      }
      return res.status(409).json({ message: "This offer has already been resolved" });
    }

    if (status === "rejected") {
      await Product.updateOne(
        { _id: offer.productId, status: "reserved", reservedBuyerId: offer.buyerId, reservedOfferId: offer._id },
        { $set: { status: "available" }, $unset: { reservedBuyerId: 1, reservedOfferId: 1 } }
      );
    }

    const eventType = { accepted: "OFFER_ACCEPTED", rejected: "OFFER_REJECTED", countered: "COUNTER_OFFER" }[status];
    await Promise.allSettled([
      recordEvent(req, {
        userId: offer.buyerId,
        eventType,
        productId: offer.productId,
        metadata: { offerAmount: offer.offerAmount, counterAmount: offer.counterAmount || null, finalPrice: updatedOffer.finalPrice || null, rounds: updatedOffer.rounds },
      }),
      Notification.create({
        userId: offer.buyerId,
        type: "offer",
        title: `Offer ${status}`,
        message: status === "accepted" ? "Your offer was accepted" : status === "rejected" ? "Your offer was rejected" : `Seller countered with ₹${counterAmount}`,
        link: "/offers",
      }),
    ]);
    res.json({ offer: updatedOffer });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message || "Offer response failed" });
  }
};
