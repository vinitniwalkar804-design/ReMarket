import { h, mount } from "../dom.js";
import { icon } from "../icons.js";
import api from "../services/api.js";
import EmptyState from "../components/empty-state.js";
import { timeAgo } from "../utils/format.js";

const typeMeta = {
  offer: { icon: "Tag", cls: "bg-info-soft text-info", label: "Offers & negotiations" },
  order: { icon: "ShoppingBag", cls: "bg-success-soft text-success", label: "Orders & delivery" },
  chat: { icon: "MessageCircle", cls: "bg-primary-soft text-primary", label: "Messages" },
  price: { icon: "TrendingDown", cls: "bg-warning-soft text-warning", label: "Price drops & savings" },
};

/**
 * Notifications center.
 *
 * Ported from the React build's Notifications.jsx. One GET on load, one
 * "mark all read" POST that optimistically flips every notification to read
 * in place, and a grouped render ordered by the fixed typeMeta table with the
 * unmatched rows at the bottom under "Everything else".
 *
 * Maps the React `EmptyState(icon={Bell})` to the vanilla helper's
 * `iconName: "Bell"` - same graphic, same copy.
 *
 * Lifecycle is the Cart/Orders pattern: a persistent root, one delegated
 * click for the mark-all button, and a body MutationObserver teardown. The
 * button lives in the masthead; each group list is a region that is NOT
 * re-rendered as a whole because the optimistic update only toggles `.read`,
 * which plain DOM class toggles handle cheaper than a rebuild.
 */

export default function Notifications() {
  const st = { notifications: [], loading: true };

  let disposed = false;
  const cleanups = [];
  const root = h("div", null);

  function ensureAlive() {
    if (root.isConnected) return true;
    if (!disposed) {
      disposed = true;
      for (const fn of cleanups.splice(0)) fn();
    }
    return false;
  }

  const observer = new MutationObserver(() => {
    if (!ensureAlive()) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Paint regions. The body is rebuilt as a whole from `st.notifications`;
  // the masthead badge is a small persistent host updated alone.
  const badgeHost = h("span", { className: "badge badge-primary" });
  const bodyHost = h("div", { className: "max-w-2xl mx-auto px-4 sm:px-6 py-8" });

  const paintBadge = () => {
    const unread = st.notifications.filter((n) => !n.read).length;
    badgeHost.textContent = `${unread} new`;
    badgeHost.classList.toggle("hidden", unread === 0);
  };

  const markAllBtn = h(
    "button",
    { className: "btn-secondary btn-sm flex-none", dataset: { notify: "markall" } },
    icon("Check", { size: 14 }),
    " Mark all read"
  );

  // React's NotificationRow: a card that is a <Link> when the notification
  // carries a destination, otherwise a plain div. The unread dot and chevron
  // are the same either way.
  const notificationRow = (n, to) => {
    const body = [
      h(
        "div",
        { className: "flex-1 min-w-0" },
        h(
          "div",
          { className: n.read ? "text-sm font-bold text-ink-900" : "text-sm font-extrabold text-ink-900" },
          n.title
        ),
        n.message ? h("div", { className: "text-xs text-muted mt-0.5 leading-relaxed" }, n.message) : null,
        h("div", { className: "text-2xs text-muted-soft mt-1.5 font-semibold" }, timeAgo(n.createdAt))
      ),
      !n.read ? h("span", { className: "w-2 h-2 rounded-full bg-primary flex-none mt-2" }) : null,
      to ? icon("ChevronRight", { size: 15, className: "text-muted-soft flex-none mt-0.5" }) : null,
    ];
    return to
      ? h("a", { href: to, className: `card p-4 flex items-start gap-3 transition-all card-hover ${n.read ? "" : "border-brand-200 bg-primary-soft/40"}` }, ...body)
      : h("div", { className: `card p-4 flex items-start gap-3 transition-all ${n.read ? "" : "border-brand-200 bg-primary-soft/40"}` }, ...body);
  };

  const group = (type, meta, items) =>
    h(
      "section",
      { key: type },
      h(
        "div",
        { className: "flex items-center gap-2.5 mb-3" },
        h(
          "span",
          { className: `w-7 h-7 rounded-lg flex items-center justify-center ${meta.cls}` },
          icon(meta.icon, { size: 14 })
        ),
        h("h2", { className: "text-sm font-extrabold text-ink-900" }, meta.label),
        items.filter((n) => !n.read).length > 0
          ? h("span", { className: "badge badge-primary" }, items.filter((n) => !n.read).length)
          : null
      ),
      h("div", { className: "space-y-2" }, ...items.map((n) => notificationRow(n, n.link || null)))
    );

  const bodyContent = () => {
    if (st.notifications.length === 0) {
      return h(
        "div",
        { className: "panel" },
        EmptyState({
          iconName: "Bell",
          title: "You're all caught up",
          description: "Offer updates, order alerts and price drops will land here.",
        })
      );
    }
    const grouped = Object.keys(typeMeta)
      .map((type) => ({ type, ...typeMeta[type], items: st.notifications.filter((n) => n.type === type) }))
      .filter((g) => g.items.length > 0);
    const other = st.notifications.filter((n) => !typeMeta[n.type]);

    return h(
      "div",
      { className: "space-y-8" },
      ...grouped.map((g) => group(g.type, g, g.items)),
      other.length > 0
        ? h(
            "section",
            null,
            h(
              "div",
              { className: "flex items-center gap-2.5 mb-3" },
              h("span", { className: "w-7 h-7 rounded-lg bg-sunken text-muted flex items-center justify-center" }, icon("Inbox", { size: 14 })),
              h("h2", { className: "text-sm font-extrabold text-ink-900" }, "Everything else")
            ),
            h("div", { className: "space-y-2" }, ...other.map((n) => notificationRow(n, null)))
          )
        : null
    );
  };

  const skeleton = () =>
    h(
      "div",
      { className: "page-container" },
      h("div", { className: "h-8 w-1/4 bg-sunken rounded-lg animate-pulse mb-6" }),
      ...Array.from({ length: 4 }, (_, i) => h("div", { key: i, className: "h-20 bg-sunken rounded-2xl animate-pulse mb-2" }))
    );

  const page = () => {
    const unread = st.notifications.filter((n) => !n.read).length;
    const sub = h("p", { className: "page-sub" }, unread > 0 ? `${unread} unread` : "You're all caught up");

    return h(
      "div",
      { className: "animate-fade-in" },
      h(
        "header",
        { className: "page-masthead" },
        h(
          "div",
          { className: "max-w-2xl mx-auto px-4 sm:px-6 py-8" },
          h(
            "div",
            { className: "flex flex-wrap items-end justify-between gap-3" },
            h(
              "div",
              null,
              h("p", { className: "page-eyebrow" }, icon("Bell", { size: 13 }), " Alerts"),
              h("div", { className: "flex items-center gap-2.5" }, h("h1", { className: "page-title" }, "Notifications"), badgeHost),
              sub
            ),
            unread > 0 ? markAllBtn : null
          )
        )
      ),
      bodyHost
    );
  };

  const repaint = () => {
    paintBadge();
    const rootEl = root.firstElementChild;
    if (rootEl) {
      // Rebuild the masthead sub copy (changes between "n unread" and "all
      // caught up") and swap the body region in place without rebuilding the
      // header shell.
      const subEl = rootEl.querySelector(".page-sub");
      const unread = st.notifications.filter((n) => !n.read).length;
      if (subEl) subEl.textContent = unread > 0 ? `${unread} unread` : "You're all caught up";
    }
    mount(bodyHost, bodyContent());
  };

  const showEmpty = () => {
    st.notifications = [];
    mount(root, page());
    repaint();
  };

  const load = () =>
    api
      .get("/notifications")
      .then(({ data }) => {
        if (!ensureAlive()) return;
        st.notifications = data.notifications || [];
        st.loading = false;
        mount(root, page());
        repaint();
      })
      .catch(() => {
        if (!ensureAlive()) return;
        st.loading = false;
        showEmpty();
      });

  const markAll = async () => {
    st.notifications = st.notifications.map((n) => ({ ...n, read: true }));
    repaint();
    try {
      await api.post("/notifications/read");
    } catch {
      // React swallows the failure silently - the optimistic update stays.
    }
  };

  const onRootClick = (event) => {
    const btn = event.target.closest?.("[data-notify]");
    if (!btn || btn.dataset.notify !== "markall") return;
    event.preventDefault();
    markAll();
  };

  root.addEventListener("click", onRootClick);
  cleanups.push(() => root.removeEventListener("click", onRootClick));

  mount(root, skeleton());
  load();

  return root;
}