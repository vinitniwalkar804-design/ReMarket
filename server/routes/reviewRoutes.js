import { Router } from "express";
import { getProductReviews, createReview } from "../controllers/reviewController.js";
import { authenticateUser } from "../middleware/auth.js";

const router = Router();

router.get("/:productId", getProductReviews);
router.post("/", authenticateUser, createReview);

export default router;