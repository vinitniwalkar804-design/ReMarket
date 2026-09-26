import { Settings } from "../models/index.js";

const DEFAULTS = [
  { key: "siteName", value: "ReMarket", label: "Marketplace name", group: "general" },
  { key: "tagline", value: "Give good things a second life.", label: "Tagline", group: "general" },
  { key: "platformFee", value: 0, label: "Platform fee (₹)", group: "general" },
  { key: "freeDelivery", value: true, label: "Free delivery on all orders", group: "checkout" },
  { key: "enableNegotiation", value: true, label: "Enable price negotiation", group: "features" },
  { key: "enableExchange", value: true, label: "Enable exchanges", group: "features" },
  { key: "enableRecommendations", value: true, label: "Personalized recommendations", group: "features" },
  { key: "minClusters", value: 3, label: "Minimum customer clusters", group: "ml" },
  { key: "maxClusters", value: 8, label: "Maximum customer clusters", group: "ml" },
  { key: "cartAbandonmentWindowHours", value: 24, label: "Cart abandonment window (hours)", group: "ml" },
];

export const getSettings = async (req, res) => {
  try {
    const saved = await Settings.find().lean();
    const map = new Map(saved.map((s) => [s.key, s]));
    const merged = DEFAULTS.map((d) => {
      const existing = map.get(d.key);
      return existing ? { key: d.key, value: existing.value, label: existing.label, group: existing.group } : d;
    });
    res.json({ settings: merged, groups: [...new Set(DEFAULTS.map((d) => d.group))] });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const updateSetting = async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    const setting = await Settings.findOneAndUpdate({ key }, { value }, { upsert: true, new: true });
    res.json({ setting });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getPublicSettings = async (req, res) => {
  try {
    const keys = ["siteName", "tagline", "platformFee", "enableNegotiation", "enableExchange", "enableRecommendations"];
    const saved = await Settings.find({ key: { $in: keys } }).lean();
    const out = { siteName: "ReMarket", tagline: "Give good things a second life.", platformFee: 0, enableNegotiation: true, enableExchange: true, enableRecommendations: true };
    saved.forEach((s) => { out[s.key] = s.value; });
    res.json(out);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};