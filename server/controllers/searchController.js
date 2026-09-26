import { Product, Category, BehaviorEvent } from "../models/index.js";

export const continueShopping = async (req, res) => {
  try {
    if (!req.user) return res.json({ items: [] });
    const recent = await BehaviorEvent.find({ userId: req.user._id, eventType: "SEARCH", "metadata.query": { $ne: "" } })
      .sort({ timestamp: -1 })
      .limit(30)
      .lean();
    const queries = [...new Set(recent.map((e) => e.metadata.query).filter((q) => typeof q === "string"))].slice(0, 4);
    const items = [];
    for (const q of queries) {
      const products = await Product.aggregate([
        { $match: { status: "available", $text: { $search: q } } },
        {
          $project: {
            title: 1, brand: 1, price: 1, originalPrice: 1,
            image: { $arrayElemAt: ["$images", 0] }, categoryName: 1, condition: 1, location: 1,
          },
        },
        { $limit: 4 },
      ]);
      if (products.length) items.push({ query: q, products });
    }
    res.json({ items: items.slice(0, 3) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const searchSuggestions = async (req, res) => {
  try {
    const { q } = req.query;
    const term = (q || "").trim();

    const [productMatches, topQueries, categoryMatches] = await Promise.all([
      term
        ? Product.aggregate([
            { $match: { status: "available", $text: { $search: term } } },
            { $project: { title: 1, brand: 1, price: 1, image: { $arrayElemAt: ["$images", 0] }, categoryName: 1, condition: 1 } },
            { $limit: 6 },
          ])
        : Promise.resolve([]),
      BehaviorEvent.aggregate([
        { $match: { eventType: "SEARCH", "metadata.query": { $ne: "" } } },
        { $group: { _id: "$metadata.query", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 8 },
      ]),
      term
        ? Category.find({ name: { $regex: new RegExp(term, "i") } }).limit(4).lean()
        : Promise.resolve([]),
    ]);

    let recentSearches = [];
    if (req.user) {
      const recent = await BehaviorEvent.find({ userId: req.user._id, eventType: "SEARCH", "metadata.query": { $ne: "" } })
        .sort({ timestamp: -1 })
        .limit(10)
        .lean();
      recentSearches = [...new Set(recent.map((e) => e.metadata.query).filter(Boolean))].slice(0, 5);
    }

    res.json({
      products: productMatches,
      popular: topQueries.map((t) => t._id).filter(Boolean),
      recent: recentSearches,
      categories: categoryMatches.map((c) => ({ _id: c._id, name: c.name, slug: c.slug })),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};