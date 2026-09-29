/**
 * Admin console — Customer detail.
 *
 * Vanilla port of `pages/admin/AdminCustomerDetail.jsx`.
 *
 * Fetches `/admin/customers/:id` once on mount (React pained on `[id]`, which for
 * a routed page mounts fresh per navigation), then paints the identity header,
 * stat cards, persona rationale, embedded `CustomerAttractionChart`, feature
 * values, behavioural timeline and purchase history into a persistent body host.
 */
import { h, mount } from "../../dom.js";
import { icon } from "../../icons.js";
import { link } from "../../navigation.js";
import api from "../../services/api.js";
import { fallbackFor } from "../../utils/images.js";
import { formatINR } from "../../utils/format.js";
import { orderTone } from "../../utils/theme.js";
import CustomerAttractionChart from "./customer-attraction-chart.js";

export default function AdminCustomerDetail({ params }) {
  const id = params.id;
  const st = { data: null, loading: true, error: false };
  let disposed = false;

  const root = h("div", { className: "animate-fade-in space-y-5" });
  const bodyHost = h("div");

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

  const build = () => {
    if (st.loading) {
      mount(
        bodyHost,
        h(
          "div",
          { className: "space-y-4 animate-fade-in" },
          h("div", { className: "h-9 w-40 bg-sunken rounded-lg animate-pulse" }),
          h("div", { className: "h-36 rounded-2xl bg-sunken animate-pulse" }),
          h(
            "div",
            { className: "grid grid-cols-2 lg:grid-cols-4 gap-3" },
            Array(4).fill(0).map((_, i) => h("div", { key: i, className: "h-24 rounded-2xl border border-line bg-surface animate-pulse" }))
          ),
          h("div", { className: "h-72 rounded-2xl border border-line bg-surface animate-pulse" })
        )
      );
      return;
    }

    if (st.error || !st.data) {
      mount(
        bodyHost,
        h(
          "div",
          { className: "panel p-12 text-center" },
          h("span", { className: "icon-tile-primary mx-auto mb-4" }, icon("UserCheck", { size: 20 })),
          h("h3", { className: "font-extrabold text-ink-900" }, "Customer not found"),
          h("p", { className: "text-sm text-muted mt-1" }, "This profile may have been removed, or the link is stale."),
          h("a", link("/admin/customers", { className: "btn-primary mt-5" }), icon("ArrowLeft", { size: 15 }), " Back to customers")
        )
      );
      return;
    }

    const {
      user, features, persona, clusterId, timeline = [], orders = [], purchaseCount,
      totalSpending, searchBehavior, viewedCategories, wishlistCount, priceWatches, offers = [],
    } = st.data;

    const featureRows = features
      ? Object.entries(features).filter(([k, v]) => typeof v === "number" && k !== "_id").slice(0, 25)
      : [];
    const topSearches = searchBehavior ? searchBehavior.slice(0, 4).map((s) => s._id) : [];
    const topCategories = viewedCategories ? viewedCategories.slice(0, 4).map((c) => c._id) : [];
    // The attraction panel names the customer in its own heading, so the heading
    // reads as a sentence instead of repeating the profile name beside it.
    const firstName = (user.name || "this customer").trim().split(" ")[0];

    const stats = [
      { icon: "ShoppingBag", label: "Purchases", value: purchaseCount ?? 0 },
      {
        icon: "Wallet",
        label: "Total spending",
        value: totalSpending >= 0 ? formatINR(totalSpending) : "—",
        tone: "text-success",
      },
      { icon: "Hexagon", label: "Cluster", value: clusterId === undefined || clusterId === null ? "—" : `#${clusterId}` },
      { icon: "UserCheck", label: "Account", value: user.isActive ? "Active" : "Inactive" },
    ];

    // Capture a non-upserting fallback for broken product images.
    const makeImg = (src, fallback) => {
      const img = h("img", { src, alt: "", className: "w-full h-full object-cover" });
      img.addEventListener("error", () => {
        img.removeAttribute("src");
        img.src = fallback;
      });
      return img;
    };

    const attractionChartRoot = CustomerAttractionChart({ customerId: id });

    mount(
      bodyHost,
      h(
        "div",
        { className: "animate-fade-in space-y-5" },
        h("a", link("/admin/customers", { className: "link-more text-xs" }), icon("ArrowLeft", { size: 13 }), " Back to customers"),

        // ---------- identity ----------
        h(
          "header",
          { className: "relative overflow-hidden rounded-3xl mesh-primary text-white p-6 sm:p-7" },
          h("div", { className: "absolute inset-0 bg-dots opacity-25" }),
          h("div", { className: "absolute -right-16 -top-20 w-64 h-64 rounded-full bg-white/10 blur-3xl" }),
          h("div", { className: "absolute -left-10 -bottom-24 w-56 h-56 rounded-full bg-accent/25 blur-3xl" }),
          h(
            "div",
            { className: "relative flex flex-wrap items-center gap-4" },
            h(
              "span",
              { className: "w-14 h-14 rounded-2xl bg-white/12 backdrop-blur border border-white/20 text-lg font-extrabold flex items-center justify-center flex-none" },
              user.name?.charAt(0)
            ),
            h(
              "div",
              { className: "min-w-0 flex-1" },
              h("h1", { className: "text-xl font-extrabold truncate" }, user.name),
              h("p", { className: "text-sm text-white/65 truncate font-mono" }, user.email),
              h("p", { className: "text-2xs text-white/45 mt-0.5" }, user.location || "No location set")
            ),
            persona &&
              h(
                "div",
                { className: "rounded-2xl bg-white/10 border border-white/20 backdrop-blur px-5 py-3 text-center flex-none" },
                h("div", { className: "text-2xs text-white/55 uppercase tracking-[0.12em] font-bold" }, "Persona"),
                h("div", { className: "font-bold text-sm mt-0.5" }, persona.name),
                persona.signature && h("div", { className: "text-2xs font-mono text-accent-200 mt-0.5" }, persona.signature)
              )
          )
        ),

        // ---------- metrics ----------
        h(
          "div",
          { className: "grid grid-cols-2 lg:grid-cols-4 gap-3" },
          stats.map((s) =>
            h(
              "div",
              { key: s.label, className: "stat-card" },
              h(
                "div",
                { className: "flex items-center justify-between" },
                icon(s.icon, { size: 16, className: "text-primary" }),
                h("span", { className: "metric-label" }, s.label)
              ),
              h("p", { className: `metric mt-2 ${s.tone || ""}` }, s.value)
            )
          )
        ),

        // ---------- persona rationale ----------
        h(
          "section",
          { className: "panel" },
          h(
            "div",
            { className: "panel-head" },
            h(
              "div",
              null,
              h("h2", { className: "panel-title flex items-center gap-2" }, icon("Brain", { size: 16, className: "text-primary" }), " Why this persona"),
              h("p", { className: "panel-sub" }, "The signals the segmentation model used to assign this cluster")
            ),
            clusterId !== -1 && clusterId != null && h("span", { className: "badge-accent" }, `Cluster #${clusterId}`)
          ),
          h(
            "div",
            { className: "panel-body" },
            persona
              ? h(
                  "div",
                  { className: "grid lg:grid-cols-4 gap-5" },
                  h(
                    "div",
                    { className: "rounded-2xl border border-brand-200 bg-primary-soft p-5 text-center flex flex-col justify-center" },
                    h("div", { className: "text-3xl mb-2" }, persona.emoji || "🧑‍💻"),
                    h("div", { className: "font-extrabold text-primary" }, persona.name),
                    persona.signature && h("div", { className: "text-2xs font-mono text-primary/70 mt-0.5" }, persona.signature),
                    h("div", { className: "text-2xs text-muted mt-2" }, `${persona.percentage ?? "—"}% of customers`)
                  ),
                  h(
                    "div",
                    { className: "lg:col-span-3 grid sm:grid-cols-2 gap-5" },
                    h(
                      "div",
                      null,
                      h("p", { className: "input-label flex items-center gap-1.5" }, icon("Search", { size: 11 }), " Top searches"),
                      h(
                        "div",
                        { className: "flex flex-wrap gap-1.5" },
                        topSearches.length
                          ? topSearches.map((s) => h("span", { key: s, className: "chip-idle" }, s))
                          : h("span", { className: "text-xs text-muted-soft" }, "No searches yet")
                      )
                    ),
                    h(
                      "div",
                      null,
                      h("p", { className: "input-label flex items-center gap-1.5" }, icon("Eye", { size: 11 }), " Viewed categories"),
                      h(
                        "div",
                        { className: "flex flex-wrap gap-1.5" },
                        topCategories.length
                          ? topCategories.map((s) => h("span", { key: s, className: "chip-idle" }, s))
                          : h("span", { className: "text-xs text-muted-soft" }, "No views yet")
                      )
                    ),
                    h(
                      "div",
                      null,
                      h("p", { className: "input-label flex items-center gap-1.5" }, icon("Activity", { size: 11 }), " Engagement signals"),
                      h(
                        "div",
                        { className: "flex flex-wrap gap-1.5" },
                        h("span", { className: "chip-idle" }, icon("Heart", { size: 11, className: "text-magenta" }), ` ${wishlistCount ?? 0} wishlist`),
                        h("span", { className: "chip-idle" }, icon("Gift", { size: 11, className: "text-rating" }), ` ${priceWatches ?? 0} watches`),
                        h("span", { className: "chip-idle" }, icon("Tags", { size: 11, className: "text-primary" }), ` ${offers.length} offers`),
                        h(
                          "span",
                          { className: "chip-idle" },
                          icon("Clock", { size: 11, className: "text-info" }),
                          features?.decisionTime ? `${Math.round(features.decisionTime)}m` : "—",
                          " decision"
                        )
                      )
                    ),
                    h(
                      "div",
                      null,
                      h("p", { className: "input-label" }, "Profile"),
                      h(
                        "p",
                        { className: "text-sm text-muted leading-relaxed" },
                        persona.description || "This customer matches a behavior pattern learned from the model."
                      )
                    )
                  )
                )
              : h(
                  "p",
                  { className: "text-sm text-muted" },
                  persona === null && clusterId !== -1
                    ? "Run segmentation to discover this customer's persona."
                    : "This customer is not assigned to any persona yet — run segmentation from Personas."
                )
          )
        ),

        h(
          "div",
          { className: "grid lg:grid-cols-2 gap-5" },
          // ---------- attraction ----------
          h(
            "section",
            { className: "panel lg:col-span-2" },
            h(
              "div",
              { className: "panel-head" },
              h(
                "div",
                null,
                h("h2", { className: "panel-title flex items-center gap-2" }, icon("PieChart", { size: 16, className: "text-primary" }), ` What draws ${firstName} in`),
                h("p", { className: "panel-sub" }, "This customer’s category attraction, from their own behaviour")
              ),
              h("span", { className: "badge-accent" }, "Customer attraction")
            ),
            h("div", { className: "panel-body" }, attractionChartRoot)
          ),

          // ---------- features ----------
          h(
            "section",
            { className: "panel" },
            h(
              "div",
              { className: "panel-head" },
              h("div", null, h("h2", { className: "panel-title" }, "Feature values"), h("p", { className: "panel-sub" }, "Built from raw behavior data")),
              h("span", { className: "badge-neutral" }, `${featureRows.length} signals`)
            ),
            h(
              "div",
              { className: "panel-body" },
              featureRows.length
                ? h(
                    "div",
                    { className: "grid grid-cols-2 gap-x-5" },
                    featureRows.map(([k, v]) =>
                      h(
                        "div",
                        { key: k, className: "flex justify-between gap-2 border-b border-line py-2 text-xs" },
                        h("span", { className: "text-muted capitalize truncate" }, k.replace(/([A-Z])/g, " $1")),
                        h("span", { className: "font-bold text-ink-900 tabular flex-none" }, v.toFixed(2))
                      )
                    )
                  )
                : h("p", { className: "text-sm text-muted-soft" }, "No numeric features computed yet.")
            )
          ),

          // ---------- timeline ----------
          h(
            "section",
            { className: "panel" },
            h(
              "div",
              { className: "panel-head" },
              h("div", null, h("h2", { className: "panel-title" }, "Behavioral timeline"), h("p", { className: "panel-sub" }, "Most recent first")),
              h("span", { className: "badge-neutral" }, `${timeline.length} events`)
            ),
            h(
              "div",
              { className: "panel-body max-h-[420px] overflow-y-auto" },
              timeline.length === 0
                ? h("p", { className: "text-sm text-muted-soft" }, "No recorded behavior")
                : h(
                    "div",
                    { className: "space-y-0" },
                    timeline.map((e, i) =>
                      h(
                        "div",
                        { key: `${e.timestamp}-${i}`, className: "flex gap-3 relative pb-4 last:pb-0" },
                        i < timeline.length - 1 && h("div", { className: "absolute left-[5px] top-4 bottom-0 w-px bg-line" }),
                        h("span", {
                          className: `w-3 h-3 rounded-full mt-1.5 flex-none border-2 ${
                            i === 0 ? "bg-primary border-brand-200" : "bg-line-strong border-line"
                          }`,
                        }),
                        h(
                          "div",
                          { className: "min-w-0" },
                          h("div", { className: "text-sm font-semibold text-ink-900 capitalize" }, String(e.eventType || "").replace(/_/g, " ")),
                          h(
                            "div",
                            { className: "text-2xs text-muted" },
                            new Date(e.timestamp).toLocaleString(),
                            e.productId ? ` · ${e.productId.title || "product"}` : ""
                          )
                        )
                      )
                    )
                  )
            )
          ),

          // ---------- orders ----------
          h(
            "section",
            { className: "panel lg:col-span-2" },
            h(
              "div",
              { className: "panel-head" },
              h("div", null, h("h2", { className: "panel-title" }, "Purchase history"), h("p", { className: "panel-sub" }, "Completed checkouts by this customer")),
              h("span", { className: "badge-neutral" }, `${orders.length} orders`)
            ),
            h(
              "div",
              { className: "panel-body" },
              orders.length === 0
                ? h("p", { className: "text-sm text-muted-soft" }, "No purchases yet")
                : h(
                    "div",
                    { className: "space-y-2" },
                    orders.map((o) =>
                      h(
                        "div",
                        { key: o._id, className: "flex items-center gap-3 border-b border-line pb-2 last:border-0 last:pb-0" },
                        h(
                          "div",
                          { className: "w-10 h-10 bg-sunken rounded-lg overflow-hidden flex-none" },
                          o.productId?.images?.[0]
                            ? makeImg(o.productId.images[0], fallbackFor(o.productId))
                            : h(
                                "div",
                                { className: "w-full h-full flex items-center justify-center text-muted-soft" },
                                icon("Package", { size: 14 })
                              )
                        ),
                        h(
                          "div",
                          { className: "flex-1 min-w-0" },
                          h("div", { className: "text-sm font-semibold text-ink-900 truncate" }, o.productId?.title || o.productTitle || "Product"),
                          h("div", { className: "text-2xs text-muted" }, `${new Date(o.createdAt).toLocaleDateString()} · Decision: ${o.decisionTimeMinutes} min`)
                        ),
                        h("span", { className: "font-extrabold text-sm text-ink-900 tabular flex-none" }, formatINR(o.finalPrice)),
                        h("span", { className: `badge capitalize ${orderTone(o.status)}` }, o.status)
                      )
                    )
                  )
            )
          )
        )
      )
    );
  };

  const load = () => {
    st.loading = true;
    build();
    api
      .get(`/admin/customers/${id}`)
      .then(({ data }) => {
        if (!ensureAlive()) return;
        st.data = data;
        st.loading = false;
        build();
      })
      .catch(() => {
        if (!ensureAlive()) return;
        st.error = true;
        st.loading = false;
        build();
      });
  };

  root.appendChild(bodyHost);
  build();
  load();

  return root;
}