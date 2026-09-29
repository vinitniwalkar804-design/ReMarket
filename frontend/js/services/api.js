/**
 * HTTP client for the ReMarket API.
 *
 * A direct port of the React build's `services/api.js`, which was an axios
 * instance. Two properties have to survive the swap to `fetch`, because the
 * whole app depends on them:
 *
 *  1. **Same contract.** Every call resolves to `{ data, status, headers }` and
 *     every failure rejects with an error carrying `.response.status` and
 *     `.response.data`, so `err.response?.data?.message` keeps working
 *     unchanged on every page. Nothing above this module knows the app stopped
 *     using axios.
 *  2. **Same request decoration.** The bearer token, the `X-Session-Id` header
 *     and the FormData content-type handling are identical, so the backend sees
 *     byte-identical requests and the behaviour features it derives from
 *     `X-Session-Id` keep landing in the right session.
 *
 * The 401 handling is also unchanged: clear the stored session, announce
 * `AUTH_EXPIRED_EVENT` so the auth store drops its state, and send the customer
 * back to sign-in with a `next` parameter - except on `/login` and `/admin`,
 * which is what stops an expired token from looping.
 */

import { getSessionId } from "../utils/session.js";

export const AUTH_EXPIRED_EVENT = "remarket:auth-expired";

const BASE_URL = "/api";

/** An axios-shaped error, so existing `err.response?.data?.message` works. */
export class ApiError extends Error {
  constructor(message, response, request) {
    super(message);
    this.name = "ApiError";
    this.response = response;
    this.request = request;
    this.isAxiosError = true;
  }
}

/** Normalise the many error shapes the backend can produce into one message. */
function errorMessage(status, data) {
  if (typeof data === "string" && data) return data;
  if (data && typeof data === "object") {
    if (typeof data.message === "string") return data.message;
    if (Array.isArray(data.errors) && data.errors.length) {
      const first = data.errors[0];
      if (typeof first === "string") return first;
      if (first?.msg) return first.msg;
      if (first?.message) return first.message;
    }
  }
  return `Request failed with status code ${status}`;
}

let handlingExpiry = false;

/** Run the shared 401 side effects exactly once per expiry burst. */
function handleUnauthorized() {
  if (handlingExpiry) return;
  handlingExpiry = true;

  const hadToken = Boolean(localStorage.getItem("token"));
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));

  if (
    hadToken &&
    !window.location.pathname.includes("/login") &&
    !window.location.pathname.includes("/admin")
  ) {
    const next = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.assign(`/login?next=${encodeURIComponent(next)}`);
  }
  // Cleared on the next navigation so a later, unrelated 401 can redirect too.
  setTimeout(() => {
    handlingExpiry = false;
  }, 0);
}

async function request(method, path, data, config = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = { Accept: "application/json", ...(config.headers || {}) };

  const token = localStorage.getItem("token");
  if (token) headers.Authorization = `Bearer ${token}`;

  // The server stamps this onto the behaviour events it writes itself (cart,
  // wishlist, order, offer...). Without it those events would carry no session
  // and `sessionFrequency` would fall back to guessing sessions from idle gaps.
  headers["X-Session-Id"] = getSessionId();

  // Let the browser set the multipart boundary itself; overriding it produces a
  // body the backend cannot parse. This mirrors deleting Content-Type in the
  // axios request interceptor.
  const isFormData = typeof FormData !== "undefined" && data instanceof FormData;
  if (!isFormData && data !== undefined && data !== null) {
    headers["Content-Type"] = "application/json";
  }

  const init = { method, headers, credentials: "same-origin" };
  if (isFormData) init.body = data;
  else if (data !== undefined && data !== null) init.body = JSON.stringify(data);

  let res;
  try {
    res = await fetch(url, init);
  } catch (cause) {
    // Network-level failure: there is no response at all. Shaped like an axios
    // error with `response` undefined so callers can rely on the same optional
    // chaining they already use.
    throw new ApiError(cause?.message || "Network Error", undefined, { method, url });
  }

  const raw = await res.text();
  let payload = raw;
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    payload = raw ? JSON.parse(raw) : null;
  } else if (raw === "") {
    payload = null;
  }

  const responseHeaders = {};
  res.headers.forEach((v, k) => {
    responseHeaders[k] = v;
  });

  if (!res.ok) {
    if (res.status === 401) handleUnauthorized();
    throw new ApiError(errorMessage(res.status, payload), {
      status: res.status,
      statusText: res.statusText,
      data: payload,
      headers: responseHeaders,
    }, { method, url });
  }

  return { data: payload, status: res.status, statusText: res.statusText, headers: responseHeaders };
}

export const api = {
  get: (path, config) => request("GET", path, undefined, config),
  delete: (path, config) => request("DELETE", path, undefined, config),
  post: (path, data, config) => request("POST", path, data, config),
  put: (path, data, config) => request("PUT", path, data, config),
  patch: (path, data, config) => request("PATCH", path, data, config),
};

export default api;
