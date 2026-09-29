/**
 * The compare tray, as one shared store.
 *
 * Ported from the React build's `context/CompareContext.jsx`. Why it is a
 * single shared store rather than per-page state: every page that read the tray
 * used to get its own private copy of the id set and its own `GET /compare` on
 * mount. Two pages could then disagree about whether a product was already
 * selected - the button on a card and the button on the product page would
 * contradict each other - and opening Explore fired the same request several
 * times over. One store, fetched once per signed-in customer, fixes both.
 *
 * The tray is server state: the `Comparison` document in MongoDB is the source of
 * truth, so this is a cache of it and never a second copy. Nothing is written to
 * localStorage - a comparison is a decision the customer is making right now,
 * and a stale shortlist on a shared device is worse than none.
 *
 * The API records the `PRODUCT_COMPARE` behaviour event itself, on add, at the
 * moment the tray actually changes. This store must therefore never send that
 * event as well, or every add would be counted twice in the segmentation
 * features the ML pipeline learns from.
 */
import api from "../services/api.js";
import auth from "./auth.js";
import toast from "../toast.js";
import { navigate } from "../navigation.js";

/** Mirror of COMPARE_MAX in backend/controllers/compareController.js. */
export const COMPARE_MAX = 5;

const toIdSet = (list) => new Set((list || []).map(String));

const state = {
  ids: new Set(),
  products: [],
  unavailable: [],
  max: COMPARE_MAX,
  /** When the active MongoDB session began, so duration is measured from the
   *  real session start rather than from whenever this tab happened to load. */
  startedAt: null,
  status: "idle", // idle | loading | ready | error
  error: null,
  /** Product currently mid-flight, so one card can spin without freezing the rest. */
  pendingId: null,
};

const listeners = new Set();
const emit = () => {
  for (const fn of listeners) fn(state);
};

/** Guards against a double load on first paint, mirroring the React ref. */
let loadedFor = null;
/** Loads are serialised so two refreshes can never resolve out of order and
 *  leave the cache holding the older response. */
let chain = Promise.resolve();

function currentUserId() {
  const user = auth.user;
  return user?._id && user.role === "customer" ? String(user._id) : null;
}

function applyPayload(data) {
  const list = Array.isArray(data?.compareIds)
    ? data.compareIds
    : (data?.products || []).map((p) => p._id);
  state.ids = toIdSet(list);
  state.products = Array.isArray(data?.products) ? data.products : [];
  state.unavailable = Array.isArray(data?.unavailable) ? data.unavailable : [];
  if (Number(data?.max) > 0) state.max = Number(data.max);
  state.startedAt = data?.startedAt || null;
  state.error = null;
  state.status = "ready";
  emit();
}

async function runLoad() {
  if (!currentUserId()) return null;
  try {
    const { data } = await api.get("/compare");
    applyPayload(data);
    return data;
  } catch (err) {
    state.error = err?.response?.data?.message || "We couldn't load your comparison.";
    state.status = "error";
    emit();
    return null;
  }
}

function load({ showSpinner = false } = {}) {
  if (!currentUserId()) return Promise.resolve(null);
  if (showSpinner && state.status !== "error") {
    state.status = "loading";
    emit();
  }
  chain = chain.then(runLoad, runLoad);
  return chain;
}

/** Reset on sign-out so the next person never sees someone else's shortlist. */
function syncForUser() {
  const userId = currentUserId();
  if (!userId) {
    loadedFor = null;
    chain = Promise.resolve();
    state.ids = new Set();
    state.products = [];
    state.unavailable = [];
    state.startedAt = null;
    state.error = null;
    state.status = "idle";
    state.pendingId = null;
    emit();
    return;
  }
  if (loadedFor === userId) return;
  loadedFor = userId;
  state.status = "loading";
  emit();
  load();
}

/**
 * Add or remove one product.
 *
 * Optimistic, so the button reacts on the same frame as the click, and rolled
 * back on failure. The cap is enforced here as well as on the server: a request
 * that is certain to be rejected is not worth making, and the customer gets a
 * useful message instead of a generic failure.
 */
async function toggle(productId) {
  const key = String(productId);
  if (!key) return { ok: false, added: false };
  const wasPresent = state.ids.has(key);

  if (!wasPresent && state.ids.size >= state.max) {
    toast.error(`You can compare up to ${state.max} products. Remove one to add another.`, {
      icon: "⚠️",
      duration: 4000,
    });
    return { ok: false, added: false, reason: "limit" };
  }
  if (state.pendingId) return { ok: false, added: wasPresent, reason: "busy" };

  state.pendingId = key;
  const next = new Set(state.ids);
  if (wasPresent) next.delete(key);
  else next.add(key);
  state.ids = next;
  if (wasPresent) state.products = state.products.filter((p) => String(p._id) !== key);
  emit();

  try {
    const { data } = await api.post("/compare", { productId: key });
    if (Array.isArray(data?.compareIds)) {
      state.ids = toIdSet(data.compareIds);
      if (Number(data.max) > 0) state.max = Number(data.max);
    }

    if (wasPresent) {
      toast.success("Removed from Compare", {
        icon: "✓",
        action: { label: "Undo", onClick: () => toggle(key) },
      });
      emit();
      return { ok: true, added: false };
    }

    toast.success("Added to Compare", {
      icon: "✓",
      action: { label: "View", onClick: () => navigate("/compare") },
    });
    // A newly added listing is not in the cached documents yet, so pull the tray
    // once to get real data rather than guessing at its fields.
    emit();
    await load();
    return { ok: true, added: true };
  } catch (err) {
    const rollback = new Set(state.ids);
    if (wasPresent) rollback.add(key);
    else rollback.delete(key);
    state.ids = rollback;
    emit();
    await load();
    toast.error(err?.response?.data?.message || "Could not update Compare", {
      icon: "⚠️",
      duration: 4000,
    });
    return { ok: false, added: wasPresent, reason: err?.response?.status };
  } finally {
    state.pendingId = null;
    emit();
  }
}

/** Removes locally first, so the column disappears on the click rather than after the round trip. */
async function remove(productId, { quiet = false } = {}) {
  const key = String(productId);
  if (!state.ids.has(key) || state.pendingId === key) return { ok: true, changed: false };

  const next = new Set(state.ids);
  next.delete(key);
  state.ids = next;
  state.products = state.products.filter((p) => String(p._id) !== key);
  emit();

  try {
    // The endpoint is a toggle; the product is known to be present because it
    // came out of `ids`, so this always removes.
    await api.post("/compare", { productId: key });
    if (!quiet) toast.success("Removed from Compare", { icon: "✓" });
    return { ok: true, changed: true };
  } catch (err) {
    await load();
    if (!quiet) {
      toast.error(err?.response?.data?.message || "Could not remove from Compare", { icon: "⚠️" });
    }
    return { ok: false, changed: false };
  }
}

/** Ends the tray. The server keeps the finished session for the decision signal. */
async function clearAll() {
  const snapshot = state.products;
  state.ids = new Set();
  state.products = [];
  state.unavailable = [];
  emit();
  try {
    await api.delete("/compare");
    toast.success("Comparison cleared", { icon: "✓" });
    return true;
  } catch (err) {
    state.products = snapshot;
    emit();
    await load();
    toast.error(err?.response?.data?.message || "Could not clear Compare", { icon: "⚠️" });
    return false;
  }
}

const isComparing = (id) => state.ids.has(String(id));

auth.subscribe(syncForUser);

export const compareStore = {
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  getState() {
    return {
      ...state,
      ids: state.ids,
      compareIds: state.ids,
      count: state.ids.size,
      loading: state.status === "loading",
      busy: Boolean(state.pendingId),
      isComparing,
      toggle,
      remove,
      clearAll,
      refreshCompare: () => load({ showSpinner: true }),
    };
  },
  toggle,
  remove,
  clearAll,
  isComparing,
  refreshCompare: () => load({ showSpinner: true }),
};

export default compareStore;
