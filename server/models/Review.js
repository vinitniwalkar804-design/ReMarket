import mongoose from "mongoose";

const reviewSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true, index: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, default: "" },
  },
  { timestamps: true }
);

reviewSchema.index({ userId: 1, productId: 1 }, { unique: true });

/**
 * The seller trust panel aggregates a seller's review record across every listing
 * they have ever sold, and `sellerId` carried no index, so that was a full scan
 * of the largest review collection in the database. `productId` is already
 * indexed on the field itself for the per-listing rating breakdown.
 */
reviewSchema.index({ sellerId: 1 });

const Review = mongoose.model("Review", reviewSchema);
export default Review;