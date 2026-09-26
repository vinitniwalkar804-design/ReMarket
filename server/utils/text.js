/**
 * Small text helpers shared by the admin query builders.
 *
 * These endpoints build Mongo filters straight from request query strings, so a
 * user-supplied search term becomes part of a regular expression. Without
 * escaping, a search for "c++" throws on the malformed pattern, and a search for
 * ".*" matches every listing in the marketplace. Escaping first makes the term a
 * literal substring, which is what a person typing into a search box expects.
 */

/** Escape a user-supplied string for safe use inside a RegExp. */
export const escapeRegex = (value) => String(value ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A case-insensitive "contains" filter, or undefined so it can be spread in. */
export const contains = (value, maxLength = 80) => {
  const term = String(value ?? "").trim().slice(0, maxLength);
  return term ? { $regex: new RegExp(escapeRegex(term), "i") } : undefined;
};

/** Clamp a page/limit pair from query params into something safe to use. */
export const pagination = (query, { defaultLimit = 20, maxLimit = 100 } = {}) => {
  const rawPage = Number.parseInt(query.page, 10);
  const rawLimit = Number.parseInt(query.limit, 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, maxLimit) : defaultLimit;
  return { page, limit, skip: (page - 1) * limit };
};
