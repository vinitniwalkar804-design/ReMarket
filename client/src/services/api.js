import axios from "axios";
import { getSessionId } from "../utils/session.js";

export const AUTH_EXPIRED_EVENT = "remarket:auth-expired";

const api = axios.create({
  baseURL: "/api",
  headers: { Accept: "application/json" },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  // The server stamps this onto the behaviour events it writes itself (cart,
  // wishlist, order, offer...). Without it those events would carry no session
  // and `sessionFrequency` would fall back to guessing sessions from idle gaps.
  config.headers = config.headers || {};
  config.headers["X-Session-Id"] = getSessionId();
  if (typeof FormData !== "undefined" && config.data instanceof FormData && config.headers) {
    delete config.headers["Content-Type"];
    delete config.headers["content-type"];
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      const hadToken = Boolean(localStorage.getItem("token"));
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
      if (hadToken && !window.location.pathname.includes("/login") && !window.location.pathname.includes("/admin")) {
        const next = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        window.location.assign(`/login?next=${encodeURIComponent(next)}`);
      }
    }
    return Promise.reject(err);
  }
);

export default api;
