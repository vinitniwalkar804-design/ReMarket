/**
 * Ownership of the browsing-session id.
 *
 * Ported unchanged from the React build's `utils/session.js`, including the
 * reasoning, because `sessionFrequency` is a modelled feature: if this id
 * stopped changing between visits, every active customer would look like they
 * had exactly one session, ever.
 *
 * Two unrelated places need the same value - `utils/behavior.js` stamps it onto
 * navigation events, and `services/api.js` sends it as `X-Session-Id` so the
 * events the API records itself land in the same session. They have to agree, so
 * only one of them may decide what the id is.
 *
 * The id is minted on first use rather than at module load, so nothing writes
 * to sessionStorage merely because the module was imported.
 */

/** Must match SESSION_IDLE_MINUTES in backend/services/clusterFeatures.js. */
export const SESSION_IDLE_MS = 30 * 60 * 1000;

const STORAGE_KEY = "rmk_session";

/** Matches the server's SESSION_ID_PATTERN: 6-100 chars of [A-Za-z0-9_-]. */
const mintId = () => `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

let session = null;

/** Mint or revive the session, rotating after an idle gap. */
const resolve = () => {
  const now = Date.now();
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.id && now - Number(parsed.lastSeen || 0) < SESSION_IDLE_MS) {
        session = { id: parsed.id, lastSeen: now };
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
        return session;
      }
    }
  } catch {
    /* storage unavailable - fall through to an in-memory session */
  }
  session = { id: mintId(), lastSeen: now };
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    /* in-memory only */
  }
  return session;
};

/**
 * The current session id, minting or rotating as needed.
 * Safe to call from anywhere, including before sign-in.
 */
export const getSessionId = () => {
  const now = Date.now();
  if (!session) return resolve().id;
  if (now - session.lastSeen > SESSION_IDLE_MS) return resolve().id;
  session.lastSeen = now;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    /* in-memory only */
  }
  return session.id;
};

/**
 * Drop the current session. Called on sign-out so the next visit is counted as a
 * new session rather than continuing the previous customer's.
 */
export const resetSession = () => {
  session = null;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to clean up */
  }
};
