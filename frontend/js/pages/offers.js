import { h, mount } from "../dom.js";
import { icon } from "../icons.js";
import api from "../services/api.js";
import toast from "../toast.js";
import EmptyState from "../components/empty-state.js";
import { formatINR, timeAgo } from "../utils/format.js";
import { orderTone } from "../utils/theme.js";
import { imageProps } from "../utils/images.js";

/**
 * Offers & Negotiations.
 *
 * Ported from the React build's Offers.jsx. Two tabs (sent / incoming) each
 * backed by their own endpoint, a counter offer flow that PUTs a status to
 * /offers/:id/respond and patches the row in place, and the status-aware
 * action footers (accept / reject / counter / create order / waiting dots).
 *
 * All mutation results update `st.sent` / `st.incoming` directly and repaint
 * just the offer list, which keeps the counters, tone badges and round
 * numbers in sync. Handlers are element props (ProductDetail pattern) and the
 * counter input uses the same native addEventListener("input") binding that
 * the offer modal uses.
 */

export default function Offers() {
  const st = { tab: "sent", sent: [], incoming: [], loading: true, counteringId: null, counterValue: "" };

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

  const bodyHost = h("div", { className: "max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8" });
  const sentCountHost = h("span", null, "0");
  const incomingCountHost = h("span", null, "0");
  const sentBtn = h("button", { type: "button" }, "Sent (", sentCountHost, ")");
  const incomingBtn = h("button", { type: "button" }, "Incoming (", incomingCountHost, ")");
  const tabHost = h("div", { className: "flex gap-1 bg-sunken p-1 rounded-xl w-fit" }, sentBtn, incomingBtn);

  const paintHeader = () => {
    sentCountHost.textContent = st.sent.length;
    const pendingIncoming = st.incoming.filter((o) => o.status === "pending" || o.status === "countered").length;
    incomingCountHost.textContent = pendingIncoming;
    const active = st.tab;
    sentBtn.className = `chip border-0 ${active === "sent" ? "bg-white text-primary shadow-xs" : "text-muted hover:text-ink-900"}`;
    incomingBtn.className = `chip border-0 ${active === "incoming" ? "bg-white text-primary shadow-xs" : "text-muted hover:text-ink-900"}`;
  };

  const load = async () => {
    const [s, i] = await Promise.all([
      api.get("/offers/my").catch(() => ({ data: { offers: [] } })),
      api.get("/offers/incoming").catch(() => ({ data: { offers: [] } })),
    ]);
    if (!ensureAlive()) return;
    st.sent = s.data.offers || [];
    st.incoming = i.data.offers || [];
    st.loading = false;
    paintHeader();
    mount(bodyHost, bodyContent());
  };

  const respond = async (id, status, counterAmount) => {
    try {
      const body = { status };
      if (counterAmount) body.counterAmount = Number(counterAmount);
      await api.put(`/offers/${id}/respond`, body);
      toast.success(
        status === "accepted"
          ? "Offer accepted — create the order to confirm"
          : status === "countered"
            ? "Counter-offer sent"
            : "Offer rejected"
      );
      st.incoming = st.incoming.map((o) =>
        o._id === id
          ? { ...o, status, ...(counterAmount ? { counterAmount: Number(counterAmount), rounds: (o.rounds || 1) + 1 } : {}) }
          : o
      );
      st.counteringId = null;
      st.counterValue = "";
      paintHeader();
      mount(bodyHost, bodyContent());
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed");
    }
  };

  const startCounter = (o) => {
    st.counteringId = o._id;
    st.counterValue = o.counterAmount ? String(o.counterAmount) : "";
    mount(bodyHost, bodyContent());
  };

  const offerCard = (o) => {
    const actionable = st.tab === "incoming" && (o.status === "pending" || o.status === "countered");
    const buyerCountered = st.tab === "sent" && o.status === "countered";
    const isCountering = st.counteringId === o._id;

    const counterInput = h("input", {
      type: "number",
      value: st.counterValue,
      className: "input-field !w-44",
      placeholder: `Offer below ${formatINR(o.listedPrice || 0)}`,
      autofocus: "",
    });
    counterInput.addEventListener("input", (e) => {
      st.counterValue = e.target.value;
    });

    return h(
      "article",
      { key: o._id, className: "card p-4 card-hover" },
      h(
        "div",
        { className: "flex items-center gap-3" },
        h(
          "a",
          { href: `/products/${o.productId?._id}`, className: "w-14 h-14 rounded-xl bg-sunken overflow-hidden flex-none block" },
          h("img", { ...imageProps(o.productId), alt: o.productId?.title || "", className: "w-full h-full object-cover" })
        ),
        h(
          "div",
          { className: "flex-1 min-w-0" },
          h(
            "a",
            { href: `/products/${o.productId?._id}`, className: "font-bold text-sm text-ink-900 hover:text-primary line-clamp-1 transition-colors" },
            o.productId?.title || "Product"
          ),
          h(
            "div",
            { className: "flex items-center flex-wrap gap-x-2 gap-y-1 text-2xs text-muted mt-1" },
            h("span", null, "Listed ", formatINR(o.listedPrice || 0)),
            h("span", null, "·"),
            h("span", null, timeAgo(o.createdAt)),
            h("span", null, "·"),
            h("span", null, `${o.rounds} ${o.rounds === 1 ? "round" : "rounds"}`)
          )
        ),
        h(
          "span",
          { className: `badge ${orderTone(o.status)} capitalize flex-none` },
          o.status,
          o.status === "accepted" ? icon("CheckCircle2", { size: 11, className: "ml-1" }) : null
        )
      ),
      h(
        "div",
        { className: "flex items-end gap-3 mt-4 flex-wrap" },
        h(
          "div",
          { className: "bg-primary-soft border border-brand-200 rounded-xl px-3 py-2" },
          h("span", { className: "text-2xs uppercase tracking-[0.1em] text-primary/70 font-bold" }, st.tab === "incoming" ? "Buyer offer" : "Your offer"),
          h("p", { className: "font-extrabold text-ink-900 tabular" }, formatINR(o.offerAmount || 0))
        ),
        o.counterAmount
          ? h(
              "div",
              { className: "bg-warning-soft border border-warning/20 rounded-xl px-3 py-2" },
              h("span", { className: "text-2xs uppercase tracking-[0.1em] text-warning/80 font-bold" }, st.tab === "incoming" ? "Your counter" : "Seller counter"),
              h("p", { className: "font-extrabold text-ink-900 tabular" }, formatINR(o.counterAmount))
            )
          : null,
        o.finalPrice
          ? h(
              "div",
              { className: "bg-success-soft border border-success/20 rounded-xl px-3 py-2" },
              h("span", { className: "text-2xs uppercase tracking-[0.1em] text-success/80 font-bold" }, "Final price"),
              h("p", { className: "font-extrabold text-ink-900 tabular" }, formatINR(o.finalPrice))
            )
          : null,
        o.notes ? h("span", { className: "text-xs text-muted italic pb-1" }, `\u201c${o.notes}\u201d`) : null
      ),
      actionable
        ? [
            h(
              "div",
              { className: "mt-3.5 pt-3.5 border-t border-line flex items-center gap-2 flex-wrap" },
              h("button", { type: "button", onClick: () => respond(o._id, "accepted"), className: "btn-success btn-sm" }, icon("CheckCircle2", { size: 13 }), " Accept"),
              h("button", { type: "button", onClick: () => respond(o._id, "rejected"), className: "btn-danger btn-sm" }, icon("XCircle", { size: 13 }), " Reject"),
              h(
                "button",
                {
                  type: "button",
                  onClick: () => (isCountering ? ((st.counteringId = null), (st.counterValue = ""), mount(bodyHost, bodyContent())) : startCounter(o)),
                  className: "btn-secondary btn-sm",
                },
                icon("RefreshCcw", { size: 13 }),
                isCountering ? " Cancel counter" : " Counter"
              )
            ),
            isCountering
              ? h(
                  "div",
                  { className: "mt-3 flex items-center gap-2 flex-wrap" },
                  counterInput,
                  h(
                    "button",
                    {
                      type: "button",
                      onClick: () => {
                        if (Number(st.counterValue) > 0) respond(o._id, "countered", st.counterValue);
                        else toast.error("Enter a valid amount");
                      },
                      className: "btn-primary btn-sm",
                    },
                    "Send counter"
                  ),
                  h("span", { className: "text-2xs text-muted" }, `Round ${o.rounds + 1} of negotiation`)
                )
              : null,
          ]
        : null,
      buyerCountered
        ? h(
            "div",
            { className: "mt-3.5 pt-3.5 border-t border-line flex flex-wrap items-center gap-3" },
            h(
              "span",
              { className: "text-sm text-ink-600" },
              "The seller countered at ",
              h("b", { className: "text-warning" }, formatINR(o.counterAmount)),
              ". You can bring it to checkout at that price, or chat with the seller to push further."
            ),
            h("a", { href: `/products/${o.productId?._id}?offer=${o._id}`, className: "btn-accent btn-sm" }, icon("ArrowRight", { size: 13 }), " Review & checkout")
          )
        : null,
      st.tab === "sent" && o.status === "pending"
        ? h(
            "div",
            { className: "mt-3.5 pt-3.5 border-t border-line text-xs text-muted flex items-center gap-2" },
            "Waiting for the seller to respond",
            h("span", { className: "w-1.5 h-1.5 rounded-full bg-warning animate-pulse inline-block" })
          )
        : null,
      o.status === "accepted"
        ? h(
            "div",
            { className: "mt-3.5 pt-3.5 border-t border-line flex items-center gap-3 flex-wrap" },
            h("span", { className: "text-sm text-ink-600" }, "Agreed at ", h("b", { className: "text-ink-900" }, formatINR(o.finalPrice || o.offerAmount)), " — lock it in:"),
            h("a", { href: `/products/${o.productId?._id}?offer=${o._id}`, className: "btn-accent btn-sm" }, icon("Sparkles", { size: 13 }), " Create order")
          )
        : null,
      o.status === "pending" && st.tab === "incoming"
        ? h(
            "p",
            { className: "mt-3 pt-3 border-t border-line text-2xs text-muted flex items-center gap-1.5" },
            icon("Hourglass", { size: 11 }),
            " Waiting on your response"
          )
        : null
    );
  };

  const bodyContent = () => {
    const offers = st.tab === "sent" ? st.sent : st.incoming;
    if (st.loading) {
      return h(
        "div",
        { className: "space-y-3" },
        ...Array.from({ length: 3 }, () => h("div", { className: "h-32 bg-sunken rounded-2xl animate-pulse" }))
      );
    }
    if (offers.length === 0) {
      return h(
        "div",
        { className: "panel" },
        EmptyState({
          iconName: "Tag",
          title: st.tab === "sent" ? "No offers sent yet" : "No incoming offers",
          description:
            st.tab === "sent"
              ? "Make an offer on any product and negotiate the best price."
              : "Buyer offers on your listings will appear here.",
          action: h("a", { href: "/products", className: "btn-primary" }, "Browse products"),
        })
      );
    }
    return h("div", { className: "space-y-3" }, ...offers.map(offerCard));
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
          h(
            "div",
            { className: "flex flex-wrap items-end justify-between gap-3" },
            h(
              "div",
              null,
              h("p", { className: "page-eyebrow" }, icon("Tag", { size: 13 }), " Negotiation desk"),
              h("h1", { className: "page-title" }, "Offers & Negotiations"),
              h("p", { className: "page-sub" }, "Counter-offers, acceptances and the final price you locked in.")
            ),
            tabHost
          )
        )
      ),
      bodyHost
    );

  const switchTab = (tab) => {
    if (st.tab === tab) return;
    st.tab = tab;
    st.counteringId = null;
    st.counterValue = "";
    paintHeader();
    mount(bodyHost, bodyContent());
  };

  sentBtn.onclick = () => switchTab("sent");
  incomingBtn.onclick = () => switchTab("incoming");
  cleanups.push(() => {
    sentBtn.onclick = null;
    incomingBtn.onclick = null;
  });

  // loading skeleton first
  mount(root, page());
  mount(bodyHost, bodyContent());

  load();

  return root;
}