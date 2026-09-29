import mongoose from "mongoose";
import { LISTING_STATUSES } from "../utils/listingStatus.js";

/**
 * One administrator decision about a listing.
 *
 * Kept as an append-only trail rather than overwriting a single "moderated" flag:
 * a listing that was hidden, then restored, then rejected is three separate
 * events, and "why is this listing gone?" has to be answerable from the document
 * itself rather than from log files. The seller sees the same trail in their
 * studio, so the reason is never hidden from the person it affects.
 */
const moderationEntrySchema = new mongoose.Schema(
  {
    action: { type: String, required: true },
    from: { type: String, default: "" },
    to: { type: String, required: true },
    reason: { type: String, default: "" },
    note: { type: String, default: "" },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    byName: { type: String, default: "" },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: "Category", required: true },
    categoryName: { type: String, required: true },
    brand: { type: String, default: "Other" },
    model: { type: String, default: "" },
    originalPrice: { type: Number, required: true },
    price: { type: Number, required: true },
    condition: { type: String, enum: ["Like New", "Good", "Average", "Used"], default: "Good" },
    location: { type: String, default: "" },
    images: [{ type: String }],
    specifications: { type: mongoose.Schema.Types.Mixed, default: {} },
    negotiable: { type: Boolean, default: true },
    exchangeable: { type: Boolean, default: false },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    sellerName: { type: String, default: "" },
    /**
     * The listing lifecycle. `available` is the only publicly visible value -
     * see backend/utils/listingStatus.js, which every public read path filters on.
     */
    status: { type: String, enum: LISTING_STATUSES, default: "available" },
    reservedBuyerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reservedOfferId: { type: mongoose.Schema.Types.ObjectId, ref: "Offer", default: null },
    views: { type: Number, default: 0 },
    wishlistCount: { type: Number, default: 0 },
    compareCount: { type: Number, default: 0 },
    cartCount: { type: Number, default: 0 },
    orderCount: { type: Number, default: 0 },
    rating: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 },
    isVerified: { type: Boolean, default: false },
    isFeatured: { type: Boolean, default: false },

    /**
     * Why the listing is currently off the marketplace, and who put it there.
     * Null/empty for a listing nobody has touched, so existing documents need no
     * migration and keep behaving exactly as before.
     */
    moderationNote: { type: String, default: "" },
    moderationReason: { type: String, default: "" },
    moderatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    moderatedByName: { type: String, default: "" },
    moderatedAt: { type: Date, default: null },
    /** Append-only audit trail of every moderation action on this listing. */
    moderationHistory: { type: [moderationEntrySchema], default: [] },
  },
  { timestamps: true }
);

productSchema.index({ title: "text", description: "text", brand: "text", categoryName: "text" });

const Product = mongoose.model("Product", productSchema);
export default Product;