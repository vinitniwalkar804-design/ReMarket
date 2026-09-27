import { Router } from "express";
import { authenticateUser, requireAdmin } from "../middleware/auth.js";
import {
  getDashboardStats, getTrends, getCustomers, getCustomerDetail, getProductsAdmin,
  getProductDetailAdmin, updateProductStatusAdmin, removeProductAdmin, getOrdersAdmin,
  getAnalytics, getPersonas, getClusters, getClusteringVisualization,
  getCustomerJourney, getProductIntelligence, getProductIntelligenceDetailAdmin, getSellersAdmin, getSellerDetailAdmin,
  updateSellerAdmin, getMarketplaceReports, getModerationStats, getCustomerAttractionAdmin,
  getAttractionAnalyticsAdmin, getSalesInsightsAdmin, getSellerIntelligenceAdmin,
} from "../controllers/adminController.js";
import { getModerationQueue, resolveReport } from "../controllers/reportController.js";
import {
  getDataset, runKmeansPipeline, runAgglomerativePipeline, runDbscanPipeline,
  runConsensus, runFullPipeline, getResults, getPersonas as getClusterPersonas,
  getCustomerClusters, getHistory,
} from "../controllers/clusterController.js";

const router = Router();

router.use(authenticateUser, requireAdmin);

router.get("/analytics", getAnalytics);
router.get("/stats", getDashboardStats);
router.get("/trends", getTrends);
router.get("/journey", getCustomerJourney);
router.get("/customers", getCustomers);
// Registered before "/customers/:id" for the same reason as the intelligence
// route below: the segment counts differ so Express cannot confuse them, but the
// specific path reads better next to its siblings.
router.get("/customers/:id/attraction", getCustomerAttractionAdmin);
router.get("/customers/:id", getCustomerDetail);
router.get("/products", getProductsAdmin);
// Registered before "/products/:id" purely for readability: the paths differ in
// segment count so Express cannot confuse them, but keeping the specific one
// adjacent to its siblings makes the workspace's endpoint easy to find.
router.get("/products/:productId/intelligence", getProductIntelligenceDetailAdmin);
router.get("/products/:id", getProductDetailAdmin);
router.patch("/products/:id/status", updateProductStatusAdmin);
router.delete("/products/:id", removeProductAdmin);
router.get("/orders", getOrdersAdmin);
router.get("/product-intelligence", getProductIntelligence);
router.get("/sellers", getSellersAdmin);
router.get("/sellers/:id", getSellerDetailAdmin);
router.patch("/sellers/:id", updateSellerAdmin);
router.get("/reports", getMarketplaceReports);

// --- Marketplace intelligence ----------------------------------------------
// The three catalogue-level reports. They are deliberately separate endpoints
// rather than one "intelligence" blob: each backs a distinct destination in the
// sidebar, and an operator who only opens Sales Insights should not pay for the
// event aggregation the attraction report needs. All three are still one
// aggregate pass each server-side - see services/marketplaceIntelligence.js.
router.get("/attraction", getAttractionAnalyticsAdmin);
router.get("/sales-insights", getSalesInsightsAdmin);
router.get("/seller-intelligence", getSellerIntelligenceAdmin);

// --- Moderation: the report queue and the listings it acts on --------------
// The queue is a separate namespace from /reports (which is marketplace health,
// not customer complaints) so the two can grow apart without renaming either.
router.get("/moderation/stats", getModerationStats);
router.get("/moderation/reports", getModerationQueue);
router.patch("/moderation/reports/:id", resolveReport);

router.get("/personas", getPersonas);
router.get("/clusters", getClusters);
router.get("/visualization", getClusteringVisualization);

// --- Cluster Lab: the live segmentation console -------------------------
// `customer/:id` is registered before `results`/`personas` style paths only
// because Express matches in order; all of these are distinct literals, so the
// ordering here is readability rather than necessity.
router.get("/clusters/dataset", getDataset);
router.get("/clusters/history", getHistory);
router.get("/clusters/results", getResults);
router.get("/clusters/personas", getClusterPersonas);
router.get("/clusters/customer/:id", getCustomerClusters);
router.post("/clusters/run", runFullPipeline);
router.post("/clusters/kmeans", runKmeansPipeline);
router.post("/clusters/agglomerative", runAgglomerativePipeline);
router.post("/clusters/dbscan", runDbscanPipeline);
router.post("/clusters/hybrid", runConsensus);

export default router;