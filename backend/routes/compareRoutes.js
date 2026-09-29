import { Router } from "express";
import { getCompare, toggleCompare, compareSelect, clearCompare } from "../controllers/compareController.js";
import { authenticateUser } from "../middleware/auth.js";

const router = Router();

router.get("/", authenticateUser, getCompare);
router.post("/", authenticateUser, toggleCompare);
router.post("/select", authenticateUser, compareSelect);
router.delete("/", authenticateUser, clearCompare);

export default router;