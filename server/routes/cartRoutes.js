import { Router } from "express";
import { getCart, addToCart, removeFromCart, clearCart } from "../controllers/cartController.js";
import { authenticateUser } from "../middleware/auth.js";

const router = Router();

router.get("/", authenticateUser, getCart);
router.post("/", authenticateUser, addToCart);
router.delete("/:id", authenticateUser, removeFromCart);
router.delete("/", authenticateUser, clearCart);

export default router;