import { User, Product } from "../models/index.js";
import { recordEvent } from "../services/behaviorEvents.js";

export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password");
    const stats = {
      productsSold: await Product.countDocuments({ seller: req.user._id, status: "sold" }),
      activeListings: await Product.countDocuments({ seller: req.user._id, status: { $in: ["available", "reserved"] } }),
    };
    res.json({ user, stats });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const allowed = ["name", "location", "phone", "avatar", "bio"];
    const updates = {};
    allowed.forEach((k) => {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    });
    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true }).select("-password");
    res.json({ user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getSellerProfile = async (req, res) => {
  try {
    const sellerId = req.params.id;
    if (req.user) {
      await recordEvent(req, { userId: req.user._id, eventType: "SELLER_PROFILE_VIEW", metadata: { sellerId } });
    }
    const seller = await User.findById(sellerId).select("name email location avatar bio isVerifiedSeller sellerRating sellerRatingCount createdAt");
    if (!seller) return res.status(404).json({ message: "Seller not found" });
    const products = await Product.find({ seller: sellerId, status: { $in: ["available", "reserved"] } }).lean();
    res.json({ seller, products });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getVerifiedSellers = async (req, res) => {
  try {
    const sellers = await User.find({ role: "customer", isVerifiedSeller: true })
      .select("name location avatar sellerRating sellerRatingCount createdAt bio")
      .sort({ sellerRating: -1, sellerRatingCount: -1 })
      .limit(parseInt(req.query.limit) || 6)
      .lean();
    const enriched = await Promise.all(sellers.map(async (s) => {
      const [activeListings, soldCount] = await Promise.all([
        Product.countDocuments({ seller: s._id, status: { $in: ["available", "reserved"] } }),
        Product.countDocuments({ seller: s._id, status: "sold" }),
      ]);
      return { ...s, activeListings, soldCount };
    }));
    res.json({ sellers: enriched });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getMyStats = async (req, res) => {
  try {
    const orderCount = await Product.find({ seller: req.user._id }).countDocuments();
    const stats = {
      orders: orderCount,
      products: await Product.countDocuments({ seller: req.user._id }),
      sold: await Product.countDocuments({ seller: req.user._id, status: "sold" }),
    };
    res.json({ stats });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};