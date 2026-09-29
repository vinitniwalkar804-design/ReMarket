/**
 * Display formatting.
 *
 * Ported unchanged from the React build's `utils/format.js`. Locale strings are
 * identical, so prices, dates and relative times read the same in both
 * frontends.
 */

import { conditionTone } from "./theme.js";

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

export const formatINR = (value) =>
  value == null || isNaN(value) ? "—" : `₹${inr.format(Math.round(value))}`;

export const formatNumber = (value) =>
  value == null || isNaN(value) ? "0" : inr.format(Math.round(value));

export const discountPercent = (price, originalPrice) =>
  originalPrice > price && originalPrice > 0 ? Math.round((1 - price / originalPrice) * 100) : 0;

export const formatDate = (d) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

export const formatDateTime = (d) => {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const timeAgo = (d) => {
  if (!d) return "—";
  const seconds = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
};

export const initials = (name = "") =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0].toUpperCase())
    .join("");

export { conditionTone };

export const clamp = (text, max) => (text && text.length > max ? text.slice(0, max - 1) + "…" : text);
