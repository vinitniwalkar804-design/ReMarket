import mongoose from "mongoose";

const offerSchema = new mongoose.Schema(
  {
    buyerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    listedPrice: { type: Number, required: true },
    offerAmount: { type: Number, required: true },
    status: { type: String, enum: ["pending", "accepted", "rejected", "countered", "expired"], default: "pending" },
    counterAmount: { type: Number, default: null },
    rounds: { type: Number, default: 1 },
    finalPrice: { type: Number, default: null },
    message: { type: String, default: "" },
    sellerResponseTime: { type: Number, default: 0 },
  },
  { timestamps: true }
);

/**
 * Negotiation analytics need to reach a listing's offers and a seller's whole
 * offer history. `Offer` had no indexes at all, so both were collection scans -
 * invisible at a few hundred documents, painful once negotiations become the
 * main way a marketplace transacts.
 *
 * `{ productId, status }` is the listing-level negotiation breakdown, which
 * groups by status after matching on product. `sellerId` serves the seller trust
 * panel, which aggregates across every listing a seller has ever negotiated on.
 */
offerSchema.index({ productId: 1, status: 1 });
offerSchema.index({ sellerId: 1 });

const Offer = mongoose.model("Offer", offerSchema);
export default Offer;