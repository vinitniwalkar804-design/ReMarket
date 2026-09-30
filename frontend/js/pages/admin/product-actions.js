/**
 * Admin product management — the inspect panel, the confirmation dialog and the
 * calls behind them, as one shared desk.
 *
 * This is the implementation that already existed in `pages/admin/listings.js`,
 * moved here verbatim rather than reimplemented, because there is exactly one
 * product-management surface on the admin side and two tables that need it:
 * Listings (status-facetted, lifecycle transitions) and Products (the plain
 * catalogue read-out). A second copy would mean two sets of confirmation copy,
 * two sets of `canDelete` handling and two places to keep in step with the
 * server, for no benefit.
 *
 * Every network call goes to an endpoint that already existed:
 *   - `GET    /api/admin/products/:id`          inspect a listing
 *   - `PATCH  /api/admin/products/:id/status`   lifecycle transition
 *   - `DELETE /api/admin/products/:id`          permanent delete
 *
 * The page owns its own list state and is told to refresh through `onChanged`,
 * so this module never re-fetches anything on its own behalf and cannot disagree
 * with the table about what is on screen.
 *
 * `isAlive` is the caller's "is this page still mounted?" check: every async
 * continuation bails out on it so a dialog resolving after a route change cannot
 * paint into a detached tree.
 */
import { h, mount } from "../../dom.js";
import { icon } from "../../icons.js";
import api from "../../services/api.js";
import { SkeletonRow } from "../../components/loading.js";
import { formatINR, formatDate } from "../../utils/format.js";
import { listingTone } from "../../utils/theme.js";
import { LISTING_STATUS_LABELS, MODERATION_REASONS, reasonLabel } from "../../utils/moderation.js";
import Modal from "../../components/modal.js";

/** Sentinel target for the permanent-delete action, which is not a status change. */
export const DELETE_TARGET = "__delete__";

/**
 * The listing's lifecycle, as buttons rather than as one status dropdown.
 *
 * A dropdown would technically be a smaller control, but it is the wrong shape
 * for this decision: five of the seven states need a reason, and a dropdown
 * cannot ask for one. Offering only the transitions that make sense from the
 * current state also removes the possibility of "available -> rejected" being
 * typed by accident. The server re-validates all of this regardless - this is
 * about not offering an admin a mistake in the first place.
 */
export const TRANSITIONS = {
  available: [
    { to: "hidden", label: "Hide listing", icon: "EyeOff", destructive: true, reason: true },
    { to: "suspended", label: "Suspend", icon: "ShieldAlert", destructive: true, reason: true },
    { to: "rejected", label: "Reject", icon: "X", destructive: true, reason: true },
    { to: "sold", label: "Mark sold", icon: "Package", destructive: false, reason: false },
  ],
  hidden: [
    { to: "available", label: "Restore to live", icon: "RotateCcw", destructive: false, reason: false },
    { to: "suspended", label: "Suspend", icon: "ShieldAlert", destructive: true, reason: true },
    { to: "rejected", label: "Reject", icon: "X", destructive: true, reason: true },
    { to: "removed", label: "Remove permanently", icon: "Trash2", destructive: true, reason: true },
  ],
  suspended: [
    { to: "available", label: "Restore to live", icon: "RotateCcw", destructive: false, reason: false },
    { to: "hidden", label: "Hide", icon: "EyeOff", destructive: true, reason: true },
    { to: "rejected", label: "Reject", icon: "X", destructive: true, reason: true },
    { to: "removed", label: "Remove permanently", icon: "Trash2", destructive: true, reason: true },
  ],
  rejected: [
    { to: "available", label: "Restore to live", icon: "RotateCcw", destructive: false, reason: false },
    { to: "hidden", label: "Hide", icon: "EyeOff", destructive: true, reason: true },
    { to: "removed", label: "Remove permanently", icon: "Trash2", destructive: true, reason: true },
  ],
  removed: [{ to: "available", label: "Restore to live", icon: "RotateCcw", destructive: false, reason: false }],
  reserved: [{ to: "hidden", label: "Hide listing", icon: "EyeOff", destructive: true, reason: true }],
  sold: [{ to: "available", label: "Return to live", icon: "RotateCcw", destructive: false, reason: false }],
};

/** The permanent-delete transition, as a transition. Not a status change. */
export const DELETE_TRANSITION = {
  to: DELETE_TARGET,
  label: "Delete listing permanently",
  destructive: true,
  reason: false,
};

/**
 * Build the management desk.
 *
 * @param {object}  [opts]
 * @param {Function} [opts.isAlive]  page-mounted check; async work stops when false
 * @param {Function} [opts.onChanged] called after a transition or delete lands,
 *   so the owning table can reload itself
 */
export function createProductActions({ isAlive = () => true, onChanged = () => {} } = {}) {
  const st = {
    detail: null,
    action: null,
    reason: "policy_violation",
    note: "",
    busy: false,
    error: "",
    toast: "",
  };

  const toastHost = h("div");
  const actionModalHost = h("div");
  const detailModalHost = h("div");
  /** Append these to the page root; order matches the original page. */
  const hosts = [toastHost, actionModalHost, detailModalHost];

  let toastTimer = null;

  const showToast = (msg) => {
    st.toast = msg;
    clearTimeout(toastTimer);
    mount(
      toastHost,
      h(
        "div",
        { className: "fixed bottom-5 right-5 z-[110] badge badge-success shadow-pop px-4 py-2.5 animate-slide-up" },
        msg
      )
    );
    toastTimer = setTimeout(() => {
      mount(toastHost);
    }, 4000);
  };

  const openDetail = async (id) => {
    st.detail = { loading: true };
    paintDetailModal();
    try {
      const { data } = await api.get(`/admin/products/${id}`);
      if (!isAlive()) return;
      st.detail = data;
    } catch {
      if (!isAlive()) return;
      st.detail = null;
    }
    paintDetailModal();
  };

  const openAction = (row, transition) => {
    st.error = "";
    st.reason = "policy_violation";
    st.note = "";
    st.action = { row, transition };
    paintActionModal();
  };

  const runAction = async () => {
    if (!st.action) return;
    st.busy = true;
    st.error = "";
    paintActionModal();
    try {
      const targetId = st.action.row._id;
      if (st.action.transition.to === DELETE_TARGET) {
        const { data } = await api.delete(`/admin/products/${targetId}`);
        showToast(data.message || "Listing deleted");
        st.action = null;
        st.detail = null;
        paintActionModal();
        paintDetailModal();
        await onChanged();
        return;
      }
      const { data } = await api.patch(`/admin/products/${targetId}/status`, {
        status: st.action.transition.to,
        reason: st.action.transition.reason ? st.reason : undefined,
        note: st.note.trim() || undefined,
      });
      showToast(data.message || "Listing updated");
      st.action = null;
      paintActionModal();
      await onChanged();
      // A transition can be launched from the inspection modal, which stays open
      // underneath: refresh it so the panel reflects the new state.
      if (st.detail?.product?._id === targetId) openDetail(targetId);
    } catch (err) {
      // The server is the authority on whether an action is allowed - it knows
      // about active orders and reservations that the table cannot show.
      if (!isAlive()) return;
      st.error = err.response?.data?.message || "That action could not be completed";
    } finally {
      if (!isAlive()) return;
      st.busy = false;
      paintActionModal();
    }
  };

  const paintActionModal = () => {
    const action = st.action;
    if (!action) {
      mount(actionModalHost);
      return;
    }
    const t = action.transition;
    const reasonSelect = h("select", { id: "moderation-reason", className: "select-field", value: st.reason });
    MODERATION_REASONS.forEach((r) => {
      reasonSelect.appendChild(h("option", { value: r }, reasonLabel(r)));
    });
    reasonSelect.addEventListener("change", (e) => {
      st.reason = e.target.value;
    });
    const noteInput = h("textarea", {
      id: "moderation-note",
      className: "textarea-field",
      rows: 3,
      maxLength: 500,
      value: st.note,
      placeholder: "What should the seller change to get this back on the market?",
    });
    noteInput.addEventListener("input", (e) => {
      st.note = e.target.value;
    });

    const content = h("div");
    const errorBlock =
      st.error &&
      h(
        "div",
        { className: "mb-4 flex items-start gap-2 rounded-xl bg-danger-soft border border-danger/25 px-3.5 py-2.5 text-xs font-semibold text-danger" },
        icon("AlertTriangle", { size: 14, className: "mt-px flex-none" }),
        h("span", null, st.error)
      );
    const reasonBlock =
      t.reason &&
      h(
        "div",
        { className: "space-y-1.5 mb-4" },
        h("label", { className: "input-label", for: "moderation-reason" }, " Reason ", h("span", { className: "text-danger" }, "*")),
        reasonSelect,
        h("p", { className: "input-hint" }, "The seller sees this reason on the listing and in their notifications.")
      );
    const noteBlock = h(
      "div",
      { className: "space-y-1.5" },
      h(
        "label",
        { className: "input-label", for: "moderation-note" },
        " Note to the seller ",
        h("span", { className: "text-muted-soft font-normal" }, "(optional)")
      ),
      noteInput
    );
    mount(content, errorBlock, reasonBlock, noteBlock);

    const subtitle =
      t.to === DELETE_TARGET
        ? "This cannot be undone. The listing and its price history are removed for good. Its tracked activity is kept for marketplace reporting."
        : t.destructive
          ? `"${action.row.title}" will stop appearing in search, the catalogue and every public listing feed. The seller is notified and can fix the details, but only an admin can put it back.`
          : `"${action.row.title}" will go live again in search and the catalogue.`;

    const modal = Modal({
      open: true,
      onClose: () => {
        if (!st.busy) {
          st.action = null;
          paintActionModal();
        }
      },
      title: `${t.label}?`,
      subtitle,
      footer: h(
        "div",
        { className: "flex items-center justify-end gap-2.5" },
        h("button", { type: "button", className: "btn-quiet", disabled: st.busy, onClick: () => { st.action = null; paintActionModal(); } }, "Cancel"),
        h(
          "button",
          { type: "button", className: t.destructive ? "btn-danger" : "btn-primary", disabled: st.busy, onClick: runAction },
          st.busy ? "Working…" : t.label
        )
      ),
      children: content,
    });
    mount(actionModalHost, modal);
  };

  const paintDetailModal = () => {
    const detail = st.detail;
    if (!detail) {
      mount(detailModalHost);
      return;
    }

    const body =
      detail?.loading || !detail?.product
        ? h(
            "div",
            { className: "space-y-3" },
            Array(3).fill(0).map((_, i) => h("span", { key: i }, SkeletonRow()))
          )
        : paintDetailContent();

    const modal = Modal({
      open: true,
      onClose: () => {
        st.detail = null;
        paintDetailModal();
      },
      wide: true,
      title: detail?.product?.title || "Listing",
      subtitle: detail?.product
        ? `${detail.product.categoryName} · listed by ${detail.product.seller?.name || detail.product.sellerName} · ${formatDate(detail.product.createdAt)}`
        : undefined,
      footer: detail?.product
        ? h(
            "div",
            { className: "flex flex-wrap items-center justify-end gap-2 w-full" },
            h(
              "button",
              {
                type: "button",
                className: "btn-danger btn-sm mr-auto",
                disabled: detail.canDelete === false,
                title: detail.canDelete === false ? "Blocked by existing orders, offers, reviews or conversations" : "Permanently delete this listing",
                onClick: () => openAction(detail.product, DELETE_TRANSITION),
              },
              icon("Trash2", { size: 13 }),
              " Delete permanently"
            ),
            (TRANSITIONS[detail.product.status] || []).map((t) =>
              h(
                "button",
                {
                  type: "button",
                  key: t.to,
                  className: t.destructive ? "btn-danger btn-sm" : "btn-secondary btn-sm",
                  onClick: () => openAction(detail.product, t),
                },
                icon(t.icon, { size: 13 }),
                " ",
                t.label
              )
            ),
            h("button", { type: "button", className: "btn-primary btn-sm", onClick: () => { st.detail = null; paintDetailModal(); } }, "Done")
          )
        : null,
      children: body,
    });
    mount(detailModalHost, modal);
  };

  const paintDetailContent = () => {
    const d = st.detail;
    const product = d.product;
    const refs = d.references;

    const sections = [
      h(
        "div",
        { className: "flex flex-wrap items-center gap-2" },
        h("span", { className: `badge capitalize border ${listingTone(product.status)}` }, LISTING_STATUS_LABELS[product.status] || product.status),
        h("span", { className: "badge badge-neutral" }, formatINR(product.price)),
        h("span", { className: "badge badge-neutral" }, product.condition),
        h("span", { className: "badge badge-neutral" }, `${product.views || 0} views`)
      ),
    ];

    if (product.moderatedAt) {
      sections.push(
        h(
          "div",
          { className: "rounded-xl border border-warning/25 bg-warning-soft px-4 py-3" },
          h(
            "p",
            { className: "text-xs font-extrabold text-warning flex items-center gap-1.5" },
            icon("ShieldAlert", { size: 13 }),
            ` Moderated ${formatDate(product.moderatedAt)} by ${product.moderatedByName || "an admin"}`
          ),
          h(
            "p",
            { className: "text-xs text-ink-900/80 mt-1" },
            reasonLabel(product.moderationReason),
            product.moderationNote ? ` — ${product.moderationNote}` : ""
          )
        )
      );
    }

    sections.push(
      h(
        "section",
        null,
        h("h4", { className: "text-xs font-extrabold uppercase tracking-wider text-muted-soft mb-2" }, "Description"),
        h("p", { className: "text-sm text-ink-900/85 whitespace-pre-line leading-relaxed" }, product.description)
      ),
      // Why deletion is or is not possible - the honest answer, stated up front.
      h(
        "section",
        null,
        h(
          "h4",
          { className: "text-xs font-extrabold uppercase tracking-wider text-muted-soft mb-2 flex items-center gap-1.5" },
          icon("Info", { size: 12 }),
          " What references this listing"
        ),
        refs.canDelete
          ? h(
              "p",
              { className: "text-xs text-success font-semibold" },
              "Nothing references this listing, so it can be permanently deleted. Its price history will be removed with it; its tracked events are kept."
            )
          : h(
              "p",
              { className: "text-xs text-danger font-semibold mb-2" },
              "This listing cannot be permanently deleted because of other people's records. Take it off the market instead - that is reversible."
            ),
        h(
          "div",
          { className: "grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2" },
          [...(refs.blockers || []), ...(refs.removable || []), ...(refs.retained || [])].map((r) =>
            h(
              "div",
              { key: r.name, className: "rounded-lg border border-line bg-raised px-3 py-2" },
              h("p", { className: "text-2xs font-bold text-muted-soft uppercase tracking-wide" }, r.tier === "blockers" ? "Blocks deletion" : r.tier === "removable" ? "Removed with it" : "Kept"),
              h("p", { className: "text-sm font-extrabold text-ink-900 tabular" }, r.count),
              h("p", { className: "text-2xs text-muted" }, `${r.label}${r.count === 1 ? "" : "s"}`)
            )
          )
        )
      )
    );

    if (product.moderationHistory?.length > 0) {
      sections.push(
        h(
          "section",
          null,
          h(
            "h4",
            { className: "text-xs font-extrabold uppercase tracking-wider text-muted-soft mb-2 flex items-center gap-1.5" },
            icon("History", { size: 12 }),
            " Moderation history"
          ),
          h(
            "ol",
            { className: "space-y-2" },
            [...product.moderationHistory].reverse().map((entry, i) =>
              h(
                "li",
                { key: i, className: "rounded-lg border border-line bg-raised px-3.5 py-2.5" },
                h(
                  "p",
                  { className: "text-xs font-bold text-ink-900" },
                  entry.from || "—",
                  " → ",
                  entry.to || "—",
                  h("span", { className: "text-muted-soft font-normal ml-2" }, formatDate(entry.at))
                ),
                h(
                  "p",
                  { className: "text-2xs text-muted mt-0.5" },
                  entry.byName || "system",
                  entry.reason ? ` · ${reasonLabel(entry.reason)}` : "",
                  entry.note ? ` · ${entry.note}` : ""
                )
              )
            )
          )
        )
      );
    }

    if (d.reports?.length > 0) {
      sections.push(
        h(
          "section",
          null,
          h(
            "h4",
            { className: "text-xs font-extrabold uppercase tracking-wider text-muted-soft mb-2 flex items-center gap-1.5" },
            icon("Flag", { size: 12 }),
            " Customer reports"
          ),
          h(
            "ul",
            { className: "space-y-2" },
            d.reports.map((r) =>
              h(
                "li",
                { key: r._id, className: "rounded-lg border border-line bg-raised px-3.5 py-2.5" },
                h(
                  "p",
                  { className: "text-xs font-bold text-ink-900" },
                  reasonLabel(r.reason),
                  h("span", { className: "text-muted-soft font-normal ml-2" }, formatDate(r.createdAt))
                ),
                h(
                  "p",
                  { className: "text-2xs text-muted mt-0.5" },
                  r.status,
                  " · reported by ",
                  r.reporterName,
                  r.details ? ` · ${r.details}` : ""
                )
              )
            )
          )
        )
      );
    }

    return h("div", { className: "space-y-5" }, sections);
  };

  /**
   * The actions cell for one table row.
   *
   * `transition: false` swaps the status-facetted button out for the permanent
   * delete, which is the right control on a catalogue table whose job is "is this
   * wanted or not" rather than "walk this listing through its lifecycle".
   * Both paths end in the same dialog and the same endpoint.
   */
  const actionsCell = (p, { transition = true, remove = false } = {}) => {
    const primary = transition
      ? (TRANSITIONS[p.status] || []).slice(0, 1)
      : remove
        ? [{ to: DELETE_TARGET, label: "Delete", icon: "Trash2", destructive: true }]
        : [];

    return h(
      "td",
      null,
      h(
        "div",
        { className: "flex items-center justify-end gap-1.5" },
        h(
          "button",
          { type: "button", className: "btn-secondary btn-xs", title: "Inspect this listing", onClick: () => openDetail(p._id) },
          icon("Eye", { size: 12 }),
          " Inspect"
        ),
        primary.map((t) =>
          h(
            "button",
            {
              type: "button",
              key: t.to,
              className: t.destructive ? "btn-danger btn-xs" : "btn-secondary btn-xs",
              title: `${t.label} — ${p.title}`,
              onClick: () => openAction(p, t.to === DELETE_TARGET ? DELETE_TRANSITION : t),
            },
            icon(t.icon, { size: 12 }),
            " ",
            t.label
          )
        )
      )
    );
  };

  return { hosts, actionsCell, openDetail, openAction, TRANSITIONS, DELETE_TARGET, DELETE_TRANSITION };
}

export default createProductActions;
