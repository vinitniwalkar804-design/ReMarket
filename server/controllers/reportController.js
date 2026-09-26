/**
 * Listing reports: the customer-facing flag and the admin's triage read model.
 *
 * The project had no abuse reporting before this. What it called "reports" in the
 * admin area was a marketplace-health summary (recent reviews, offer funnel,
 * order fulfilment) - useful, but it cannot answer "somebody complained about
 * this listing, what did we do?".
 *
 * Scope is deliberately narrow: a report points at one listing, carries one
 * reason, and ends in a moderation decision. It is not a ticket system, and it
 * deliberately does not duplicate orders/offers/reviews, which stay the record
 * of what actually happened commercially.
 *
 * Authorization: creating a report needs a signed-in customer (anyone can see a
 * live listing, so anyone can report one, but reports must be attributable).
 * Triaging is admin-only and lives behind `authenticateUser -> requireAdmin` in
 * the admin routes, never here.
 */
import mongoose from "mongoose";
import { Product, ProductReport } from "../models/index.js";
import { REPORT_REASONS } from "../models/ProductReport.js";
import { applyModeration, reasonLabel } from "../services/moderation.js";
import { MODERATION_STATUSES, isPubliclyVisible } from "../utils/listingStatus.js";

const isObjectId = (value) => mongoose.isValidObjectId(String(value || ""));
const boundedLimit = (value, fallback, max = 100) => {
  const number = Number.parseInt(value, 10);
  return Math.min(max, Math.max(1, Number.isFinite(number) ? number : fallback));
};
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export { REPORT_REASONS };

/* ------------------------------------------------------------------ *
 * Customer side
 * ------------------------------------------------------------------ */

/**
 * POST /api/reports  { productId, reason, details }
 *
 * A report can only be filed against a listing that is actually live: reporting
 * something you cannot see is either a stale link or an attempt to attach noise
 * to a listing an admin is about to look at.
 */
export const createReport = async (req, res) => {
  try {
    const { productId, reason, details } = req.body;
    if (!isObjectId(productId)) return res.status(400).json({ message: "Invalid listing" });
    if (!REPORT_REASONS.includes(reason)) {
      return res.status(400).json({ message: "Choose a valid reason for reporting this listing" });
    }
    const note = String(details || "").trim().slice(0, 1000);

    const product = await Product.findById(productId).select("seller sellerName title status");
    if (!product) return res.status(404).json({ message: "This listing no longer exists" });
    if (!isPubliclyVisible(product.status)) {
      return res.status(409).json({ message: "This listing is already off the marketplace" });
    }
    if (String(product.seller) === String(req.user._id)) {
      return res.status(400).json({ message: "You cannot report your own listing" });
    }

    const existing = await ProductReport.findOne({
      productId: product._id,
      reporterId: req.user._id,
      status: { $in: ["open", "reviewing"] },
    });
    if (existing) {
      return res.status(409).json({ message: "You have already reported this listing" });
    }

    const report = await ProductReport.create({
      productId: product._id,
      productTitle: product.title,
      sellerId: product.seller,
      sellerName: product.sellerName,
      reporterId: req.user._id,
      reporterName: req.user.name,
      reason,
      details: note,
    });
    res.status(201).json({ report, message: "Thanks - an administrator will review this listing" });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ message: "You have already reported this listing" });
    }
    res.status(err.statusCode || 500).json({ message: err.message || "Could not file the report" });
  }
};

/** GET /api/reports/mine - what this customer has reported, and what happened. */
export const getMyReports = async (req, res) => {
  try {
    const reports = await ProductReport.find({ reporterId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate("productId", "title images status")
      .lean();
    res.json({ reports });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ------------------------------------------------------------------ *
 * Admin side (called only from adminRoutes, behind requireAdmin)
 * ------------------------------------------------------------------ */

/**
 * GET /api/admin/moderation/reports
 *
 * The triage queue: reported listings with enough context to decide without
 * opening five other pages, plus the facets the queue header counts from.
 */
export const getModerationQueue = async (req, res) => {
  try {
    const page = boundedLimit(req.query.page, 1, 100000);
    const limit = boundedLimit(req.query.limit, 20, 100);
    const { status, reason, search, seller } = req.query;

    const filter = {};
    if (status && ["open", "reviewing", "resolved", "dismissed"].includes(status)) {
      filter.status = status;
    } else if (!status) {
      // Default view is the actionable queue, not the whole archive.
      filter.status = { $in: ["open", "reviewing"] };
    }
    if (reason && REPORT_REASONS.includes(reason)) filter.reason = reason;
    if (isObjectId(seller)) filter.sellerId = seller;
    if (typeof search === "string" && search.trim()) {
      const rx = new RegExp(escapeRegex(search.trim().slice(0, 80)), "i");
      filter.$or = [{ productTitle: rx }, { sellerName: rx }, { reporterName: rx }];
    }
    const [reports, total, byStatus, byReason] = await Promise.all([
      ProductReport.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("productId", "title images categoryName price condition status seller sellerName createdAt")
        .lean(),
      ProductReport.countDocuments(filter),
      ProductReport.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      ProductReport.aggregate([{ $group: { _id: "$reason", count: { $sum: 1 } } }]),
    ]);

    // Denormalised copy of the title so a queue filter does not need a populate
    // per candidate document. Written at report time, refreshed if the seller edits.
    const flagged = await Product.aggregate([
      { $match: { status: { $in: MODERATION_STATUSES } } },
      {
        $project: {
          _id: 1, title: 1, status: 1, categoryName: 1, price: 1, condition: 1,
          images: 1, seller: 1, sellerName: 1, createdAt: 1,
          moderationReason: 1, moderationNote: 1, moderatedByName: 1, moderatedAt: 1,
        },
      },
      { $sort: { moderatedAt: -1 } },
      { $limit: 25 },
    ]);

    res.json({
      reports,
      total,
      page,
      limit,
      reasons: REPORT_REASONS,
      facets: {
        byStatus: Object.fromEntries(byStatus.map((r) => [r._id, r.count])),
        byReason: Object.fromEntries(byReason.map((r) => [r._id, r.count])),
      },
      flaggedListings: flagged,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * PATCH /api/admin/moderation/reports/:id
 *
 * Close a report, optionally with a moderation action applied to the listing in
 * the same call. The listing change goes through `applyModeration`, so acting on
 * a report has exactly the same effect as acting on the listings page - there is
 * no second, weaker code path.
 */
export const resolveReport = async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ message: "Invalid report" });
    const { action, note, listingStatus, reason } = req.body || {};
    const allowedActions = ["dismiss", "resolve", "hide_listing", "reject_listing", "suspend_listing", "remove_listing", "restore_listing"];
    if (!allowedActions.includes(action)) {
      return res.status(400).json({ message: "Choose what to do with this report" });
    }
    const resolutionNote = String(note || "").trim().slice(0, 500);

    const report = await ProductReport.findById(req.params.id);
    if (!report) return res.status(404).json({ message: "Report not found" });

    // An action naming a listing status performs that moderation now, so the
    // queue and the listings page can never disagree about a listing's state.
    const impliedStatus = {
      hide_listing: "hidden",
      reject_listing: "rejected",
      suspend_listing: "suspended",
      remove_listing: "removed",
      restore_listing: "available",
    }[action];

    let listing = null;
    if (impliedStatus) {
      const targetStatus = listingStatus || impliedStatus;
      try {
        const result = await applyModeration({
          productId: report.productId,
          status: targetStatus,
          reason: reason || defaultReasonFor(targetStatus),
          note: resolutionNote || `Reported as ${reasonLabel(report.reason)}`,
          admin: req.user,
        });
        listing = result.product;
      } catch (err) {
        // The listing is mid-transaction or already gone. Say so instead of
        // silently marking the report closed - the listing is still a problem.
        return res.status(err.statusCode || 409).json({
          message: err.message,
          report,
        });
      }
    }

    report.status = action === "dismiss" ? "dismissed" : "resolved";
    report.resolutionAction = action;
    report.resolutionNote = resolutionNote;
    report.resolvedBy = req.user._id;
    report.resolvedByName = req.user.name;
    report.resolvedAt = new Date();
    await report.save();

    res.json({ report, listing, message: `Report ${report.status}` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const defaultReasonFor = (status) => {
  if (status === "rejected") return "policy_violation";
  if (status === "suspended") return "under_review";
  if (status === "removed") return "policy_violation";
  return "under_review";
};
