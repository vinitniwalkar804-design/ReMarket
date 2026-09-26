import mongoose from "mongoose";

/**
 * A single tracked interaction.
 *
 * `sessionId` is the backbone of the engagement features. When the client sends
 * one, `sessionFrequency` is a real count of real sessions; when it does not, the
 * aggregation service infers sessions from idle gaps instead. The two are never
 * mixed for the same customer, because that would double-count.
 */
const behaviorEventSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    eventType: { type: String, required: true, index: true },
    category: { type: String, default: "" },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", default: null },
    sessionId: { type: String, default: "", index: true },
    /** Role of the page the event fired on: browse, product, cart, checkout, account. */
    surface: { type: String, default: "" },
    /** Milliseconds the user spent on the surface before this event, when known. */
    durationMs: { type: Number, default: 0 },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

behaviorEventSchema.index({ userId: 1, eventType: 1 });
behaviorEventSchema.index({ userId: 1, timestamp: -1 });
behaviorEventSchema.index({ userId: 1, sessionId: 1 });

const BehaviorEvent = mongoose.model("BehaviorEvent", behaviorEventSchema);
export default BehaviorEvent;
