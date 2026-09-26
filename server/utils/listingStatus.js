/**
 * The listing lifecycle, in one place.
 *
 * A listing is not a boolean "exists / doesn't exist". Sellers create them,
 * buyers reserve and buy them, and admins moderate them, so the same document
 * has to be able to say several different things at once: that it sold, that an
 * admin pulled it, that it is back pending review. Encoding that as one `status`
 * enum plus a small set of rules keeps every consumer - the public catalogue,
 * the seller studio, the admin console - reading the same meaning from the same
 * field.
 *
 * The single most important rule in this file:
 *
 *   A listing is publicly visible if and only if its status is `available`.
 *
 * Every public read path (catalogue, search, suggestions, categories, featured,
 * trending, deals, nearby, similar, recommendations, wishlist, cart, compare)
 * filters on that exact value. Adding a moderation state is therefore safe by
 * construction: a new state is invisible everywhere until someone opts it in.
 */

/** Every status the schema accepts. */
export const LISTING_STATUSES = [
  "available", // live on the storefront
  "reserved",  // held for a buyer mid-negotiation
  "sold",      // completed sale
  "hidden",    // admin pulled it temporarily; can be restored
  "suspended", // under review / seller suspended; can be restored
  "rejected",  // violated marketplace policy; can be restored after a fix
  "removed",   // taken down for good; the terminal state
];

/**
 * Statuses that mean "an administrator has acted on this listing".
 *
 * These are the states a seller may NOT move a listing out of on their own -
 * see `SELLER_STATUS_TRANSITIONS` in the product controller. Relisting has to be
 * an admin decision or moderation is decorative.
 */
export const MODERATION_STATUSES = ["hidden", "suspended", "rejected", "removed"];

/** Statuses that take a listing out of the public marketplace. */
export const OFF_MARKETPLACE_STATUSES = ["reserved", "sold", ...MODERATION_STATUSES];

/** The only status the storefront is allowed to render. */
export const isPubliclyVisible = (status) => status === "available";

/** Has an admin acted on this listing? */
export const isModerated = (status) => MODERATION_STATUSES.includes(status);

/** Is the listing still recoverable by an admin? */
export const isRestorable = (status) => status !== "removed" && status !== "sold";

/**
 * A label the UI can show for a status without hardcoding the wording, so the
 * same status never reads as "removed" in one place and "taken down" in another.
 */
export const LISTING_STATUS_LABELS = {
  available: "Live",
  reserved: "Reserved",
  sold: "Sold",
  hidden: "Hidden",
  suspended: "Suspended",
  rejected: "Rejected",
  removed: "Removed",
};

export const listingStatusLabel = (status) =>
  LISTING_STATUS_LABELS[status] || String(status || "unknown");

/**
 * Reasons an admin can attach to a moderation action. Recorded on the listing so
 * the seller (and the next admin) can see why it was pulled, not just that it was.
 */
export const MODERATION_REASONS = [
  "policy_violation",
  "prohibited_item",
  "counterfeit_or_inauthentic",
  "misleading_details",
  "duplicate_listing",
  "spam_or_scam",
  "offensive_content",
  "wrong_category",
  "under_review",
  "other",
];

export const isValidModerationReason = (reason) =>
  MODERATION_REASONS.includes(String(reason || ""));
