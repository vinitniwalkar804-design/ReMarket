import { Router } from "express";
import { getChats, getChat, createChat, sendMessage } from "../controllers/chatController.js";
import { authenticateUser } from "../middleware/auth.js";

const router = Router();

router.get("/", authenticateUser, getChats);
router.post("/", authenticateUser, createChat);
router.get("/:id", authenticateUser, getChat);
router.post("/:id/send", authenticateUser, sendMessage);

export default router;