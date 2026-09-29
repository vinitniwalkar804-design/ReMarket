/**
 * Authentication state.
 *
 * A port of the React build's `context/AuthContext.jsx`. React shared this
 * through a provider and `useAuth()`; without React the same data is served by a
 * tiny observable store. `subscribe` replaces the re-render that context
 * triggered: any view that cares about the signed-in customer subscribes and
 * re-paints when it changes.
 *
 * The behaviour that is easy to break is preserved deliberately, because both
 * the route guards and the segmentation model depend on it:
 *
 *  - A sign-out must clear auth state BEFORE its first `await`. Callers do
 *    `logout(); navigate("/login")` in the same tick, so if the user were still
 *    set when the guard ran, `PublicOnly` would bounce the customer back to "/"
 *    and the admin back to "/admin".
 *  - The token is captured and sent explicitly. The request interceptor runs
 *    asynchronously, so by the time it reads localStorage the token is already
 *    cleared, which would turn `/auth/logout` into a 401 and bounce the page to
 *    `/login?next=...` instead.
 *  - A `/auth/me` response is only applied if it was fetched with the token that
 *    is still current. Sign-out or a newer sign-in can land while it is in
 *    flight, and applying it would resurrect a session whose token is gone.
 */
import api, { AUTH_EXPIRED_EVENT } from "../services/api.js";
import { resetSession } from "../utils/session.js";

const state = { user: null, loading: true };
const listeners = new Set();

function emit() {
  for (const fn of listeners) fn(state);
}

const clearStoredSession = () => {
  try {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
  } catch {
    /* storage unavailable */
  }
};

export const auth = {
  /** Subscribe to auth changes. Returns an unsubscribe function. */
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  getState() {
    return state;
  },

  get user() {
    return state.user;
  },

  get loading() {
    return state.loading;
  },

  /** Replace the current user, e.g. after a profile update. */
  setUser(user) {
    state.user = user;
    emit();
  },

  async refresh() {
    const token = localStorage.getItem("token");
    if (!token) {
      state.user = null;
      clearStoredSession();
      state.loading = false;
      emit();
      return null;
    }
    try {
      const { data } = await api.get("/auth/me");
      // Only accept the result if the token it was fetched with is still the
      // current one.
      if (localStorage.getItem("token") === token) state.user = data.user;
      else state.user = null;
    } catch {
      // Only discard storage if it still holds the token this request failed
      // on. A newer sign-in may already have replaced it, and that is valid.
      if (localStorage.getItem("token") === token) {
        state.user = null;
        clearStoredSession();
      }
    }
    state.loading = false;
    emit();
    return state.user;
  },

  async login(email, password) {
    const { data } = await api.post("/auth/login", { email: email.trim(), password });
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));
    state.user = data.user;
    state.loading = false;
    emit();
    return data;
  },

  async register(name, email, password, location) {
    const { data, status } = await api.post("/auth/register", { name, email, password, location });
    console.info("[auth] register response", { status, userId: data.user?._id });
    try {
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
    } catch {
      console.warn("[auth] localStorage unavailable — signed in for this session only");
    }
    state.user = data.user;
    state.loading = false;
    emit();
    return data;
  },

  async logout() {
    // ORDERING MATTERS - see the note at the top of this file. State has to be
    // gone before the first await, and the token has to be sent explicitly.
    const token = localStorage.getItem("token");
    const request = token
      ? api.post("/auth/logout", null, { headers: { Authorization: `Bearer ${token}` } })
      : null;
    if (request) request.catch(() => {});

    clearStoredSession();
    // End the browsing session too. Keeping the id would attribute the next
    // person's activity to this customer's session, understating the very
    // `sessionFrequency` feature the segmentation model learns from.
    resetSession();
    state.user = null;
    state.loading = false;
    emit();

    if (request) await request;
  },
};

// An expired token discovered by the API client clears the store too, so every
// view reacts to the sign-out without polling.
window.addEventListener(AUTH_EXPIRED_EVENT, () => {
  state.user = null;
  state.loading = false;
  emit();
});

export default auth;
