import { Router } from "express";
import { optionalAuth, authenticateUser } from "../middleware/auth.js";
import { searchSuggestions, continueShopping } from "../controllers/searchController.js";

const router = Router();

router.get("/suggestions", optionalAuth, searchSuggestions);
router.get("/continue", authenticateUser, continueShopping);

export default router;