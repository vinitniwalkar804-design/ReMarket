import jwt from "jsonwebtoken";
import { config } from "../config/index.js";
import { User } from "../models/index.js";
import { recordEvent } from "../services/behaviorEvents.js";
const signToken = (user) => {
  return jwt.sign({ id: user._id, role: user.role }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
};

const safeUser = (user) => {
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    location: user.location,
    phone: user.phone,
    avatar: user.avatar,
    bio: user.bio,
    isVerifiedSeller: user.isVerifiedSeller,
    sellerRating: user.sellerRating || 0,
    sellerRatingCount: user.sellerRatingCount || 0,
    lastActive: user.lastActive,
    createdAt: user.createdAt,
  };
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const register = async (req, res) => {
  try {
    const { name, email, password, role, location } = req.body;
    console.info("[Auth] register attempt:", {
      email: String(email || "").toLowerCase(),
      name: Boolean(name),
      hasPassword: Boolean(password),
      location: location || "",
    });
    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email and password are required" });
    }
    if (!EMAIL_RE.test(String(email))) {
      return res.status(400).json({ message: "Please enter a valid email address." });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters." });
    }
    let roleFinal = "customer";
    if (role === "admin" && req.user && req.user.role === "admin") {
      roleFinal = "admin";
    }
    const existing = await User.findOne({ email: String(email).toLowerCase() });
    if (existing) {
      return res.status(400).json({ message: "An account with this email already exists." });
    }
    const user = await User.create({ name, email, password, role: roleFinal, location });
    await recordEvent(req, { userId: user._id, eventType: "REGISTER", metadata: { method: "register" } });
    const token = signToken(user);
    res.status(201).json({ token, user: safeUser(user) });
  } catch (err) {
    console.error("[Auth] register failed:", {
      name: err && err.name,
      code: err && (err.code || null),
      message: err && err.message,
      stack: err && err.stack,
    });
    if (err && (err.code === 11000 || /duplicate key/i.test(err.message || ""))) {
      return res.status(400).json({ message: "An account with this email already exists." });
    }
    if (err && err.name === "ValidationError") {
      return res.status(400).json({ message: "Please enter a valid email address." });
    }
    res.status(500).json({ message: "Unable to create your account right now. Please try again." });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }
    const user = await User.findOne({ email }).select("+password");
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    user.lastActive = new Date();
    await user.save();
    await recordEvent(req, { userId: user._id, eventType: "LOGIN", metadata: {} });
    const token = signToken(user);
    res.json({ token, user: safeUser(user) });
  } catch (err) {
    console.error("[Auth] login failed:", {
      name: err && err.name,
      code: err && (err.code || null),
      message: err && err.message,
      stack: err && err.stack,
    });
    res.status(500).json({ message: "Unable to sign you in right now. Please try again." });
  }
};

export const me = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    res.json({ user: safeUser(user) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const logout = async (req, res) => {
  try {
    await recordEvent(req, { userId: req.user._id, eventType: "LOGOUT", metadata: {} });
    res.json({ message: "Logged out" });
  } catch {
    res.json({ message: "Logged out" });
  }
};