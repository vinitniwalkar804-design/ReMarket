/**
 * Client behaviour tracking.
 *
 * Ported unchanged from the React build's `utils/behavior.js`, including the
 * reasoning. Everything the segmentation model learns about a customer arrives
 * through here, so three properties matter more than convenience:
 *
 * 1. **Real sessions.** `sessionFrequency` is a modelled feature, so every event
 *    must carry a session id that actually changes between visits. The id is
 *    minted in `utils/session.js` and rotates after an idle gap - the same
 *    30-minute boundary the server-side feature builder uses when it has to
 *    infer sessions itself.
 * 2. **No double counting.** A short dedupe window collapses repeats of the
 *    same logical action while still allowing a genuine second action
 *    (wishlist -> unwishlist -> wishlist) to be recorded.
 * 3. **Batched delivery.** Page transitions fire events in bursts, so events
 *    are queued and flushed together through `/behavior/events/batch`.
 *
 * Server-recorded events are deliberately NOT exposed here. The API records
 * wishlist, cart, purchase, offer, compare, chat, review, price-watch,
 * seller-view, login/logout/register, product-view and sell-listing itself, at
 * the exact moment the underlying data changes. Firing any of those from the
 * browser as well would double-count every action and inflate the engagement
 * features the model learns from.
 */
import api from "../services/api.js";
import { getSessionId } from "./session.js";

const FLUSH_DELAY_MS = 1200;
const MAX_QUEUE = 40;
const DEDUPE_WINDOW_MS = 1500;

const queue = [];
const recentlySent = new Map();
let flushTimer = null;

// The session id we have already announced with a SESSION_START. Tracked by id
// rather than as a plain boolean because the id is not stable for the lifetime
// of the tab: it rotates after a 30-minute idle gap and is cleared on logout,
// and both of those genuinely begin a new session that still has to announce
// itself. A boolean here would silently swallow the second SESSION_START of any
// returning customer and leave their session looking unopened.
let announcedSessionId = null;

const pruneDedupeCache = () => {
  const cutoff = Date.now() - DEDUPE_WINDOW_MS;
  for (const [key, at] of recentlySent) if (at < cutoff) recentlySent.delete(key);
};

/** True the first time this exact logical action is seen inside the dedupe window. */
function shouldRecord(key) {
  if (!key) return true;
  const now = Date.now();
  pruneDedupeCache();
  if (recentlySent.has(key)) return false;
  recentlySent.set(key, now);
  return true;
}

async function flush() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (!queue.length) return;
  const batch = queue.splice(0, MAX_QUEUE);
  try {
    await api.post("/behavior/events/batch", { events: batch });
  } catch {
    // Tracking must never break a user action. A failed batch is dropped rather
    // than retried forever; the marketplace still functions without the signal.
  }
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flush();
  }, FLUSH_DELAY_MS);
}

const track = (
  eventType,
  { metadata = {}, productId = null, category = "", dedupeKey = "", sessionId: forcedSessionId = null } = {}
) => {
  if (!localStorage.getItem("token")) return; // never record events for signed-out visitors
  if (!shouldRecord(dedupeKey)) return;
  queue.push({
    eventType,
    productId: productId || null,
    category: category || "",
    // Resolved here for ordinary events, but SESSION_END has to pin the id of the
    // session it is closing, so it passes one in. `getSessionId()` rotates after
    // an idle gap, and letting it run for a closing event would both stamp the
    // event with a session that never started and push the idle window forward.
    sessionId: forcedSessionId || getSessionId(),
    metadata,
  });
  if (queue.length >= MAX_QUEUE) flush();
  else scheduleFlush();
};

/** Announce the session once per minted session id. */
const trackSessionStart = () => {
  // Checked before the flag is set: `track` discards events for signed-out
  // visitors, so claiming the session while signed out would permanently
  // suppress the first SESSION_START after login.
  if (!localStorage.getItem("token")) return;
  const sessionId = getSessionId();
  if (announcedSessionId === sessionId) return;
  // Set before calling track so a repeated call cannot queue the same start twice.
  announcedSessionId = sessionId;
  track("SESSION_START", { dedupeKey: `sessionstart:${sessionId}` });
};

/**
 * Close the session we actually opened.
 *
 * Pinned to `announcedSessionId` rather than a fresh `getSessionId()` call
 * because that call can *rotate* the id: closing a tab after a long idle gap
 * would otherwise emit a SESSION_END for a brand new session that never sent a
 * SESSION_START, and an unopened-but-closed session distorts session counts.
 */
const trackSessionEnd = () => {
  const sessionId = announcedSessionId || getSessionId();
  track("SESSION_END", { sessionId, dedupeKey: `sessionend:${sessionId}` });
};

export const behavior = {
  /**
   * The only events the client is allowed to report.
   *
   * Everything here is a *navigation or intent* signal with no server-side
   * mutation to hang off. Actions that change data (wishlist, cart, order,
   * offer, review, chat, compare, price watch) are recorded by the API itself
   * and must not be sent from here.
   */
  search: (query, category) =>
    track("SEARCH", { metadata: { query }, category: category || "", dedupeKey: `search:${query}` }),

  categoryView: (categoryName) =>
    track("CATEGORY_VIEW", {
      metadata: { category: categoryName },
      category: categoryName || "",
      dedupeKey: `catview:${categoryName}`,
    }),

  cartView: () => {
    trackSessionStart();
    track("CART_VIEW", { dedupeKey: "cartview" });
  },

  checkoutStart: (action, total) => {
    trackSessionStart();
    track("CHECKOUT_START", { metadata: { action, total }, dedupeKey: `checkout:${action}` });
  },

  /** Fired when the reviews block on a product detail page scrolls into view. */
  reviewView: (productId) => track("REVIEW_VIEW", { productId, dedupeKey: `reviewview:${productId}` }),

  /** Called by the app shell once, after the signed-in customer is known. */
  sessionStart: trackSessionStart,

  sessionEnd: trackSessionEnd,

  /** Test seam: lets verification assert exactly what was recorded. */
  _flush: flush,
  _sessionId: getSessionId,
};

if (typeof window !== "undefined") {
  // A tab being closed or backgrounded would otherwise drop the tail of the
  // queue, which is precisely the purchase/checkout events that matter most.
  window.addEventListener("pagehide", () => {
    if (queue.length) {
      trackSessionEnd();
      flush();
    }
  });
}

export default behavior;
