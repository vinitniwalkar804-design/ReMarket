import { Router } from "express";
import { authenticateUser, requireAdmin } from "../middleware/auth.js";
import { getSettings, updateSetting, getPublicSettings } from "../controllers/settingsController.js";

const router = Router();

router.get("/public", getPublicSettings);

router.use(authenticateUser, requireAdmin);
router.get("/", getSettings);
router.put("/:key", updateSetting);

export default router;