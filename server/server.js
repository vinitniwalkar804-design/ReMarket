import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import connectDB from "./config/db.js";
import { config } from "./config/index.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";
import uploadRoutes, { uploadsDir } from "./routes/uploadRoutes.js";

import authRoutes from "./routes/authRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import wishlistRoutes from "./routes/wishlistRoutes.js";
import cartRoutes from "./routes/cartRoutes.js";
import compareRoutes from "./routes/compareRoutes.js";
import offerRoutes from "./routes/offerRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import reviewRoutes from "./routes/reviewRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import behaviorRoutes from "./routes/behaviorRoutes.js";
import searchRoutes from "./routes/searchRoutes.js";
import priceWatchRoutes from "./routes/priceWatchRoutes.js";
import settingsRoutes from "./routes/settingsRoutes.js";
import reportRoutes from "./routes/reportRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import mlRoutes from "./routes/mlRoutes.js";

await connectDB();

const app = express();

app.use(cors({ origin: config.clientUrl, credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(rateLimit({ windowMs: 1 * 60 * 1000, max: 200, message: { message: "Too many requests, please try again later" } }));

app.get("/api/health", (req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/wishlist", wishlistRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/compare", compareRoutes);
app.use("/api/offers", offerRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/chats", chatRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/users", userRoutes);
app.use("/api/behavior", behaviorRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/price-watch", priceWatchRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/ml", mlRoutes);

// AVIF/WebP are not in every mime-db version, so they otherwise fall back to
// application/octet-stream and browsers refuse to render them inline.
const UPLOAD_CONTENT_TYPES = {
  ".avif": "image/avif",
  ".webp": "image/webp",
};
app.use(
  "/uploads",
  express.static(uploadsDir, {
    setHeaders: (res, filePath) => {
      const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
      if (UPLOAD_CONTENT_TYPES[ext]) res.setHeader("Content-Type", UPLOAD_CONTENT_TYPES[ext]);
    },
  }),
);
app.use("/api/uploads", uploadRoutes);

app.use(notFound);
app.use(errorHandler);

const server = app.listen(config.port, () => {
  console.log(`[Server] Running on port ${config.port}`);
});

/**
 * A listen failure with no "error" listener is an *unhandled* 'error' event, so
 * the process dies on an uncaught exception and prints a raw net stack. That is
 * what a "stopped and restarted" run hits whenever the previous backend is still
 * alive: the new process cannot bind, crashes, and the stale process quietly
 * keeps serving the port - so the app the user is looking at is the old one, with
 * whatever routes it happened to have when it started. Ending up on an old
 * backend is how a route that exists on disk 404s in the browser.
 *
 * So report it as what it is and stop, instead of crashing on a stack trace.
 */
server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `[Server] Port ${config.port} is already in use. Another backend is still running - ` +
        `stop it (or the old dev process) and start again, otherwise the stale one keeps serving.`
    );
  } else {
    console.error("[Server] Failed to start:", err.message);
  }
  process.exit(1);
});