import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { MessageCircle, Send, Package, ChevronLeft, MessagesSquare } from "lucide-react";
import api from "../services/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import EmptyState from "../components/EmptyState.jsx";
import { formatINR, initials, timeAgo } from "../utils/format.js";
import { C } from "../utils/theme.js";

export default function Messages() {
  const { user } = useAuth();
  const [chats, setChats] = useState([]);
  const [active, setActive] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [mobileChat, setMobileChat] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    api
      .get("/chats")
      .then(({ data }) => {
        setChats(data.chats || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (active?._id) {
      api.get(`/chats/${active._id}`).then(({ data }) => setActive(data.chat));
    }
  }, [active?._id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [active?.messages?.length]);

  const other = (c) => (c.participants || []).find((p) => String(p._id) !== String(user?._id));

  const send = async (e) => {
    e.preventDefault();
    if (!message.trim() || !active) return;
    try {
      await api.post(`/chats/${active._id}/send`, { text: message.trim() });
      const { data } = await api.get(`/chats/${active._id}`);
      setActive(data.chat);
      setChats((prev) =>
        prev.map((c) =>
          c._id === active._id
            ? { ...c, lastMessage: message.trim(), lastMessageAt: new Date() }
            : c
        )
      );
      setMessage("");
    } catch {}
  };

  if (loading)
    return (
      <div className="page-container">
        <div className="h-8 w-1/4 bg-sunken rounded-lg animate-pulse mb-6" />
        <div className="h-[70vh] bg-sunken rounded-2xl animate-pulse" />
      </div>
    );

  if (chats.length === 0) {
    return (
      <div className="page-container animate-fade-in">
        <div className="panel">
          <EmptyState
            icon={MessageCircle}
            title="No conversations yet"
            description="Start chatting with sellers straight from any product page — ask about condition, delivery or price."
            action={
              <Link to="/products" className="btn-primary">
                Browse products
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  const otherUser = active ? other(active) : null;

  return (
    <div className="animate-fade-in">
      <header className="page-masthead">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <p className="page-eyebrow">
            <MessageCircle size={13} /> Inbox
          </p>
          <h1 className="page-title">Messages</h1>
          <p className="page-sub">
            {chats.length} active conversation{chats.length === 1 ? "" : "s"} with sellers and buyers.
          </p>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        <div
          className="rounded-2xl border border-line bg-surface shadow-card overflow-hidden"
          style={{ height: "72vh" }}
        >
          <div className="flex h-full">
            {/* ============ THREAD LIST ============ */}
            <div
              className={`${mobileChat ? "hidden" : "flex"} w-full sm:flex sm:w-80 flex-col border-r border-line flex-none`}
            >
              <div className="px-4 py-3.5 border-b border-line bg-raised">
                <p className="text-2xs font-bold uppercase tracking-[0.14em] text-muted">
                  Conversations ({chats.length})
                </p>
              </div>
              <div className="overflow-y-auto flex-1">
                {chats.map((c) => {
                  const p = other(c);
                  const activeNow = active?._id === c._id;
                  const product = c.productId;
                  return (
                    <button
                      key={c._id}
                      onClick={() => {
                        setActive(c);
                        setMobileChat(true);
                      }}
                      className={`w-full text-left px-4 py-3 border-b border-line flex items-center gap-3 transition-colors ${
                        activeNow ? "bg-primary-soft/60" : "hover:bg-raised"
                      }`}
                    >
                      <span
                        className="w-10 h-10 rounded-full text-sm font-extrabold text-white flex items-center justify-center flex-none"
                        style={{ background: `linear-gradient(135deg, ${C.primaryLight}, ${C.primary})` }}
                      >
                        {initials(p?.name)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-sm truncate ${activeNow ? "text-primary font-extrabold" : "text-ink-900 font-bold"}`}>
                            {p?.name || "Chat"}
                          </span>
                          {c.lastMessageAt && (
                            <span className="text-2xs text-muted-soft flex-none">{timeAgo(c.lastMessageAt)}</span>
                          )}
                        </div>
                        <div className="text-xs text-muted truncate mt-0.5">
                          {c.lastMessage || (product ? `Regarding "${product.title}"` : "No messages yet")}
                        </div>
                      </div>
                      {activeNow && <span className="w-1.5 h-1.5 rounded-full bg-primary flex-none" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ============ THREAD ============ */}
            <div className={`${mobileChat ? "flex" : "hidden"} sm:flex flex-1 flex-col min-w-0`}>
              {active ? (
                <>
                  <header className="flex items-center gap-3 px-4 py-3 border-b border-line bg-raised">
                    <button
                      onClick={() => setMobileChat(false)}
                      className="sm:hidden text-muted hover:text-primary p-1 -ml-1 transition-colors"
                      aria-label="Back to conversations"
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <span
                      className="w-9 h-9 rounded-full text-xs font-extrabold text-white flex items-center justify-center flex-none"
                      style={{ background: `linear-gradient(135deg, ${C.primaryLight}, ${C.primary})` }}
                    >
                      {initials(otherUser?.name)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm text-ink-900 truncate">{otherUser?.name || "Chat"}</div>
                      {active.productId && (
                        <Link
                          to={`/products/${active.productId._id}`}
                          className="text-2xs text-primary hover:underline inline-flex items-center gap-1"
                        >
                          <Package size={11} /> {active.productId.title}
                        </Link>
                      )}
                    </div>
                    {active.productId?.price && (
                      <span className="badge badge-primary flex-none">
                        {formatINR(active.productId.price)}
                      </span>
                    )}
                  </header>

                  <div
                    ref={scrollRef}
                    className="flex-1 overflow-y-auto p-5 space-y-3 bg-canvas"
                  >
                    {active.messages?.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-sm text-muted">
                        Send a message to start the conversation
                      </div>
                    ) : (
                      active.messages?.map((m, i) => {
                        const mine = String(m.senderId) === String(user?._id);
                        return (
                          <div key={i} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                            <div
                              className={`max-w-[22rem] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                                mine
                                  ? "bg-primary text-white rounded-br-md shadow-xs"
                                  : "bg-surface border border-line text-ink-800 rounded-bl-md"
                              }`}
                            >
                              {m.text}
                              <div className={`text-2xs mt-1 ${mine ? "text-white/65" : "text-muted-soft"}`}>
                                {timeAgo(m.timestamp)}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <form onSubmit={send} className="p-3 border-t border-line flex items-center gap-2 bg-surface">
                    <input
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      className="input-field flex-1"
                      placeholder="Type a message…"
                    />
                    <button
                      type="submit"
                      disabled={!message.trim()}
                      className="btn-primary px-3.5 py-2.5 disabled:opacity-40"
                      aria-label="Send message"
                    >
                      <Send size={16} />
                    </button>
                  </form>
                </>
              ) : (
                <div className="flex-1 hidden sm:flex items-center justify-center flex-col gap-2.5 text-muted">
                  <span className="w-14 h-14 rounded-2xl bg-sunken flex items-center justify-center">
                    <MessagesSquare size={26} className="text-muted-soft" />
                  </span>
                  <p className="text-sm">Select a conversation</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
