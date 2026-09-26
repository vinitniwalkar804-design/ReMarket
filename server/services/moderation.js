/**
 * Marketplace moderation: the one place a listing is taken off the storefront.
 *
 * Every admin action that changes a listing's visibility funnels through
 * `applyModeration`, including the one taken from the report queue. That is
 * deliberate. When "hide listing" is implemented twice it eventually means two
 * slightly different things, and the one that forgets to expire the seller's open
 * offers is the one an admin discovers from a customer complaint.
 *
 * What a moderation action always does:
 *  - writes the new status to MongoDB (nothing here is a frontend-only flag),
 *  - stamps who did it, when, and why, onto the listing itself,
 *  - appends an immutable audit entry,
 *  - expires negotiations that can no longer be accepted, so a suspended listing
 *    cannot be sold through an offer accepted a second earlier,
 *  - releases any reservation hold, so a buyer is not left reserved on an item
 *    nobody can buy,
 *  - tells the seller, through the existing notifications system.
 *
 * What it deliberately does NOT do:
 *  - delete anything. Orders, reviews, offers, chats, wishlists, comparisons and
 *    behaviour events all reference the listing, and that history is the input
 *    the segmentation model is trained on. Removing a bad listing must not
 *    rewrite the marketplace's past. The admin controller's `removeProduct` is
 *    the only path that destroys a document, and it refuses to run while
 *    references exist.
 */
import {
  BehaviorEvent,
  Chat,
  Notification,
  Offer,
  Order,
  PriceHistory,
  Product,
  Review,
} from "../models/index.js";
import {
  LISTING_STATUSES,
  MODERATION_STATUSES,
  isModerated,
  isPubliclyVisible,
  isValidModerationReason,
  listingStatusLabel,
} from "../utils/listingStatus.js";

const REASON_LABELS = {
  policy_violation: "a marketplace policy violation",
  prohibited_item: "a prohibited item",
  counterfeit_or_inauthentic: "a counterfeit or inauthentic item",
  misleading_details: "misleading listing details",
  duplicate_listing: "a duplicate listing",
  spam_or_scam: "spam or suspected scam",
  offensive_content: "offensive content",
  wrong_category: "the wrong category",
  under_review: "an ongoing review",
  other: "an admin decision",
};

export const reasonLabel = (reason) => REASON_LABELS[reason] || REASON_LABELS.other;

/** Validation shared by every endpoint that accepts a moderation reason. */
export const normalizeModerationReason = (reason) => {
  const value = String(reason || "").trim();
  return isValidModerationReason(value) ? value : "";
};

export const normalizeModerationNote = (note) =>
  String(note || "")
    .trim()
    .slice(0, 500);

/**
 * Is this listing mid-transaction?
 *
 * A listing that is reserved, or that has a live order, must not be yanked: the
 * buyer is already committed and the seller may already have shipped. The admin
 * gets a 409 and a sentence explaining what is blocking them, rather than a
 * silent no-op.
 *
 * @returns {Promise<string|null>} the blocking reason, or null when clear to act
 */
export const findActiveCommitment = async (product) => {
  if (product.status === "reserved") return "This listing is currently reserved for a buyer.";
  const activeOrder = await Order.exists({
    productId: product._id,
    status: { $nin: ["cancelled", "returned"] },
  });
  if (activeOrder) return "This listing has an order that is still active.";
  return null;
};

/**
 * Apply a moderation status to a listing and record who decided it.
 *
 * @param {object}  options
 * @param {string}  options.productId
 * @param {string}  options.status    target status; must be in LISTING_STATUSES
 * @param {string} [options.reason]   one of MODERATION_REASONS. Required for the
 *                                    destructive states, optional for restoration.
 * @param {string} [options.note]     free text, shown to the seller
 * @param {object}  options.admin     the authenticated admin (req.user)
 * @param {boolean}[options.notify]   notify the seller (default true)
 * @returns {Promise<{product: object, previousStatus: string, changed: boolean}>}
 * @throws  {Error} carrying `statusCode` for anything the caller should surface
 */
export const applyModeration = async ({
  productId,
  status,
  reason,
  note,
  admin,
  notify = true,
}) => {
  if (!LISTING_STATUSES.includes(status)) {
    const error = new Error("Unknown listing status");
    error.statusCode = 400;
    throw error;
  }

  const product = await Product.findById(productId);
  if (!product) {
    const error = new Error("Listing not found");
    error.statusCode = 404;
    throw error;
  }

  const previousStatus = product.status;
  const normalizedReason = normalizeModerationReason(reason);
  const normalizedNote = normalizeModerationNote(note);
  const changed = previousStatus !== status;

  // "Why was this taken down?" has to be answerable, so a destructive state
  // cannot be applied without a reason. Restoration needs no justification.
  if (isModerated(status) && !normalizedReason) {
    const error = new Error("Choose a reason before taking a listing off the marketplace");
    error.statusCode = 400;
    throw error;
  }

  if (changed && !isPubliclyVisible(status)) {
    const blocked = await findActiveCommitment(product);
    if (blocked) {
      const error = new Error(`${blocked} Settle it first, then moderate the listing.`);
      error.statusCode = 409;
      throw error;
    }
  }

  product.status = status;
  if (isPubliclyVisible(status)) {
    // Back on the market: clear the banner so the seller studio stops showing a
    // reason for a listing that is live again.
    product.moderationNote = "";
    product.moderationReason = "";
    product.moderatedBy = null;
    product.moderatedByName = "";
    product.moderatedAt = null;
  } else {
    product.moderationReason = normalizedReason;
    product.moderationNote = normalizedNote;
    product.moderatedBy = admin?._id || null;
    product.moderatedByName = admin?.name || "";
    product.moderatedAt = new Date();
  }

  product.moderationHistory.push({
    action: isModerated(status) ? "moderate" : "status_change",
    from: previousStatus,
    to: status,
    reason: normalizedReason,
    note: normalizedNote,
    by: admin?._id || null,
    byName: admin?.name || "",
    at: new Date(),
  });

  if (!isPubliclyVisible(status)) {
    // A listing nobody can buy must not keep an accept-able offer or hold a
    // reservation. Released here rather than left to expire on their own.
    await Offer.updateMany(
      { productId: product._id, status: { $in: ["pending", "countered"] } },
      { $set: { status: "expired" } }
    );
    // Assigning undefined is how a Mongoose document drops a path. `$unset` is an
    // update operator and only exists on queries, not on documents.
    product.reservedBuyerId = undefined;
    product.reservedOfferId = undefined;
  }

  await product.save();

  if (changed && notify && admin && String(product.seller) !== String(admin._id)) {
    const headline = isPubliclyVisible(status)
      ? `"${product.title}" is live again`
      : `"${product.title}" is now ${listingStatusLabel(status).toLowerCase()}`;
    const detail = normalizedNote
      ? normalizedNote
      : normalizedReason
        ? `Reason: ${reasonLabel(normalizedReason)}.`
        : "Open your seller studio to see the full moderation history.";
    await Notification.create({
      userId: product.seller,
      type: "moderation",
      title: headline,
      message: detail,
      link: "/sell",
    }).catch(() => {});
  }

  return { product, previousStatus, changed };
};

/**
 * Everything that points at a listing, classified by what it means for deletion.
 *
 * The three tiers exist because "can this be deleted?" has three different
 * honest answers, and collapsing them into one boolean gets it wrong in both
 * directions:
 *
 *  - `blockers` - orders, offers, reviews and conversations. These are other
 *    people's records. Deleting the listing would leave a customer's receipt,
 *    a review, or a conversation pointing at nothing, so these refuse the
 *    delete and the admin is told exactly which ones and how many.
 *  - `removable` - price history. It is owned *by* the listing and has no
 *    meaning without it, so it is deleted along with the listing.
 *  - `retained` - behaviour events. Every listing writes a SELL_LISTING event
 *    the moment it is created, so counting these as blockers would mean no
 *    listing could ever be permanently deleted and the guard would be theatre.
 *    They are historical facts about the marketplace, they are the training
 *    data for the segmentation model, and they are deliberately kept. The
 *    response reports how many so the deletion is never silent.
 */
const REFERENCE_TIERS = [
  { tier: "blockers", name: "orders", model: () => Order, query: (id) => ({ productId: id }), label: "order" },
  { tier: "blockers", name: "offers", model: () => Offer, query: (id) => ({ productId: id }), label: "offer" },
  { tier: "blockers", name: "reviews", model: () => Review, query: (id) => ({ productId: id }), label: "review" },
  { tier: "blockers", name: "chats", model: () => Chat, query: (id) => ({ productId: id }), label: "conversation" },
  { tier: "removable", name: "price history", model: () => PriceHistory, query: (id) => ({ productId: id }), label: "price record" },
  { tier: "retained", name: "behaviour events", model: () => BehaviorEvent, query: (id) => ({ productId: id }), label: "tracked event" },
];

/**
 * Count everything that still points at this listing.
 *
 * @returns {Promise<{blockers: object[], removable: object[], retained: object[], canDelete: boolean}>}
 */
export const countProductReferences = async (productId) => {
  const counted = await Promise.all(
    REFERENCE_TIERS.map(async (reference) => ({
      tier: reference.tier,
      name: reference.name,
      label: reference.label,
      count: await reference.model().countDocuments(reference.query(productId)),
    }))
  );
  const present = (tier) => counted.filter((r) => r.tier === tier && r.count > 0);
  const blockers = present("blockers");
  return {
    blockers,
    removable: present("removable"),
    retained: present("retained"),
    canDelete: blockers.length === 0,
  };
};

export { MODERATION_STATUSES };
