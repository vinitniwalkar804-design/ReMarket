import mongoose from "mongoose";
import {
  buildClusterFeatureMatrix,
  filterClusterable,
  persistFeatures,
  computeDominantCategories,
  getCustomerDirectory,
  FEATURE_NAMES,
} from "../services/clusterFeatures.js";
import {
  summariseDataset,
  runKmeans,
  runAgglomerative,
  runDbscan,
  runHybrid,
  runFullPipeline as requestFullPipeline,
  getFeatureSchema,
  getHealth,
  MlServiceError,
} from "../services/mlService.js";
import { ClusterResult, ClusterRun, CustomerPersona, CustomerFeature } from "../models/index.js";

const MIN_CUSTOMERS = 5;
const ALL_ALGORITHMS = ["kmeans", "agglomerative", "dbscan", "hybrid"];

/**
 * The algorithm whose partition the product reports as "the" segmentation.
 *
 * K-Means. The ML service computes Agglomerative, DBSCAN and a consensus
 * partition too, and they are persisted for comparison, but the cluster
 * profiles, the personas and every number the admin console shows come from this
 * algorithm's labels. It is named in one place so no call site can drift.
 */
const PRIMARY_ALGORITHM = "kmeans";

/** The partition personas and profiles are derived from, whatever the run mode. */
const primaryResult = (payload) => payload?.[PRIMARY_ALGORITHM] ?? null;

const newRunId = () => `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const isObjectId = (value) => mongoose.isValidObjectId(String(value || ""));

/** Only whole-number parameters inside sane ranges reach the ML service. */
const readParams = (body = {}) => {
  const int = (value, fallback, min, max) => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
  };
  const float = (value, fallback, min, max) => {
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
  };

  return {
    k: body.k === undefined || body.k === null || body.k === "" ? null : int(body.k, null, 2, 100),
    hybridK:
      body.hybridK === undefined || body.hybridK === null || body.hybridK === ""
        ? null
        : int(body.hybridK, null, 2, 100),
    minK: int(body.minK, 2, 2, 20),
    maxK: int(body.maxK, 8, 2, 20),
    minSamples:
      body.minSamples === undefined || body.minSamples === null || body.minSamples === ""
        ? null
        : int(body.minSamples, null, 2, 1000),
    eps: body.eps === undefined || body.eps === null || body.eps === "" ? null : float(body.eps, null, 0.0001, 1000),
    nInit: int(body.nInit, 10, 1, 100),
    seed: int(body.seed, 42, 0, 2147483647),
    linkage: ["ward", "complete", "average", "single"].includes(body.linkage) ? body.linkage : "ward",
    metric: ["euclidean", "manhattan", "l1", "l2"].includes(body.metric) ? body.metric : "euclidean",
    scaler: body.scaler === "robust" ? "robust" : "standard",
  };
};

/** Ask the ML service to describe the matrix before any clustering is attempted. */
export const getDataset = async (req, res) => {
  try {
    const matrix = await buildClusterFeatureMatrix();
    const clusterable = filterClusterable(matrix.features);

    // A stale matrix from a previous run would make the console disagree with the
    // data, so it is refreshed whenever the dataset is opened.
    const persisted = await persistFeatures(matrix.features);

    let summary = null;
    let serviceStatus = { reachable: false, detail: "ML service unreachable" };
    let mlError = null;
    try {
      const [health, datasetSummary, schema] = await Promise.all([
        getHealth(),
        summariseDataset(matrix.features),
        getFeatureSchema(),
      ]);
      summary = datasetSummary;
      serviceStatus = {
        reachable: true,
        status: health.status,
        featureSchemaVersion: health.featureSchemaVersion,
        featureCount: health.featureCount,
        minCustomers: health.minCustomers,
        algorithms: health.algorithms,
      };
    } catch (error) {
      mlError = error;
    }

    const payload = {
      success: !mlError,
      dataset: summary,
      featureNames: FEATURE_NAMES,
      clusterableCount: clusterable.length,
      // Customers with no tracked activity are reported, not hidden, so the admin
      // can see why the clusterable count is lower than the customer count.
      customersWithNoActivity: matrix.features.length - clusterable.length,
      customers: matrix.customers,
      collection: { ...matrix.stats, featuresPersisted: persisted },
      service: serviceStatus,
    };

    if (mlError) {
      // The raw matrix still goes back so the console can show real customer
      // activity even while the modelling service is down.
      return res.status(mlError instanceof MlServiceError ? mlError.status : 502).json({
        ...payload,
        message: mlError.message,
        code: mlError.code || "ml_service_error",
      });
    }

    payload.featureSchema = await getFeatureSchema().catch(() => null);
    return res.json(payload);
  } catch (error) {
    res.status(500).json({ message: `Could not build the feature matrix: ${error.message}` });
  }
};

const persistAlgorithmResults = async (runId, payload) => {
  const documents = ALL_ALGORITHMS.filter((algorithm) => payload?.[algorithm]).map((algorithm) => {
    const result = payload[algorithm];
    // The primary result carries the provenance the admin console reads: the PCA
    // projection, the measured cluster profiles and the methodology write-up.
    // They describe the K-Means partition, so they are stored on the K-Means
    // document and not copied onto a partition they do not describe.
    const isPrimary = algorithm === PRIMARY_ALGORITHM;
    // Cross-algorithm agreement is genuinely about the consensus, so it stays on
    // the consensus document where it belongs.
    const isConsensus = algorithm === "hybrid";
    return {
      runId,
      algorithm,
      isPrimary,
      numClusters: result.numClusters ?? 0,
      requestedK: result.requestedK ?? null,
      clusterSizes: result.clusterSizes ?? [],
      nSamples: result.nSamples ?? 0,
      labels: result.labels ?? {},
      metrics: result.metrics ?? { silhouette: null, daviesBouldin: null, calinskiHarabasz: null },
      metricNotes: result.metricNotes ?? {},
      parameters: result.parameters ?? {},
      kSelection: result.kSelection ?? null,
      noiseCount: result.noiseCount ?? 0,
      noisePercentage: result.noisePercentage ?? 0,
      trusted: result.trusted ?? null,
      notes: result.notes ?? [],
      contributions: isConsensus ? payload.agreement ?? null : null,
      agreement: isConsensus ? payload.agreement ?? null : null,
      consensusKReason: result.consensusKReason ?? "",
      pcaData: isPrimary ? payload.pcaData ?? null : null,
      clusterProfiles: isPrimary ? payload.clusterProfiles ?? null : null,
      methodology: isPrimary ? payload.methodology ?? null : null,
    };
  });
  if (documents.length > 0) await ClusterResult.insertMany(documents);
  return documents.length;
};

/**
 * Persist personas for the primary (K-Means) partition.
 *
 * The persona rules score measured cluster means, so a persona always describes
 * a real partition. Which partition is being described is what matters for
 * honesty, and the reported segmentation is K-Means, so that is the partition
 * whose personas are stored. A run explicitly requested as a single comparison
 * algorithm carries no personas, because its clusters are not the segmentation
 * the product reports.
 */
const persistPersonas = async (runId, payload) => {
  const personas = Array.isArray(payload?.personas) ? payload.personas : [];
  const primary = primaryResult(payload);
  if (personas.length === 0 || !primary) return 0;

  const dominant = await computeDominantCategories(primary.labels ?? {});
  const documents = personas.map((persona) => {
    const customers = (persona.customerIds ?? []).filter(isObjectId);
    return {
      runId,
      sourceAlgorithm: PRIMARY_ALGORITHM,
      personaId: persona.id,
      name: persona.name,
      signature: persona.signature ?? "",
      description: persona.description ?? "",
      marketingStrategy: persona.marketingStrategy ?? "",
      matchScore: persona.matchScore ?? 0,
      confidence: persona.confidence ?? null,
      marginOverRunnerUp: persona.marginOverRunnerUp ?? null,
      evidence: persona.evidence ?? [],
      definingBehaviors: persona.definingBehaviors ?? [],
      counterSignals: persona.counterSignals ?? [],
      alternatives: persona.alternatives ?? [],
      isNamed: persona.isNamed ?? true,
      namingReason: persona.namingReason ?? "",
      characteristics: persona.characteristics ?? {},
      populationMean: persona.populationMean ?? {},
      highFeatures: persona.highFeatures ?? [],
      lowFeatures: persona.lowFeatures ?? [],
      engagementIndex: persona.engagementIndex ?? 0,
      purchaseTendency: persona.purchaseTendency ?? 0,
      avgSpending: persona.avgSpending ?? 0,
      avgDecisionTime: persona.avgDecisionTime ?? 0,
      avgViews: persona.avgViews ?? 0,
      avgComparisons: persona.avgComparisons ?? 0,
      avgNegotiations: persona.avgNegotiations ?? 0,
      avgDiscountUsage: persona.avgDiscountUsage ?? 0,
      purchaseFrequency: persona.purchaseFrequency ?? 0,
      dominantCategories: dominant[persona.id] ?? persona.dominantCategories ?? [],
      customers,
      customerCount: customers.length,
      percentage: persona.percentage ?? 0,
    };
  });
  await CustomerPersona.insertMany(documents);
  return documents.length;
};

/** Undo a partial write so a failed run never leaves half a segmentation behind. */
const rollbackRun = async (runId) => {
  await Promise.allSettled([
    ClusterResult.deleteMany({ runId }),
    CustomerPersona.deleteMany({ runId }),
  ]);
};

const RUNNERS = {
  kmeans: (features, params) => runKmeans(features, params),
  agglomerative: (features, params) => runAgglomerative(features, params),
  dbscan: (features, params) => runDbscan(features, params),
  hybrid: (features, params) => runHybrid(features, params),
  pipeline: (features, params) => requestFullPipeline(features, params),
};

/**
 * Whether a run mode produces personas.
 *
 * The full pipeline does, because K-Means is its primary result. A run asked for
 * as a single named algorithm does not, except for K-Means itself: those modes
 * exist to be compared against the primary, and a persona hanging off a
 * comparison run would compete with the real segmentation.
 */
const producesPersonas = (mode) => mode === "pipeline" || mode === PRIMARY_ALGORITHM;

/**
 * Run one clustering mode end to end and persist it as a new run.
 *
 * The run record is created *before* the ML service is called, so a run that
 * fails is still visible in the history with its reason. An empty history plus a
 * blank page is indistinguishable from a broken page.
 */
const executeRun = (mode) => async (req, res) => {
  const runId = newRunId();
  const startedAt = Date.now();
  const params = readParams(req.body);
  let matrix = null;
  let clusterableCount = 0;

  try {
    matrix = await buildClusterFeatureMatrix();
    const clusterable = filterClusterable(matrix.features);
    clusterableCount = clusterable.length;

    if (clusterableCount < MIN_CUSTOMERS) {
      return res.status(400).json({
        message:
          `Clustering needs at least ${MIN_CUSTOMERS} customers with tracked activity; ` +
          `${clusterableCount} of ${matrix.features.length} customers currently qualify.`,
        code: "insufficient_data",
        detail: {
          totalCustomers: matrix.features.length,
          clusterableCustomers: clusterableCount,
          events: matrix.stats.events,
        },
      });
    }

    await ClusterRun.create({
      runId,
      status: "running",
      trigger: "manual",
      algorithms: mode === "pipeline" ? ALL_ALGORITHMS : [mode],
      parameters: params,
      featureCount: FEATURE_NAMES.length,
      requestedBy: req.user?._id ?? null,
      requestedByName: req.user?.name ?? "",
      dataset: { ...matrix.stats, totalCustomers: matrix.features.length, clusterableCustomers: clusterableCount },
    });

    const envelope = await RUNNERS[mode](clusterable, params);
    const payload = envelope.results ?? {};
    const warnings = [...(envelope.warnings ?? [])];
    const primary = primaryResult(payload);

    // A category the interest axes do not claim means real interactions are
    // being left out of seven of the feature columns. The run still succeeds, but
    // the omission is recorded against it so the segment labels are not trusted
    // as if the whole catalogue had been represented.
    if (matrix.stats.unmappedCategories?.length) {
      warnings.push(
        `Category interest is unmeasured for: ${matrix.stats.unmappedCategories.join(", ")}. ` +
          "Interactions in those categories are excluded from the interest features; " +
          "add them to CATEGORY_INTEREST_MAP and re-run."
      );
    }

    try {
      await persistAlgorithmResults(runId, payload);
      if (producesPersonas(mode) && primary) {
        await persistPersonas(runId, payload);
      }
    } catch (persistError) {
      await rollbackRun(runId);
      throw persistError;
    }

    await ClusterRun.updateOne(
      { runId },
      {
        $set: {
          status: "completed",
          featureSchemaVersion: envelope.featureSchemaVersion ?? "",
          selectedModel: payload.selectedModel ?? mode,
          optimalK: payload.optimalK ?? null,
          // The run summary describes the primary partition, not the consensus.
          numClusters: primary?.numClusters ?? payload[mode]?.numClusters ?? 0,
          noiseCount: primary?.noiseCount ?? payload[mode]?.noiseCount ?? 0,
          clusterSizes: primary?.clusterSizes ?? payload[mode]?.clusterSizes ?? [],
          metrics: primary?.metrics ?? payload[mode]?.metrics ?? null,
          agreement: payload.agreement ?? null,
          warnings,
          notes: primary?.notes ?? payload[mode]?.notes ?? [],
          durationMs: envelope.durationMs ?? Date.now() - startedAt,
        },
      }
    );

    return res.json({
      success: true,
      runId,
      mode,
      durationMs: envelope.durationMs ?? Date.now() - startedAt,
      featureSchemaVersion: envelope.featureSchemaVersion ?? "",
      clusterableCustomers: clusterableCount,
      warnings,
      // Personas travel with the primary result only, by design.
      personas: payload.personas ?? [],
      results: payload,
    });
  } catch (error) {
    const status = error instanceof MlServiceError ? error.status : 500;
    const message = error.message || "Clustering failed";

    // The run may already exist (we only create it after the data check passes).
    const existing = await ClusterRun.findOne({ runId }).lean();
    if (existing) {
      await ClusterRun.updateOne(
        { runId },
        {
          $set: {
            status: "failed",
            durationMs: Date.now() - startedAt,
            error: { message, code: error.code ?? "clustering_failed" },
            dataset: { ...(matrix?.stats ?? {}), clusterableCustomers: clusterableCount },
          },
        }
      );
      await rollbackRun(runId);
    }

    console.error(`[ClusterRun ${mode}] ${message}`);
    return res.status(status).json({
      success: false,
      runId: existing ? runId : null,
      message,
      code: error.code ?? "clustering_failed",
      detail: error.detail ?? null,
      clusterableCustomers: clusterableCount,
    });
  }
};

export const runKmeansPipeline = executeRun("kmeans");
export const runAgglomerativePipeline = executeRun("agglomerative");
export const runDbscanPipeline = executeRun("dbscan");
export const runConsensus = executeRun("hybrid");
export const runFullPipeline = executeRun("pipeline");

/**
 * Resolve the run to show: an explicit id, or the newest one that finished.
 *
 * `requirePersonas` matters because personas are only produced by the consensus
 * runs. Resolving to the newest run of any kind would let a single-algorithm
 * comparison blank the Personas page even though a full run had just produced
 * five personas, so persona-backed views resolve to the newest run that
 * actually has personas.
 */
const resolveRunId = async (requested, { requirePersonas = false } = {}) => {
  if (requested) return String(requested);
  const query = { status: "completed" };
  if (requirePersonas) {
    const runsWithPersonas = await CustomerPersona.distinct("runId");
    if (!runsWithPersonas.length) return null;
    query.runId = { $in: runsWithPersonas };
  }
  const latest = await ClusterRun.findOne(query).sort({ createdAt: -1 }).lean();
  return latest ? latest.runId : null;
};

export const getResults = async (req, res) => {
  try {
    const runId = await resolveRunId(req.query.runId);
    if (!runId) {
      return res.json({ hasResults: false, message: "No clustering run has completed yet." });
    }
    const [run, results] = await Promise.all([
      ClusterRun.findOne({ runId }).lean(),
      ClusterResult.find({ runId }).lean(),
    ]);
    if (!run) {
      return res.status(404).json({ message: `Unknown run: ${runId}` });
    }
    return res.json({ hasResults: true, runId, run, results });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getPersonas = async (req, res) => {
  try {
    const runId = await resolveRunId(req.query.runId, { requirePersonas: true });
    if (!runId) {
      return res.json({ hasResults: false, personas: [], message: "No clustering run has produced personas yet. Personas are generated by the consensus (hybrid) and full-pipeline runs, not by single-algorithm comparisons." });
    }
    const personas = await CustomerPersona.find({ runId })
      .sort({ personaId: 1 })
      .populate("customers", "name email location avatar")
      .lean();
    const run = await ClusterRun.findOne({ runId }).select("runId createdAt optimalK numClusters status durationMs warnings").lean();
    return res.json({ hasResults: personas.length > 0, runId, run, personas });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/** Every segment a single customer belongs to, across every algorithm of a run. */
export const getCustomerClusters = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) return res.status(400).json({ message: "Invalid customer id" });
    const runId = await resolveRunId(req.query.runId);
    if (!runId) {
      return res.json({ runId: null, message: "No clustering run has completed yet.", algorithms: {}, personas: [] });
    }
    const key = String(id);
    const results = await ClusterResult.find({ runId }).lean();
    const algorithms = {};
    for (const result of results) {
      const label = result.labels?.[key];
      algorithms[result.algorithm] = {
        label: label === undefined ? null : label,
        isNoise: label === -1,
        numClusters: result.numClusters,
        metrics: result.metrics,
        clusterSizes: result.clusterSizes,
      };
    }
    // Labels come from the run being viewed, but personas only exist on
    // consensus runs. Resolving them independently and naming the run they came
    // from keeps a K-Means comparison from silently looking like this customer
    // has no persona at all.
    const personaRunId = await resolveRunId(req.query.runId, { requirePersonas: true });
    const personas = personaRunId
      ? await CustomerPersona.find({ runId: personaRunId, customers: id }).lean()
      : [];
    const feature = await CustomerFeature.findOne({ userId: id }).lean();
    return res.json({
      runId,
      userId: key,
      algorithms,
      personas,
      personaRunId: personaRunId ?? null,
      personasFromDifferentRun: Boolean(personaRunId) && personaRunId !== runId,
      feature,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getHistory = async (req, res) => {
  try {
    const requestedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Math.min(100, Math.max(1, Number.isFinite(requestedLimit) ? requestedLimit : 20));
    const statusFilter = ["completed", "failed", "running"].includes(req.query.status) ? req.query.status : null;
    const query = statusFilter ? { status: statusFilter } : {};
    const runs = await ClusterRun.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    const counts = await ClusterRun.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);
    return res.json({
      runs: runs.map((run) => ({
        runId: run.runId,
        status: run.status,
        trigger: run.trigger,
        algorithms: run.algorithms,
        createdAt: run.createdAt,
        updatedAt: run.updatedAt,
        optimalK: run.optimalK,
        numClusters: run.numClusters,
        noiseCount: run.noiseCount,
        metrics: run.metrics,
        durationMs: run.durationMs,
        requestedByName: run.requestedByName,
        featureSchemaVersion: run.featureSchemaVersion,
        error: run.error,
      })),
      counts: Object.fromEntries(counts.map((row) => [row._id, row.count])),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
