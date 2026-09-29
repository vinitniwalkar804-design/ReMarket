/**
 * Navigation bridge for the multi-page build.
 *
 * The vanilla build ran a client-side router on pushState; this build is a real
 * multi-page site where every route is a physical .html file. This module keeps
 * the same API surface the ported page modules were written against
 * (`navigate`, `getLocation`, `query`, `link`, `onLocationChange`) but turns
 * each call into a full-page navigation.
 *
 * How URLs stay physical without touching every anchor:
 *
 * - Static shell HTML uses relative file hrefs (`products.html`,
 *   `admin/customers.html`, ...).
 * - Page modules still emit virtual anchors (`href="/products"`,
 *   `href="/products/:id"`). `start()` installs a `MutationObserver` that
 *   rewrites any anchor whose href is a virtual route to its physical file the
 *   moment it is inserted. Because the rewrite happens before the browser reads
 *   the href, left-click, middle-click, "open in new tab" and the back/forward
 *   buttons all keep working with no JS click interception.
 * - `navigate()` resolves the virtual target to a physical URL and assigns it,
 *   stashing any `state` in sessionStorage keyed by the resolved path so the
 *   target page can read it back (the Sell "edit product" flow: Profile
 *   navigates to `/sell` with `{ editProduct }`, Sell reads `location.state`).
 */

import { icon } from "./icons.js";

// ---------- virtual -> physical routes ----------

const STATIC = {
  // storefront
  "/": "index.html",
  "/products": "products.html",
  "/categories": "categories.html",
  "/compare": "compare.html",
  "/wishlist": "wishlist.html",
  "/cart": "cart.html",
  "/checkout": "checkout.html",
  "/orders": "orders.html",
  "/sell": "sell.html",
  "/offers": "offers.html",
  "/messages": "messages.html",
  "/profile": "profile.html",
  "/notifications": "notifications.html",
  "/activity": "activity.html",
  "/login": "login.html",
  "/register": "register.html",
  // admin
  "/admin": "admin/dashboard.html",
  "/admin/dashboard": "admin/dashboard.html",
  "/admin/login": "admin/login.html",
  "/admin/customers": "admin/customers.html",
  "/admin/personas": "admin/personas.html",
  "/admin/analytics": "admin/analytics.html",
  "/admin/customer-journeys": "admin/journey.html",
  "/admin/journey": "admin/journey.html",
  "/admin/product-intelligence": "admin/product-intelligence.html",
  "/admin/seller-intelligence": "admin/seller-intelligence.html",
  "/admin/sales-insights": "admin/sales-insights.html",
  "/admin/products": "admin/products.html",
  "/admin/orders": "admin/orders.html",
  "/admin/settings": "admin/settings.html",
  "/admin/listings": "admin/listings.html",
  "/admin/sellers": "admin/sellers.html",
  "/admin/marketplace-health": "admin/marketplace-health.html",
  "/admin/moderation/reports": "admin/moderation.html",
  "/admin/clusters": "admin/clusters.html",
  "/admin/ml-lab": "admin/ml-lab.html",
  // redirects, mirroring routes.js: the old combined marketplace page and any
  // unknown admin sub-path both land on a real page instead of a blank screen.
  "/admin/marketplace": "admin/seller-intelligence.html",
};

/** Dynamic virtual routes: a regex against the bare path and the file they map to. */
const DYNAMIC = [
  { re: /^\/products\/([^/?#]+)/, file: "product-detail.html" },
  { re: /^\/seller\/([^/?#]+)/, file: "seller-profile.html" },
  { re: /^\/messages\/([^/?#]+)/, file: "messages.html" },
  { re: /^\/admin\/customers\/([^/?#]+)/, file: "admin/customer-detail.html" },
  { re: /^\/admin\/customer\/([^/?#]+)/, file: "admin/customer-detail.html" },
  { re: /^\/admin\/marketplace$/, file: "admin/seller-intelligence.html" },
];

// ---------- physical -> virtual (read back) ----------

/**
 * The virtual path each physical page represents. Used for shell active-state
 * painting and for pages that build a URL from `location.path`: a detail page
 * reports the base collection it belongs to (`/products` for
 * product-detail.html), so "Explore" stays highlighted and `navigate()` of a
 * rebuilt query stays inside the right route.
 */
const FILE_TO_VIRTUAL = {
  "index.html": "/",
  "products.html": "/products",
  "product-detail.html": "/products",
  "categories.html": "/categories",
  "seller-profile.html": "/seller",
  "compare.html": "/compare",
  "wishlist.html": "/wishlist",
  "cart.html": "/cart",
  "checkout.html": "/checkout",
  "orders.html": "/orders",
  "sell.html": "/sell",
  "offers.html": "/offers",
  "messages.html": "/messages",
  "profile.html": "/profile",
  "notifications.html": "/notifications",
  "activity.html": "/activity",
  "login.html": "/login",
  "register.html": "/register",
  "admin/dashboard.html": "/admin/dashboard",
  "admin/login.html": "/admin/login",
  "admin/customers.html": "/admin/customers",
  "admin/customer-detail.html": "/admin/customers",
  "admin/personas.html": "/admin/personas",
  "admin/analytics.html": "/admin/analytics",
  "admin/journey.html": "/admin/journey",
  "admin/product-intelligence.html": "/admin/product-intelligence",
  "admin/seller-intelligence.html": "/admin/seller-intelligence",
  "admin/sales-insights.html": "/admin/sales-insights",
  "admin/products.html": "/admin/products",
  "admin/orders.html": "/admin/orders",
  "admin/settings.html": "/admin/settings",
  "admin/listings.html": "/admin/listings",
  "admin/sellers.html": "/admin/sellers",
  "admin/marketplace-health.html": "/admin/marketplace-health",
  "admin/moderation.html": "/admin/moderation/reports",
  "admin/clusters.html": "/admin/clusters",
  "admin/ml-lab.html": "/admin/ml-lab",
};

/** Physical pages whose route carried an `:id` segment. */
const DETAIL_FILES = new Set([
  "product-detail.html",
  "seller-profile.html",
  "admin/customer-detail.html",
]);

/**
 * Turn a (possibly virtual) href into a physical file href, or return it
 * untouched when it is not one of this app's internal routes.
 */
function resolveVirtual(href) {
  if (!href || typeof href !== "string") return href;
  if (href.startsWith("#") || href.startsWith("?") || href === "") return href;
  if (href.startsWith("http:") || href.startsWith("https:") || href.startsWith("mailto:") || href.startsWith("tel:")) return href;
  if (href.startsWith("/api/") || href.startsWith("/uploads")) return href;
  if (/\.html($|[?#])/.test(href)) return href; // already a physical file
  if (!href.startsWith("/")) return href; // relative asset, leave alone

  const qIndex = href.indexOf("?");
  const rawPath = qIndex === -1 ? href : href.slice(0, qIndex);
  const rawSearch = qIndex === -1 ? "" : href.slice(qIndex); // includes "?"

  for (const { re, file } of DYNAMIC) {
    const m = re.exec(rawPath);
    if (m) {
      const id = m[1];
      const base = `/${file}?id=${encodeURIComponent(id)}`;
      const rest = rawSearch ? `&${rawSearch.slice(1)}` : "";
      return base + rest;
    }
  }

  const base = STATIC[rawPath];
  if (base) return `/${base}${rawSearch}`;

  // Unknown admin sub-path: routes.js redirected it to the dashboard.
  if (rawPath.startsWith("/admin/")) return `/admin/dashboard.html${rawSearch}`;

  return href;
}

/** Physical file for the current page, under the site root. */
function currentFile() {
  const pathname = window.location.pathname;
  const clean = pathname.replace(/^\/+|\/+$/g, "");
  return clean || "index.html";
}

/** The virtual path for the current physical page. */
function fileToVirtual() {
  const file = currentFile();
  return FILE_TO_VIRTUAL[file] ?? `/${file.replace(/\.html$/, "")}`;
}

/** `:id` params for the current page, pulled from the `?id=` query segment. */
function paramsFor() {
  const file = currentFile();
  if (!DETAIL_FILES.has(file)) return {};
  const id = new URLSearchParams(window.location.search).get("id");
  return id ? { id } : {};
}

// ---------- navigation API ----------

/** The state stash key for a physical path. */
function stateKey(pathname) {
  return `rk:nav:state:${pathname}`;
}

/** Stashed navigation state for a path, consumed on read. */
function readState(pathname) {
  const key = stateKey(pathname);
  const raw = sessionStorage.getItem(key);
  sessionStorage.removeItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const listeners = new Set();

/**
 * Observe navigation. Present for API compatibility with the SPA router - in a
 * multi-page site a navigation is a page load, so the subscription never fires.
 */
export function onLocationChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * The current location. `path` is the virtual path (shells and pages compare
 * against it), `params` the route's `:id` segment, and `state` any state stashed
 * by the navigation that brought us here - the Sell edit flow reads it.
 */
export function getLocation() {
  const { pathname, search, hash } = window.location;
  return {
    path: fileToVirtual(),
    search,
    hash,
    full: window.location.pathname + search + hash,
    params: paramsFor(),
    state: readState(window.location.pathname),
  };
}

/** Current query string as a plain object, mirroring the SPA router's query(). */
export function query() {
  const out = {};
  for (const [k, v] of new URLSearchParams(window.location.search)) out[k] = v;
  return out;
}

/**
 * Navigate. Resolves the virtual target to a physical URL and loads it. `state`
 * is stashed for the target page; `replace` swaps the history entry.
 */
export function navigate(to, { replace = false, state } = {}) {
  const resolved = resolveVirtual(to) || "/index.html";
  const absolute = resolved.startsWith("/") ? resolved : `/${resolved}`;
  const path = new URL(absolute, window.location.origin).pathname;
  if (state !== undefined) sessionStorage.setItem(stateKey(path), JSON.stringify(state));
  else sessionStorage.removeItem(stateKey(path));
  if (replace) window.location.replace(absolute);
  else window.location.assign(absolute);
}

/** Build an in-app anchor's props. Kept so page code reads like the JSX `<Link>`. */
export function link(href, props = {}) {
  return { href, ...props };
}

// Compatibility stubs: the SPA router registered routes and guards at import
// time. This build has no client route table - guards run per page in boot.js,
// and `onLocationChange` never fires - so the registration API is a no-op that
// returns a no-op unsubscribe, exactly as if a listener had been added.
export const route = () => {};
export const setGuard = () => {};
export const setRouteGuard = () => {};
export const setNotFound = () => {};
export const render = () => {};

/** fmt: no-ops to keep import-compatible default shape. */
export default {
  route,
  start: null,
  navigate,
  render,
  query,
  getLocation,
  link,
  setGuard,
  setRouteGuard,
  setNotFound,
  onLocationChange,
};

/** Replace every `[data-icon]` placeholder in a subtree with its SVG. */
export function injectIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((host) => {
    const name = host.dataset.icon;
    if (!name) return;
    const size = Number(host.dataset.iconSize || 19);
    const node = icon(name, { size });
    host.replaceWith(node);
  });
}

/** Rewrite one anchor's href when the href is a virtual route. */
function rewriteAnchor(anchor) {
  const current = anchor.getAttribute("href");
  if (!current) return;
  const resolved = resolveVirtual(current);
  if (resolved !== current) anchor.setAttribute("href", resolved);
}

/**
 * Start the navigation bridge: rewrite the anchors already in the document and
 * keep rewriting any inserted afterwards (pages render their content after
 * boot, so most of the work happens through the observer).
 */
export function start() {
  injectIcons(document);
  document.querySelectorAll("a[href]").forEach(rewriteAnchor);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches?.("a[href]")) rewriteAnchor(node);
        node.querySelectorAll?.("a[href]").forEach(rewriteAnchor);
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  return observer;
}