import { createContext, useContext, useState, useEffect, useCallback } from "react";
import api, { AUTH_EXPIRED_EVENT } from "../services/api.js";
import { resetSession } from "../utils/session.js";

const AuthContext = createContext(null);

const clearStoredSession = () => {
  try {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
  } catch {}
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadUser = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      setUser(null);
      clearStoredSession();
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get("/auth/me");
      // Sign-out can land while this request is in flight. Applying the result
      // then would resurrect a session whose token is already gone, so only
      // accept it if the token it was fetched with is still the current one.
      if (localStorage.getItem("token") === token) setUser(data.user);
      else setUser(null);
    } catch {
      // Only discard storage if it still holds the token this request failed on.
      // A newer sign-in may already have replaced it, and that session is valid.
      if (localStorage.getItem("token") === token) {
        setUser(null);
        clearStoredSession();
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadUser(); }, [loadUser]);

  useEffect(() => {
    const handleExpired = () => {
      setUser(null);
      setLoading(false);
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, handleExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleExpired);
  }, []);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email: email.trim(), password });
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));
    setUser(data.user);
    return data;
  };

  const register = async (name, email, password, location) => {
    const { data, status } = await api.post("/auth/register", { name, email, password, location });
    console.info("[auth] register response", { status, userId: data.user?._id });
    try {
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
    } catch {
      console.warn("[auth] localStorage unavailable — signed in for this session only");
    }
    setUser(data.user);
    return data;
  };

  const logout = async () => {
    // ORDERING MATTERS. Every caller does `logout(); navigate("/login")` in the
    // same tick, so the auth state has to be gone BEFORE this function's first
    // await - otherwise the route guard still sees a signed-in `user` and
    // PublicOnly bounces the customer back to "/" and the admin back to "/admin".
    //
    // The token is captured and sent explicitly because axios runs its request
    // interceptor in a microtask: by the time it reads localStorage the token is
    // already cleared, which would turn /auth/logout into a 401 and make the
    // response interceptor bounce the page to /login?next=... instead.
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
    setUser(null);

    if (request) await request;
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, loading, setUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};