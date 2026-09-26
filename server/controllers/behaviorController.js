import mongoose from "mongoose";
import { BehaviorEvent } from "../models/index.js";
import { recordEvent } from "../services/behaviorEvents.js";

/**
 * The closed vocabulary of tracked events.
 *
 * This list is a contract, not a suggestion: the feature aggregation derives
 * named features from specific event types, so an event type that is not here
 * cannot contribute to segmentation. Adding one without teaching the aggregator
 * to read it would create an event that is stored but invisible to the model.
 */
const allowedEvents = new Set([
  // Session and identity
  "LOGIN", "LOGOUT", "REGISTER", "SESSION_START", "SESSION_END",
  // Discovery
  "SEARCH", "PRODUCT_VIEW", "CATEGORY_VIEW", "PRICE_WATCH", "PRICE_DROP_CLICK",
  // Consideration
  "PRODUCT_COMPARE", "COMPARE_SELECTED", "REVIEW_VIEW", "SELLER_PROFILE_VIEW",
  "CHAT_STARTED",
  // Intent
  "WISHLIST_ADD", "WISHLIST_REMOVE", "CART_VIEW", "CART_ADD", "CART_REMOVE", "CHECKOUT_START",
  // Purchase and after
  "PURCHASE", "PURCHASE_REASON", "PRODUCT_RETURN", "EXCHANGE_REQUEST", "REVIEW_SUBMITTED",
  // Selling
  "SELL_LISTING",
  // Negotiation
  "OFFER_SENT", "OFFER_ACCEPTED", "OFFER_REJECTED", "OFFER_EXPIRED", "COUNTER_OFFER",
]);

/** Events that meaningfully represent a purchase decision. */
const PURCHASE_EVENTS = new Set(["PURCHASE"]);
/** Events that represent a completed negotiation round. */
const NEGOTIATION_EVENTS = new Set(["OFFER_SENT", "COUNTER_OFFER", "OFFER_ACCEPTED", "OFFER_REJECTED"]);

const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{6,100}$/;

const isObjectId = (value) => mongoose.isValidObjectId(String(value || ""));

export const trackEvent = async (req, res) => {
  try {
    const { eventType, productId, category, metadata, surface, durationMs } = req.body;
    if (!allowedEvents.has(eventType)) {
      return res.status(400).json({
        message: "Unsupported behavior event",
        allowedEventTypes: Array.from(allowedEvents).sort(),
      });
    }
    if (productId && !isObjectId(productId)) {
      return res.status(400).json({ message: "Invalid product" });
    }
    if (metadata && (typeof metadata !== "object" || Array.isArray(metadata))) {
      return res.status(400).json({ message: "Invalid event metadata" });
    }
    if (durationMs !== undefined && (!Number.isFinite(Number(durationMs)) || Number(durationMs) < 0)) {
      return res.status(400).json({ message: "durationMs must be a positive number" });
    }

    const sessionId = String(req.body.sessionId || "").trim();
    if (sessionId && !SESSION_ID_PATTERN.test(sessionId)) {
      return res.status(400).json({ message: "Invalid sessionId" });
    }

    const event = await recordEvent(req, {
      userId: req.user._id,
      eventType,
      productId: productId || null,
      category: String(category || "").trim().slice(0, 100),
      surface: String(surface || "").trim().slice(0, 50),
      durationMs: Math.min(Number(durationMs) || 0, 24 * 60 * 60 * 1000),
      metadata: metadata || {},
      sessionId,
      timestamp: new Date(),
    });
    res.status(201).json({ success: true, eventId: event._id });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * Record several events in one call.
 *
 * Page-level tracking fires in bursts, and one request per event is wasteful
 * enough that clients end up dropping events under load -- which would silently
 * understate customer engagement, the exact opposite of what the features are for.
 */
export const trackEvents = async (req, res) => {
  try {
    const events = Array.isArray(req.body?.events) ? req.body.events : null;
    if (!events || events.length === 0) {
      return res.status(400).json({ message: "Provide a non-empty events array" });
    }
    if (events.length > 100) {
      return res.status(400).json({ message: "At most 100 events per batch" });
    }

    const documents = [];
    for (const raw of events) {
      const eventType = raw?.eventType;
      if (!allowedEvents.has(eventType)) {
        return res.status(400).json({ message: `Unsupported behavior event: ${eventType}` });
      }
      if (raw?.productId && !isObjectId(raw.productId)) {
        return res.status(400).json({ message: `Invalid product: ${raw.productId}` });
      }
      const sessionId = String(raw?.sessionId || "").trim();
      if (sessionId && !SESSION_ID_PATTERN.test(sessionId)) {
        return res.status(400).json({ message: "Invalid sessionId" });
      }
      documents.push({
        userId: req.user._id,
        eventType,
        productId: raw.productId || null,
        category: String(raw.category || "").trim().slice(0, 100),
        surface: String(raw.surface || "").trim().slice(0, 50),
        durationMs: Math.min(Number(raw.durationMs) || 0, 24 * 60 * 60 * 1000),
        metadata: raw.metadata && typeof raw.metadata === "object" && !Array.isArray(raw.metadata) ? raw.metadata : {},
        sessionId,
        timestamp: raw.timestamp ? new Date(raw.timestamp) : new Date(),
      });
    }

    const inserted = await BehaviorEvent.insertMany(documents, { ordered: false });
    res.status(201).json({ success: true, recorded: inserted.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getTimeline = async (req, res) => {
  try {
    const requestedUserId = req.params.userId || req.user._id;
    if (!isObjectId(requestedUserId)) return res.status(400).json({ message: "Invalid user" });
    if (String(requestedUserId) !== String(req.user._id) && req.user.role !== "admin") {
      return res.status(403).json({ message: "Not authorized" });
    }
    const requestedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Math.min(500, Math.max(1, Number.isFinite(requestedLimit) ? requestedLimit : 100));
    const events = await BehaviorEvent.find({ userId: requestedUserId })
      .sort({ timestamp: -1 })
      .limit(limit)
      .populate("productId", "title price images");
    res.json({ events });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const behaviorEventVocabulary = {
  allowedEvents: Array.from(allowedEvents).sort(),
  purchaseEvents: Array.from(PURCHASE_EVENTS),
  negotiationEvents: Array.from(NEGOTIATION_EVENTS),
};
