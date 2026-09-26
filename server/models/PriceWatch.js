import mongoose from "mongoose";

const priceWatchSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    targetPrice: { type: Number, default: null },
    triggered: { type: Boolean, default: false },
    purchasedAfterTrigger: { type: Boolean, default: false },
  },
  { timestamps: true }
);

priceWatchSchema.index({ userId: 1, productId: 1 }, { unique: true });

const PriceWatch = mongoose.model("PriceWatch", priceWatchSchema);
export default PriceWatch;