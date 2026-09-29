import { h, cx } from "../dom.js";
import { icon } from "../icons.js";
import { formatINR, discountPercent } from "../utils/format.js";
import { conditionTone } from "../utils/theme.js";
import { productImg } from "../utils/images.js";

/**
 * MERIDIAN product card.
 * Hierarchy: media -> trust strip -> title -> price -> seller + actions.
 *
 * The card is an <article>, not a link. Callers wrap it in an anchor to
 * `/products/:id`, which is why the wishlist and compare buttons stop
 * propagation - without it, saving an item would also follow the product link.
 */
export default function ProductCard({
  product,
  onWishlist,
  wishlisted,
  onCompare,
  comparing,
} = {}) {
  const pct = discountPercent(product.price, product.originalPrice);
  const tone = conditionTone(product.condition);
  const seller = product.seller || {};
  const sellerName = seller.name || product.sellerName || "ReMarket seller";
  const rating = product.rating ? Number(product.rating).toFixed(1) : null;

  const stop = (fn) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    fn(product._id);
  };

  return h(
    "article",
    {
      className:
        "card card-hover group h-full overflow-hidden flex flex-col focus-within:border-brand-300 focus-within:shadow-cardHover",
    },
    // ---------- media ----------
    h(
      "div",
      { className: "relative aspect-[4/3] overflow-hidden bg-sunken" },
      productImg(
        product,
        {
          className:
            "w-full h-full object-cover transition-transform duration-500 ease-smooth group-hover:scale-[1.06]",
        }
      ),
      h("div", {
        className:
          "absolute inset-0 bg-gradient-to-t from-ink-950/45 via-ink-950/0 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none",
      }),

      h(
        "div",
        { className: "absolute top-0 inset-x-0 p-2.5 flex items-start justify-between gap-2" },
        h(
          "div",
          { className: "flex flex-col items-start gap-1.5" },
          pct >= 10
            ? h("span", { className: "badge bg-danger text-white shadow-sm" }, `−${pct}%`)
            : null,
          h("span", { className: `badge border backdrop-blur-sm ${tone}` }, product.condition),
          product.status === "sold"
            ? h("span", { className: "badge bg-ink-900/85 text-white backdrop-blur-sm" }, "Sold")
            : null
        ),
        h(
          "div",
          { className: "flex flex-col items-end gap-1.5" },
          onWishlist
            ? h(
                "button",
                {
                  type: "button",
                  "aria-label": wishlisted ? "Remove from wishlist" : "Save to wishlist",
                  title: wishlisted ? "Remove from wishlist" : "Save to wishlist",
                  "aria-pressed": Boolean(wishlisted),
                  onClick: stop(onWishlist),
                  className: cx(
                    "w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-150 border backdrop-blur-md",
                    wishlisted
                      ? "bg-danger text-white border-danger shadow-xs"
                      : "bg-white/92 text-ink-700 border-white/60 hover:bg-white hover:text-danger hover:scale-105"
                  ),
                },
                icon("Heart", { size: 15, className: wishlisted ? "fill-white" : "" })
              )
            : null,
          // Kept permanently visible rather than hover-only: a hover-only control
          // cannot be discovered on a touch device, and Compare is the entry
          // point to a feature a shopper has to opt into before they know it
          // exists.
          onCompare
            ? h(
                "button",
                {
                  type: "button",
                  "aria-label": comparing ? "Remove from compare" : "Add to compare",
                  title: comparing ? "Remove from Compare" : "Add to Compare",
                  "aria-pressed": Boolean(comparing),
                  onClick: stop(onCompare),
                  className: cx(
                    "w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-150 border backdrop-blur-md",
                    comparing
                      ? "bg-primary text-white border-primary shadow-xs"
                      : "bg-white/92 text-ink-700 border-white/60 hover:bg-white hover:text-primary hover:scale-105"
                  ),
                },
                icon("ArrowLeftRight", { size: 14 })
              )
            : null
        )
      ),

      product.negotiable
        ? h(
            "div",
            { className: "absolute bottom-2.5 left-2.5" },
            h(
              "span",
              {
                className:
                  "badge bg-ink-900/78 text-white backdrop-blur-md border border-white/15 gap-1",
              },
              icon("Handshake", { size: 11 }),
              " Negotiable"
            )
          )
        : null
    ),

    // ---------- body ----------
    h(
      "div",
      { className: "p-3.5 flex flex-col gap-2 flex-1" },
      h(
        "div",
        {
          className:
            "flex items-center gap-1.5 text-2xs font-bold uppercase tracking-[0.08em] text-muted-soft",
        },
        h("span", { className: "truncate" }, product.brand || "Unbranded"),
        h("span", { className: "dot flex-none" }),
        h("span", { className: "truncate" }, product.categoryName || product.category)
      ),
      h(
        "h3",
        {
          className: "card-title line-clamp-2 group-hover:text-primary transition-colors duration-150",
          title: product.title,
        },
        product.title
      ),
      // ---------- price hierarchy ----------
      h(
        "div",
        { className: "mt-auto pt-1" },
        h(
          "div",
          { className: "flex items-baseline gap-2 flex-wrap" },
          h(
            "span",
            { className: "text-xl font-extrabold text-ink-900 tracking-tight tabular" },
            formatINR(product.price)
          ),
          product.originalPrice > product.price
            ? h(
                "span",
                { className: "text-xs font-medium text-muted-soft line-through tabular" },
                formatINR(product.originalPrice)
              )
            : null
        ),
        h(
          "div",
          { className: "flex items-center gap-2 mt-1.5" },
          rating
            ? h(
                "span",
                { className: "inline-flex items-center gap-1 text-2xs font-bold text-ink-800" },
                icon("Star", { size: 11, className: "text-rating fill-rating" }),
                h("span", { className: "tabular" }, rating)
              )
            : h("span", { className: "badge badge-neutral" }, "New listing"),
          product.reviewCount > 0
            ? h("span", { className: "text-2xs text-muted-soft" }, `(${product.reviewCount})`)
            : null,
          product.negotiable
            ? h("span", { className: "text-2xs font-bold text-accent ml-auto" }, "Offers open")
            : null
        )
      )
    ),

    // ---------- trust footer ----------
    h(
      "div",
      { className: "flex items-center gap-2 px-3.5 py-2.5 border-t border-line bg-raised text-2xs text-muted" },
      h(
        "span",
        { className: "flex items-center gap-1 min-w-0 flex-1" },
        icon("BadgeCheck", {
          size: 12,
          className: seller.isVerifiedSeller ? "text-success flex-none" : "text-muted-soft flex-none",
        }),
        h("span", { className: "truncate font-semibold" }, sellerName)
      ),
      product.location
        ? h(
            "span",
            { className: "inline-flex items-center gap-1 flex-none text-muted-soft" },
            icon("MapPin", { size: 11 }),
            h("span", { className: "max-w-[86px] truncate" }, product.location)
          )
        : null
    )
  );
}
