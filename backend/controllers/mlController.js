import {
  runFullPipeline,
  getResults,
  getDataset,
  getHistory,
  getPersonas,
  getCustomerClusters,
} from "./clusterController.js";
import { buildClusterFeatureMatrix, filterClusterable, persistFeatures, FEATURE_NAMES } from "../services/clusterFeatures.js";
import { ClusterResult } from "../models/index.js";

/**
 * The algorithm whose partition the product reports. Personas and cluster
 * profiles are derived from its labels. Kept here because the run lookup below
 * is what the admin tables and persona API trust to find "the" segmentation.
 */
const PRIMARY_ALGORITHM = "kmeans";

/**
 * Compatibility surface for the original ML Lab pages.
 *
 * `/api/ml/run` and `/api/ml/results` predate the Cluster Lab and are still
 * linked from the admin navigation, so they are kept working. They now delegate
 * to the same controller as the newer `/api/admin/clusters/*` routes -- there is
 * one implementation of a run, not two that can drift apart.
 */
export const runClustering = runFullPipeline;
export { getResults, getDataset, getHistory, getPersonas, getCustomerClusters };

/**
 * The newest run that produced a primary (K-Means) result.
 *
 * `adminController` consumes this to annotate the customer tables and to show
 * personas, so it returns the primary ClusterResult document itself (which carries
 * `labels` and `runId`) rather than the newer ClusterRun audit record.
 *
 * The search anchors on the primary algorithm rather than requiring all four. A
 * run always has a K-Means result, so anchoring on it means the admin shows the
 * latest real segmentation instead of skipping past it to an older run that
 * happened to be the first one containing every comparison algorithm. The other
 * algorithms are still returned in `results` when they exist, and the comparison
 * pages already render a missing algorithm as absent.
 */
export const getLatestCompleteClusterRun = async () => {
  const runs = await ClusterResult.find({ algorithm: PRIMARY_ALGORITHM })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();
  for (const candidate of runs) {
    const results = await ClusterResult.find({ runId: candidate.runId }).lean();
    if (results.length > 0) return { run: candidate, results };
  }
  return null;
};

/**
 * Build the feature matrix and persist it. The seed script calls this so a fresh
 * database has a populated Cluster Lab before anyone presses Run.
 */
export const buildCustomerFeatures = async () => {
  const matrix = await buildClusterFeatureMatrix();
  await persistFeatures(matrix.features);
  return matrix.features;
};

/**
 * Feature matrix for the tables on the legacy ML Lab page, persisted so the page
 * shows the same numbers that were clustered.
 */
export const getFeatures = async (req, res) => {
  try {
    const matrix = await buildClusterFeatureMatrix();
    const clusterable = filterClusterable(matrix.features);
    await persistFeatures(matrix.features);
    return res.json({
      success: true,
      totalCustomers: matrix.features.length,
      clusterableCustomers: clusterable.length,
      features: matrix.features,
      customers: matrix.customers,
      featureNames: FEATURE_NAMES,
      collection: matrix.stats,
    });
  } catch (error) {
    res.status(500).json({ message: `Could not build the feature matrix: ${error.message}` });
  }
};

/**
 * Raw per-algorithm results for the comparison view.
 *
 * Only algorithms present in the requested run are returned. An algorithm that
 * was never run is reported as absent rather than as an empty partition, so the
 * comparison table cannot imply a result that does not exist.
 */
export const getAlgorithmComparison = async (req, res) => {
  try {
    const runId = req.query.runId;
    const query = runId ? { runId: String(runId) } : { runId: { $in: await recentRunIds() } };
    const results = await ClusterResult.find(query).sort({ createdAt: -1 }).lean();
    res.json({ success: true, comparison: results });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const recentRunIds = async () => {
  const results = await ClusterResult.find({}).sort({ createdAt: -1 }).limit(8).distinct("runId");
  return results.length ? results : ["__none__"];
};
