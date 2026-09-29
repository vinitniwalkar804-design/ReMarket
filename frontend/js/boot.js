/**
 * Page bootstrap for the multi-page build.
 *
 * Plays the role the SPA router's guards and render loop used to: wait for the
 * session to resolve, apply the route guard, initialise the static shell and
 * mount the page module into `#page`.
 *
 * `renderPage` is called by each physical page's entry file under `js/`, with
 * the page module and the same `{ guard, shell }` options the route table used
 * to declare.
 */
import { mount } from "./dom.js";
import LoadingScreen from "./components/loading-screen.js";
import auth from "./store/auth.js";
import { navigate, getLocation, query } from "./navigation.js";
import { initCustomerShell, initAdminShell } from "./shell.js";

/**
 * The React route wrappers, as a lookup. `auth.refresh()` has already resolved
 * by the time this runs, so these reduce to the redirect `<Navigate>` produced.
 */
export function redirectFor(kind) {
  const user = auth.user;
  if (kind === "publicOnly") {
    return user ? (user.role === "admin" ? "/admin" : "/") : null;
  }
  if (kind === "customer") {
    if (!user || user.role !== "customer") return "/login";
    return null;
  }
  if (kind === "admin") {
    if (!user) return "/admin/login";
    if (user.role !== "admin") return "/";
    return null;
  }
  return null;
}

/** The context the router handed to page modules: params, location, query. */
export function getContext() {
  const location = getLocation();
  return { params: location.params || {}, location, query: query() };
}

/**
 * Mount a page module. `guard` redirects a signed-out (or wrong-role) visitor
 * without rendering; `shell` decides which static shell gets initialised first.
 */
export default async function renderPage(pageModule, { guard = null, shell = null } = {}) {
  const pageEl = document.getElementById("page");
  if (!pageEl) return;

  mount(pageEl, LoadingScreen());

  try {
    await auth.refresh();
  } catch {
    // refresh() already clears a session it could not restore; a failure here
    // just means "signed out", which the guards handle.
  }

  if (guard) {
    const denied = redirectFor(guard);
    if (denied) {
      navigate(denied, { replace: true });
      return;
    }
  }

  // Build the page context BEFORE the shell initialises: shell painting reads
  // `getLocation()`, whose first call consumes the navigation state that Sell
  // and Profile hand to the page module through `ctx.location.state`.
  const ctx = getContext();

  if (shell === "admin") initAdminShell();
  else if (shell === "customer") initCustomerShell();

  mount(pageEl, pageModule(ctx));
}