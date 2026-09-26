import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import api from "../services/api.js";
import { useAuth } from "./AuthContext.jsx";

/**
 * The compare tray, as one shared store.
 *
 * Why this is a context and not the old per-page `useState` hook: every page that
 * called `useCompare()` used to get its own private copy of the id set and its
 * own `GET /compare` on mount. That meant (a) two pages could disagree about
 * whether a product was already selected, so the button on a card and the button
 * on the product page contradicted each other, and (b) opening Explore fired the
 * same request several times over.
 *
 * One provider, fetched once per signed-in customer, fixes both. Existing
 * consumers still call `useCompare()` (see hooks/useCompare.js) and none of their
 * call sites changed.
 *
 * The tray is server state: the `Comparison` document in MongoDB is the source of
 * truth, so this store is a cache of it and never a second copy of it. Nothing
 * is written to localStorage -- a comparison is a decision the customer is
 * making right now, and a stale shortlist on a shared device is worse than none.
 *
 * The API records the `PRODUCT_COMPARE` behaviour event itself, on add, at the
 * moment the tray actually changes. This store must therefore never send that
 * event as well, or every add would be counted twice in the segmentation
 * features the ML pipeline learns from.
 */
const CompareContext = createContext(null);

/** Mirror of COMPARE_MAX in server/controllers/compareController.js. */
export const COMPARE_MAX = 5;

const toIdSet = (list) => new Set((list || []).map(String));

export function CompareProvider({ children }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  // Only customers have a tray: every storefront route is already gated on
  // `role === "customer"`, so this keeps an admin session from firing a request
  // whose result could never be shown.
  const userId = user?._id && user.role === "customer" ? String(user._id) : null;

  const [ids, setIds] = useState(() => new Set());
  const [products, setProducts] = useState([]);
  const [unavailable, setUnavailable] = useState([]);
  const [max, setMax] = useState(COMPARE_MAX);
  /** When the active MongoDB session began, so duration is measured from the
      real session start rather than from whenever this tab happened to mount. */
  const [startedAt, setStartedAt] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | loading | ready | error
  const [error, setError] = useState(null);
  /** Product currently mid-flight, so one card can spin without freezing the rest. */
  const [pendingId, setPendingId] = useState(null);

  // React 18 StrictMode double-invokes mount effects. Without this the first
  // paint would fire two identical GET /compare requests.
  const loadedFor = useRef(null);
  // Loads are serialised through a promise chain so two refreshes can never
  // resolve out of order and leave the cache holding the older response.
  const chain = useRef(Promise.resolve());
  // Lets the "Undo" toast call the newest toggle rather than the closure that
  // happened to be current when the toast was created.
  const toggleRef = useRef(null);

  const applyPayload = useCallback((data) => {
    const list = Array.isArray(data?.compareIds)
      ? data.compareIds
      : (data?.products || []).map((p) => p._id);
    setIds(toIdSet(list));
    setProducts(Array.isArray(data?.products) ? data.products : []);
    setUnavailable(Array.isArray(data?.unavailable) ? data.unavailable : []);
    if (Number(data?.max) > 0) setMax(Number(data.max));
    setStartedAt(data?.startedAt || null);
    setError(null);
    setStatus("ready");
  }, []);

  const runLoad = useCallback(async () => {
    if (!userId) return null;
    try {
      const { data } = await api.get("/compare");
      applyPayload(data);
      return data;
    } catch (err) {
      setError(err?.response?.data?.message || "We couldn't load your comparison.");
      setStatus("error");
      return null;
    }
  }, [userId, applyPayload]);

  const load = useCallback(
    ({ showSpinner = false } = {}) => {
      if (!userId) return Promise.resolve(null);
      if (showSpinner) setStatus((s) => (s === "error" ? s : "loading"));
      chain.current = chain.current.then(runLoad, runLoad);
      return chain.current;
    },
    [userId, runLoad]
  );

  // Load once per signed-in customer. Signing out clears the cache so the next
  // person on this device never sees someone else's shortlist, and signing back
  // in re-reads that customer's own tray from MongoDB.
  useEffect(() => {
    if (!userId) {
      loadedFor.current = null;
      chain.current = Promise.resolve();
      setIds(new Set());
      setProducts([]);
      setUnavailable([]);
      setStartedAt(null);
      setError(null);
      setStatus("idle");
      setPendingId(null);
      return;
    }
    if (loadedFor.current === userId) return;
    loadedFor.current = userId;
    setStatus("loading");
    load();
  }, [userId, load]);

  const isComparing = useCallback((id) => ids.has(String(id)), [ids]);

  /**
   * Add or remove one product.
   *
   * Optimistic, so the button reacts on the same frame as the click, and rolled
   * back on failure. The cap is enforced here as well as on the server: a request
   * that is certain to be rejected is not worth making, and the customer gets a
   * useful message instead of a generic failure.
   */
  const toggle = useCallback(
    async (productId) => {
      const key = String(productId);
      if (!key) return { ok: false, added: false };
      const wasPresent = ids.has(key);

      if (!wasPresent && ids.size >= max) {
        toast.error(`You can compare up to ${max} products. Remove one to add another.`, {
          icon: "⚠️",
          duration: 4000,
        });
        return { ok: false, added: false, reason: "limit" };
      }
      if (pendingId) return { ok: false, added: wasPresent, reason: "busy" };

      setPendingId(key);
      setIds((prev) => {
        const next = new Set(prev);
        if (wasPresent) next.delete(key);
        else next.add(key);
        return next;
      });
      if (wasPresent) setProducts((prev) => prev.filter((p) => String(p._id) !== key));

      try {
        const { data } = await api.post("/compare", { productId: key });
        if (Array.isArray(data?.compareIds)) {
          setIds(toIdSet(data.compareIds));
          if (Number(data.max) > 0) setMax(Number(data.max));
        }

        if (wasPresent) {
          toast.success("Removed from Compare", {
            icon: "✓",
            action: { label: "Undo", onClick: () => toggleRef.current?.(key) },
          });
          return { ok: true, added: false };
        }

        toast.success("Added to Compare", {
          icon: "✓",
          action: { label: "View", onClick: () => navigate("/compare") },
        });
        // A newly added listing is not in the cached documents yet, so pull the
        // tray once to get real data rather than guessing at its fields.
        load();
        return { ok: true, added: true };
      } catch (err) {
        setIds((prev) => {
          const next = new Set(prev);
          if (wasPresent) next.add(key);
          else next.delete(key);
          return next;
        });
        load();
        toast.error(err?.response?.data?.message || "Could not update Compare", {
          icon: "⚠️",
          duration: 4000,
        });
        return { ok: false, added: wasPresent, reason: err?.response?.status };
      } finally {
        setPendingId(null);
      }
    },
    [ids, max, pendingId, load, navigate]
  );

  toggleRef.current = toggle;

  /** Removes locally first, so the column disappears on the click rather than after the round trip. */
  const remove = useCallback(
    async (productId, { quiet = false } = {}) => {
      const key = String(productId);
      if (!ids.has(key) || pendingId === key) return { ok: true, changed: false };
      setIds((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      setProducts((prev) => prev.filter((p) => String(p._id) !== key));
      try {
        // The endpoint is a toggle; the product is known to be present because
        // it came out of `ids`, so this always removes.
        await api.post("/compare", { productId: key });
        if (!quiet) toast.success("Removed from Compare", { icon: "✓" });
        return { ok: true, changed: true };
      } catch (err) {
        load();
        if (!quiet) {
          toast.error(err?.response?.data?.message || "Could not remove from Compare", { icon: "⚠️" });
        }
        return { ok: false, changed: false };
      }
    },
    [ids, pendingId, load]
  );

  /** Ends the tray. The server keeps the finished session for the decision signal. */
  const clearAll = useCallback(async () => {
    const snapshot = products;
    setIds(new Set());
    setProducts([]);
    setUnavailable([]);
    try {
      await api.delete("/compare");
      toast.success("Comparison cleared", { icon: "✓" });
      return true;
    } catch (err) {
      setProducts(snapshot);
      load();
      toast.error(err?.response?.data?.message || "Could not clear Compare", { icon: "⚠️" });
      return false;
    }
  }, [products, load]);

  const value = useMemo(
    () => ({
      ids,
      compareIds: ids,
      count: ids.size,
      max,
      startedAt,
      products,
      unavailable,
      status,
      error,
      loading: status === "loading",
      pendingId,
      busy: Boolean(pendingId),
      isComparing,
      toggle,
      remove,
      clearAll,
      refreshCompare: () => load({ showSpinner: true }),
    }),
    [ids, max, startedAt, products, unavailable, status, error, pendingId, isComparing, toggle, remove, clearAll, load]
  );

  return <CompareContext.Provider value={value}>{children}</CompareContext.Provider>;
}

export function useCompareStore() {
  const ctx = useContext(CompareContext);
  if (!ctx) throw new Error("useCompareStore must be used within a CompareProvider");
  return ctx;
}

export default CompareContext;
