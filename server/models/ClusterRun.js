import mongoose from "mongoose";

/**
 * The audit record for one clustering execution.
 *
 * Runs are kept even when they fail. A failed run is the most useful thing in
 * the history: it records what the admin asked for, what the data looked like at
 * the time, and why the pipeline refused to produce a segmentation. Without
 * that, "the ML page is empty" is indistinguishable from "the ML page is broken".
 */
const clusterRunSchema = new mongoose.Schema(
  {
    runId: { type: String, required: true, unique: true, index: true },
    status: {
      type: String,
      enum: ["running", "completed", "failed"],
      default: "running",
      index: true,
    },
    trigger: { type: String, enum: ["manual", "api", "scheduled"], default: "manual" },
    algorithms: { type: [String], default: [] },
    parameters: { type: mongoose.Schema.Types.Mixed, default: {} },
    featureSchemaVersion: { type: String, default: "" },
    featureCount: { type: Number, default: 0 },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    requestedByName: { type: String, default: "" },
    dataset: { type: mongoose.Schema.Types.Mixed, default: {} },
    selectedModel: { type: String, default: "" },
    optimalK: { type: Number, default: null },
    numClusters: { type: Number, default: 0 },
    noiseCount: { type: Number, default: 0 },
    clusterSizes: { type: [Number], default: [] },
    metrics: { type: mongoose.Schema.Types.Mixed, default: {} },
    agreement: { type: mongoose.Schema.Types.Mixed, default: null },
    warnings: { type: [String], default: [] },
    notes: { type: [String], default: [] },
    durationMs: { type: Number, default: null },
    error: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true, minimize: false }
);

clusterRunSchema.index({ createdAt: -1 });

const ClusterRun = mongoose.model("ClusterRun", clusterRunSchema);
export default ClusterRun;
