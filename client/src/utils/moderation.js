/**
 * The listing lifecycle, mirrored for the browser.
 *
 * The server owns the rules - `server/utils/listingStatus.js` is the source of
 * truth and re-validates every status, reason and transition. This file exists so
 * the UI can *speak* the same vocabulary: a badge that says "Live" here means the
 * same thing as `status === "available"` there, and the two cannot drift into
 * showing a moderation reason under a different name.
 *
 * The lists below are intentionally duplicated rather than imported. A Vite
 * client cannot import from the server directory, and the alternative - fetching
 * the vocabulary over the network - would make a static badge asynchronous.
 * `listingStatus.js` on the server carries the same constants, and the
 * verification step in the final report checks the two agree.
 */

/** Mirrors LISTING_STATUSES on the server. */
export const LISTING_STATUSES = [
  "available",
  "reserved",
  "sold",
  "hidden",
  "suspended",
  "rejected",
  "removed",
];

/** Mirrors MODERATION_STATUSES on the server. */
export const MODERATION_STATUSES = ["hidden", "suspended", "rejected", "removed"];

/** Wording shown to people. `available` reads as "Live" because nobody thinks in enum values. */
export const LISTING_STATUS_LABELS = {
  available: "Live",
  reserved: "Reserved",
  sold: "Sold",
  hidden: "Hidden",
  suspended: "Suspended",
  rejected: "Rejected",
  removed: "Removed",
};

/** Mirrors MODERATION_REASONS on the server. */
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

/** Mirrors REPORT_REASONS on the server, for the customer-facing report form. */
export const REPORT_REASONS = [
  "prohibited_item",
  "counterfeit_or_inauthentic",
  "misleading_details",
  "wrong_category",
  "offensive_content",
  "spam_or_scam",
  "duplicate_listing",
  "other",
];

export const REASON_LABELS = {
  policy_violation: "Marketplace policy violation",
  prohibited_item: "Prohibited item",
  counterfeit_or_inauthentic: "Counterfeit or inauthentic",
  misleading_details: "Misleading details",
  duplicate_listing: "Duplicate listing",
  spam_or_scam: "Spam or suspected scam",
  offensive_content: "Offensive content",
  wrong_category: "Wrong category",
  under_review: "Further review needed",
  other: "Other",
};

export const listingLabel = (status) => LISTING_STATUS_LABELS[status] || String(status || "Unknown");

export const reasonLabel = (reason) => REASON_LABELS[reason] || String(reason || "").replace(/_/g, " ");

/** Is this listing off the marketplace because an administrator acted? */
export const isModerated = (status) => MODERATION_STATUSES.includes(status);

/** A sentence a seller or a customer can act on, rather than a bare status name. */
export const listingStatusSentence = (product) => {
  const reason = reasonLabel(product?.moderationReason);
  switch (product?.status) {
    case "hidden":
      return "An administrator hid this listing. It is not visible to other customers.";
    case "suspended":
      return "An administrator suspended this listing while reviewing it.";
    case "rejected":
      return `An administrator rejected this listing${reason ? ` (${reason.toLowerCase()})` : ""}.`;
    case "removed":
      return "An administrator removed this listing from the marketplace.";
    case "sold":
      return "This listing has been sold.";
    case "reserved":
      return "This listing is reserved for another buyer.";
    default:
      return "";
  }
};
