import { Star } from "lucide-react";

export default function StarRating({ value = 0, size = 14, className = "", showValue = false }) {
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <span className="inline-flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star
            key={i}
            size={size}
            className={
              i <= Math.round(value)
                ? "text-rating fill-rating"
                : "text-line-strong fill-sunken"
            }
          />
        ))}
      </span>
      {showValue && (
        <span className="text-xs font-bold text-ink-800 tabular">
          {Number(value || 0).toFixed(1)}
        </span>
      )}
    </span>
  );
}
