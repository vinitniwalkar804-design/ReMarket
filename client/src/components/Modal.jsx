import { useEffect } from "react";
import { X } from "lucide-react";

export default function Modal({ open, onClose, title, subtitle, children, footer, wide, size }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  const width = size || (wide ? "sm:max-w-3xl" : "sm:max-w-lg");

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-6">
      <div className="absolute inset-0 bg-ink-950/55 backdrop-blur-[3px] animate-fade-in" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative w-full ${width} bg-card rounded-t-3xl sm:rounded-2xl
          shadow-pop border border-line animate-slide-up max-h-[92vh] flex flex-col`}
      >
        <div
          className="flex items-start justify-between gap-4 px-5 sm:px-6 py-4 border-b border-line
            bg-raised rounded-t-3xl sm:rounded-t-2xl"
        >
          <div className="min-w-0">
            <h3 className="text-base font-extrabold text-ink-900 tracking-tight">{title}</h3>
            {subtitle && <p className="text-xs text-muted mt-1 leading-relaxed">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="btn-icon flex-none -mr-1 -mt-0.5"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-5 sm:px-6 py-5 overflow-y-auto">{children}</div>
        {footer && (
          <div
            className="px-5 sm:px-6 py-4 border-t border-line bg-raised flex items-center justify-end gap-2.5
              rounded-b-3xl sm:rounded-b-2xl"
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
