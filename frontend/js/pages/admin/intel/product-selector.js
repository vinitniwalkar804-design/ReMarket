/**
 * Listing selector for the product-intelligence workspace.
 *
 * Vanilla port of `pages/admin/intel/ProductSelector.jsx`. The selection is a
 * URL (`?product=<id>`), so a particular listing's analysis can be linked and
 * bookmarked. Search text is deliberately transient, never part of the URL.
 * Search is server-side and paginated by reusing the admin listings endpoint,
 * and requests are sequenced with a ticket so a slow "pho" response cannot
 * overwrite a fast "phone" response.
 */
import { h, mount } from "../../../dom.js";
import { getLocation, navigate } from "../../../navigation.js";
import { icon } from "../../../icons.js";
import api from "../../../services/api.js";
import { formatINR } from "../../../utils/format.js";
import { listingTone } from "../../../utils/theme.js";
import { NoSearchResults, Spinner } from "./ui.js";

const PAGE_SIZE = 12;
const DEBOUNCE_MS = 260;

const CatalogueRow = ({ product, selected, onSelect }) => {
  const status = product.status || "available";
  return h(
    "li",
    null,
    h(
      "button",
      {
        type: "button",
        onClick: () => onSelect(product._id),
        "aria-current": selected ? "true" : undefined,
        className: `w-full text-left px-3.5 py-3 flex items-center gap-3 transition-colors ${
          selected ? "bg-primary-soft" : "hover:bg-raised"
        }`,
      },
      h(
        "span",
        { className: "relative w-11 h-11 rounded-lg overflow-hidden bg-sunken flex-none" },
        product.images?.[0]
          ? h("img", {
              src: product.images[0],
              alt: "",
              className: "w-full h-full object-cover",
              loading: "lazy",
            })
          : null
      ),
      h(
        "span",
        { className: "min-w-0 flex-1" },
        h("span", { className: "block text-sm font-semibold text-ink-900 truncate" }, product.title),
        h(
          "span",
          { className: "block text-xs text-muted truncate" },
          `${product.categoryName} · ${formatINR(product.price)} · ${
            product.sellerName || "Unknown seller"
          }`
        )
      ),
      h("span", { className: `badge ${listingTone(status)} flex-none` }, status),
      selected && icon("Check", { size: 15, className: "text-primary flex-none" })
    )
  );
};

export default function ProductSelector({ selectedId, onSelect, disabled } = {}) {
  const root = h("section", { className: "panel sticky top-4" });
  let alive = true;
  const cleanups = [];
  const ensureAlive = () => alive;
  const observer = new MutationObserver(() => {
    if (!root.isConnected) {
      alive = false;
      observer.disconnect();
      while (cleanups.length) cleanups.pop()();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  const st = {
    query: "",
    debounced: "",
    page: 1,
    result: { products: [], total: 0, page: 1, limit: PAGE_SIZE },
    loading: true,
    error: null,
  };

  let ticket = 0;
  let debounceTimer = null;
  cleanups.push(() => clearTimeout(debounceTimer));

  const searchParams = () => new URLSearchParams(getLocation()?.search || "");

  const headHost = h("div", { className: "panel-head" });
  const searchHost = h(
    "div",
    { className: "p-3 border-b border-line" },
    h(
      "div",
      { className: "relative" },
      icon("Search", {
        size: 15,
        className: "absolute left-3 top-1/2 -translate-y-1/2 text-muted-soft pointer-events-none",
      }),
      h("input", {
        type: "search",
        value: st.query,
        placeholder: "Search listings by title…",
        "aria-label": "Search listings",
        className: "input-field input-field-sm pl-9",
        disabled,
      })
    )
  );
  const listHost = h("div");
  const footHost = h("div");

  const activeLabel = () => {
    if (!st.result.products.length) return "Listings";
    return st.result.total > st.result.products.length
      ? `Listings · ${st.result.total} match`
      : "Listings";
  };

  const select = (productId) => {
    const next = searchParams();
    next.set("product", productId);
    navigate(`${getLocation().path}?${next.toString()}`, { replace: true });
    onSelect?.(productId);
  };

  const clearSelection = () => {
    const next = searchParams();
    next.delete("product");
    navigate(`${getLocation().path}?${next.toString()}`, { replace: true });
  };

  const paintHead = () => {
    const urlProductId = searchParams().get("product");
    mount(
      headHost,
      h(
        "div",
        { className: "min-w-0" },
        h("h2", { className: "panel-title" }, "Choose a listing"),
        h("p", { className: "panel-sub" }, activeLabel())
      ),
      urlProductId
        ? h(
            "button",
            { type: "button", onClick: clearSelection, className: "btn btn-quiet btn-xs flex-none" },
            icon("X", { size: 12 }),
            " Clear"
          )
        : null
    );
  };

  const paintList = () => {
    if (st.error) {
      mount(
        listHost,
        h(
          "div",
          { className: "p-4" },
          h("p", { className: "text-xs text-danger font-semibold" }, st.error),
          h("button", { type: "button", onClick: load, className: "btn btn-secondary btn-sm mt-3" }, "Retry")
        )
      );
      return;
    }
    if (st.loading && !st.result.products.length) {
      mount(
        listHost,
        h(
          "div",
          { className: "p-4 space-y-2" },
          Array(5)
            .fill(0)
            .map((_, i) => h("div", { key: i, className: "skeleton-block h-11" }))
        )
      );
      return;
    }
    if (!st.result.products.length) {
      mount(listHost, NoSearchResults({ query: st.debounced, onClear: () => onQueryChange("") }));
      return;
    }
    mount(
      listHost,
      h(
        "ul",
        { className: "max-h-[460px] overflow-y-auto divide-y divide-line" },
        st.result.products.map((product) =>
          CatalogueRow({
            key: product._id,
            product,
            selected: product._id === selectedId,
            onSelect: select,
          })
        )
      )
    );
  };

  const paintFoot = () => {
    const totalPages = Math.max(1, Math.ceil((st.result.total || 0) / (st.result.limit || PAGE_SIZE)));
    mount(
      footHost,
      st.result.total > (st.result.limit || PAGE_SIZE)
        ? h(
            "div",
            { className: "flex items-center justify-between gap-2 px-3 py-2.5 border-t border-line" },
            h(
              "button",
              {
                type: "button",
                onClick: () => go(Math.max(1, st.page - 1)),
                disabled: st.page <= 1,
                className: "btn btn-secondary btn-xs",
              },
              icon("ChevronLeft", { size: 12 }),
              " Prev"
            ),
            h("span", { className: "text-2xs text-muted font-semibold tabular" }, `Page ${st.result.page} of ${totalPages}`),
            h(
              "button",
              {
                type: "button",
                onClick: () => go(Math.min(totalPages, st.page + 1)),
                disabled: st.page >= totalPages,
                className: "btn btn-secondary btn-xs",
              },
              "Next ",
              icon("ChevronRight", { size: 12 })
            )
          )
        : null,
      st.loading && st.result.products.length > 0
        ? h("div", { className: "px-3 py-2 border-t border-line" }, Spinner({ label: "Refreshing" }))
        : null
    );
  };

  function go(page) {
    st.page = page;
    load();
  }

  function onQueryChange(value) {
    st.query = value;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      st.debounced = st.query.trim();
      st.page = 1;
      load();
    }, DEBOUNCE_MS);
  }

  async function load() {
    const mine = ++ticket;
    st.loading = true;
    st.error = null;
    paintList();
    paintFoot();
    const sp = new URLSearchParams();
    sp.set("page", st.page);
    sp.set("limit", PAGE_SIZE);
    if (st.debounced) sp.set("search", st.debounced);
    try {
      const { data } = await api.get(`/admin/products?${sp.toString()}`);
      if (!ensureAlive() || mine !== ticket) return;
      st.result = {
        products: data.products || [],
        total: data.total || 0,
        page: data.page || 1,
        limit: data.limit || PAGE_SIZE,
      };
      st.loading = false;
      paintHead();
      paintList();
      paintFoot();
    } catch (err) {
      if (!ensureAlive() || mine !== ticket) return;
      st.loading = false;
      st.error = err.response?.data?.message || "Could not load listings";
      paintList();
    }
  }

  searchHost.querySelector("input").addEventListener("input", (e) => onQueryChange(e.target.value));

  root.appendChild(headHost);
  root.appendChild(searchHost);
  root.appendChild(listHost);
  root.appendChild(footHost);
  paintHead();
  load();
  return root;
}