import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
  {
    buyerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    productTitle: { type: String, default: "" },
    quantity: { type: Number, default: 1 },
    listedPrice: { type: Number, required: true },
    finalPrice: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    discountPercent: { type: Number, default: 0 },
    type: { type: String, enum: ["buy", "exchange"], default: "buy" },
    status: { type: String, enum: ["pending", "confirmed", "shipped", "delivered", "returned", "cancelled"], default: "pending" },
    paymentMethod: { type: String, default: "cod" },
    shippingAddress: { type: mongoose.Schema.Types.Mixed, default: {} },
    purchaseReason: { type: String, default: "" },
    viewedAt: { type: Date, default: null },
    firstViewAt: { type: Date, default: null },
    decisionTimeMinutes: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const Order = mongoose.model("Order", orderSchema);
export default Order;