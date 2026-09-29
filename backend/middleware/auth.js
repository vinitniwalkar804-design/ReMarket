import jwt from "jsonwebtoken";
import { config } from "../config/index.js";
import User from "../models/User.js";

export const authenticateUser = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Authentication required" });
    }
    const token = header.split(" ")[1];
    const decoded = jwt.verify(token, config.jwtSecret);
    const user = await User.findById(decoded.id).select("-password");
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

export const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
};

export const optionalAuth = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (header && header.startsWith("Bearer ")) {
      const token = header.split(" ")[1];
      const decoded = jwt.verify(token, config.jwtSecret);
      const user = await User.findById(decoded.id).select("-password");
      if (user) req.user = user;
    }
  } catch {}
  next();
};

/**
 * The browsing session the request belongs to.
 *
 * `sessionFrequency` is a modelled feature, so events the API writes itself
 * (cart, wishlist, order, offer, review, compare...) have to carry the same
 * session id the client reports for navigation events. Without this the session
 * id is empty on those documents and the feature builder has to guess sessions
 * from idle gaps instead of counting real ones.
 *
 * The client sends it as `X-Session-Id`; it is validated here rather than trusted
 * because it is attacker-controlled and ends up in a stored document.
 */
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{6,100}$/;

export const sessionIdFromRequest = (req) => {
  const raw = req.get?.("X-Session-Id") || req.headers?.["x-session-id"] || "";
  const sessionId = String(raw).trim();
  return SESSION_ID_PATTERN.test(sessionId) ? sessionId : "";
};
