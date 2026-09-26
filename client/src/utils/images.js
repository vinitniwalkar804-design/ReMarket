/**
 * SINGLE SOURCE OF TRUTH for rendering a product image on the client.
 *
 * Every page (Home, Explore, Categories, Search, Product Detail, Wishlist, Cart,
 * Checkout, Orders, Offers, Compare, Recently Viewed, Seller listings, Admin)
 * resolves its thumbnail through this module. No page decides which image
 * belongs to a product, and no page keeps its own fallback.
 *
 * Rules
 * -----
 * 1. A product's image comes from that product's persisted image data
 *    (`product.images[]`, or `product.image` for search projections).
 * 2. If a product genuinely has no image, we render a neutral marketplace
 *    placeholder that is unmistakably a placeholder. We never borrow another
 *    product's photo, never pick a random one, and never pass off a category
 *    image as the product's own.
 * 3. If a stored image fails to load, we fall back to the same neutral
 *    placeholder - again, never to a different product's image.
 */

/**
 * Neutral "no photo" placeholder, inlined as an SVG data URI.
 * Self-contained: it cannot 404, adds no network request, and scales to any
 * card or gallery size without distortion.
 */
export const PLACEHOLDER_IMAGE =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300" role="img" aria-label="No photo available">
      <rect width="400" height="300" fill="#F1F5F9"/>
      <rect x="0.5" y="0.5" width="399" height="299" fill="none" stroke="#CBD5E1" stroke-width="1.5" stroke-dasharray="10 8"/>
      <g fill="none" stroke="#94A3B8" stroke-width="7" stroke-linejoin="round" stroke-linecap="round">
        <path d="M132 104h136a12 12 0 0 1 12 12v68a12 12 0 0 1-12 12H132a12 12 0 0 1-12-12v-68a12 12 0 0 1 12-12Z"/>
        <path d="M120 172l44-40 34 30 26-22 56 48"/>
      </g>
      <circle cx="234" cy="140" r="13" fill="none" stroke="#94A3B8" stroke-width="7"/>
      <text x="200" y="232" font-family="system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif" font-size="19" font-weight="600" fill="#64748B" text-anchor="middle">No photo yet</text>
      <text x="200" y="256" font-family="system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif" font-size="14" fill="#94A3B8" text-anchor="middle">Seller has not added an image</text>
    </svg>`
  );

const UNSPLASH = "images.unsplash.com/photo-";

/**
 * Keep remote catalog artwork on the standard 4:3 crop so nothing is stretched
 * or inconsistently sized. Seller-uploaded URLs are never rewritten.
 */
const normalizeUrl = (url) => {
  if (typeof url !== "string") return "";
  const value = url.trim();
  if (!value) return "";
  if (value.startsWith("data:")) return value;
  if (value.includes(UNSPLASH) && !/[?&]w=/.test(value)) {
    const base = value.split("?")[0];
    return `${base}?auto=format&fit=crop&w=1000&h=750&q=70`;
  }
  return value;
};

/** True when the product has its own persisted image(s). */
export const hasProductImage = (product) => getProductImages(product).length > 0;

/**
 * The product's own images, in order, de-duplicated.
 * Returns [] when the product has no image - it never substitutes anything.
 */
export const getProductImages = (product) => {
  if (!product) return [];
  // `images` is authoritative when it carries anything. List/search projections
  // expose only a singular `image`, and may also carry an empty `images`, so
  // fall back to it whenever the array is absent OR empty.
  const list = Array.isArray(product.images) ? product.images : [];
  const source = list.length ? list : product.image ? [product.image] : [];
  const seen = new Set();
  const out = [];
  for (const entry of source) {
    const url = normalizeUrl(entry);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
};

/**
 * The product's own image at `index`, or the neutral placeholder.
 * @param {boolean} [isFallback] set true on the returned value when the
 *   placeholder is being used, so the UI can style it as a fallback.
 */
export const getProductImage = (product, index = 0, isFallback = false) =>
  getProductImages(product)[index] || PLACEHOLDER_IMAGE;

/** The placeholder. Kept for call sites that only need a safe default. */
export const fallbackFor = () => PLACEHOLDER_IMAGE;

/**
 * Spread onto an <img> to render a product's image.
 * On load failure it degrades to the neutral placeholder, and it will not
 * switch to any other product's image.
 */
export const imageProps = (product, index = 0) => ({
  src: getProductImage(product, index),
  onError: (event) => {
    const el = event.currentTarget;
    el.onerror = null;
    if (el.src !== PLACEHOLDER_IMAGE) el.src = PLACEHOLDER_IMAGE;
  },
});
