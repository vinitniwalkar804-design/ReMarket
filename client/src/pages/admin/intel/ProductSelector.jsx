/**
 * Listing selector for the product-intelligence workspace.
 *
 * Three things drove the design.
 *
 * 1. **The selection is a URL.** `?product=<id>` is the whole contract, so a
 *    particular listing's analysis can be linked, bookmarked and opened in a new
 *    tab. Search text is deliberately *not* in the URL - it is a transient
 *    way of finding a listing, not part of the destination, and putting it there
 *    would make every copied link carry someone else's half-finished search.
 *
 * 2. **Search is server-side and paginated.** The listings endpoint is reused
 *    rather than adding a catalogue route here: it already supports
 *    `search`/`page`/`limit` and already enforces admin auth, so a second
 *    listing search would be a second place for a permission bug. A browser-side
 *    filter would have to download every listing to work, which is the thing that
 *    stops being acceptable as a catalogue grows.
 *
 * 3. **Requests are sequenced, not just debounced.** A slow response for "pho"
 *    must not overwrite a fast response for "phone", so every keystroke takes a
 *    ticket and only the newest ticket is allowed to write state.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Check, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import api from "../../../services/api.js";
import { formatINR } from "../../../utils/format.js";
import { listingTone } from "../../../utils/theme.js";
import { NoSearchResults, Spinner } from "./ui.jsx";

const PAGE_SIZE = 12;
const DEBOUNCE_MS = 260;

const CatalogueRow = ({ product, selected, onSelect }) => {
  const status = product.status || "available";
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(product._id)}
        aria-current={selected ? "true" : undefined}
        className={`w-full text-left px-3.5 py-3 flex items-center gap-3 transition-colors ${
          selected ? "bg-primary-soft" : "hover:bg-raised"
        }`}
      >
        <span className="relative w-11 h-11 rounded-lg overflow-hidden bg-sunken flex-none">
          {product.images?.[0] ? (
            <img src={product.images[0]} alt="" className="w-full h-full object-cover" loading="lazy" />
          ) : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink-900 truncate">{product.title}</span>
          <span className="block text-xs text-muted truncate">
            {product.categoryName} · {formatINR(product.price)} · {product.sellerName || "Unknown seller"}
          </span>
        </span>
        <span className={`badge ${listingTone(status)} flex-none`}>{status}</span>
        {selected && <Check size={15} className="text-primary flex-none" />}
      </button>
    </li>
  );
};

export default function ProductSelector({ selectedId, onSelect, disabled }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlProductId = searchParams.get("product");

  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ products: [], total: 0, page: 1, limit: PAGE_SIZE });
  const [listState, setListState] = useState({ loading: true, error: null });
  const ticket = useRef(0);

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebounced(query.trim());
      setPage(1);
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query]);

  const load = useCallback(async () => {
    const mine = ++ticket.current;
    setListState((s) => ({ ...s, loading: true, error: null }));
    try {
      const { data } = await api.get("/admin/products", {
        params: { page, limit: PAGE_SIZE, ...(debounced ? { search: debounced } : {}) },
      });
      if (mine !== ticket.current) return; // a newer request already answered
      setResult({ products: data.products || [], total: data.total || 0, page: data.page || 1, limit: data.limit || PAGE_SIZE });
      setListState({ loading: false, error: null });
    } catch (err) {
      if (mine !== ticket.current) return;
      setListState({ loading: false, error: err.response?.data?.message || "Could not load listings" });
    }
  }, [debounced, page]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil((result.total || 0) / (result.limit || PAGE_SIZE)));

  /**
   * The URL is the source of truth for the selection, so the page can be shared.
   * `replace: true` because a listing swap is a navigation within one workspace,
   * not a step the reader would want to undo with the back button.
   */
  const select = useCallback(
    (productId) => {
      const next = new URLSearchParams(searchParams);
      next.set("product", productId);
      setSearchParams(next, { replace: true });
      onSelect?.(productId);
    },
    [searchParams, setSearchParams, onSelect]
  );

  const clearSelection = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete("product");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const activeLabel = useMemo(() => {
    if (!result.products.length) return "Listings";
    return result.total > result.products.length
      ? `Listings · ${result.total} match`
      : "Listings";
  }, [result.products.length, result.total]);

  return (
    <section className="panel sticky top-4">
      <div className="panel-head">
        <div className="min-w-0">
          <h2 className="panel-title">Choose a listing</h2>
          <p className="panel-sub">{activeLabel}</p>
        </div>
        {urlProductId && (
          <button type="button" onClick={clearSelection} className="btn btn-quiet btn-xs flex-none">
            <X size={12} /> Clear
          </button>
        )}
      </div>

      <div className="p-3 border-b border-line">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-soft pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search listings by title…"
            aria-label="Search listings"
            className="input-field input-field-sm pl-9"
            disabled={disabled}
          />
        </div>
      </div>

      {listState.error ? (
        <div className="p-4">
          <p className="text-xs text-danger font-semibold">{listState.error}</p>
          <button type="button" onClick={load} className="btn btn-secondary btn-sm mt-3">
            Retry
          </button>
        </div>
      ) : listState.loading && !result.products.length ? (
        <div className="p-4 space-y-2">
          {Array(5).fill(0).map((_, i) => (
            <div key={i} className="skeleton-block h-11" />
          ))}
        </div>
      ) : result.products.length === 0 ? (
        <NoSearchResults query={debounced} onClear={() => setQuery("")} />
      ) : (
        <ul className="max-h-[460px] overflow-y-auto divide-y divide-line">
          {result.products.map((product) => (
            <CatalogueRow
              key={product._id}
              product={product}
              selected={product._id === selectedId}
              onSelect={select}
            />
          ))}
        </ul>
      )}

      {result.total > (result.limit || PAGE_SIZE) && (
        <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-t border-line">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="btn btn-secondary btn-xs"
          >
            <ChevronLeft size={12} /> Prev
          </button>
          <span className="text-2xs text-muted font-semibold tabular">
            Page {result.page} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="btn btn-secondary btn-xs"
          >
            Next <ChevronRight size={12} />
          </button>
        </div>
      )}

      {listState.loading && result.products.length > 0 && (
        <div className="px-3 py-2 border-t border-line">
          <Spinner label="Refreshing" />
        </div>
      )}
    </section>
  );
}
