import { Router } from "express";
import { getProfile, updateProfile, getSellerProfile, getMyStats, getVerifiedSellers } from "../controllers/userController.js";
import { authenticateUser, optionalAuth } from "../middleware/auth.js";

const router = Router();

router.get("/profile", authenticateUser, getProfile);
router.put("/profile", authenticateUser, updateProfile);
router.get("/stats", authenticateUser, getMyStats);
router.get("/verified-sellers", getVerifiedSellers);
router.get("/seller/:id", optionalAuth, getSellerProfile);

export default router;