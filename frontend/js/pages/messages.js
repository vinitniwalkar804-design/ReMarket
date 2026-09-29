import { h, mount } from "../dom.js";
import { icon } from "../icons.js";
import api from "../services/api.js";
import auth from "../store/auth.js";
import EmptyState from "../components/empty-state.js";
import { formatINR, initials, timeAgo } from "../utils/format.js";
import { C } from "../utils/theme.js";

/**
 * Messages.
 *
 * Ported from the React build's Messages.jsx. A two-pane inbox (thread list +
 * open thread) with a mobile conversation toggle. Selecting a thread shows the
 * list-preview copy first, then refetches the full chat via GET /chats/:id.
 * Sending posts to /chats/:id/send, refetches the thread and bumps the list
 * preview - exactly the three calls the React version makes.
 *
 * Repaints rebuild the contents of two persistent hosts (thread list, thread
 * pane), so handlers and the composition input are recreated fresh every
 * draw and cannot leak. The input keeps focus across sends because the send
 * repaint refocuses the composer.
 */

export default function Messages() {
  const user = auth.getState().user;
  const st = { chats: [], active: null, message: "", loading: true, mobileChat: false };

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

  const listHost = h("div", { className: "overflow-y-auto flex-1" });
  const threadHost = h("div", { className: "flex flex-col min-w-0 flex-1" });
  const listCol = h(
    "div",
    { className: "flex flex-col w-full sm:flex sm:w-80 border-r border-line flex-none" },
    h(
      "div",
      { className: "px-4 py-3.5 border-b border-line bg-raised" },
      h("p", { className: "text-2xs font-bold uppercase tracking-[0.14em] text-muted" }, "Conversations (", h("span", null, "0"), ")")
    ),
    listHost
  );

  const threadCol = h("div", { className: "hidden sm:flex flex-col flex-1 min-w-0" }, threadHost);
  const convHost = h("div", { className: "flex h-full" }, listCol, threadCol);

  const updateLabels = () => {
    const label = listCol.querySelector("p span");
    if (label) label.textContent = st.chats.length;
    const sub = root.querySelector(".page-sub");
    if (sub) sub.textContent = `${st.chats.length} active conversation${st.chats.length === 1 ? "" : "s"} with sellers and buyers.`;
    listCol.classList.toggle("hidden", st.mobileChat);
    threadCol.classList.toggle("hidden", !st.mobileChat);
  };

  const other = (c) => (c.participants || []).find((p) => String(p._id) !== String(user?._id));

  const selectChat = async (c) => {
    st.active = c;
    st.mobileChat = true;
    repaint();
    if (c._id) {
      try {
        const { data } = await api.get(`/chats/${c._id}`);
        if (!ensureAlive()) return;
        st.active = data.chat;
        repaint();
      } catch {}
    }
  };

  const avatar = (name) =>
    h(
      "span",
      {
        className: "w-10 h-10 rounded-full text-sm font-extrabold text-white flex items-center justify-center flex-none",
        style: { background: `linear-gradient(135deg, ${C.primaryLight}, ${C.primary})` },
      },
      initials(name)
    );

  const avatarSm = (name) =>
    h(
      "span",
      {
        className: "w-9 h-9 rounded-full text-xs font-extrabold text-white flex items-center justify-center flex-none",
        style: { background: `linear-gradient(135deg, ${C.primaryLight}, ${C.primary})` },
      },
      initials(name)
    );

  const paintList = () => {
    listHost.replaceChildren();
    listHost.append(
      ...st.chats.map((c) => {
        const p = other(c);
        const activeNow = st.active?._id === c._id;
        const product = c.productId;
        return h(
          "button",
          {
            key: c._id,
            type: "button",
            onClick: () => selectChat(c),
            className: `w-full text-left px-4 py-3 border-b border-line flex items-center gap-3 transition-colors ${activeNow ? "bg-primary-soft/60" : "hover:bg-raised"}`,
          },
          avatar(p?.name),
          h(
            "div",
            { className: "flex-1 min-w-0" },
            h(
              "div",
              { className: "flex items-center justify-between gap-2" },
              h("span", { className: `text-sm truncate ${activeNow ? "text-primary font-extrabold" : "text-ink-900 font-bold"}` }, p?.name || "Chat"),
              c.lastMessageAt ? h("span", { className: "text-2xs text-muted-soft flex-none" }, timeAgo(c.lastMessageAt)) : null
            ),
            h(
              "div",
              { className: "text-xs text-muted truncate mt-0.5" },
              c.lastMessage || (product ? `Regarding "${product.title}"` : "No messages yet")
            )
          ),
          activeNow ? h("span", { className: "w-1.5 h-1.5 rounded-full bg-primary flex-none" }) : null
        );
      })
    );
  };

  const send = async (e) => {
    e.preventDefault();
    if (!st.message.trim() || !st.active) return;
    const text = st.message.trim();
    try {
      await api.post(`/chats/${st.active._id}/send`, { text });
      const { data } = await api.get(`/chats/${st.active._id}`);
      if (!ensureAlive()) return;
      st.active = data.chat;
      st.chats = st.chats.map((c) =>
        c._id === st.active._id ? { ...c, lastMessage: text, lastMessageAt: new Date() } : c
      );
      st.message = "";
      st.focusComposer = true;
      repaint();
    } catch {
      // React's send swallows the failure silently.
    }
  };

  const paintThread = () => {
    threadHost.replaceChildren();
    if (!st.active) {
      threadHost.append(
        h(
          "div",
          { className: "flex-1 hidden sm:flex items-center justify-center flex-col gap-2.5 text-muted" },
          h("span", { className: "w-14 h-14 rounded-2xl bg-sunken flex items-center justify-center" }, icon("MessagesSquare", { size: 26, className: "text-muted-soft" })),
          h("p", { className: "text-sm" }, "Select a conversation")
        )
      );
      return;
    }

    const active = st.active;
    const otherUser = other(active);

    const composer = h(
      "input",
      { type: "text", className: "input-field flex-1", placeholder: "Type a message…", value: st.message, "data-composer": "true" }
    );
    composer.addEventListener("input", (e) => {
      st.message = e.target.value;
      sendBtn.disabled = !composer.value.trim();
    });

    const sendBtn = h(
      "button",
      { type: "submit", className: "btn-primary px-3.5 py-2.5 disabled:opacity-40", "aria-label": "Send message", disabled: true },
      icon("Send", { size: 16 })
    );

    const scroll = h("div", { className: "flex-1 overflow-y-auto p-5 space-y-3 bg-canvas", "data-scroll": "true" });

    const msgs = active.messages?.length === 0
      ? [h("div", { className: "h-full flex items-center justify-center text-sm text-muted" }, "Send a message to start the conversation")]
      : (active.messages || []).map((m, i) => {
          const mine = String(m.senderId) === String(user?._id);
          return h(
            "div",
            { key: i, className: `flex ${mine ? "justify-end" : "justify-start"}` },
            h(
              "div",
              {
                className: `max-w-[22rem] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  mine ? "bg-primary text-white rounded-br-md shadow-xs" : "bg-surface border border-line text-ink-800 rounded-bl-md"
                }`,
              },
              m.text,
              h("div", { className: `text-2xs mt-1 ${mine ? "text-white/65" : "text-muted-soft"}` }, timeAgo(m.timestamp))
            )
          );
        });

    scroll.append(...msgs);

    const header = h(
      "header",
      { className: "flex items-center gap-3 px-4 py-3 border-b border-line bg-raised" },
      h(
        "button",
        {
          type: "button",
          onClick: () => {
            st.mobileChat = false;
            updateLabels();
            repaint();
          },
          className: "sm:hidden text-muted hover:text-primary p-1 -ml-1 transition-colors",
          "aria-label": "Back to conversations",
        },
        icon("ChevronLeft", { size: 18 })
      ),
      avatarSm(otherUser?.name),
      h(
        "div",
        { className: "flex-1 min-w-0" },
        h("div", { className: "font-bold text-sm text-ink-900 truncate" }, otherUser?.name || "Chat"),
        active.productId
          ? h(
              "a",
              { href: `/products/${active.productId._id}`, className: "text-2xs text-primary hover:underline inline-flex items-center gap-1" },
              icon("Package", { size: 11 }),
              " ",
              active.productId.title
            )
          : null
      ),
      active.productId?.price ? h("span", { className: "badge badge-primary flex-none" }, formatINR(active.productId.price)) : null
    );

    const form = h("form", { className: "p-3 border-t border-line flex items-center gap-2 bg-surface" }, composer, sendBtn);
    form.addEventListener("submit", send);

    threadHost.append(header, scroll, form);

    // scroll to bottom, then hand focus back to the composer after a send
    requestAnimationFrame(() => {
      scroll.scrollTop = scroll.scrollHeight;
      if (st.focusComposer) {
        composer.focus();
        st.focusComposer = false;
      }
    });
  };

  const repaint = () => {
    updateLabels();
    paintList();
    paintThread();
  };

  const load = async () => {
    try {
      const { data } = await api.get("/chats");
      if (!ensureAlive()) return;
      st.chats = data.chats || [];
    } catch {}
    st.loading = false;
    if (ensureAlive()) {
      const shell = root.querySelector("[data-shell]");
      if (shell) mount(shell, convHost);
      repaint();
    }
  };

  const page = () =>
    h(
      "div",
      { className: "animate-fade-in" },
      h(
        "header",
        { className: "page-masthead" },
        h(
          "div",
          { className: "max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8" },
          h("p", { className: "page-eyebrow" }, icon("MessageCircle", { size: 13 }), " Inbox"),
          h("h1", { className: "page-title" }, "Messages"),
          h("p", { className: "page-sub" }, "0 active conversations with sellers and buyers.")
        )
      ),
      h(
        "div",
        { className: "max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 pb-8" },
        h(
          "div",
          { className: "rounded-2xl border border-line bg-surface shadow-card overflow-hidden", style: { height: "72vh" }, "data-shell": "true" },
          h("div", { className: "flex h-full items-center justify-center text-sm text-muted" }, "Loading conversations…")
        )
      )
    );

  if (!user) {
    mount(
      root,
      h(
        "div",
        { className: "page-container animate-fade-in" },
        h(
          "div",
          { className: "panel" },
          EmptyState({
            iconName: "MessageCircle",
            title: "Sign in to see your messages",
            description: "Chats with sellers and buyers live here once you're logged in.",
            action: h("a", { href: "/login", className: "btn-primary" }, "Sign in"),
          })
        )
      )
    );
    return root;
  }

  mount(root, page());
  convHost;
  load();

  return root;
}