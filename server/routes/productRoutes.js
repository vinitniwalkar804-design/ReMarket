import { Router } from "express";
import {
  getProducts, getProduct, createProduct, updateProduct, deleteProduct,
  getFeatured, getTrending, getRecent, getDeals, getNearby, getCategories, getMyProducts, getRecommended,
  getSimilarProducts, getPriceHistory,
} from "../controllers/productController.js";
import { authenticateUser, optionalAuth } from "../middleware/auth.js";

const router = Router();

router.get("/", getProducts);
router.get("/featured", getFeatured);
router.get("/trending", getTrending);
router.get("/recent", getRecent);
router.get("/deals", getDeals);
router.get("/nearby", getNearby);
router.get("/categories", getCategories);
router.get("/recommended", authenticateUser, getRecommended);
router.get("/my", authenticateUser, getMyProducts);
router.get("/:id", optionalAuth, getProduct);
router.get("/:id/similar", getSimilarProducts);
router.get("/:id/price-history", getPriceHistory);
router.post("/", authenticateUser, createProduct);
router.put("/:id", authenticateUser, updateProduct);
router.delete("/:id", authenticateUser, deleteProduct);

export default router;