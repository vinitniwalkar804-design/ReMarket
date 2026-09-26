import mongoose from "mongoose";

const priceHistorySchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true, index: true },
    price: { type: Number, required: true },
    source: { type: String, enum: ["listing", "offer", "update", "seed"], default: "listing" },
    note: { type: String, default: "" },
  },
  { timestamps: true }
);

priceHistorySchema.index({ productId: 1, createdAt: 1 });

const PriceHistory = mongoose.model("PriceHistory", priceHistorySchema);
export default PriceHistory;