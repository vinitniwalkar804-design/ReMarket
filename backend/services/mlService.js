/**
 * Thin, well-behaved client for the Python ML service.
 *
 * The Node layer owns the database; the Python layer owns the mathematics. This
 * module is the only place that crosses that boundary, so transport failures,
 * timeouts and the service's structured error payloads are translated into
 * messages an admin can actually act on instead of leaking an axios stack.
 */
import axios from "axios";
import { config } from "../config/index.js";

const REQUEST_TIMEOUT_MS = 120_000;

const client = axios.create({
  baseURL: config.mlServiceUrl,
  timeout: REQUEST_TIMEOUT_MS,
  headers: { "Content-Type": "application/json" },
  // Treat any non-2xx as an error we want to handle ourselves, not a throw.
  validateStatus: () => true,
});

export class MlServiceError extends Error {
  constructor(message, { status = 502, code = "ml_service_error", detail = null } = {}) {
    super(message);
    this.name = "MlServiceError";
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

const describeTransportError = (error) => {
  if (error.code === "ECONNREFUSED") {
    return new MlServiceError(
      `The ML service is not running at ${config.mlServiceUrl}. Start it with "uvicorn app.main:app --reload --port 8000" from the ml-service folder.`,
      { status: 503, code: "ml_service_unreachable" }
    );
  }
  if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
    return new MlServiceError(
      `The ML service did not respond within ${REQUEST_TIMEOUT_MS / 1000}s.`,
      { status: 504, code: "ml_service_timeout" }
    );
  }
  return new MlServiceError(
    `Could not reach the ML service: ${error.message}`,
    { status: 502, code: "ml_service_unreachable" }
  );
};

const post = async (path, body) => {
  let response;
  try {
    response = await client.post(path, body);
  } catch (error) {
    throw describeTransportError(error);
  }

  if (response.status >= 200 && response.status < 300) {
    return response.data;
  }

  // FastAPI reports validation problems as a list of field errors and pipeline
  // problems as a single "detail" string. Both are surfaced verbatim: they are
  // written to be read by the admin who triggered the run.
  const { detail, message } = response.data || {};
  if (Array.isArray(detail)) {
    const summary = detail
      .map((item) => `${(item.loc || []).slice(1).join(".")}: ${item.msg}`)
      .join("; ");
    throw new MlServiceError(`The ML service rejected the request. ${summary}`, {
      status: response.status >= 500 ? 502 : 400,
      code: "ml_request_invalid",
      detail,
    });
  }
  const text = detail || message || response.statusText || "unknown error";
  throw new MlServiceError(`The ML service reported: ${text}`, {
    status: response.status >= 500 ? 502 : 400,
    code: "ml_request_rejected",
    detail: text,
  });
};

export const getHealth = async () => {
  try {
    const response = await client.get("/health");
    if (response.status >= 200 && response.status < 300) return response.data;
    throw new MlServiceError("The ML service health check failed.", { status: 502 });
  } catch (error) {
    if (error instanceof MlServiceError) throw error;
    throw describeTransportError(error);
  }
};

export const getFeatureSchema = async () => {
  try {
    const response = await client.get("/features");
    if (response.status >= 200 && response.status < 300) return response.data;
    throw new MlServiceError("The ML service did not return a feature schema.", { status: 502 });
  } catch (error) {
    if (error instanceof MlServiceError) throw error;
    throw describeTransportError(error);
  }
};

export const summariseDataset = (features) => post("/dataset/summary", { features });

export const runKmeans = (features, params = {}) =>
  post("/cluster/kmeans", {
    features,
    k: params.k ?? null,
    minK: params.minK ?? 2,
    maxK: params.maxK ?? 8,
    nInit: params.nInit ?? 10,
    seed: params.seed ?? 42,
    scaler: params.scaler ?? "standard",
  });

export const runAgglomerative = (features, params = {}) =>
  post("/cluster/agglomerative", {
    features,
    k: params.k ?? null,
    minK: params.minK ?? 2,
    maxK: params.maxK ?? 8,
    linkage: params.linkage ?? "ward",
    metric: params.metric ?? "euclidean",
    scaler: params.scaler ?? "standard",
    seed: params.seed ?? 42,
  });

export const runDbscan = (features, params = {}) =>
  post("/cluster/dbscan", {
    features,
    eps: params.eps ?? null,
    minSamples: params.minSamples ?? null,
    scaler: params.scaler ?? "standard",
    seed: params.seed ?? 42,
  });

export const runHybrid = (features, params = {}) =>
  post("/cluster/hybrid", {
    features,
    k: params.k ?? null,
    minK: params.minK ?? 2,
    maxK: params.maxK ?? 8,
    linkage: params.linkage ?? "ward",
    metric: params.metric ?? "euclidean",
    eps: params.eps ?? null,
    minSamples: params.minSamples ?? null,
    hybridK: params.hybridK ?? null,
    nInit: params.nInit ?? 10,
    scaler: params.scaler ?? "standard",
    seed: params.seed ?? 42,
  });

export const runFullPipeline = (features, params = {}) =>
  post("/cluster", {
    features,
    k: params.k ?? null,
    minK: params.minK ?? 2,
    maxK: params.maxK ?? 8,
    linkage: params.linkage ?? "ward",
    metric: params.metric ?? "euclidean",
    eps: params.eps ?? null,
    minSamples: params.minSamples ?? null,
    hybridK: params.hybridK ?? null,
    nInit: params.nInit ?? 10,
    scaler: params.scaler ?? "standard",
    seed: params.seed ?? 42,
  });
