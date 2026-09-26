import mongoose from "mongoose";

const wishlistSchema = new mongoose.Schema({
  // Indexed uniquely by the schema.index below; declaring `index: true` here as
  // well would register the same key twice and warn on startup.
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  products: [
    {
      productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
      addedAt: { type: Date, default: Date.now },
    },
  ],
});

wishlistSchema.index({ userId: 1 }, { unique: true });

const Wishlist = mongoose.model("Wishlist", wishlistSchema);
export default Wishlist;