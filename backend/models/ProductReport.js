import mongoose from "mongoose";

/**
 * A customer flagging a listing for an administrator to look at.
 *
 * Deliberately minimal. The project had no abuse-reporting at all - the admin
 * "reports" endpoint was really a marketplace-health summary (reviews, offer
 * funnel, order fulfilment), which is useful but answers a different question.
 * Moderation needs one thing it did not have: a queue of specific listings that
 * somebody complained about, with a reason, an outcome, and a trail of who
 * decided what. That is exactly what this model is, and nothing more.
 *
 * It is intentionally NOT a general-purpose abuse/ticket system. Reviews, offers
 * and orders keep their own models; a report only ever points at a listing.
 */
export const REPORT_REASONS = [
  "prohibited_item",
  "counterfeit_or_inauthentic",
  "misleading_details",
  "wrong_category",
  "offensive_content",
  "spam_or_scam",
  "duplicate_listing",
  "other",
];

export const REPORT_STATUSES = ["open", "reviewing", "resolved", "dismissed"];

const productReportSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true, index: true },
    /**
     * Title copied at report time so the queue can be searched and sorted by
     * listing without populating every candidate document. A title edit later
     * does not rewrite history - the report is about what was seen and when.
     */
    productTitle: { type: String, default: "" },
    /** Denormalised so the moderation queue never needs a lookup to show who to blame. */
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    sellerName: { type: String, default: "" },
    reporterId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    reporterName: { type: String, default: "" },
    reason: { type: String, enum: REPORT_REASONS, required: true },
    details: { type: String, default: "", maxlength: 1000 },
    status: { type: String, enum: REPORT_STATUSES, default: "open", index: true },
    /** What the admin did about it, so the queue can show outcomes, not just counts. */
    resolutionAction: { type: String, default: "" },
    resolutionNote: { type: String, default: "" },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    resolvedByName: { type: String, default: "" },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// One open report per person per listing: a duplicate is noise in the queue and
// would otherwise let a single reporter inflate the count an admin triages on.
productReportSchema.index(
  { productId: 1, reporterId: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ["open", "reviewing"] } } }
);
productReportSchema.index({ status: 1, createdAt: -1 });

const ProductReport = mongoose.model("ProductReport", productReportSchema);
export default ProductReport;
