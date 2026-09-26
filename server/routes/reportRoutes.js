import { Router } from "express";
import { createReport, getMyReports } from "../controllers/reportController.js";
import { authenticateUser } from "../middleware/auth.js";

/**
 * Customer-facing reporting. Two endpoints only: file a report, see the reports
 * you filed and what came of them. Triaging is not here - it lives in
 * adminRoutes behind requireAdmin, so there is no path to the moderation queue
 * that does not go through the admin guard.
 */
const router = Router();

router.post("/", authenticateUser, createReport);
router.get("/mine", authenticateUser, getMyReports);

export default router;
