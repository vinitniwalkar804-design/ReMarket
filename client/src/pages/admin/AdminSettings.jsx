import { useState, useEffect } from "react";
import {
  Settings as SettingsIcon, Save, RefreshCw, Globe, ShoppingBag, Sparkles, Brain, Loader2, Check,
} from "lucide-react";
import api from "../../services/api.js";
import toast from "react-hot-toast";

const groupMeta = {
  general: { icon: Globe, label: "General", desc: "Marketplace identity shown storefront-wide." },
  checkout: { icon: ShoppingBag, label: "Checkout", desc: "Fees and delivery behaviour." },
  features: { icon: Sparkles, label: "Features", desc: "Buyer & seller experience toggles." },
  ml: { icon: Brain, label: "Machine learning", desc: "Parameters consumed by the ML pipeline." },
};

export default function AdminSettings() {
  const [groups, setGroups] = useState([]);
  const [settings, setSettings] = useState([]);
  const [values, setValues] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/settings");
      setGroups(data.groups || []);
      setSettings(data.settings || []);
      const init = {};
      (data.settings || []).forEach((s) => {
        init[s.key] = s.value;
      });
      setValues(init);
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const save = async (key, label, nextValue) => {
    const value = nextValue === undefined ? values[key] : nextValue;
    setSaving(key);
    try {
      await api.put(`/settings/${key}`, { value });
      setSettings((prev) => prev.map((s) => (s.key === key ? { ...s, value } : s)));
      toast.success(`${label} updated`);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to save");
    }
    setSaving(null);
  };

  if (loading) {
    return (
      <div className="animate-fade-in space-y-5">
        <div className="h-9 w-56 bg-sunken rounded-lg animate-pulse" />
        {Array(2).fill(0).map((_, i) => (
          <div key={i} className="h-40 bg-sunken rounded-2xl animate-pulse" />
        ))}
      </div>
    );
  }

  const visibleGroups = groups.filter((g) => settings.some((s) => s.group === g));

  return (
    <div className="animate-fade-in space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="page-eyebrow">
            <SettingsIcon size={12} /> Configuration
          </span>
          <h1 className="page-title">Settings</h1>
          <p className="page-sub">
            Storefront configuration plus the parameters consumed by the ML pipeline.
          </p>
        </div>
        <button onClick={load} className="btn-secondary">
          <RefreshCw size={15} /> Refresh
        </button>
      </header>

      {visibleGroups.length === 0 ? (
        <div className="panel p-12 text-center">
          <span className="icon-tile-primary mx-auto mb-4">
            <SettingsIcon size={20} />
          </span>
          <h3 className="font-extrabold text-ink-900">No settings exposed</h3>
          <p className="text-sm text-muted mt-1">The API returned no editable configuration keys.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {visibleGroups.map((g) => {
            const meta = groupMeta[g] || { icon: SettingsIcon, label: g, desc: "" };
            const Icon = meta.icon;
            const items = settings.filter((s) => s.group === g);
            return (
              <section key={g}>
                <div className="flex items-center gap-3 mb-3">
                  <span className="icon-tile-primary">
                    <Icon size={17} />
                  </span>
                  <div>
                    <h2 className="panel-title capitalize">{meta.label}</h2>
                    <p className="text-xs text-muted">{meta.desc}</p>
                  </div>
                  <span className="badge-neutral ml-auto">{items.length} keys</span>
                </div>

                <div className="panel">
                  {items.map((s) => {
                    const dirty = values[s.key] !== s.value;
                    return (
                      <div
                        key={s.key}
                        className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-4 sm:p-5 border-b border-line last:border-0"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm text-ink-900 flex items-center gap-2">
                            {s.label}
                            {dirty && <span className="badge-warning">Unsaved</span>}
                          </div>
                          <div className="text-2xs text-muted font-mono mt-0.5">{s.key}</div>
                        </div>

                        <div className="flex items-center gap-2 w-full sm:w-auto sm:min-w-[240px]">
                          {typeof s.value === "boolean" ? (
                            <button
                              onClick={() => {
                                const next = !values[s.key];
                                setValues((v) => ({ ...v, [s.key]: next }));
                                save(s.key, s.label, next);
                              }}
                              disabled={saving === s.key}
                              className={`relative w-12 h-7 rounded-full transition-colors flex-none disabled:opacity-60 ${
                                values[s.key] ? "bg-primary" : "bg-line-strong"
                              }`}
                              aria-label={s.label}
                              aria-pressed={!!values[s.key]}
                            >
                              {saving === s.key ? (
                                <Loader2 size={13} className="absolute inset-0 m-auto animate-spin text-white" />
                              ) : (
                                <span
                                  className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-sm transition-all ${
                                    values[s.key] ? "left-6" : "left-1"
                                  }`}
                                />
                              )}
                            </button>
                          ) : (
                            <>
                              <input
                                type={typeof s.value === "number" ? "number" : "text"}
                                value={values[s.key] ?? ""}
                                onChange={(e) =>
                                  setValues((v) => ({
                                    ...v,
                                    [s.key]:
                                      typeof s.value === "number" ? Number(e.target.value) : e.target.value,
                                  }))
                                }
                                className="input-field flex-1"
                              />
                              <button
                                onClick={() => save(s.key, s.label)}
                                disabled={saving === s.key || !dirty}
                                className={`btn-icon flex-none ${dirty ? "btn-primary" : "btn-secondary"}`}
                                title="Save"
                                aria-label={`Save ${s.label}`}
                              >
                                {saving === s.key ? (
                                  <Loader2 size={15} className="animate-spin" />
                                ) : dirty ? (
                                  <Check size={15} />
                                ) : (
                                  <Save size={15} />
                                )}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
