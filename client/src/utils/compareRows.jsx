import { formatINR, formatDate, discountPercent } from "./format.js";
import { conditionTone, listingTone } from "./theme.js";

/**
 * Everything the compare page knows how to say about a product, in one place.
 *
 * Two rules shaped this file:
 *
 * 1. **Never invent a field.** Every row below reads a real column of the
 *    Product schema (or a real key of the seller's free-form `specifications`
 *    object). The previous compare page scored products with a weighted formula
 *    and printed a "Best product" banner; a numeric total across price,
 *    condition and seller trust is a claim the marketplace cannot make, because
 *    which of those matters is exactly what the customer is deciding. So there
 *    are no scores here. What is left is arithmetic anyone can check -- lowest
 *    price, highest price, highest rating -- and everything else is shown as-is.
 *
 * 2. **Show the difference, not the noise.** A comparison where every cell is
 *    styled the same is three product cards in a row. `differences()` marks the
 *    rows whose values are not all equal so the page can draw the eye there,
 *    and `identicalRows()` lets the caller hide the rows that agree.
 */

/** Server enum order (server/models/Product.js). Used only to phrase, never to judge. */
const CONDITION_SEVERITY = {
  "like new": 4,
  good: 3,
  average: 2,
  used: 1,
};

const DASH = "—";

/** Case/whitespace-insensitive comparison key, so "Good" and " good " agree. */
const normalise = (value) => {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "number") return String(value);
  return String(value).trim().toLowerCase();
};

const humaniseKey = (key) =>
  String(key)
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());

/** Spec keys are compared with case and internal spacing collapsed. */
const normaliseKey = (key) => String(key).trim().toLowerCase().replace(/\s+/g, " ");

/** "1 year ago" / "4 months ago", derived from the listing's createdAt. */
export function relativeAge(iso) {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;
  const days = Math.max(0, Math.round((Date.now() - then) / 86400000));
  if (days < 1) return "Listed today";
  if (days === 1) return "Listed yesterday";
  if (days < 30) return `Listed ${days} days ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `Listed ${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return rest ? `Listed ${years}y ${rest}mo ago` : `Listed ${years} year${years === 1 ? "" : "s"} ago`;
}

const sellerName = (p) => p?.seller?.name || p?.sellerName || DASH;
const isAvailable = (p) => (p?.status ? p.status === "available" : true);

/* ------------------------------------------------------------------ rows -- */
/**
 * `value` is the comparable primitive (drives the difference check).
 * `render` is the cell. Both receive the product so a row can be self-contained.
 */
const OVERVIEW_ROWS = [
  {
    key: "price",
    label: "Price",
    hint: "What the seller is asking today.",
    value: (p) => (Number.isFinite(p?.price) ? p.price : null),
    render: (p) => (
      <span className="text-[15px] font-extrabold text-ink-900 tabular">{formatINR(p.price)}</span>
    ),
  },
  {
    key: "originalPrice",
    label: "Original price",
    hint: "The new-equivalent price the seller listed against.",
    value: (p) => (p?.originalPrice > p.price ? p.originalPrice : null),
    render: (p) =>
      p.originalPrice > p.price ? (
        <span className="text-xs font-semibold text-muted-soft line-through tabular">
          {formatINR(p.originalPrice)}
        </span>
      ) : (
        <span className="text-muted-soft">{DASH}</span>
      ),
  },
  {
    key: "savings",
    label: "You save",
    hint: "Difference between the original price and the asking price.",
    value: (p) => (p?.originalPrice > p.price ? discountPercent(p.price, p.originalPrice) : 0),
    render: (p) => {
      const pct = discountPercent(p.price, p.originalPrice);
      if (!pct) return <span className="text-muted-soft">{DASH}</span>;
      return (
        <span className="inline-flex items-center gap-1 font-bold text-success tabular">
          {pct}% off
        </span>
      );
    },
  },
  {
    key: "condition",
    label: "Condition",
    hint: "Seller-declared condition. Check the description for wear.",
    value: (p) => normalise(p?.condition),
    render: (p) =>
      p.condition ? (
        <span className={`badge border ${conditionTone(p.condition)}`}>{p.condition}</span>
      ) : (
        <span className="text-muted-soft">{DASH}</span>
      ),
  },
  {
    key: "brand",
    label: "Brand",
    value: (p) => normalise(p?.brand),
    render: (p) => (
      <span className="font-semibold text-ink-800">{p.brand || <span className="text-muted-soft">{DASH}</span>}</span>
    ),
  },
  {
    key: "model",
    label: "Model",
    value: (p) => normalise(p?.model),
    render: (p) => <span className="text-ink-800">{p.model || <span className="text-muted-soft">{DASH}</span>}</span>,
  },
  {
    key: "categoryName",
    label: "Category",
    value: (p) => normalise(p?.categoryName),
    render: (p) => <span className="text-ink-800">{p.categoryName || <span className="text-muted-soft">{DASH}</span>}</span>,
  },
  {
    key: "rating",
    label: "Product rating",
    hint: "Average rating left by buyers of this listing.",
    value: (p) => (Number(p?.rating) > 0 ? Number(p.rating).toFixed(2) : ""),
    render: (p) =>
      Number(p.rating) > 0 ? (
        <span className="inline-flex items-center gap-1.5">
          <span className="text-2xs text-muted tabular">
            {Number(p.rating).toFixed(1)} / 5
          </span>
          <span className="text-2xs font-semibold text-muted-soft">({p.reviewCount || 0})</span>
        </span>
      ) : (
        <span className="badge badge-neutral">No reviews yet</span>
      ),
  },
];

const SELLER_ROWS = [
  {
    key: "sellerName",
    label: "Seller",
    value: (p) => normalise(sellerName(p)),
    render: (p) => <span className="font-semibold text-ink-800">{sellerName(p)}</span>,
  },
  {
    key: "sellerVerified",
    label: "Verified seller",
    hint: "ReMarket has verified this seller's identity.",
    value: (p) => (p?.seller?.isVerifiedSeller ? "yes" : "no"),
    render: (p) =>
      p.seller?.isVerifiedSeller ? (
        <span className="badge badge-success">Verified</span>
      ) : (
        <span className="badge badge-neutral">Not verified</span>
      ),
  },
  {
    key: "sellerRating",
    label: "Seller rating",
    hint: "Seller's average rating across all their listings.",
    value: (p) => (Number(p?.seller?.sellerRating) > 0 ? Number(p.seller.sellerRating).toFixed(2) : ""),
    render: (p) => {
      const rating = Number(p.seller?.sellerRating) || 0;
      const count = Number(p.seller?.sellerRatingCount) || 0;
      if (!rating) return <span className="badge badge-neutral">New seller</span>;
      return (
        <span className="inline-flex items-center gap-1.5">
          <span className="font-bold text-ink-800 tabular">{rating.toFixed(1)} / 5</span>
          <span className="text-2xs text-muted-soft">({count} {count === 1 ? "review" : "reviews"})</span>
        </span>
      );
    },
  },
  {
    key: "sellerLocation",
    label: "Seller location",
    value: (p) => normalise(p?.seller?.location),
    render: (p) =>
      p.seller?.location ? (
        <span className="text-ink-800">{p.seller.location}</span>
      ) : (
        <span className="text-muted-soft">{DASH}</span>
      ),
  },
];

const BUYING_ROWS = [
  {
    key: "negotiable",
    label: "Price negotiable",
    hint: "Seller will consider a lower offer on this listing.",
    value: (p) => (p?.negotiable ? "yes" : "no"),
    render: (p) => (p.negotiable ? <YesNo yes /> : <YesNo />),
  },
  {
    key: "exchangeable",
    label: "Exchange accepted",
    hint: "Seller will take another item as part of the deal.",
    value: (p) => (p?.exchangeable ? "yes" : "no"),
    render: (p) => (p.exchangeable ? <YesNo yes /> : <YesNo />),
  },
  {
    key: "offersOpen",
    label: "Make an offer",
    hint: "Offers can only be sent on negotiable listings.",
    value: (p) => (p?.negotiable ? "yes" : "no"),
    render: (p) =>
      p.negotiable ? (
        <span className="badge badge-accent">Offers open</span>
      ) : (
        <span className="text-muted-soft">Fixed price</span>
      ),
  },
  {
    key: "status",
    label: "Availability",
    value: (p) => normalise(p?.status || "available"),
    render: (p) => (
      <span className={`badge border ${listingTone(p.status || "available")}`}>
        {p.status === "sold" ? "Sold" : p.status === "reserved" ? "Reserved" : "Available"}
      </span>
    ),
  },
];

const LISTING_ROWS = [
  {
    key: "location",
    label: "Pickup location",
    hint: "Where the item is collected from. ReMarket has no courier checkout.",
    value: (p) => normalise(p?.location),
    render: (p) => <span className="text-ink-800">{p.location || <span className="text-muted-soft">{DASH}</span>}</span>,
  },
  {
    key: "listedOn",
    label: "Listed on",
    value: (p) => normalise(p?.createdAt),
    render: (p) => <span className="text-ink-800">{formatDate(p.createdAt)}</span>,
  },
  {
    key: "age",
    label: "Listing age",
    hint: "How long this listing has been on the marketplace.",
    value: (p) => normalise(relativeAge(p?.createdAt)),
    render: (p) => <span className="text-ink-800">{relativeAge(p.createdAt) || DASH}</span>,
  },
];

function YesNo({ yes }) {
  return yes ? (
    <span className="badge badge-success">Yes</span>
  ) : (
    <span className="text-muted-soft text-xs font-semibold">No</span>
  );
}

export const SECTIONS = [
  { key: "overview", title: "Product overview", icon: "package", rows: OVERVIEW_ROWS },
  { key: "seller", title: "Seller", icon: "user", rows: SELLER_ROWS },
  { key: "buying", title: "Buying options", icon: "tag", rows: BUYING_ROWS },
  { key: "listing", title: "Listing details", icon: "clock", rows: LISTING_ROWS },
];

/**
 * Specification rows built from what the sellers actually filled in.
 *
 * `specifications` is a free-form object on the Product schema, so there is no
 * fixed list of spec keys to hardcode. The row set is the union of the keys
 * across the compared listings, which means a row only ever appears if at least
 * one real listing has that value. A laptop's "RAM" row shows "—" for a phone
 * that was never asked for one, instead of pretending the phone has no RAM.
 *
 * Keys are unioned case-insensitively, because sellers type "RAM", "Ram" and
 * "ram" for the same thing. Each observed spelling is kept alongside the row so
 * a lookup can try every variant: unioning on the lowercase form alone would
 * create the row from whichever spelling was seen first and then report every
 * other seller who typed it differently as if they had left the field blank.
 */
export function specRows(products) {
  // normalised key -> every spelling of it that appeared in the data
  const spellings = new Map();
  const firstSpelling = new Map();
  products.forEach((p) => {
    const specs = p?.specifications;
    if (!specs || typeof specs !== "object" || Array.isArray(specs)) return;
    Object.keys(specs).forEach((k) => {
      const key = String(k).trim();
      if (!key) return;
      const norm = key.toLowerCase();
      if (!spellings.has(norm)) {
        spellings.set(norm, []);
        firstSpelling.set(norm, key);
      }
      if (!spellings.get(norm).includes(key)) spellings.get(norm).push(key);
    });
  });
  if (!spellings.size) return [];

  const read = (p, variants) => {
    const specs = p?.specifications;
    if (!specs || typeof specs !== "object" || Array.isArray(specs)) return undefined;
    for (const variant of variants) {
      const raw = specs[variant];
      if (raw !== null && raw !== undefined && raw !== "") return raw;
    }
    // A seller may have typed the key with different spacing, e.g. "Screen Size".
    // Fall back to a whitespace-insensitive scan before calling it absent.
    const wanted = variants.map((v) => normaliseKey(v));
    const match = Object.keys(specs).find((k) => wanted.includes(normaliseKey(k)));
    return match === undefined ? undefined : specs[match];
  };

  return [...spellings.keys()].map((norm) => {
    const variants = spellings.get(norm);
    const label = humaniseKey(firstSpelling.get(norm));
    return {
      key: `spec:${norm}`,
      label,
      isSpec: true,
      value: (p) => {
        const raw = read(p, variants);
        if (raw === null || raw === undefined || raw === "") return "";
        return normalise(raw);
      },
      render: (p) => {
        const raw = read(p, variants);
        if (raw === null || raw === undefined || raw === "") {
          return <span className="text-muted-soft">{DASH}</span>;
        }
        return <span className="font-semibold text-ink-800 break-words">{String(raw)}</span>;
      },
    };
  });
}

/** Sections ready to render, with spec rows appended when any listing has them. */
export function buildSections(products, { includeSpecs = true } = {}) {
  // Nothing to compare means nothing to lay rows out against. Returning the
  // static rows here would produce a table full of em dashes for a tray that is
  // empty, so an empty tray gets an empty table instead.
  if (!Array.isArray(products) || products.length === 0) return [];
  const specs = includeSpecs ? specRows(products) : [];
  const sections = SECTIONS.map((s) => ({ ...s, rows: s.rows }));
  if (specs.length) {
    sections.push({ key: "specs", title: "Specifications", icon: "sliders", rows: specs, isSpec: true });
  }
  return sections;
}

/** True when the row's values are not all equal across the compared products. */
export function rowDiffers(row, products) {
  const values = products.map((p) => row.value(p));
  const present = values.filter((v) => v !== "" && v !== null && v !== undefined);
  if (!present.length) return false;
  return new Set(present.map(String)).size > 1 || present.length !== values.length;
}

export function annotateSections(sections, products) {
  return sections.map((section) => {
    const rows = section.rows.map((row) => ({ ...row, differs: rowDiffers(row, products) }));
    return { ...section, rows, differs: rows.some((r) => r.differs) };
  });
}

/* --------------------------------------------------------- neutral facts -- */
/**
 * Objective, checkable extremes. These are the only "highlight" the page shows,
 * and only where the underlying value is a plain number anyone can verify.
 * There is deliberately no overall winner: the right pick depends on what the
 * customer actually needs, which is the question they came here to answer.
 */
export function priceExtremes(products) {
  const prices = products
    .map((p) => Number(p.price))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (prices.length < 2) return { lowestId: null, highestId: null, spread: 0, distinct: false };
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return {
    lowestId: String(products.find((p) => Number(p.price) === min)?._id || ""),
    highestId: String(products.find((p) => Number(p.price) === max)?._id || ""),
    spread: max - min,
    distinct: min !== max,
  };
}

export function ratingExtremes(products) {
  const rated = products.filter((p) => Number(p.rating) > 0);
  if (rated.length < 2) return { highestId: null, distinct: false };
  const max = Math.max(...rated.map((p) => Number(p.rating)));
  const values = new Set(rated.map((p) => Number(p.rating).toFixed(2)));
  if (values.size < 2) return { highestId: null, distinct: false };
  return {
    highestId: String(rated.find((p) => Number(p.rating) === max)?._id || ""),
    distinct: true,
  };
}

/** A short, factual summary of the set. Counts, ranges, no recommendations. */
export function summarise(products) {
  const prices = products.map((p) => Number(p.price)).filter(Number.isFinite);
  const conditions = new Map();
  products.forEach((p) => {
    const c = p.condition || "Not stated";
    conditions.set(c, (conditions.get(c) || 0) + 1);
  });
  const locations = new Set(products.map((p) => normalise(p.location)).filter(Boolean));
  return {
    count: products.length,
    minPrice: prices.length ? Math.min(...prices) : null,
    maxPrice: prices.length ? Math.max(...prices) : null,
    negotiable: products.filter((p) => p.negotiable).length,
    exchangeable: products.filter((p) => p.exchangeable).length,
    verifiedSellers: products.filter((p) => p.seller?.isVerifiedSeller).length,
    conditionSpread: [...conditions.entries()].map(([name, n]) => ({ name, n })),
    locationCount: locations.size,
  };
}

export { DASH, normalise, isAvailable, CONDITION_SEVERITY };
