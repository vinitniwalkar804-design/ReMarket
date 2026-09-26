export default function EmptyState({ icon: Icon, title, description, action, compact }) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${
        compact ? "py-10" : "py-16 sm:py-20"
      } px-6`}
    >
      {Icon && (
        <div
          className="w-14 h-14 rounded-2xl bg-primary-soft border border-brand-100 flex items-center
            justify-center mb-5"
        >
          <Icon size={24} className="text-primary" />
        </div>
      )}
      <h3 className="text-lg font-extrabold text-ink-900 tracking-tight">{title}</h3>
      {description && (
        <p className="text-sm text-muted max-w-sm mt-2 mb-6 leading-relaxed">{description}</p>
      )}
      {action}
    </div>
  );
}
