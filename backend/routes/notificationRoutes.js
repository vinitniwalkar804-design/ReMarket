import { Router } from "express";
import { getNotifications, markRead } from "../controllers/notificationController.js";
import { authenticateUser } from "../middleware/auth.js";

const router = Router();

router.get("/", authenticateUser, getNotifications);
router.post("/read", authenticateUser, markRead);

export default router;