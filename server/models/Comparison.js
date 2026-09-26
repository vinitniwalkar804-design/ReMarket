import mongoose from "mongoose";

const comparisonSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    products: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
    startedAt: { type: Date, default: Date.now },
    endedAt: { type: Date, default: null },
    selectedProductId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", default: null },
    durationSec: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const Comparison = mongoose.model("Comparison", comparisonSchema);
export default Comparison;