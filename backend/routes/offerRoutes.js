import { Router } from "express";
import { sendOffer, myOffers, incomingOffers, respondOffer } from "../controllers/offerController.js";
import { authenticateUser } from "../middleware/auth.js";

const router = Router();

router.get("/my", authenticateUser, myOffers);
router.get("/incoming", authenticateUser, incomingOffers);
router.post("/", authenticateUser, sendOffer);
router.put("/:id/respond", authenticateUser, respondOffer);

export default router;