/**
 * Admin console — customer journey.
 *
 * Vanilla port of `pages/admin/AdminJourney.jsx`.
 *
 * Reads `/admin/journey` once: a stage-by-stage conversion funnel across all
 * users, the latest behavior events, and three always-on funnel insights whose
 * framing ("Behavior first, analytics second") is the page's own honest claim.
 */
import { h, mount } from "../../dom.js";
import { icon } from "../../icons.js";
import api from "../../services/api.js";
import { timeAgo, formatNumber } from "../../utils/format.js";

const InsightTones = {
  primary: "border-brand-200 bg-primary-soft text-primary",
  accent: "border-accent/25 bg-accent-soft text-accent",
  success: "border-success/25 bg-success-soft text-success",
  danger: "border-danger/25 bg-danger-soft text-danger",
};

function Insight({ icon: IconName, tone = "primary", title, body }) {
  return h(
    "div",
    { className: `flex items-start gap-3 rounded-xl border p-4 ${InsightTones[tone]}` },
    icon(IconName, { size: 15, className: "mt-0.5 flex-none" }),
    h(
      "div",
      null,
      h("p", { className: "text-sm font-bold text-ink-900" }, title),
      h("p", { className: "text-xs text-muted mt-1 leading-relaxed" }, body)
    )
  );
}

export default function AdminJourney() {
  const st = { data: null, loading: true };
  let disposed = false;

  const root = h("div", { className: "animate-fade-in space-y-5" });
  const contentHost = h("div");
  root.appendChild(contentHost);

  function ensureAlive() {
    if (root.isConnected) return true;
    if (!disposed) {
      disposed = true;
    }
    return false;
  }

  const observer = new MutationObserver(() => {
    if (!ensureAlive()) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  api
    .get("/admin/journey")
    .then(({ data }) => {
      if (!ensureAlive()) return;
      st.data = data;
      st.loading = false;
      paint();
    })
    .catch(() => {
      if (!ensureAlive()) return;
      st.loading = false;
      paint();
    });

  const paint = () => {
    if (st.loading) {
      mount(
        contentHost,
        h(
          "div",
          { className: "animate-fade-in space-y-5" },
          h("div", { className: "h-9 w-64 bg-sunken rounded-lg animate-pulse" }),
          h("div", { className: "h-64 rounded-2xl bg-sunken animate-pulse" }),
          h(
            "div",
            { className: "space-y-3" },
            [0, 1, 2, 3, 4].map(() => h("div", { className: "h-14 rounded-2xl bg-sunken animate-pulse" }))
          )
        )
      );
      return;
    }

    const funnel = st.data?.funnel || [];
    const maxCount = Math.max(1, ...funnel.map((f) => f.count));
    const recent = st.data?.recentEvents || [];
    const overall = funnel.length
      ? ((funnel[funnel.length - 1]?.count || 0) / Math.max(1, funnel[0]?.count || 1)) * 100
      : 0;

    const insights = [];
    if (funnel.length > 1) {
      insights.push(
        Insight({
          icon: overall < 5 ? "TrendingDown" : "TrendingUp",
          tone: overall < 5 ? "danger" : "success",
          title: overall < 5 ? "Big drop between discovery and conversion" : "Healthy discovery-to-purchase rate",
          body: `${funnel[0].stage.toLowerCase()} events (${formatNumber(funnel[0].count)}) flow through ${funnel.length} stages to purchase (${formatNumber(funnel[funnel.length - 1].count)}). Re-check product page CTA placements if the biggest drop sits between Compare and Cart.`,
        })
      );
    }
    if (st.data?.journeys > 0) {
      insights.push(
        Insight({
          icon: "Users",
          tone: "primary",
          title: `${formatNumber(st.data.journeys)} distinct buyer journeys`,
          body: "Each journey is grouped per user from their first to last recorded event — used to power feature engineering and cluster assignment.",
        })
      );
    }
    insights.push(
      Insight({
        icon: "Activity",
        tone: "accent",
        title: "Behavior first, analytics second",
        body: "Every number here is computed on-the-fly from BehaviorEvent, Order, Offer, Wishlist and PriceWatch documents — nothing hardcoded.",
      })
    );

    mount(
      contentHost,
      h(
        "div",
        { className: "animate-fade-in space-y-5" },
        h(
          "header",
          null,
          h("span", { className: "page-eyebrow" }, icon("Route", { size: 12 }), " Behaviour analytics"),
          h("h1", { className: "page-title" }, "Customer journey"),
          h("p", { className: "page-sub" }, "Every stage computed live from stored behavior events — not guesses.")
        ),
        h(
          "section",
          { className: "panel" },
          h(
            "div",
            { className: "panel-head" },
            h(
              "div",
              { className: "flex items-center gap-2.5" },
              icon("ZoomIn", { size: 16, className: "text-primary" }),
              h(
                "div",
                null,
                h("h2", { className: "panel-title" }, "Conversion funnel"),
                h("p", { className: "panel-sub" }, "Stage-by-stage drop-off across all users")
              )
            ),
            h(
              "div",
              { className: "flex items-center gap-5" },
              h(
                "div",
                { className: "text-right hidden sm:block" },
                h("span", { className: "text-2xs font-bold uppercase tracking-[0.1em] text-muted block" }, "Journeys"),
                h("span", { className: "text-sm font-extrabold text-ink-900 tabular" }, formatNumber(st.data?.journeys || 0))
              ),
              h(
                "div",
                { className: "text-right" },
                h("span", { className: "text-2xs font-bold uppercase tracking-[0.1em] text-muted block" }, "Search → buy"),
                h("span", { className: `text-sm font-extrabold tabular ${overall >= 5 ? "text-success" : "text-warning"}` }, `${overall.toFixed(1)}%`)
              )
            )
          ),
          h(
            "div",
            { className: "panel-body space-y-4" },
            funnel.length === 0
              ? h("p", { className: "text-sm text-muted-soft" }, "No funnel stages computed yet.")
              : funnel.map((f, i) => {
                  const pct = (f.count / maxCount) * 100;
                  const prev = i > 0 ? funnel[i - 1].count : null;
                  const drop = prev ? (1 - f.count / prev) * 100 : null;
                  return h(
                    "div",
                    { key: f.stage, className: "group" },
                    h(
                      "div",
                      { className: "flex items-center justify-between gap-3 mb-1.5" },
                      h(
                        "span",
                        { className: "text-sm font-semibold text-ink-800" },
                        h("span", { className: "text-muted-soft tabular mr-1.5" }, `${i + 1}.`),
                        f.stage
                      ),
                      h(
                        "span",
                        { className: "text-2xs flex items-center gap-2 flex-none" },
                        drop !== null &&
                          drop > 0 &&
                          h("span", { className: "badge-danger" }, icon("TrendingDown", { size: 10 }), ` ${drop.toFixed(0)}%`),
                        drop !== null &&
                          drop <= 0 &&
                          h("span", { className: "badge-success" }, icon("TrendingUp", { size: 10 }), ` +${Math.abs(drop).toFixed(0)}%`),
                        h("span", { className: "text-sm font-extrabold text-ink-900 tabular" }, formatNumber(f.count))
                      )
                    ),
                    h(
                      "div",
                      { className: "h-3.5 rounded-lg bg-sunken overflow-hidden" },
                      h("div", {
                        className: "h-full rounded-lg bg-primary transition-all duration-500 group-hover:bg-primary-hover",
                        style: { width: `${Math.max(2, pct)}%` },
                      })
                    )
                  );
                })
          )
        ),
        h(
          "div",
          { className: "grid lg:grid-cols-2 gap-5" },
          h(
            "section",
            { className: "panel" },
            h(
              "div",
              { className: "panel-head" },
              h(
                "div",
                { className: "flex items-center gap-2.5" },
                icon("Activity", { size: 16, className: "text-primary" }),
                h("h2", { className: "panel-title" }, "Latest behavior events")
              ),
              h("span", { className: "badge-neutral" }, recent.length)
            ),
            h(
              "div",
              { className: "panel-body max-h-[440px] overflow-y-auto" },
              recent.length === 0
                ? h("p", { className: "text-sm text-muted-soft" }, "No behavior recorded yet.")
                : h(
                    "div",
                    { className: "space-y-1" },
                    recent.map((e, i) =>
                      h(
                        "div",
                        {
                          key: `${e.timestamp}-${i}`,
                          className: "flex items-center gap-3 py-2 border-b border-line last:border-0",
                        },
                        h("span", { className: "w-2 h-2 rounded-full bg-primary flex-none" }),
                        h(
                          "div",
                          { className: "flex-1 min-w-0" },
                          h("div", { className: "text-sm font-semibold text-ink-900 truncate capitalize" }, String(e.eventType || "").replace(/_/g, " ")),
                          e.productId?.title && h("div", { className: "text-2xs text-muted truncate" }, e.productId.title)
                        ),
                        h("span", { className: "text-2xs text-muted-soft flex-none" }, timeAgo(e.timestamp))
                      )
                    )
                  )
            )
          ),
          h(
            "section",
            { className: "panel" },
            h(
              "div",
              { className: "panel-head" },
              h(
                "div",
                { className: "flex items-center gap-2.5" },
                icon("Lightbulb", { size: 16, className: "text-rating" }),
                h("h2", { className: "panel-title" }, "Funnel insights")
              )
            ),
            h("div", { className: "panel-body space-y-3" }, insights)
          )
        )
      )
    );
  };

  paint();
  return root;
}