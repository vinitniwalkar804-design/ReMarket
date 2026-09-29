import mongoose from "mongoose";

const cartItemSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    item: {
      productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
      price: { type: Number },
      title: { type: String },
      image: { type: String },
      sellerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      addedAt: { type: Date, default: Date.now },
    },
  },
  { timestamps: true }
);

cartItemSchema.index({ userId: 1, "item.productId": 1 }, { unique: true });

const Cart = mongoose.model("Cart", cartItemSchema);
export default Cart;