import { useCompareStore } from "../context/CompareContext.jsx";

/**
 * Central compare-tray state.
 *
 * Thin re-export of the shared store in context/CompareContext.jsx. It used to
 * own a private `useState` copy of the id set, which meant every page that
 * called it kept its own version of the truth and every page re-fetched
 * `GET /compare` on mount. The call signature below is unchanged, so Home,
 * Explore, Categories, SellerProfile and Wishlist need no edits.
 *
 * The server records the PRODUCT_COMPARE behaviour event on toggle, so this
 * layer never sends a behaviour event of its own -- doing so would double count
 * every add.
 */
export default function useCompare() {
  const { ids, count, isComparing, toggle, busy, pendingId, max, refreshCompare } = useCompareStore();

  return {
    compareIds: ids,
    count,
    max,
    isComparing,
    toggleCompare: toggle,
    refreshCompare,
    busy,
    pendingId,
  };
}
