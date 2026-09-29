import mongoose from "mongoose";

/**
 * One document per (run, algorithm). A single run produces four of these: the
 * three base algorithms and the consensus, so the admin can compare them side by
 * side from the same dataset and the same parameters.
 *
 * Only one of them is the reported segmentation, and that one carries
 * `isPrimary: true` together with the `pcaData`, `clusterProfiles` and
 * `methodology` that describe it. The other three are comparison output and are
 * stored without those fields, so a cluster map can never be drawn from a
 * partition nobody claimed as primary.
 *
 * The metrics are deliberately nullable. Silhouette, Davies-Bouldin and
 * Calinski-Harabasz are undefined in several perfectly ordinary situations (one
 * cluster, fewer than two clustered customers, DBSCAN that found only noise).
 * Storing 0 in those cases would show the admin a confidently wrong number, so
 * the value stays null and `metricNotes` carries the reason.
 */
const clusterResultSchema = new mongoose.Schema(
  {
    runId: { type: String, required: true, index: true },
    algorithm: { type: String, required: true, index: true },
    /** True for the single algorithm whose partition the product reports. */
    isPrimary: { type: Boolean, default: false },
    label: { type: String, default: "" },
    nSamples: { type: Number, default: 0 },
    numClusters: { type: Number, default: 0 },
    requestedK: { type: Number, default: null },
    clusterSizes: { type: [Number], default: [] },
    labels: { type: mongoose.Schema.Types.Mixed, default: {} },
    metrics: {
      silhouette: { type: Number, default: null },
      daviesBouldin: { type: Number, default: null },
      calinskiHarabasz: { type: Number, default: null },
    },
    metricNotes: { type: mongoose.Schema.Types.Mixed, default: {} },
    parameters: { type: mongoose.Schema.Types.Mixed, default: {} },
    kSelection: { type: mongoose.Schema.Types.Mixed, default: null },
    noiseCount: { type: Number, default: 0 },
    noisePercentage: { type: Number, default: 0 },
    trusted: { type: Boolean, default: null },
    notes: { type: [String], default: [] },
    contributions: { type: mongoose.Schema.Types.Mixed, default: null },
    consensusKReason: { type: String, default: "" },
    agreement: { type: mongoose.Schema.Types.Mixed, default: null },
    pcaData: { type: mongoose.Schema.Types.Mixed, default: null },
    clusterProfiles: { type: mongoose.Schema.Types.Mixed, default: null },
    methodology: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true, minimize: false }
);

clusterResultSchema.index({ runId: 1, algorithm: 1 }, { unique: true });

const ClusterResult = mongoose.model("ClusterResult", clusterResultSchema);
export default ClusterResult;
