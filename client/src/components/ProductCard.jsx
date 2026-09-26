import { Star, Heart, MapPin, ArrowLeftRight, BadgeCheck, Handshake } from "lucide-react";
import { formatINR, discountPercent } from "../utils/format.js";
import { conditionTone } from "../utils/theme.js";
import { imageProps } from "../utils/images.js";

/**
 * MERIDIAN product card.
 * Hierarchy: media → trust strip → title → price → seller + actions.
 */
export default function ProductCard({
  product,
  onWishlist,
  wishlisted,
  onCompare,
  comparing,
  compact = false,
}) {
  const pct = discountPercent(product.price, product.originalPrice);
  const tone = conditionTone(product.condition);
  const seller = product.seller || {};
  const sellerName = seller.name || product.sellerName || "ReMarket seller";
  const rating = product.rating ? Number(product.rating).toFixed(1) : null;

  return (
    <article
      className={`card card-hover group h-full overflow-hidden flex flex-col
        focus-within:border-brand-300 focus-within:shadow-cardHover
        ${compact ? "" : ""}`}
    >
      {/* ---------- media ---------- */}
      <div className="relative aspect-[4/3] overflow-hidden bg-sunken">
        <img
          alt={product.title}
          {...imageProps(product)}
          className="w-full h-full object-cover transition-transform duration-500 ease-smooth group-hover:scale-[1.06]"
          loading="lazy"
        />
        <div
          className="absolute inset-0 bg-gradient-to-t from-ink-950/45 via-ink-950/0 to-transparent
            opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        />

        <div className="absolute top-0 inset-x-0 p-2.5 flex items-start justify-between gap-2">
          <div className="flex flex-col items-start gap-1.5">
            {pct >= 10 && (
              <span className="badge bg-danger text-white shadow-sm">
                &minus;{pct}%
              </span>
            )}
            <span className={`badge border backdrop-blur-sm ${tone}`}>{product.condition}</span>
            {product.status === "sold" && (
              <span className="badge bg-ink-900/85 text-white backdrop-blur-sm">Sold</span>
            )}
          </div>

          <div className="flex flex-col items-end gap-1.5">
            {onWishlist && (
              <button
                aria-label={wishlisted ? "Remove from wishlist" : "Save to wishlist"}
                title={wishlisted ? "Remove from wishlist" : "Save to wishlist"}
                aria-pressed={!!wishlisted}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onWishlist(product._id);
                }}
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-150
                  border backdrop-blur-md
                  ${
                    wishlisted
                      ? "bg-danger text-white border-danger shadow-xs"
                      : "bg-white/92 text-ink-700 border-white/60 hover:bg-white hover:text-danger hover:scale-105"
                  }`}
              >
                <Heart size={15} className={wishlisted ? "fill-white" : ""} />
              </button>
            )}
            {onCompare && (
              /* Kept permanently visible rather than hover-only: a hover-only
                 control cannot be discovered on a touch device, and Compare is
                 the entry point to a feature a shopper has to opt into before
                 they know it exists. */
              <button
                aria-label={comparing ? "Remove from compare" : "Add to compare"}
                title={comparing ? "Remove from Compare" : "Add to Compare"}
                aria-pressed={!!comparing}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onCompare(product._id);
                }}
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-150
                  border backdrop-blur-md
                  ${
                    comparing
                      ? "bg-primary text-white border-primary shadow-xs"
                      : "bg-white/92 text-ink-700 border-white/60 hover:bg-white hover:text-primary hover:scale-105"
                  }`}
              >
                <ArrowLeftRight size={14} />
              </button>
            )}
          </div>
        </div>

        {product.negotiable && (
          <div className="absolute bottom-2.5 left-2.5">
            <span className="badge bg-ink-900/78 text-white backdrop-blur-md border border-white/15 gap-1">
              <Handshake size={11} /> Negotiable
            </span>
          </div>
        )}
      </div>

      {/* ---------- body ---------- */}
      <div className="p-3.5 flex flex-col gap-2 flex-1">
        <div className="flex items-center gap-1.5 text-2xs font-bold uppercase tracking-[0.08em] text-muted-soft">
          <span className="truncate">{product.brand || "Unbranded"}</span>
          <span className="dot flex-none" />
          <span className="truncate">{product.categoryName || product.category}</span>
        </div>

        <h3
          className="card-title line-clamp-2 group-hover:text-primary transition-colors duration-150"
          title={product.title}
        >
          {product.title}
        </h3>

        {/* ---------- price hierarchy ---------- */}
        <div className="mt-auto pt-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-xl font-extrabold text-ink-900 tracking-tight tabular">
              {formatINR(product.price)}
            </span>
            {product.originalPrice > product.price && (
              <span className="text-xs font-medium text-muted-soft line-through tabular">
                {formatINR(product.originalPrice)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            {rating ? (
              <span className="inline-flex items-center gap-1 text-2xs font-bold text-ink-800">
                <Star size={11} className="text-rating fill-rating" />
                <span className="tabular">{rating}</span>
              </span>
            ) : (
              <span className="badge badge-neutral">New listing</span>
            )}
            {product.reviewCount > 0 && (
              <span className="text-2xs text-muted-soft">({product.reviewCount})</span>
            )}
            {product.negotiable && (
              <span className="text-2xs font-bold text-accent ml-auto">Offers open</span>
            )}
          </div>
        </div>
      </div>

      {/* ---------- trust footer ---------- */}
      <div
        className="flex items-center gap-2 px-3.5 py-2.5 border-t border-line bg-raised
          text-2xs text-muted"
      >
        <span className="flex items-center gap-1 min-w-0 flex-1">
          <BadgeCheck
            size={12}
            className={seller.isVerifiedSeller ? "text-success flex-none" : "text-muted-soft flex-none"}
          />
          <span className="truncate font-semibold">{sellerName}</span>
        </span>
        {product.location && (
          <span className="inline-flex items-center gap-1 flex-none text-muted-soft">
            <MapPin size={11} />
            <span className="max-w-[86px] truncate">{product.location}</span>
          </span>
        )}
      </div>
    </article>
  );
}
