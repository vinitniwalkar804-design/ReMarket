import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Bell, Check, Tag, ShoppingBag, MessageCircle, TrendingDown, ChevronRight, Inbox } from "lucide-react";
import api from "../services/api.js";
import EmptyState from "../components/EmptyState.jsx";
import { timeAgo } from "../utils/format.js";

const typeMeta = {
  offer: { icon: Tag, cls: "bg-info-soft text-info", label: "Offers & negotiations" },
  order: { icon: ShoppingBag, cls: "bg-success-soft text-success", label: "Orders & delivery" },
  chat: { icon: MessageCircle, cls: "bg-primary-soft text-primary", label: "Messages" },
  price: { icon: TrendingDown, cls: "bg-warning-soft text-warning", label: "Price drops & savings" },
};

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/notifications")
      .then(({ data }) => {
        setNotifications(data.notifications || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const markAll = async () => {
    try {
      await api.post("/notifications/read");
      setNotifications((n) => n.map((x) => ({ ...x, read: true })));
    } catch {}
  };

  if (loading)
    return (
      <div className="page-container">
        <div className="h-8 w-1/4 bg-sunken rounded-lg animate-pulse mb-6" />
        {Array(4).fill(0).map((_, i) => (
          <div key={i} className="h-20 bg-sunken rounded-2xl animate-pulse mb-2" />
        ))}
      </div>
    );

  const unread = notifications.filter((n) => !n.read).length;
  const grouped = Object.keys(typeMeta)
    .map((type) => ({ type, ...typeMeta[type], items: notifications.filter((n) => n.type === type) }))
    .filter((g) => g.items.length > 0);
  const other = notifications.filter((n) => !typeMeta[n.type]);

  const NotificationRow = ({ n, to }) => {
    const body = (
      <>
        <div className="flex-1 min-w-0">
          <div className={`text-sm ${n.read ? "font-bold text-ink-900" : "font-extrabold text-ink-900"}`}>
            {n.title}
          </div>
          {n.message && <div className="text-xs text-muted mt-0.5 leading-relaxed">{n.message}</div>}
          <div className="text-2xs text-muted-soft mt-1.5 font-semibold">{timeAgo(n.createdAt)}</div>
        </div>
        {!n.read && <span className="w-2 h-2 rounded-full bg-primary flex-none mt-2" />}
        {to && <ChevronRight size={15} className="text-muted-soft flex-none mt-0.5" />}
      </>
    );

    const cls = `card p-4 flex items-start gap-3 transition-all ${
      n.read ? "" : "border-brand-200 bg-primary-soft/40"
    }`;

    return to ? (
      <Link to={to} className={`${cls} card-hover`}>
        {body}
      </Link>
    ) : (
      <div className={cls}>{body}</div>
    );
  };

  return (
    <div className="animate-fade-in">
      <header className="page-masthead">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="page-eyebrow">
                <Bell size={13} /> Alerts
              </p>
              <div className="flex items-center gap-2.5">
                <h1 className="page-title">Notifications</h1>
                {unread > 0 && <span className="badge badge-primary">{unread} new</span>}
              </div>
              <p className="page-sub">
                {unread > 0 ? `${unread} unread` : "You're all caught up"}
              </p>
            </div>
            {unread > 0 && (
              <button onClick={markAll} className="btn-secondary btn-sm flex-none">
                <Check size={14} /> Mark all read
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        {notifications.length === 0 ? (
          <div className="panel">
            <EmptyState
              icon={Bell}
              title="You're all caught up"
              description="Offer updates, order alerts and price drops will land here."
            />
          </div>
        ) : (
          <div className="space-y-8">
            {grouped.map((g) => {
              const Icon = g.icon;
              const groupUnread = g.items.filter((n) => !n.read).length;
              return (
                <section key={g.type}>
                  <div className="flex items-center gap-2.5 mb-3">
                    <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${g.cls}`}>
                      <Icon size={14} />
                    </span>
                    <h2 className="text-sm font-extrabold text-ink-900">{g.label}</h2>
                    {groupUnread > 0 && <span className="badge badge-primary">{groupUnread}</span>}
                  </div>
                  <div className="space-y-2">
                    {g.items.map((n) => (
                      <NotificationRow key={n._id} n={n} to={n.link || null} />
                    ))}
                  </div>
                </section>
              );
            })}

            {other.length > 0 && (
              <section>
                <div className="flex items-center gap-2.5 mb-3">
                  <span className="w-7 h-7 rounded-lg bg-sunken text-muted flex items-center justify-center">
                    <Inbox size={14} />
                  </span>
                  <h2 className="text-sm font-extrabold text-ink-900">Everything else</h2>
                </div>
                <div className="space-y-2">
                  {other.map((n) => (
                    <NotificationRow key={n._id} n={n} to={null} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
