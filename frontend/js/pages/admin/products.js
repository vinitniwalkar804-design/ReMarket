/**
 * Admin console — product catalogue.
 *
 * Vanilla port of `pages/admin/AdminProducts.jsx`.
 *
 * Paginated table of every listing across all sellers: API returns `{ products,
 * total }` for `page`/`limit`, mirrored one-for-one. No local filtering — this
 * table is strictly the read-out of the stored catalogue.
 */
import { h, mount } from "../../dom.js";
import { icon } from "../../icons.js";
import api from "../../services/api.js";
import { SkeletonRow } from "../../components/loading.js";
import { imageProps } from "../../utils/images.js";
import { formatINR } from "../../utils/format.js";
import { listingTone } from "../../utils/theme.js";

const PAGE_SIZE = 15;

export default function AdminProducts() {
  const st = { products: [], total: 0, page: 1, loading: true };
  let disposed = false;

  const root = h("div", { className: "animate-fade-in space-y-5" });
  const contentHost = h("div");
  root.appendChild(contentHost);

  function ensureAlive() {
    if (root.isConnected) return true;
    if (!disposed) {
      disposed = true;
    }
    return false;
  }

  const observer = new MutationObserver(() => {
    if (!ensureAlive()) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  const load = async () => {
    st.loading = true;
    paintHeader();
    paint();
    try {
      const { data } = await api.get(`/admin/products?page=${st.page}&limit=${PAGE_SIZE}`);
      if (!ensureAlive()) return;
      st.products = data.products || [];
      st.total = data.total || 0;
      st.loading = false;
      paintHeader();
      paint();
    } catch (err) {
      if (!ensureAlive()) return;
      st.loading = false;
      paintHeader();
      paint();
    }
  };

  const pages = () => Math.max(1, Math.ceil(st.total / PAGE_SIZE));

  const headerHost = h("div");
  function paintHeader() {
    const pagesCount = pages();
    mount(
      headerHost,
      h(
        "header",
        { className: "flex flex-wrap items-end justify-between gap-3" },
        h(
          "div",
          null,
          h("span", { className: "page-eyebrow" }, icon("Layers", { size: 12 }), " Catalogue"),
          h("h1", { className: "page-title" }, "Products"),
          h(
            "p",
            { className: "page-sub" },
            st.loading ? "Loading catalogue…" : `${st.total} listing${st.total === 1 ? "" : "s"} across every seller`
          )
        ),
        h(
          "div",
          { className: "flex items-center gap-1.5" },
          h(
            "button",
            { type: "button", onClick: () => { st.page = Math.max(1, st.page - 1); load(); }, disabled: st.page === 1 || st.loading, className: "btn-icon", "aria-label": "Previous page" },
            icon("ChevronLeft", { size: 15 })
          ),
          h("span", { className: "text-2xs font-bold text-muted tabular px-1" }, `${st.page} / ${pagesCount}`),
          h(
            "button",
            { type: "button", onClick: () => { st.page = Math.min(pagesCount, st.page + 1); load(); }, disabled: st.page === pagesCount || st.loading, className: "btn-icon", "aria-label": "Next page" },
            icon("ChevronRight", { size: 15 })
          )
        )
      )
    );
  }

  const paint = () => {
    if (st.loading) {
      mount(
        contentHost,
        h(
          "div",
          { className: "panel p-5 space-y-3" },
          [0, 1, 2, 3, 4, 5].map(() => SkeletonRow())
        )
      );
      return;
    }

    if (st.products.length === 0) {
      mount(
        contentHost,
        h(
          "div",
          { className: "panel p-12 text-center" },
          h("span", { className: "icon-tile-primary mx-auto mb-4" }, icon("Package", { size: 20 })),
          h("h3", { className: "font-extrabold text-ink-900" }, "No products found"),
          h("p", { className: "text-sm text-muted mt-1" }, "Nothing has been listed on the marketplace yet.")
        )
      );
      return;
    }

    const pagesCount = pages();
    mount(
      contentHost,
      h(
        "div",
        { className: "animate-fade-in" },
        h(
          "div",
          { className: "panel" },
          h(
            "div",
            { className: "table-wrap" },
            h(
              "table",
              { className: "data-table" },
              h(
                "thead",
                null,
                h(
                  "tr",
                  null,
                  h("th", null, "Product"),
                  h("th", null, "Category"),
                  h("th", null, "Seller"),
                  h("th", { className: "th-num" }, "Price"),
                  h("th", { className: "th-num" }, "Views"),
                  h("th", null, "Status")
                )
              ),
              h(
                "tbody",
                null,
                st.products.map((p) =>
                  h(
                    "tr",
                    { key: p._id },
                    h(
                      "td",
                      null,
                      h(
                        "div",
                        { className: "flex items-center gap-3" },
                        h(
                          "div",
                          { className: "w-10 h-10 bg-sunken rounded-lg overflow-hidden flex-none" },
                          h("img", { alt: p.title, ...imageProps(p), className: "w-full h-full object-cover" })
                        ),
                        h("span", { className: "text-sm font-semibold text-ink-900 line-clamp-1 max-w-[280px]" }, p.title)
                      )
                    ),
                    h("td", { className: "text-muted" }, p.categoryName || "\u2014"),
                    h("td", { className: "text-muted" }, p.seller?.name || "\u2014"),
                    h("td", { className: "num" }, formatINR(p.price)),
                    h("td", { className: "num" }, p.views ?? 0),
                    h(
                      "td",
                      null,
                      h("span", { className: `badge capitalize border ${listingTone(p.status)}` }, p.status)
                    )
                  )
                )
              )
            )
          ),
          pagesCount > 1 &&
            h(
              "div",
              { className: "flex items-center justify-between gap-3 px-5 py-3 border-t border-line bg-raised" },
              h(
                "span",
                { className: "text-2xs text-muted" },
                `Showing ${(st.page - 1) * PAGE_SIZE + 1}\u2013${Math.min(st.page * PAGE_SIZE, st.total)} of ${st.total}`
              ),
              h(
                "div",
                { className: "flex items-center gap-1.5" },
                h(
                  "button",
                  { type: "button", onClick: () => { st.page = Math.max(1, st.page - 1); load(); }, disabled: st.page === 1, className: "btn-secondary btn-sm" },
                  icon("ChevronLeft", { size: 13 }),
                  " Prev"
                ),
                h(
                  "button",
                  { type: "button", onClick: () => { st.page = Math.min(pagesCount, st.page + 1); load(); }, disabled: st.page === pagesCount, className: "btn-secondary btn-sm" },
                  "Next ",
                  icon("ChevronRight", { size: 13 })
                )
              )
            )
        )
      )
    );
  };

  root.appendChild(headerHost);
  paintHeader();
  paint();
  load();

  return root;
}