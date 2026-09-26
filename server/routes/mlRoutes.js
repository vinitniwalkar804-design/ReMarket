import { Router } from "express";
import { authenticateUser, requireAdmin } from "../middleware/auth.js";
import { runClustering, getResults } from "../controllers/mlController.js";

const router = Router();

router.post("/run", authenticateUser, requireAdmin, runClustering);
router.get("/results", authenticateUser, requireAdmin, getResults);

export default router;