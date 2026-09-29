import { Router } from "express";
import { createOrder, createOrders, myOrders, sellerOrders, updateOrderStatus } from "../controllers/orderController.js";
import { authenticateUser } from "../middleware/auth.js";

const router = Router();

router.get("/", authenticateUser, myOrders);
router.get("/seller", authenticateUser, sellerOrders);
router.post("/bulk", authenticateUser, createOrders);
router.post("/", authenticateUser, createOrder);
router.put("/:id/status", authenticateUser, updateOrderStatus);

export default router;