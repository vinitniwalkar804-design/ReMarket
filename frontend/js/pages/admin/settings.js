/**
 * Admin console — storefront & ML settings.
 *
 * Vanilla port of `pages/admin/AdminSettings.jsx`.
 *
 * Reads `/settings`, groups the editable keys under General / Checkout /
 * Features / Machine learning, and writes back with `PUT /settings/:key`.
 * Booleans toggle immediately; text/numbers are typed, marked "Unsaved", and
 * sent with the dedicated save button. Inputs are created once per load and are
 * never repainted while typing (only the small status/badge and save-button
 * sub-hosts are, so focus and caret survive), which is the exact behaviour that
 * React's controlled inputs produced.
 */
import { h, mount } from "../../dom.js";
import { icon } from "../../icons.js";
import api from "../../services/api.js";
import toast from "../../toast.js";

const groupMeta = {
  general: { icon: "Globe", label: "General", desc: "Marketplace identity shown storefront-wide." },
  checkout: { icon: "ShoppingBag", label: "Checkout", desc: "Fees and delivery behaviour." },
  features: { icon: "Sparkles", label: "Features", desc: "Buyer & seller experience toggles." },
  ml: { icon: "Brain", label: "Machine learning", desc: "Parameters consumed by the ML pipeline." },
};

export default function AdminSettings() {
  const st = { groups: [], settings: [], values: {}, loading: true, saving: null };
  let disposed = false;

  const root = h("div", { className: "animate-fade-in space-y-5" });
  const headerHost = h("div");
  const contentHost = h("div");
  root.appendChild(headerHost);
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

  const savedValue = (key) => st.settings.find((s) => s.key === key)?.value;
  const dirty = (key) => st.values[key] !== savedValue(key);

  const paintHeader = () => {
    mount(
      headerHost,
      h(
        "header",
        { className: "flex flex-wrap items-end justify-between gap-3" },
        h(
          "div",
          null,
          h("span", { className: "page-eyebrow" }, icon("Settings", { size: 12 }), " Configuration"),
          h("h1", { className: "page-title" }, "Settings"),
          h("p", { className: "page-sub" }, "Storefront configuration plus the parameters consumed by the ML pipeline.")
        ),
        h(
          "button",
          { type: "button", onClick: load, className: "btn-secondary" },
          icon("RefreshCw", { size: 15 }),
          " Refresh"
        )
      )
    );
  };

  async function load() {
    st.loading = true;
    paintHeader();
    mount(contentHost, skeletonHost());
    try {
      const { data } = await api.get("/settings");
      if (!ensureAlive()) return;
      st.groups = data.groups || [];
      st.settings = data.settings || [];
      const init = {};
      (data.settings || []).forEach((s) => {
        init[s.key] = s.value;
      });
      st.values = init;
      st.loading = false;
      paint();
    } catch (err) {
      if (!ensureAlive()) return;
      st.loading = false;
      paint();
    }
  }

  function skeletonHost() {
    return h(
      "div",
      { className: "animate-fade-in space-y-5" },
      h("div", { className: "h-9 w-56 bg-sunken rounded-lg animate-pulse" }),
      [0, 1].map(() => h("div", { className: "h-40 bg-sunken rounded-2xl animate-pulse" }))
    );
  }

  const save = async (key, label, nextValue) => {
    const value = nextValue === undefined ? st.values[key] : nextValue;
    st.saving = key;
    repaint();
    try {
      await api.put(`/settings/${key}`, { value });
      if (!ensureAlive()) return;
      st.settings = st.settings.map((s) => (s.key === key ? { ...s, value } : s));
      toast.success(`${label} updated`);
    } catch (err) {
      if (!ensureAlive()) return;
      toast.error(err.response?.data?.message || "Failed to save");
    }
    st.saving = null;
    repaint();
  };

  // Repaint the small mutable bits (status badge on a label, save button on an
  // input row, whole boolean switch) without rebuilding the text inputs, which
  // keeps focus and caret wherever the user is typing.
  function repaint() {
    for (const k in st._row) st._row[k]();
  }

  const paint = () => {
    st._row = {};
    const visibleGroups = st.groups.filter((g) => st.settings.some((s) => s.group === g));

    mount(
      contentHost,
      st.loading
        ? skeletonHost()
        : visibleGroups.length === 0
          ? h(
              "div",
              { className: "panel p-12 text-center" },
              h("span", { className: "icon-tile-primary mx-auto mb-4" }, icon("Settings", { size: 20 })),
              h("h3", { className: "font-extrabold text-ink-900" }, "No settings exposed"),
              h("p", { className: "text-sm text-muted mt-1" }, "The API returned no editable configuration keys.")
            )
          : h(
              "div",
              { className: "space-y-6" },
              visibleGroups.map((g) => {
                const meta = groupMeta[g] || { icon: "Settings", label: g, desc: "" };
                const items = st.settings.filter((s) => s.group === g);
                return h(
                  "section",
                  { key: g },
                  h(
                    "div",
                    { className: "flex items-center gap-3 mb-3" },
                    h("span", { className: "icon-tile-primary" }, icon(meta.icon, { size: 17 })),
                    h(
                      "div",
                      null,
                      h("h2", { className: "panel-title capitalize" }, meta.label),
                      h("p", { className: "text-xs text-muted" }, meta.desc)
                    ),
                    h("span", { className: "badge-neutral ml-auto" }, `${items.length} keys`)
                  ),
                  h(
                    "div",
                    { className: "panel" },
                    items.map((s) => row(s))
                  )
                );
              })
            )
    );
  };

  // Left-hand column of a settings row: label, the "Unsaved" badge (mounted on
  // demand so it appears on edit and disappears once saved), and the setting key.
  function labelColumn(s) {
    const badgeHost = h("span");
    return [
      h(
        "div",
        { className: "flex-1 min-w-0" },
        h(
          "div",
          { className: "font-semibold text-sm text-ink-900 flex items-center gap-2" },
          s.label,
          badgeHost
        ),
        h("div", { className: "text-2xs text-muted font-mono mt-0.5" }, s.key)
      ),
      badgeHost,
    ];
  }

  function repaintBadge(badgeHost, s) {
    mount(badgeHost, dirty(s.key) ? h("span", { className: "badge-warning" }, "Unsaved") : null);
  }

  function row(s) {
    if (typeof s.value === "boolean") {
      const btnHost = h("span", { className: "flex-none" });
      const [labelCol, badgeHost] = labelColumn(s);

      const repaintBtn = () => {
        const on = !!st.values[s.key];
        const busy = st.saving === s.key;
        repaintBadge(badgeHost, s);
        mount(
          btnHost,
          h(
            "button",
            {
              type: "button",
              onClick: () => {
                const next = !st.values[s.key];
                st.values[s.key] = next;
                save(s.key, s.label, next);
              },
              disabled: busy,
              className: `relative w-12 h-7 rounded-full transition-colors flex-none disabled:opacity-60 ${on ? "bg-primary" : "bg-line-strong"}`,
              "aria-label": s.label,
              "aria-pressed": on,
            },
            busy
              ? icon("Loader2", { size: 13, className: "absolute inset-0 m-auto animate-spin text-white" })
              : h("span", { className: `absolute top-1 w-5 h-5 rounded-full bg-white shadow-sm transition-all ${on ? "left-6" : "left-1"}` })
          )
        );
      };
      st._row[s.key] = repaintBtn;
      repaintBtn();

      return h(
        "div",
        { key: s.key, className: "flex flex-col sm:flex-row items-start sm:items-center gap-3 p-4 sm:p-5 border-b border-line last:border-0" },
        labelCol,
        h(
          "div",
          { className: "flex items-center gap-2 w-full sm:w-auto sm:min-w-[240px]" },
          btnHost
        )
      );
    }

    const saveHost = h("span", { className: "flex-none" });
    const [labelCol, badgeHost] = labelColumn(s);
    const isNumber = typeof s.value === "number";
    const input = h("input", {
      type: isNumber ? "number" : "text",
      value: st.values[s.key] ?? "",
      className: "input-field flex-1",
      "aria-label": s.label,
    });
    input.addEventListener("input", (e) => {
      st.values[s.key] = isNumber ? Number(e.target.value) : e.target.value;
      repaintRow();
    });

    const repaintRow = () => {
      const busy = st.saving === s.key;
      const isDirty = dirty(s.key);
      repaintBadge(badgeHost, s);
      mount(
        saveHost,
        h(
          "button",
          {
            type: "button",
            onClick: () => save(s.key, s.label),
            disabled: busy || !isDirty,
            className: `btn-icon flex-none ${isDirty ? "btn-primary" : "btn-secondary"}`,
            title: "Save",
            "aria-label": `Save ${s.label}`,
          },
          busy ? icon("Loader2", { size: 15, className: "animate-spin" }) : isDirty ? icon("Check", { size: 15 }) : icon("Save", { size: 15 })
        )
      );
    };
    st._row[s.key] = repaintRow;
    repaintRow();

    return h(
      "div",
      { key: s.key, className: "flex flex-col sm:flex-row items-start sm:items-center gap-3 p-4 sm:p-5 border-b border-line last:border-0" },
      labelCol,
      h(
        "div",
        { className: "flex items-center gap-2 w-full sm:w-auto sm:min-w-[240px]" },
        input,
        saveHost
      )
    );
  }

  paintHeader();
  paint();
  load();

  return root;
}