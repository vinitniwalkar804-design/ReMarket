import { Router } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { authenticateUser } from "../middleware/auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, "..", "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

const MAX_FILES = 8;
const MAX_SIZE = 8 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif"]);
const MIME_EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}`),
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE, files: MAX_FILES },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
    const error = new Error("Only JPG, PNG, GIF, WebP, and AVIF images are allowed");
    error.statusCode = 400;
    cb(error);
  },
});

const detectExtension = (buffer) => {
  if (!buffer || buffer.length < 4) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpg";
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "png";
  if (buffer.slice(0, 3).toString("ascii") === "GIF") return "gif";
  if (buffer.length >= 12 && buffer.slice(0, 4).toString("ascii") === "RIFF" && buffer.slice(8, 12).toString("ascii") === "WEBP") return "webp";
  if (buffer.length >= 12 && buffer.slice(4, 8).toString("ascii") === "ftyp") {
    const brand = buffer.slice(8, 12).toString("ascii");
    if (brand === "avif" || brand === "avis") return "avif";
  }
  return null;
};

const removeFiles = async (files = []) => {
  await Promise.allSettled(files.map((file) => fs.promises.unlink(file.path)));
};

const removePaths = async (paths = []) => {
  await Promise.allSettled(paths.map((filePath) => fs.promises.unlink(filePath)));
};

const router = Router();

router.post("/", authenticateUser, (req, res) => {
  upload.array("images", MAX_FILES)(req, res, async (err) => {
    if (err) {
      await removeFiles(req.files || []);
      const status = err.statusCode || (err.code === "LIMIT_FILE_SIZE" ? 413 : 400);
      return res.status(status).json({ message: err.message || "Image upload failed" });
    }
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ message: "No image files received; use the field name images" });
    const storedPaths = [];
    try {
      const urls = [];
      for (const file of files) {
        const buffer = await fs.promises.readFile(file.path);
        const detectedExtension = detectExtension(buffer);
        const expectedExtension = MIME_EXTENSIONS[file.mimetype];
        if (!detectedExtension || expectedExtension !== detectedExtension) {
          const error = new Error("The uploaded file is not a valid image");
          error.statusCode = 400;
          throw error;
        }
        const filename = `${file.filename}.${detectedExtension}`;
        const storedPath = path.join(uploadsDir, filename);
        await fs.promises.rename(file.path, storedPath);
        storedPaths.push(storedPath);
        // Store a relative path, not an absolute URL built from the request host.
        // req.get("host") reflects whoever called the API (dev server, proxy, or
        // localhost:5050) and baking that origin into the database breaks the
        // image on every other host/port. "/uploads/..." is accepted by
        // validImageUrl() and is resolved against the app origin at render time.
        urls.push(`/uploads/${filename}`);
      }
      res.status(201).json({ urls });
    } catch (error) {
      await Promise.all([removeFiles(files), removePaths(storedPaths)]);
      res.status(error.statusCode || 400).json({ message: error.message || "Image upload failed" });
    }
  });
});

export default router;
export { uploadsDir };
