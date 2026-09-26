export { default as EmptyState } from "./EmptyState.jsx";

export const SkeletonCard = () => (
  <div className="card overflow-hidden animate-pulse">
    <div className="aspect-[4/3] bg-sunken" />
    <div className="p-3.5 space-y-2.5">
      <div className="h-2.5 bg-sunken rounded w-2/5" />
      <div className="h-3.5 bg-sunken rounded w-11/12" />
      <div className="h-3.5 bg-sunken rounded w-2/3" />
      <div className="flex justify-between items-end pt-2">
        <div className="h-5 bg-sunken rounded w-1/3" />
        <div className="h-2.5 bg-sunken rounded w-16" />
      </div>
    </div>
    <div className="h-9 border-t border-line bg-raised" />
  </div>
);

export const SkeletonRow = () => (
  <div className="flex items-center gap-4 p-4 card animate-pulse">
    <div className="w-11 h-11 bg-sunken rounded-lg flex-none" />
    <div className="flex-1 space-y-2">
      <div className="h-3.5 bg-sunken rounded w-1/3" />
      <div className="h-2.5 bg-sunken rounded w-1/2" />
    </div>
    <div className="h-5 bg-sunken rounded w-20 flex-none" />
  </div>
);

export const SkeletonLine = ({ className = "" }) => (
  <div className={`bg-sunken animate-pulse rounded ${className}`} />
);

export const SkeletonStat = () => (
  <div className="card p-5 animate-pulse space-y-3">
    <div className="h-2.5 bg-sunken rounded w-24" />
    <div className="h-7 bg-sunken rounded w-16" />
    <div className="h-2.5 bg-sunken rounded w-32" />
  </div>
);

export const SkeletonTable = ({ rows = 6, cols = 5 }) => (
  <div className="card overflow-hidden animate-pulse">
    <div className="h-11 bg-raised border-b border-line" />
    <div className="divide-y divide-line">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="px-4 py-3.5 flex items-center gap-4">
          {Array.from({ length: cols }).map((__, c) => (
            <div
              key={c}
              className="h-3 bg-sunken rounded"
              style={{ width: c === 0 ? "26%" : `${Math.max(10, 60 / cols)}%` }}
            />
          ))}
        </div>
      ))}
    </div>
  </div>
);
