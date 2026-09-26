import mongoose from "mongoose";

/**
 * One document per named segment per run.
 *
 * A persona is only written when the algorithm had enough measured evidence to
 * earn the name. Clusters below the evidence threshold are still returned, but
 * with an "Unnamed segment" label and a null persona, so the console never shows
 * a confident marketing description for a group the data does not support.
 */
const customerPersonaSchema = new mongoose.Schema(
  {
    runId: { type: String, required: true, index: true },
    personaId: { type: Number, required: true },
    name: { type: String, required: true },
    signature: { type: String, default: "" },
    description: { type: String, default: "" },
    marketingStrategy: { type: String, default: "" },
    matchScore: { type: Number, default: 0 },
    confidence: { type: Number, default: null },
    marginOverRunnerUp: { type: Number, default: null },
    evidence: { type: mongoose.Schema.Types.Mixed, default: [] },
    definingBehaviors: { type: [String], default: [] },
    counterSignals: { type: [String], default: [] },
    alternatives: { type: mongoose.Schema.Types.Mixed, default: [] },
    isNamed: { type: Boolean, default: true },
    namingReason: { type: String, default: "" },
    characteristics: { type: mongoose.Schema.Types.Mixed, default: {} },
    populationMean: { type: mongoose.Schema.Types.Mixed, default: {} },
    highFeatures: { type: mongoose.Schema.Types.Mixed, default: [] },
    lowFeatures: { type: mongoose.Schema.Types.Mixed, default: [] },
    engagementIndex: { type: Number, default: 0 },
    purchaseTendency: { type: Number, default: 0 },
    avgSpending: { type: Number, default: 0 },
    avgDecisionTime: { type: Number, default: 0 },
    avgViews: { type: Number, default: 0 },
    avgComparisons: { type: Number, default: 0 },
    avgNegotiations: { type: Number, default: 0 },
    avgDiscountUsage: { type: Number, default: 0 },
    purchaseFrequency: { type: Number, default: 0 },
    dominantCategories: { type: [String], default: [] },
    customers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    customerCount: { type: Number, default: 0 },
    percentage: { type: Number, default: 0 },
  },
  { timestamps: true, minimize: false }
);

customerPersonaSchema.index({ runId: 1, personaId: 1 }, { unique: true });

const CustomerPersona = mongoose.model("CustomerPersona", customerPersonaSchema);
export default CustomerPersona;
