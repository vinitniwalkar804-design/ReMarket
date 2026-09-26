import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Tag, CheckCircle2, XCircle, ArrowRight, RefreshCcw, Hourglass, Sparkles } from "lucide-react";
import api from "../services/api.js";
import toast from "react-hot-toast";
import EmptyState from "../components/EmptyState.jsx";
import { formatINR, timeAgo } from "../utils/format.js";
import { orderTone } from "../utils/theme.js";
import { imageProps } from "../utils/images.js";

export default function Offers() {
  const [tab, setTab] = useState("sent");
  const [sent, setSent] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [loading, setLoading] = useState(true);
  const [counteringId, setCounteringId] = useState(null);
  const [counterValue, setCounterValue] = useState("");

  useEffect(() => {
    Promise.all([
      api.get("/offers/my").catch(() => ({ data: { offers: [] } })),
      api.get("/offers/incoming").catch(() => ({ data: { offers: [] } })),
    ]).then(([s, i]) => {
      setSent(s.data.offers);
      setIncoming(i.data.offers);
      setLoading(false);
    });
  }, []);

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
      setIncoming((prev) =>
        prev.map((o) =>
          o._id === id
            ? { ...o, status, ...(counterAmount ? { counterAmount: Number(counterAmount), rounds: (o.rounds || 1) + 1 } : {}) }
            : o
        )
      );
      setCounteringId(null);
      setCounterValue("");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed");
    }
  };

  const startCounter = (o) => {
    setCounteringId(o._id);
    setCounterValue(o.counterAmount ? String(o.counterAmount) : "");
  };

  if (loading)
    return (
      <div className="page-container">
        <div className="h-8 w-1/4 bg-sunken rounded-lg animate-pulse mb-6" />
        {Array(3).fill(0).map((_, i) => (
          <div key={i} className="h-32 bg-sunken rounded-2xl animate-pulse mb-3" />
        ))}
      </div>
    );

  const offers = tab === "sent" ? sent : incoming;
  const pendingIncoming = incoming.filter((o) => o.status === "pending" || o.status === "countered").length;

  return (
    <div className="animate-fade-in">
      <header className="page-masthead">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="page-eyebrow">
                <Tag size={13} /> Negotiation desk
              </p>
              <h1 className="page-title">Offers & Negotiations</h1>
              <p className="page-sub">
                Counter-offers, acceptances and the final price you locked in.
              </p>
            </div>
            <div className="flex gap-1 bg-sunken p-1 rounded-xl w-fit">
              <button
                onClick={() => setTab("sent")}
                className={`chip border-0 ${tab === "sent" ? "bg-white text-primary shadow-xs" : "text-muted hover:text-ink-900"}`}
              >
                Sent ({sent.length})
              </button>
              <button
                onClick={() => setTab("incoming")}
                className={`chip border-0 ${tab === "incoming" ? "bg-white text-primary shadow-xs" : "text-muted hover:text-ink-900"}`}
              >
                Incoming ({pendingIncoming})
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {offers.length === 0 ? (
          <div className="panel">
            <EmptyState
              icon={Tag}
              title={tab === "sent" ? "No offers sent yet" : "No incoming offers"}
              description={
                tab === "sent"
                  ? "Make an offer on any product and negotiate the best price."
                  : "Buyer offers on your listings will appear here."
              }
              action={
                <Link to="/products" className="btn-primary">
                  Browse products
                </Link>
              }
            />
          </div>
        ) : (
          <div className="space-y-3">
            {offers.map((o) => {
              const actionable = tab === "incoming" && (o.status === "pending" || o.status === "countered");
              const buyerCountered = tab === "sent" && o.status === "countered";
              const isCountering = counteringId === o._id;
              return (
                <article key={o._id} className="card p-4 card-hover">
                  <div className="flex items-center gap-3">
                    <Link
                      to={`/products/${o.productId?._id}`}
                      className="w-14 h-14 rounded-xl bg-sunken overflow-hidden flex-none"
                    >
                      <img
                        alt={o.productId?.title || ""}
                        {...imageProps(o.productId)}
                        className="w-full h-full object-cover"
                      />
                    </Link>

                    <div className="flex-1 min-w-0">
                      <Link
                        to={`/products/${o.productId?._id}`}
                        className="font-bold text-sm text-ink-900 hover:text-primary line-clamp-1 transition-colors"
                      >
                        {o.productId?.title || "Product"}
                      </Link>
                      <div className="flex items-center flex-wrap gap-x-2 gap-y-1 text-2xs text-muted mt-1">
                        <span>Listed {formatINR(o.listedPrice || 0)}</span>
                        <span>·</span>
                        <span>{timeAgo(o.createdAt)}</span>
                        <span>·</span>
                        <span>
                          {o.rounds} {o.rounds === 1 ? "round" : "rounds"}
                        </span>
                      </div>
                    </div>

                    <span className={`badge ${orderTone(o.status)} capitalize flex-none`}>
                      {o.status}
                      {o.status === "accepted" && <CheckCircle2 size={11} className="ml-1" />}
                    </span>
                  </div>

                  <div className="flex items-end gap-3 mt-4 flex-wrap">
                    <div className="bg-primary-soft border border-brand-200 rounded-xl px-3 py-2">
                      <span className="text-2xs uppercase tracking-[0.1em] text-primary/70 font-bold">
                        {tab === "incoming" ? "Buyer offer" : "Your offer"}
                      </span>
                      <p className="font-extrabold text-ink-900 tabular">{formatINR(o.offerAmount || 0)}</p>
                    </div>
                    {o.counterAmount && (
                      <div className="bg-warning-soft border border-warning/20 rounded-xl px-3 py-2">
                        <span className="text-2xs uppercase tracking-[0.1em] text-warning/80 font-bold">
                          {tab === "incoming" ? "Your counter" : "Seller counter"}
                        </span>
                        <p className="font-extrabold text-ink-900 tabular">{formatINR(o.counterAmount)}</p>
                      </div>
                    )}
                    {o.finalPrice && (
                      <div className="bg-success-soft border border-success/20 rounded-xl px-3 py-2">
                        <span className="text-2xs uppercase tracking-[0.1em] text-success/80 font-bold">Final price</span>
                        <p className="font-extrabold text-ink-900 tabular">{formatINR(o.finalPrice)}</p>
                      </div>
                    )}
                    {o.notes && <span className="text-xs text-muted italic pb-1">“{o.notes}”</span>}
                  </div>

                  {actionable && (
                    <>
                      <div className="mt-3.5 pt-3.5 border-t border-line flex items-center gap-2 flex-wrap">
                        <button onClick={() => respond(o._id, "accepted")} className="btn-success btn-sm">
                          <CheckCircle2 size={13} /> Accept
                        </button>
                        <button onClick={() => respond(o._id, "rejected")} className="btn-danger btn-sm">
                          <XCircle size={13} /> Reject
                        </button>
                        <button
                          onClick={() => (isCountering ? setCounteringId(null) : startCounter(o))}
                          className="btn-secondary btn-sm"
                        >
                          <RefreshCcw size={13} /> {isCountering ? "Cancel counter" : "Counter"}
                        </button>
                      </div>
                      {isCountering && (
                        <div className="mt-3 flex items-center gap-2 flex-wrap">
                          <input
                            type="number"
                            value={counterValue}
                            onChange={(e) => setCounterValue(e.target.value)}
                            className="input-field !w-44"
                            placeholder={`Offer below ${formatINR(o.listedPrice || 0)}`}
                            autoFocus
                          />
                          <button
                            onClick={() => {
                              if (Number(counterValue) > 0) respond(o._id, "countered", counterValue);
                              else toast.error("Enter a valid amount");
                            }}
                            className="btn-primary btn-sm"
                          >
                            Send counter
                          </button>
                          <span className="text-2xs text-muted">Round {o.rounds + 1} of negotiation</span>
                        </div>
                      )}
                    </>
                  )}

                  {buyerCountered && (
                    <div className="mt-3.5 pt-3.5 border-t border-line flex flex-wrap items-center gap-3">
                      <span className="text-sm text-ink-600">
                        The seller countered at <b className="text-warning">{formatINR(o.counterAmount)}</b>. You
                        can bring it to checkout at that price, or chat with the seller to push further.
                      </span>
                      <Link to={`/products/${o.productId?._id}?offer=${o._id}`} className="btn-accent btn-sm">
                        <ArrowRight size={13} /> Review & checkout
                      </Link>
                    </div>
                  )}

                  {tab === "sent" && o.status === "pending" && (
                    <div className="mt-3.5 pt-3.5 border-t border-line text-xs text-muted flex items-center gap-2">
                      Waiting for the seller to respond
                      <span className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse inline-block" />
                    </div>
                  )}

                  {o.status === "accepted" && (
                    <div className="mt-3.5 pt-3.5 border-t border-line flex items-center gap-3 flex-wrap">
                      <span className="text-sm text-ink-600">
                        Agreed at <b className="text-ink-900">{formatINR(o.finalPrice || o.offerAmount)}</b> — lock
                        it in:
                      </span>
                      <Link to={`/products/${o.productId?._id}?offer=${o._id}`} className="btn-accent btn-sm">
                        <Sparkles size={13} /> Create order
                      </Link>
                    </div>
                  )}

                  {o.status === "pending" && tab === "incoming" && (
                    <p className="mt-3 pt-3 border-t border-line text-2xs text-muted flex items-center gap-1.5">
                      <Hourglass size={11} /> Waiting on your response
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
