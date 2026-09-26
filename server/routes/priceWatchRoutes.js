import { Router } from "express";
import { authenticateUser } from "../middleware/auth.js";
import { getMyPriceWatches, addPriceWatch, removePriceWatch, priceDropClick } from "../controllers/priceWatchController.js";

const router = Router();

router.use(authenticateUser);

router.get("/", getMyPriceWatches);
router.post("/", addPriceWatch);
router.delete("/:id", removePriceWatch);
router.post("/:id/click", priceDropClick);

export default router;