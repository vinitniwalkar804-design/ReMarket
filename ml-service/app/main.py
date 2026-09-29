"""
Smart Second-Hand Marketplace -- ML Service
Customer Segmentation & Persona Discovery

FastAPI service for customer segmentation. It is deliberately stateless: the
Node.js backend owns MongoDB, performs the customer-level feature aggregation,
and posts a prepared feature matrix here. Everything that constitutes "machine
learning" happens in this service and nowhere else.

The product's segmentation story is deliberately narrow:

    behaviour events -> features -> scaling -> K-Means -> clusters -> personas

K-Means is the algorithm whose result the product reports. Agglomerative,
DBSCAN and the consensus ("hybrid") partition are still computed so the
comparison tooling has something to compare against, but they never supply the
clusters, profiles or personas the admin sees.

Endpoints
---------
GET  /health                      liveness probe
POST /dataset/summary             describe the feature matrix before clustering
POST /cluster                     full pipeline (K-Means primary; others for comparison)
POST /cluster/kmeans              K-Means only
POST /cluster/agglomerative       Agglomerative only
POST /cluster/dbscan              DBSCAN only
POST /cluster/hybrid              consensus over the three base algorithms

Every response uses the same envelope so the admin console can render any of them
identically. Cluster counts and metrics are never invented: where a value cannot
be computed it is ``null`` and ``metricNotes`` explains why.
"""

from __future__ import annotations

import time
from typing import Any, Dict, List, Optional, Tuple

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, field_validator

# The one algorithm whose partition is reported as "the" segmentation. Personas
# and cluster profiles are computed from its labels. Kept as a constant so no
# call site can quietly re-point the primary result at a different algorithm.
PRIMARY_ALGORITHM = "kmeans"

from app.clustering.engine import (
    CONSENSUS_WEIGHTS,
    FEATURE_COLUMNS,
    FEATURE_SCHEMA_VERSION,
    NOISE_LABEL,
    PipelineError,
    assign_personas,
    choose_k,
    compute_agreement,
    compute_pca,
    dataset_summary,
    hybrid_clustering,
    k_selection_curve,
    methodology_document,
    resolve_k_range,
    preprocess_features,
    build_feature_matrix,
    profile_clusters,
    run_agglomerative,
    run_dbscan,
    run_kmeans,
    scale_features,
)
from app.clustering.feature_schema import public_schema

app = FastAPI(
    title="Smart Marketplace ML Service",
    description="Customer Segmentation & Persona Discovery using Hybrid Clustering Methods",
    version="2.0.0",
)

MIN_CUSTOMERS = 5
MAX_CUSTOMERS = 5000


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------


class BaseRunRequest(BaseModel):
    """Shared parameter surface. Admin-supplied values are validated here, never
    trusted, and never silently coerced into something different."""

    scaler: str = Field("standard", description="standard | robust")
    seed: int = Field(42, ge=0, le=2_147_483_647, description="Random state for reproducible runs")

    @field_validator("scaler")
    @classmethod
    def _check_scaler(cls, value: str) -> str:
        normalised = str(value).strip().lower()
        if normalised not in ("standard", "robust"):
            raise ValueError("scaler must be 'standard' or 'robust'")
        return normalised


class SingleAlgorithmRequest(BaseRunRequest):
    features: List[Dict[str, Any]] = Field(..., min_length=3, max_length=MAX_CUSTOMERS)
    k: Optional[int] = Field(None, ge=2, le=100, description="K for K-Means / Agglomerative")
    minK: int = Field(2, ge=2, le=20, description="Lower bound of the evidence sweep")
    maxK: int = Field(8, ge=2, le=20, description="Upper bound of the evidence sweep")
    linkage: str = Field("ward", description="ward | complete | average | single")
    metric: str = Field("euclidean", description="euclidean | manhattan | l1 | l2")
    eps: Optional[float] = Field(None, gt=0, le=1000, description="DBSCAN neighbourhood radius")
    minSamples: Optional[int] = Field(None, ge=2, le=1000, description="DBSCAN core-point density")

    @field_validator("maxK")
    @classmethod
    def _check_max_k(cls, value: int, info) -> int:
        if value < info.data.get("minK", 2):
            raise ValueError("maxK must be greater than or equal to minK")
        return value


class FullPipelineRequest(BaseRunRequest):
    features: List[Dict[str, Any]] = Field(..., min_length=3, max_length=MAX_CUSTOMERS)
    k: Optional[int] = Field(None, ge=2, le=100, description="Force K instead of choosing it")
    minK: int = Field(2, ge=2, le=20)
    maxK: int = Field(8, ge=2, le=20)
    linkage: str = Field("ward", description="ward | complete | average | single")
    metric: str = Field("euclidean", description="euclidean | manhattan | l1 | l2")
    eps: Optional[float] = Field(None, gt=0, le=1000)
    minSamples: Optional[int] = Field(None, ge=2, le=1000)
    hybridK: Optional[int] = Field(None, ge=2, le=100, description="Force the consensus cut size")
    nInit: int = Field(10, ge=1, le=100)

    @field_validator("maxK")
    @classmethod
    def _check_max_k(cls, value: int, info) -> int:
        if value < info.data.get("minK", 2):
            raise ValueError("maxK must be greater than or equal to minK")
        return value


class HybridRequest(BaseRunRequest):
    features: List[Dict[str, Any]] = Field(..., min_length=3, max_length=MAX_CUSTOMERS)
    k: Optional[int] = Field(None, ge=2, le=100)
    minK: int = Field(2, ge=2, le=20)
    maxK: int = Field(8, ge=2, le=20)
    linkage: str = Field("ward")
    metric: str = Field("euclidean")
    eps: Optional[float] = Field(None, gt=0, le=1000)
    minSamples: Optional[int] = Field(None, ge=2, le=1000)
    hybridK: Optional[int] = Field(None, ge=2, le=100)
    nInit: int = Field(10, ge=1, le=100)


class DatasetRequest(BaseModel):
    features: List[Dict[str, Any]] = Field(..., min_length=1, max_length=MAX_CUSTOMERS)


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


def _prepare(features: List[Dict[str, Any]], scaler: str):
    """Run the shared preprocessing chain and return everything downstream needs."""
    raw_df, user_ids = preprocess_features(features)
    processed_df, preprocessing = build_feature_matrix(raw_df)
    scaled, scaling = scale_features(processed_df, scaler)
    return raw_df, processed_df, scaled, user_ids, preprocessing, scaling


def _not_enough(count: int, minimum: int) -> HTTPException:
    return HTTPException(
        status_code=400,
        detail=(
            "Not enough behavioural data to generate reliable segments yet. "
            "Clustering needs at least {} customers with real activity; {} available.".format(
                minimum, count
            )
        ),
    )


def _pipeline_error(err: PipelineError) -> HTTPException:
    return HTTPException(status_code=400, detail=str(err))


def _envelope(results: Dict[str, Any], duration_ms: int, warnings: List[str]) -> Dict[str, Any]:
    return {
        "results": results,
        "durationMs": duration_ms,
        "featureSchemaVersion": FEATURE_SCHEMA_VERSION,
        "featureCount": len(FEATURE_COLUMNS),
        "warnings": warnings,
    }


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@app.get("/health")
def health_check() -> Dict[str, Any]:
    return {
        "status": "healthy",
        "service": "ml-clustering",
        "featureSchemaVersion": FEATURE_SCHEMA_VERSION,
        "featureCount": len(FEATURE_COLUMNS),
        "minCustomers": MIN_CUSTOMERS,
        "algorithms": ["kmeans", "agglomerative", "dbscan", "hybrid"],
    }


@app.get("/features")
def feature_schema() -> Dict[str, Any]:
    """The exact feature set this build consumes, for the admin feature browser."""
    return public_schema()


@app.post("/dataset/summary")
def dataset_summary_endpoint(request: DatasetRequest) -> Dict[str, Any]:
    started = time.perf_counter()
    try:
        raw_df, user_ids = preprocess_features(request.features)
        summary = dataset_summary(raw_df, user_ids)
    except PipelineError as err:
        raise _pipeline_error(err) from None
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"Dataset summary failed: {exc}") from None

    summary["clusterable"] = len(user_ids) >= MIN_CUSTOMERS
    summary["minCustomers"] = MIN_CUSTOMERS
    summary["durationMs"] = int((time.perf_counter() - started) * 1000)
    return summary


@app.post("/cluster/kmeans")
def run_kmeans_endpoint(request: SingleAlgorithmRequest) -> Dict[str, Any]:
    started = time.perf_counter()
    try:
        raw_df, processed_df, scaled, user_ids, preprocessing, scaling = _prepare(
            request.features, request.scaler
        )
        if len(user_ids) < MIN_CUSTOMERS:
            raise _not_enough(len(user_ids), MIN_CUSTOMERS)
        lo, hi, range_notes = resolve_k_range(len(user_ids), request.minK, request.maxK)
        curve = k_selection_curve(scaled, min_k=lo, max_k=hi)
        suggested_k, reason = choose_k(curve)
        k = request.k if request.k is not None else suggested_k
        result = run_kmeans(scaled, user_ids, k, n_init=10, random_state=request.seed)
        result["kSelection"] = {
            "suggestedK": suggested_k,
            "appliedK": int(k),
            "reason": reason,
            "curve": curve,
            "requestedRange": [request.minK, request.maxK],
            "effectiveRange": [lo, hi],
        }
    except HTTPException:
        raise
    except PipelineError as err:
        raise _pipeline_error(err) from None
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"K-Means failed: {exc}") from None

    return _envelope(
        {"kmeans": result, "preprocessing": preprocessing, "scaling": scaling},
        int((time.perf_counter() - started) * 1000),
        range_notes,
    )


@app.post("/cluster/agglomerative")
def run_agglomerative_endpoint(request: SingleAlgorithmRequest) -> Dict[str, Any]:
    started = time.perf_counter()
    try:
        raw_df, processed_df, scaled, user_ids, preprocessing, scaling = _prepare(
            request.features, request.scaler
        )
        if len(user_ids) < MIN_CUSTOMERS:
            raise _not_enough(len(user_ids), MIN_CUSTOMERS)
        lo, hi, range_notes = resolve_k_range(len(user_ids), request.minK, request.maxK)
        curve = k_selection_curve(scaled, min_k=lo, max_k=hi)
        suggested_k, reason = choose_k(curve)
        k = request.k if request.k is not None else suggested_k
        result = run_agglomerative(
            scaled, user_ids, k, linkage_method=request.linkage, metric=request.metric
        )
        result["kSelection"] = {
            "suggestedK": suggested_k,
            "appliedK": int(k),
            "reason": reason,
            "curve": curve,
            "requestedRange": [request.minK, request.maxK],
            "effectiveRange": [lo, hi],
        }
    except HTTPException:
        raise
    except PipelineError as err:
        raise _pipeline_error(err) from None
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Agglomerative clustering failed: {exc}") from None

    return _envelope(
        {"agglomerative": result, "preprocessing": preprocessing, "scaling": scaling},
        int((time.perf_counter() - started) * 1000),
        range_notes,
    )


@app.post("/cluster/dbscan")
def run_dbscan_endpoint(request: SingleAlgorithmRequest) -> Dict[str, Any]:
    started = time.perf_counter()
    try:
        raw_df, processed_df, scaled, user_ids, preprocessing, scaling = _prepare(
            request.features, request.scaler
        )
        if len(user_ids) < MIN_CUSTOMERS:
            raise _not_enough(len(user_ids), MIN_CUSTOMERS)
        result = run_dbscan(scaled, user_ids, eps=request.eps, min_samples=request.minSamples)
    except HTTPException:
        raise
    except PipelineError as err:
        raise _pipeline_error(err) from None
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"DBSCAN failed: {exc}") from None

    warnings = []
    if result.get("fallback") == "all_noise":
        warnings.append(
            "DBSCAN classified every customer as noise. Loosen eps or lower min_samples to obtain "
            "density-based clusters."
        )
    return _envelope(
        {"dbscan": result, "preprocessing": preprocessing, "scaling": scaling},
        int((time.perf_counter() - started) * 1000),
        warnings,
    )


def _run_base_algorithms(
    request: FullPipelineRequest,
    scaled,
    user_ids: List[str],
    n_samples: int,
    curve: List[Dict[str, Any]],
    effective_range: Tuple[int, int],
):
    suggested_k, reason = choose_k(curve)
    k = request.k if request.k is not None else suggested_k
    if k > n_samples:
        raise PipelineError(
            "K={} exceeds the number of customers ({}). Reduce K or collect more behavioural "
            "data.".format(k, n_samples),
            "invalid_k",
        )
    kmeans_result = run_kmeans(scaled, user_ids, k, n_init=request.nInit, random_state=request.seed)
    agglomerative_result = run_agglomerative(
        scaled, user_ids, k, linkage_method=request.linkage, metric=request.metric
    )
    dbscan_result = run_dbscan(scaled, user_ids, eps=request.eps, min_samples=request.minSamples)
    k_selection = {
        "suggestedK": suggested_k,
        "appliedK": int(k),
        "reason": reason,
        "curve": curve,
        "requestedRange": [request.minK, request.maxK],
        "effectiveRange": [int(effective_range[0]), int(effective_range[1])],
    }
    for result in (kmeans_result, agglomerative_result):
        result["kSelection"] = k_selection
    return kmeans_result, agglomerative_result, dbscan_result, k, reason, suggested_k


@app.post("/cluster/hybrid")
def run_hybrid_endpoint(request: HybridRequest) -> Dict[str, Any]:
    """Consensus clustering over all three base algorithms."""
    started = time.perf_counter()
    try:
        raw_df, processed_df, scaled, user_ids, preprocessing, scaling = _prepare(
            request.features, request.scaler
        )
        if len(user_ids) < MIN_CUSTOMERS:
            raise _not_enough(len(user_ids), MIN_CUSTOMERS)

        lo, hi, range_notes = resolve_k_range(len(user_ids), request.minK, request.maxK)
        curve = k_selection_curve(scaled, min_k=lo, max_k=hi)
        kmeans_result, agglomerative_result, dbscan_result, k, reason, suggested_k = _run_base_algorithms(
            request, scaled, user_ids, len(user_ids), curve, (lo, hi)
        )
        hybrid_result = hybrid_clustering(
            kmeans_result, agglomerative_result, dbscan_result, scaled, user_ids,
            target_k=request.hybridK, max_k=request.maxK,
        )
        agreement = compute_agreement(
            kmeans_result, agglomerative_result, dbscan_result, hybrid_result, user_ids
        )
        profiles = profile_clusters(raw_df, hybrid_result["labels"], user_ids)
        personas = assign_personas(profiles)
        pca_data = compute_pca(scaled, user_ids)
    except HTTPException:
        raise
    except PipelineError as err:
        raise _pipeline_error(err) from None
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Hybrid clustering failed: {exc}") from None

    warnings: List[str] = list(range_notes)
    if hybrid_result["numClusters"] == 0:
        warnings.append(
            "The consensus produced no segments: every customer was classified as noise by DBSCAN."
        )

    methodology = methodology_document(
        curve, reason, preprocessing, scaling,
        {
            "k": int(k), "linkage": request.linkage, "metric": request.metric,
            "eps": dbscan_result["parameters"]["eps"],
            "minSamples": dbscan_result["parameters"]["minSamples"],
            "nInit": request.nInit, "seed": request.seed,
        },
        hybrid_result, warnings,
    )

    results = {
        "kmeans": kmeans_result,
        "agglomerative": agglomerative_result,
        "dbscan": dbscan_result,
        "hybrid": hybrid_result,
        "pcaData": pca_data,
        "personas": personas,
        "clusterProfiles": {str(cid): profile for cid, profile in profiles.items()},
        "agreement": agreement,
        "methodology": methodology,
        "preprocessing": preprocessing,
        "scaling": scaling,
        "optimalK": int(k),
        "suggestedK": int(suggested_k),
        "totalCustomers": len(user_ids),
        "selectedModel": "hybrid",
    }
    return _envelope(results, int((time.perf_counter() - started) * 1000), warnings)


@app.post("/cluster")
def run_clustering(request: FullPipelineRequest) -> Dict[str, Any]:
    """
    The full pipeline. K-Means is the primary segmentation: its labels drive the
    cluster profiles, the personas and ``selectedModel``.

    Agglomerative, DBSCAN and the consensus partition are also computed and
    returned so they can be compared against the K-Means result, but they are
    reported under their own names and never substituted for it.
    """
    started = time.perf_counter()
    try:
        raw_df, processed_df, scaled, user_ids, preprocessing, scaling = _prepare(
            request.features, request.scaler
        )
        n_samples = len(user_ids)
        if n_samples < MIN_CUSTOMERS:
            raise _not_enough(n_samples, MIN_CUSTOMERS)

        lo, hi, range_notes = resolve_k_range(n_samples, request.minK, request.maxK)
        curve = k_selection_curve(scaled, min_k=lo, max_k=hi)
        kmeans_result, agglomerative_result, dbscan_result, k, reason, suggested_k = _run_base_algorithms(
            request, scaled, user_ids, n_samples, curve, (lo, hi)
        )

        hybrid_result = hybrid_clustering(
            kmeans_result, agglomerative_result, dbscan_result, scaled, user_ids,
            target_k=request.hybridK, max_k=request.maxK,
        )
        agreement = compute_agreement(
            kmeans_result, agglomerative_result, dbscan_result, hybrid_result, user_ids
        )
        pca_data = compute_pca(scaled, user_ids)
        # K-Means is the primary segmentation for this product. Cluster profiles
        # and personas are therefore derived from the K-Means partition, not from
        # the consensus. The other algorithms are still computed and returned in
        # full so an operator can compare them, but nothing the admin sees as
        # "the segmentation" is a blend - it is K-Means, and it is labelled
        # K-Means everywhere.
        profiles = profile_clusters(raw_df, kmeans_result["labels"], user_ids)
        personas = assign_personas(profiles)
        # Same profiles and personas computed on the consensus partition, so the
        # comparison pages can still show what a multi-algorithm blend would have
        # produced. Never substituted for the K-Means result above.
        consensus_profiles = profile_clusters(raw_df, hybrid_result["labels"], user_ids)
        consensus_personas = assign_personas(consensus_profiles)
        summary = dataset_summary(raw_df, user_ids)
    except HTTPException:
        raise
    except PipelineError as err:
        raise _pipeline_error(err) from None
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Clustering failed: {exc}") from None

    warnings: List[str] = list(range_notes)
    if hybrid_result["numClusters"] == 0:
        warnings.append(
            "The consensus produced no segments: every customer was classified as noise by DBSCAN."
        )
    if dbscan_result.get("fallback") == "all_noise":
        warnings.append("DBSCAN found no dense regions at the chosen eps / min_samples.")
    if summary["constantFeatureCount"] > 0:
        warnings.append(
            "{} feature(s) had zero variance for every customer and could not influence the "
            "result: {}.".format(
                summary["constantFeatureCount"], ", ".join(summary["constantFeatures"])
            )
        )

    methodology = methodology_document(
        curve, reason, preprocessing, scaling,
        {
            "k": int(k), "linkage": request.linkage, "metric": request.metric,
            "eps": dbscan_result["parameters"]["eps"],
            "minSamples": dbscan_result["parameters"]["minSamples"],
            "nInit": request.nInit, "seed": request.seed,
            "scaler": request.scaler,
        },
        hybrid_result, warnings,
    )

    results = {
        "kmeans": kmeans_result,
        "agglomerative": agglomerative_result,
        "dbscan": dbscan_result,
        "hybrid": hybrid_result,
        "pcaData": pca_data,
        "personas": personas,
        "clusterProfiles": {str(cid): profile for cid, profile in profiles.items()},
        "agreement": agreement,
        "methodology": methodology,
        "dataset": summary,
        "preprocessing": preprocessing,
        "scaling": scaling,
        "optimalK": int(k),
        "suggestedK": int(suggested_k),
        "totalCustomers": n_samples,
        # K-Means is the segmentation this product reports on. `clusterProfiles`
        # and `personas` above come from `kmeans.labels` and nothing else.
        "selectedModel": PRIMARY_ALGORITHM,
        "primaryAlgorithm": PRIMARY_ALGORITHM,
        "primaryLabel": "K-Means",
        "numClusters": int(kmeans_result["numClusters"]),
        "clusterSizes": kmeans_result["clusterSizes"],
        "noiseCount": int(kmeans_result["noiseCount"]),
        # Secondary, comparison-only. Named so no consumer can mistake a
        # consensus partition for the K-Means one it sits beside.
        "secondaryModels": ["agglomerative", "dbscan", "hybrid"],
        "consensusPersonas": consensus_personas,
        "consensusClusterProfiles": {str(cid): profile for cid, profile in consensus_profiles.items()},
        "consensusWeights": dict(CONSENSUS_WEIGHTS),
    }
    return _envelope(results, int((time.perf_counter() - started) * 1000), warnings)
