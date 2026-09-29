import { Router } from "express";
import { getWishlist, addToWishlist, removeFromWishlist, isInWishlist } from "../controllers/wishlistController.js";
import { authenticateUser } from "../middleware/auth.js";

const router = Router();

router.get("/", authenticateUser, getWishlist);
router.post("/", authenticateUser, addToWishlist);
router.post("/check/:id", authenticateUser, isInWishlist);
router.delete("/:id", authenticateUser, removeFromWishlist);

export default router;