import { Router } from "express";
import { register, login, me, logout } from "../controllers/authController.js";
import { authenticateUser } from "../middleware/auth.js";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.get("/me", authenticateUser, me);
router.post("/logout", authenticateUser, logout);

export default router;