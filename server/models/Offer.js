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

const Offer = mongoose.model("Offer", offerSchema);
export default Offer;