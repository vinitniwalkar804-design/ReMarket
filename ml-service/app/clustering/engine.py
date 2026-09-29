"""
Customer Segmentation & Persona Discovery using Hybrid Clustering Methods.

This module is the complete, executable ML pipeline. Nothing in it is mocked:
every number returned to the admin console is produced by scikit-learn /
scipy running on the real customer feature matrix supplied by the Node backend.

Pipeline
--------
    raw behaviour (MongoDB)
        -> customer aggregation              (Node: mlPipeline service)
        -> feature engineering               (Node: buildCustomerFeatures)
        -> missing-value handling            (impute)
        -> skew handling                     (log1p on heavy-tailed magnitudes)
        -> outlier handling                  (quantile winsorisation)
        -> scaling                           (StandardScaler | RobustScaler)
        -> K-Means / Agglomerative / DBSCAN
        -> evaluation                        (Silhouette / Davies-Bouldin / Calinski-Harabasz)
        -> hybrid consensus                  (pairwise co-association ensemble)
        -> PCA                               (2D projection, visualisation only)
        -> cluster profiling                 (vs. population)
        -> persona interpretation            (rule scoring over measured evidence)
"""

from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Sequence, Tuple

import numpy as np
import pandas as pd
from scipy.cluster.hierarchy import linkage
from scipy.optimize import linear_sum_assignment
from scipy.spatial.distance import squareform
from sklearn.cluster import DBSCAN, AgglomerativeClustering, KMeans
from sklearn.decomposition import PCA
from sklearn.metrics import (
    adjusted_rand_score,
    calinski_harabasz_score,
    davies_bouldin_score,
    silhouette_score,
)
from sklearn.neighbors import NearestNeighbors
from sklearn.preprocessing import RobustScaler, StandardScaler

from app.clustering.feature_schema import (
    CATEGORY_INTEREST_MAP,
    ENGAGEMENT_COMPONENTS,
    FEATURE_BY_NAME,
    FEATURE_COLUMNS,
    FEATURE_SCHEMA_VERSION,
    PURCHASE_TENDENCY_COMPONENTS,
    public_schema,
)

# Reproducibility: every stochastic step in this pipeline is seeded so two runs
# over the same dataset produce identical labels. This is a hard requirement for
# a defensible segmentation, and it is what lets the admin trust the UI.
RANDOM_STATE = 42

# Consensus ensemble weights. K-Means and Agglomerative always partition every
# customer, so they carry full weight. DBSCAN abstains on noise and produces a
# variable number of groups, so it contributes at a reduced weight -- its job in
# the ensemble is to corroborate dense regions and to veto outliers, not to
# dictate the final grouping.
CONSENSUS_WEIGHTS: Dict[str, float] = {"kmeans": 1.0, "agglomerative": 1.0, "dbscan": 0.6}

ALLOWED_SCALERS = ("standard", "robust")

# Compute budget for the K sweep. Every candidate K costs a full K-Means fit at
# n_init=10, so the sweep is bounded to keep the admin console responsive. This is
# a cost limit, not a modelling claim, which is exactly why it is reported back to
# the admin when their requested range is wider rather than applied silently.
MAX_K_SWEEP = 12
ALLOWED_LINKAGES = ("ward", "complete", "average", "single")
# Only distance metrics that are valid on standardised (possibly negative)
# vectors are offered. "cosine" is deliberately excluded.
ALLOWED_METRICS = ("euclidean", "manhattan", "l1", "l2")

NOISE_LABEL = -1

# Above this share of noise, a DBSCAN run is treated as mis-parameterised rather
# than as a finding. Distance concentration in a 46-dimensional standardised space
# is a real problem: as dimensions grow, all points look roughly equidistant, the
# k-distance curve flattens, and the density test either finds nothing or marks
# almost everyone as noise. A run that discards most of the customer base is a
# parameter problem, not an insight, so the run is reported as untrustworthy and
# the hybrid stops propagating its noise labels.
MAX_TRUSTED_NOISE_RATE = 0.35

# A customer is "active" if they have done any of these at least once. Used by the
# dataset summary to report how much of the customer base is clusterable at all.
# These must be canonical feature names: the summary used to reference
# "sessionCount" and "offerCount", which do not exist in the schema, so those two
# signals were silently dropped and the admin was shown 0 sessions / 0 offers for
# the whole marketplace. The assertion below stops that class of typo recurring.
ACTIVITY_SIGNAL_FEATURES = (
    "totalViews",
    "sessionFrequency",
    "cartViewCount",
    "negotiationCount",
    "purchaseCount",
    "totalSearches",
)

_unknown_activity_signals = [c for c in ACTIVITY_SIGNAL_FEATURES if c not in FEATURE_COLUMNS]
if _unknown_activity_signals:  # pragma: no cover - guards a developer mistake
    raise RuntimeError(
        "ACTIVITY_SIGNAL_FEATURES references names that are not in the feature schema: "
        "{}. Update the names or add the features; do not let them be silently "
        "ignored.".format(", ".join(_unknown_activity_signals))
    )


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------


class PipelineError(ValueError):
    """A problem with the input data that the admin must be told about."""

    def __init__(self, message: str, code: str = "invalid_data"):
        super().__init__(message)
        self.code = code


# ---------------------------------------------------------------------------
# Step 1-4: preprocessing
# ---------------------------------------------------------------------------


def preprocess_features(features_list: Sequence[Dict[str, Any]]) -> Tuple[pd.DataFrame, List[str]]:
    """
    Convert raw customer feature documents into a clean numeric DataFrame.

    Only coercion and structural validation happen here. Value-level treatment
    (imputation, log transform, winsorisation) happens in ``build_feature_matrix``
    so that every step is separately auditable.
    """
    user_ids = [str(f.get("userId", f.get("user_id", "")) or "").strip() for f in features_list]
    if any(not uid for uid in user_ids):
        raise PipelineError("Every customer feature must include a non-empty userId", "missing_user_id")
    if len(set(user_ids)) != len(user_ids):
        raise PipelineError("Customer feature userId values must be unique", "duplicate_user_id")

    df = pd.DataFrame(features_list)
    for column in FEATURE_COLUMNS:
        if column not in df.columns:
            df[column] = 0.0
        df[column] = pd.to_numeric(df[column], errors="coerce")

    return df[FEATURE_COLUMNS].copy(), user_ids


def build_feature_matrix(
    df: pd.DataFrame,
    log_threshold_skew: float = 1.0,
    winsor_lower: float = 0.01,
    winsor_upper: float = 0.99,
) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    """
    Deterministic value-level preprocessing.

    1. **Imputation** — non-finite values become the column median, falling back
       to 0.0 for an all-null column. Median (not mean) keeps the imputed values
       inside the observed range, which matters because a large share of these
       features are zero-inflated.
    2. **Log transform** — columns declared ``log1p`` in the feature schema and
       whose sample skewness exceeds ``log_threshold_skew`` are passed through
       ``log1p``. This compresses the long right tail of counts and rupee
       amounts so a single high-value customer cannot dominate Euclidean
       distance. Ratios in [0, 1] are never transformed.
    3. **Winsorisation** — values are clipped to the 1st/99th percentile. This is
       a light-touch outlier treatment: it keeps the ordering of customers while
       stopping a single extreme record from stretching the feature axes.
    """
    working = df.copy()

    imputed_count = 0
    for column in FEATURE_COLUMNS:
        series = working[column]
        non_finite = ~np.isfinite(series.to_numpy(dtype=float))
        imputed_count += int(non_finite.sum())
        if not non_finite.any():
            continue
        median = float(np.nanmedian(series.to_numpy(dtype=float))) if series.notna().any() else 0.0
        if not math.isfinite(median):
            median = 0.0
        working[column] = series.where(~non_finite, median)

    logged: List[str] = []
    for column in FEATURE_COLUMNS:
        if FEATURE_BY_NAME[column]["transform"] != "log1p":
            continue
        values = working[column].to_numpy(dtype=float)
        if values.size < 3:
            continue
        if float(pd.Series(values).skew()) > log_threshold_skew and float(values.max()) > 0:
            working[column] = np.log1p(values)
            logged.append(column)

    clipped: List[str] = []
    for column in FEATURE_COLUMNS:
        values = working[column].to_numpy(dtype=float)
        if values.size < 5 or float(values.max()) == float(values.min()):
            continue
        low = float(np.quantile(values, winsor_lower))
        high = float(np.quantile(values, winsor_upper))
        if high > low:
            working[column] = np.clip(values, low, high)
            clipped.append(column)

    metadata = {
        "imputedValues": imputed_count,
        "logTransformedFeatures": logged,
        "logThresholdSkew": log_threshold_skew,
        "winsorisedFeatures": clipped,
        "winsorBounds": {"lower": winsor_lower, "upper": winsor_upper},
    }
    return working, metadata


def scale_features(
    df: pd.DataFrame, scaler_type: str = "standard"
) -> Tuple[np.ndarray, Dict[str, Any]]:
    """
    Scale the feature matrix.

    ``standard`` -> StandardScaler: the default. Correct choice here because the
    features are a heterogeneous mix of counts, rupee amounts and ratios, and
    after log-compression there is no meaningful heavy tail left to protect
    against.

    ``robust`` -> RobustScaler (median / IQR): offered for comparison. It is
    defensible when a few customers retain extreme values even after winsorising.
    """
    if scaler_type not in ALLOWED_SCALERS:
        raise PipelineError(
            f"Unknown scaler '{scaler_type}'. Allowed: {', '.join(ALLOWED_SCALERS)}", "invalid_scaler"
        )

    values = df.to_numpy(dtype=float)
    constant = [
        column
        for column, idx in zip(FEATURE_COLUMNS, range(values.shape[1]))
        if float(np.nanstd(values[:, idx])) == 0.0
    ]
    if len(constant) == len(FEATURE_COLUMNS):
        raise PipelineError(
            "Every customer has identical values for all features, so no meaningful "
            "clusters can be formed. Each customer needs distinct behavioural activity.",
            "identical_features",
        )

    scaler = RobustScaler() if scaler_type == "robust" else StandardScaler()
    scaled = scaler.fit_transform(values)
    # Defensive: a NaN here would silently poison every downstream algorithm.
    if not np.isfinite(scaled).all():
        scaled = np.nan_to_num(scaled, nan=0.0, posinf=0.0, neginf=0.0)

    metadata = {
        "scaler": scaler_type,
        "scalerClass": type(scaler).__name__,
        "constantFeatures": constant,
        "featureCount": int(values.shape[1]),
        "customerCount": int(values.shape[0]),
    }
    return scaled, metadata


# ---------------------------------------------------------------------------
# Step 5: K selection with published evidence
# ---------------------------------------------------------------------------


def k_selection_curve(scaled: np.ndarray, min_k: int = 2, max_k: int = 8) -> List[Dict[str, Any]]:
    """
    Sweep K and record, for every candidate, all four selection signals.

    * **inertia** (K-Means) -- elbow method. Look for the point where adding
      another cluster stops buying a large reduction in within-cluster variance.
    * **silhouette** -- mean per-point cohesion vs. separation in [-1, 1].
      Higher is better.
    * **daviesBouldin** -- mean cluster scatter / inter-cluster distance.
      Lower is better.
    * **calinskiHarabasz** -- between-cluster over within-cluster variance.
      Higher is better.

    No single number decides K. The curve is returned so the admin console can
    show the evidence and the chosen K can be justified rather than asserted.
    """
    n_samples = scaled.shape[0]
    lo, hi, _ = resolve_k_range(n_samples, min_k, max_k)
    curve: List[Dict[str, Any]] = []
    for k in range(lo, hi + 1):
        model = KMeans(n_clusters=k, n_init=10, random_state=RANDOM_STATE, max_iter=300)
        labels = model.fit_predict(scaled)
        distinct = len(set(labels.tolist()))
        entry: Dict[str, Any] = {
            "k": k,
            "inertia": round(float(model.inertia_), 4),
            "silhouette": None,
            "daviesBouldin": None,
            "calinskiHarabasz": None,
            "clusterSizes": sorted(np.bincount(labels).tolist(), reverse=True),
        }
        if distinct > 1:
            entry["silhouette"] = round(float(silhouette_score(scaled, labels)), 4)
            entry["daviesBouldin"] = round(float(davies_bouldin_score(scaled, labels)), 4)
            entry["calinskiHarabasz"] = round(float(calinski_harabasz_score(scaled, labels)), 4)
        curve.append(entry)
    return curve


def resolve_k_range(
    n_samples: int,
    min_k: int = 2,
    max_k: int = 8,
) -> Tuple[int, int, List[str]]:
    """
    Clamp a requested K window to the range the sweep can actually evaluate.

    The sweep is bounded by three things: at least 2 clusters, one fewer than the
    number of samples, and :data:`MAX_K_SWEEP` for compute. A requested window that
    falls outside those bounds is *reported*, never quietly replaced, because an
    admin who asks for K=15..20 and silently receives K=3 has been handed a result
    that does not answer their question. Any adjustment comes back as a note so it
    can be surfaced to the console.

    Returns ``(lo, hi, notes)`` where ``lo <= hi`` is guaranteed to be non-empty.
    """
    notes: List[str] = []

    hi = int(min(max_k, n_samples - 1, MAX_K_SWEEP))
    if max_k > MAX_K_SWEEP:
        notes.append(
            "K sweep capped at K={} for compute reasons; the requested maxK={} exceeds it. "
            "K is a modelling choice, so raise the cap deliberately if you need wider "
            "sweeps.".format(MAX_K_SWEEP, max_k)
        )

    lo = max(2, int(min_k))
    if lo > hi:
        notes.append(
            "Requested minK={} leaves no evaluable K given {} samples and a sweep cap of "
            "K={}; the sweep starts at K={} instead.".format(min_k, n_samples, MAX_K_SWEEP, hi)
        )
        lo = hi

    if hi < 2:
        raise PipelineError(
            "A K sweep needs at least 3 samples to evaluate a single cluster, "
            "but only {} were provided.".format(n_samples)
        )

    return lo, hi, notes


def choose_k(curve: List[Dict[str, Any]]) -> Tuple[int, str]:
    """
    Pick K from the sweep and state the reason in words.

    The decision rule is published rather than hidden: among the candidate Ks
    that produced a valid silhouette, take the best silhouette, and only accept
    a *smaller* K than that if its silhouette is within 5% -- a parsimony tie
    break, because fewer, better-separated segments are easier to act on.

    An empty or unusable sweep raises rather than falling back to a default K. A
    fabricated K would be recorded as ``optimalK`` and then contradict the cluster
    count the same run reports, which is worse than an explicit failure.
    """
    if not curve:
        raise PipelineError(
            "The K sweep produced no candidates, so no K can be justified. "
            "This means the requested K range was infeasible for the sample size."
        )

    usable = [entry for entry in curve if entry.get("silhouette") is not None]
    if not usable:
        raise PipelineError(
            "None of the {} candidate K values produced a valid silhouette score, so "
            "no K can be justified. Try a wider K range or a different scaler.".format(len(curve))
        )

    best = max(usable, key=lambda entry: entry["silhouette"])
    best_k = int(best["k"])
    best_score = float(best["silhouette"])

    parsimonious = [
        entry
        for entry in usable
        if int(entry["k"]) < best_k and float(entry["silhouette"]) >= best_score * 0.95
    ]
    if parsimonious:
        chosen = min(parsimonious, key=lambda entry: int(entry["k"]))
        return int(chosen["k"]), (
            "K={} chosen by parsimony: its silhouette {:.4f} is within 5% of the best "
            "silhouette {:.4f} at K={}, and fewer segments are easier to interpret.".format(
                chosen["k"], float(chosen["silhouette"]), best_score, best_k
            )
        )

    return best_k, (
        "K={} chosen as the global maximum of the silhouette sweep across K={}..{} "
        "(silhouette {:.4f}).".format(best_k, usable[0]["k"], usable[-1]["k"], best_score)
    )


# ---------------------------------------------------------------------------
# Evaluation
# ---------------------------------------------------------------------------


def evaluate_partition(
    matrix: np.ndarray, labels: np.ndarray, ignore_label: Optional[int] = None
) -> Dict[str, Any]:
    """
    Compute the three internal validation indices, or explain why they cannot be
    computed.

    Silhouette, Davies-Bouldin and Calinski-Harabasz are all *internal* indices:
    they need at least two groups and at least as many points as groups. When
    that is not satisfied the value is returned as ``None`` together with a
    human-readable reason. A metric is never invented and never defaulted to 0.
    """
    total = int(labels.shape[0])
    keep = np.ones(total, dtype=bool) if ignore_label is None else (labels != ignore_label)
    clustered = int(keep.sum())
    distinct = len(set(labels[keep].tolist()))

    result: Dict[str, Any] = {
        "silhouette": None,
        "daviesBouldin": None,
        "calinskiHarabasz": None,
        "customers": total,
        "clusteredCustomers": clustered,
        "excludedCustomers": total - clustered,
        "distinctClusters": distinct,
        "unavailable": {},
    }
    if clustered < 2:
        reason = "Needs at least 2 clustered customers; only {} available.".format(clustered)
        result["unavailable"] = {"silhouette": reason, "daviesBouldin": reason, "calinskiHarabasz": reason}
        return result
    if distinct < 2:
        reason = (
            "Needs at least 2 clusters; this partition produced {}. Internal validation "
            "indices are undefined for a single group.".format(distinct)
        )
        result["unavailable"] = {"silhouette": reason, "daviesBouldin": reason, "calinskiHarabasz": reason}
        return result
    if distinct > clustered:
        reason = "More clusters than clustered customers, which cannot be validated."
        result["unavailable"] = {"silhouette": reason, "daviesBouldin": reason, "calinskiHarabasz": reason}
        return result

    subset = matrix[keep]
    subset_labels = labels[keep]
    try:
        result["silhouette"] = round(float(silhouette_score(subset, subset_labels)), 4)
    except ValueError as exc:  # pragma: no cover - guarded above, kept for safety
        result["unavailable"]["silhouette"] = str(exc)
    try:
        result["daviesBouldin"] = round(float(davies_bouldin_score(subset, subset_labels)), 4)
    except ValueError as exc:  # pragma: no cover
        result["unavailable"]["daviesBouldin"] = str(exc)
    try:
        result["calinskiHarabasz"] = round(float(calinski_harabasz_score(subset, subset_labels)), 4)
    except ValueError as exc:  # pragma: no cover
        result["unavailable"]["calinskiHarabasz"] = str(exc)
    return result


def _validate_k(k: int, n_samples: int, floor: int = 2) -> int:
    if not isinstance(k, (int, np.integer)) or isinstance(k, bool):
        raise PipelineError("K must be a whole number.", "invalid_k")
    k = int(k)
    if k < floor:
        raise PipelineError("K must be at least {}.".format(floor), "invalid_k")
    if k > n_samples:
        raise PipelineError(
            "K={} exceeds the number of customers ({}). Reduce K or add more behavioural "
            "data.".format(k, n_samples),
            "invalid_k",
        )
    return k


# ---------------------------------------------------------------------------
# Step 6: the three base algorithms
# ---------------------------------------------------------------------------


def run_kmeans(
    scaled: np.ndarray,
    user_ids: Sequence[str],
    n_clusters: int,
    n_init: int = 10,
    max_iter: int = 300,
    random_state: int = RANDOM_STATE,
) -> Dict[str, Any]:
    """
    K-Means -- centroid-based partitional clustering.

    Chosen because the feature space is dense, numeric and standardised, and the
    segments we expect (heavy buyers, researchers, bargain hunters) are roughly
    convex blobs. K-Means minimises within-cluster sum of squares, so it is fast
    and stable, but it forces every customer into a group and assumes clusters
    are spherical -- which is exactly why it is only one voice in the ensemble.

    ``n_init`` restarts guard against the classic K-Means failure of converging
    into a poor local minimum, and ``random_state`` makes the result reproducible.
    """
    n_samples = scaled.shape[0]
    k = _validate_k(n_clusters, n_samples)

    model = KMeans(
        n_clusters=k, n_init=max(1, int(n_init)), max_iter=int(max_iter), random_state=int(random_state)
    )
    labels = model.fit_predict(scaled)

    evaluation = evaluate_partition(scaled, labels)
    centers = model.cluster_centers_
    return {
        "algorithm": "kmeans",
        "label": "K-Means",
        "nSamples": int(n_samples),
        "numClusters": int(len(set(labels.tolist()))),
        "requestedK": k,
        "labels": {uid: int(label) for uid, label in zip(user_ids, labels)},
        "clusterSizes": np.bincount(labels, minlength=k).tolist(),
        "noiseCount": 0,
        "metrics": {
            "silhouette": evaluation["silhouette"],
            "daviesBouldin": evaluation["daviesBouldin"],
            "calinskiHarabasz": evaluation["calinskiHarabasz"],
        },
        "metricNotes": evaluation["unavailable"],
        "inertia": round(float(model.inertia_), 4),
        "parameters": {
            "k": k,
            "nInit": max(1, int(n_init)),
            "maxIter": int(max_iter),
            "randomState": int(random_state),
        },
        "centersScaled": np.round(centers, 4).tolist(),
        "notes": [
            "Centroid-based partitional clustering on the scaled feature matrix.",
            "K-Means assigns every customer to a cluster; it has no noise concept.",
        ],
    }


def run_agglomerative(
    scaled: np.ndarray,
    user_ids: Sequence[str],
    n_clusters: int,
    linkage_method: str = "ward",
    metric: str = "euclidean",
) -> Dict[str, Any]:
    """
    Agglomerative (hierarchical) clustering -- connectivity-based.

    Chosen because it does not assume spherical clusters of similar size, so it
    can surface one large mainstream segment alongside several small niche ones,
    which K-Means tends to split artificially. It is also the algorithm reused
    to cut the consensus matrix in the hybrid step, so having it in the ensemble
    keeps the two stages consistent.

    Linkage / metric compatibility is validated explicitly because scikit-learn
    only permits non-Euclidean metrics for certain linkages.
    """
    n_samples = scaled.shape[0]
    k = _validate_k(n_clusters, n_samples)

    linkage_method = str(linkage_method or "ward").lower()
    if linkage_method not in ALLOWED_LINKAGES:
        raise PipelineError(
            "Unsupported linkage '{}'. Allowed: {}.".format(linkage_method, ", ".join(ALLOWED_LINKAGES)),
            "invalid_linkage",
        )

    metric = str(metric or "euclidean").lower()
    if metric not in ALLOWED_METRICS:
        raise PipelineError(
            "Unsupported distance metric '{}'. Allowed: {}.".format(metric, ", ".join(ALLOWED_METRICS)),
            "invalid_metric",
        )
    if linkage_method == "ward" and metric != "euclidean":
        raise PipelineError(
            "Ward linkage requires the Euclidean metric; received '{}'. Choose a different "
            "linkage or use euclidean.".format(metric),
            "invalid_metric",
        )

    model = AgglomerativeClustering(n_clusters=k, linkage=linkage_method, metric=metric)
    labels = model.fit_predict(scaled)

    evaluation = evaluate_partition(scaled, labels)
    child_counts = model.children_
    return {
        "algorithm": "agglomerative",
        "label": "Agglomerative",
        "nSamples": int(n_samples),
        "numClusters": int(len(set(labels.tolist()))),
        "requestedK": k,
        "labels": {uid: int(label) for uid, label in zip(user_ids, labels)},
        "clusterSizes": np.bincount(labels, minlength=k).tolist(),
        "noiseCount": 0,
        "metrics": {
            "silhouette": evaluation["silhouette"],
            "daviesBouldin": evaluation["daviesBouldin"],
            "calinskiHarabasz": evaluation["calinskiHarabasz"],
        },
        "metricNotes": evaluation["unavailable"],
        "parameters": {"k": k, "linkage": linkage_method, "metric": metric},
        "mergeCount": int(len(child_counts)),
        "notes": [
            "Bottom-up hierarchical clustering: every customer starts alone and the two "
            "closest groups merge until {} groups remain.".format(k),
            "{} linkage minimises the increase in total within-cluster variance.".format(
                linkage_method.capitalize()
            ),
        ],
    }


def _knee_index(curve: np.ndarray) -> int:
    """
    Locate the elbow of a monotonically increasing curve, Kneedle-style.

    A line is fitted by least squares to the points before each candidate split
    and to the points after it; the split that maximises the perpendicular
    separation between those two lines is the knee.

    The tempting shortcut -- take the single largest gap between consecutive
    values -- is wrong, and badly so here: the far tail of a k-distance curve is
    made of genuine outliers, and one huge gap between two of them would be chosen
    as the "elbow", producing an eps so small that almost every customer becomes
    noise. Fitting both sides is what makes the estimate robust to that tail.
    """
    n = curve.shape[0]
    if n < 5:
        return n // 2

    x = np.arange(n, dtype=float)
    x_norm = x / float(x[-1] - x[0]) if x[-1] > x[0] else x
    y = curve - curve[0]
    scale = abs(y[-1])
    y_norm = y / scale if scale > 1e-12 else y

    def slope(xs: np.ndarray, ys: np.ndarray) -> float:
        if xs.size < 2:
            return 0.0
        variance = float(np.var(xs))
        if variance <= 1e-18:
            return 0.0
        return float(np.mean((xs - xs.mean()) * (ys - ys.mean())) / variance)

    best_index = n // 2
    best_gain = -np.inf
    for index in range(2, n - 2):
        left_x, left_y = x_norm[: index + 1], y_norm[: index + 1]
        right_x, right_y = x_norm[index:], y_norm[index:]
        distance_from_left = abs(
            y_norm[index] - (left_y[-1] + slope(left_x, left_y) * (x_norm[index] - left_x[-1]))
        )
        distance_from_right = abs(
            y_norm[index] - (right_y[0] + slope(right_x, right_y) * (x_norm[index] - right_x[0]))
        )
        gain = distance_from_left + distance_from_right
        if gain > best_gain:
            best_gain = gain
            best_index = index
    return best_index


def _auto_eps(scaled: np.ndarray) -> Tuple[float, List[float]]:
    """
    Derive DBSCAN's ``eps`` from the k-distance curve.

    For every customer we take the distance to its k-th nearest neighbour, sort
    those distances, and find the knee of that curve (see ``_knee_index``). Below
    the knee a customer has no dense neighbourhood; above it, points chain
    together. The full sorted curve is returned so the choice can be plotted and
    defended in the viva instead of taken on faith.
    """
    n_samples = scaled.shape[0]
    k = int(min(5, n_samples - 1))
    model = NearestNeighbors(n_neighbors=k)
    model.fit(scaled)
    distances, _ = model.kneighbors(scaled)
    k_distances = np.sort(distances[:, -1]).astype(float)

    knee_index = _knee_index(k_distances)
    eps = float(k_distances[knee_index])
    if not math.isfinite(eps) or eps <= 0:
        # Fully degenerate geometry: fall back to the median neighbourhood radius.
        eps = float(np.median(k_distances)) if k_distances.size else 0.5
    if not math.isfinite(eps) or eps <= 0:
        eps = 0.5
    return eps, [round(float(value), 4) for value in k_distances]


def run_dbscan(
    scaled: np.ndarray,
    user_ids: Sequence[str],
    eps: Optional[float] = None,
    min_samples: Optional[int] = None,
) -> Dict[str, Any]:
    """
    DBSCAN -- density-based clustering that models noise explicitly.

    Chosen because it is the only one of the three algorithms that can say
    "this customer does not belong to any group". Its ``eps`` is the search
    radius in scaled units and ``min_samples`` is how many neighbours (including
    the point itself) a candidate needs to become a core point.

    DBSCAN does *not* force outliers into clusters. A customer who fails the
    density test is labelled noise (-1) and is excluded from the internal
    validation indices, because including noise would flatter the scores.
    """
    n_samples = scaled.shape[0]
    notes: List[str] = []
    fallback: Optional[str] = None
    k_distances: List[float] = []
    eps_source = "supplied by admin"

    if eps is None:
        eps_value, k_distances = _auto_eps(scaled)
        eps_source = "k-distance knee (auto)"
    else:
        try:
            eps_value = float(eps)
        except (TypeError, ValueError):
            raise PipelineError("eps must be a number.", "invalid_eps") from None
        if not math.isfinite(eps_value) or eps_value <= 0:
            raise PipelineError("eps must be a positive number.", "invalid_eps")

    if min_samples is None:
        min_samples_value = int(max(2, min(5, n_samples // 3)))
    else:
        try:
            min_samples_value = int(min_samples)
        except (TypeError, ValueError):
            raise PipelineError("min_samples must be a whole number.", "invalid_min_samples") from None
        if min_samples_value < 2:
            raise PipelineError("min_samples must be at least 2.", "invalid_min_samples")
        if min_samples_value > n_samples:
            raise PipelineError(
                "min_samples={} exceeds the number of customers ({}).".format(
                    min_samples_value, n_samples
                ),
                "invalid_min_samples",
            )

    if n_samples < 5:
        # Too few points for a meaningful density estimate. Say so instead of
        # silently inventing a partition.
        labels = np.zeros(n_samples, dtype=int)
        return {
            "algorithm": "dbscan",
            "label": "DBSCAN",
            "numClusters": 1,
            "requestedK": None,
            "labels": {uid: int(label) for uid, label in zip(user_ids, labels)},
            "clusterSizes": [n_samples],
            "noiseCount": 0,
            "noisePercentage": 0.0,
            "metrics": {"silhouette": None, "daviesBouldin": None, "calinskiHarabasz": None},
            "metricNotes": {
                "silhouette": "Fallback partition: DBSCAN needs at least 5 customers for a "
                "density estimate.",
                "daviesBouldin": "Fallback partition: DBSCAN needs at least 5 customers for a "
                "density estimate.",
                "calinskiHarabasz": "Fallback partition: DBSCAN needs at least 5 customers for a "
                "density estimate.",
            },
            "parameters": {"eps": round(eps_value, 4), "minSamples": min_samples_value, "epsSource": eps_source},
            "fallback": "insufficient_samples",
            # The single group is a placeholder, not a density-based finding, so it
            # must never earn a vote in the consensus.
            "trusted": False,
            "maxTrustedNoiseRate": MAX_TRUSTED_NOISE_RATE,
            "epsEscalations": [],
            "kDistanceCurve": k_distances,
            "notes": [
                "Too few customers for density-based clustering; all customers placed in one group.",
                "This fallback is untrusted and carries no weight in the consensus.",
            ],
        }

    raw_labels = DBSCAN(eps=eps_value, min_samples=min_samples_value).fit_predict(scaled)
    noise_mask = raw_labels == NOISE_LABEL
    num_clusters = int(len(set(raw_labels.tolist()) - {NOISE_LABEL}))
    noise_count = int(noise_mask.sum())
    escalations: List[Dict[str, Any]] = []

    # If the automatic eps leaves the data mostly unclustered, the neighbourhood
    # radius is simply too small for this many dimensions. Walk it up the
    # k-distance curve rather than reporting a run that discarded most of the
    # customer base, and record every adjustment so the admin can see it happened.
    if k_distances and eps is None:
        percentiles = (75, 90, 95)
        for percentile in percentiles:
            if noise_count / n_samples <= MAX_TRUSTED_NOISE_RATE and num_clusters >= 2:
                break
            candidate = float(np.percentile(k_distances, percentile))
            if not math.isfinite(candidate) or candidate <= eps_value:
                continue
            trial_labels = DBSCAN(eps=candidate, min_samples=min_samples_value).fit_predict(scaled)
            trial_noise = int((trial_labels == NOISE_LABEL).sum())
            trial_clusters = int(len(set(trial_labels.tolist()) - {NOISE_LABEL}))
            escalations.append(
                {
                    "percentile": percentile,
                    "eps": round(candidate, 4),
                    "clusters": trial_clusters,
                    "noiseCount": trial_noise,
                    "accepted": False,
                }
            )
            if trial_noise < noise_count and trial_clusters >= 2:
                escalations[-1]["accepted"] = True
                raw_labels, noise_mask = trial_labels, trial_labels == NOISE_LABEL
                num_clusters, noise_count = trial_clusters, trial_noise
                eps_value = candidate
                eps_source = "k-distance percentile (knee was too tight)"

    trusted = bool(
        num_clusters >= 2 and (noise_count / n_samples) <= MAX_TRUSTED_NOISE_RATE
    )
    if not trusted:
        fallback = "untrusted_parameters" if num_clusters else "all_noise"

    evaluation = evaluate_partition(scaled, raw_labels, ignore_label=NOISE_LABEL)

    if num_clusters == 0:
        # Every point is noise. Report it honestly; do not fabricate clusters.
        notes.append(
            "Every customer was classified as noise at eps={:.4f}, min_samples={}. The parameters "
            "are too strict for this data. Nothing was forced into a cluster.".format(
                eps_value, min_samples_value
            )
        )
        fallback = "all_noise"
    elif noise_count > 0:
        notes.append(
            "{} of {} customers ({:.1f}%) failed the density test and are reported as noise, not "
            "as a cluster.".format(noise_count, n_samples, 100.0 * noise_count / n_samples)
        )
    if not trusted and fallback != "all_noise":
        notes.append(
            "This DBSCAN run is not trusted: {:.1f}% of customers are noise, above the {:.0f}% "
            "threshold. Distance concentration in {} standardised dimensions makes DBSCAN's density "
            "test unreliable here, so the hybrid will not discard these customers -- it will use "
            "the DBSCAN noise as advisory only.".format(
                100.0 * noise_count / n_samples, 100 * MAX_TRUSTED_NOISE_RATE, scaled.shape[1]
            )
        )
    if escalations:
        notes.append(
            "eps was raised from the k-distance knee after the automatic value left too much of "
            "the data unclustered ({} adjustment(s) tested).".format(len(escalations))
        )

    sizes = [int(count) for count in np.bincount(raw_labels[~noise_mask], minlength=max(num_clusters, 1))] if num_clusters else []
    return {
        "algorithm": "dbscan",
        "label": "DBSCAN",
        "nSamples": int(n_samples),
        "numClusters": num_clusters,
        "requestedK": None,
        "labels": {uid: int(label) for uid, label in zip(user_ids, raw_labels)},
        "clusterSizes": sizes,
        "noiseCount": noise_count,
        "noisePercentage": round(100.0 * noise_count / n_samples, 2),
        "metrics": {
            "silhouette": evaluation["silhouette"],
            "daviesBouldin": evaluation["daviesBouldin"],
            "calinskiHarabasz": evaluation["calinskiHarabasz"],
        },
        "metricNotes": evaluation["unavailable"],
        "parameters": {
            "eps": round(eps_value, 4),
            "minSamples": min_samples_value,
            "epsSource": eps_source,
        },
        "fallback": fallback,
        "trusted": trusted,
        "maxTrustedNoiseRate": MAX_TRUSTED_NOISE_RATE,
        "epsEscalations": escalations,
        "kDistanceCurve": k_distances,
        "notes": notes
        or [
            "Density-based clustering. eps={:.4f} ({}), min_samples={}.".format(
                eps_value, eps_source, min_samples_value
            ),
            "No customers were classified as noise.",
        ],
    }


# ---------------------------------------------------------------------------
# Step 7: hybrid / consensus clustering
# ---------------------------------------------------------------------------


def _co_association(labels: np.ndarray, valid: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
    """
    Vectorised pairwise co-association matrix for one algorithm.

    ``C[i, j] = 1`` when customers *i* and *j* were placed in the same cluster by
    this algorithm. ``valid[i, j] = 1`` when the algorithm actually expressed an
    opinion about that pair -- DBSCAN abstains for any pair involving noise, and
    an abstention must not be counted as disagreement.
    """
    n = labels.shape[0]
    same = (labels[:, None] == labels[None, :]).astype(np.float32)
    np.fill_diagonal(same, 0.0)
    # A customer can only co-cluster with itself-consistent, non-noise peers.
    valid = valid[:, None] & valid[None, :]
    same = same * valid
    np.fill_diagonal(valid, 1.0)
    return same, valid


def _cut_linkage(linkage_matrix: np.ndarray, k: int) -> np.ndarray:
    """
    Flat cluster assignment that produces **exactly** ``k`` groups.

    ``scipy.cluster.hierarchy.fcluster(..., criterion="maxclust")`` is the obvious
    tool here and it is wrong for this particular input. The consensus distance
    matrix is built from co-association evidence, so it is full of ties: every
    pair inside a segment can sit at exactly the same distance, and entire blocks
    merge at height 0. Under those ties ``maxclust`` can cut above the whole
    dendrogram and hand back a *single* cluster when two were requested, or hand
    back the same partition for every k above the true count. The consensus sweep
    then silently reports "no valid silhouette" for small k and a flat line
    afterwards, which is an artefact of the cutting method rather than a property
    of the data.

    Counting merges sidesteps the ties entirely: cut the dendrogram after
    ``n - k`` merges and the group count is exact by construction.
    """
    n_samples = int(linkage_matrix.shape[0]) + 1
    target = int(min(max(int(k), 1), n_samples))
    merges_needed = n_samples - target

    # The dendrogram introduces n_samples - 1 new nodes, so the union-find array
    # needs room for every original leaf plus every internal merge node.
    parent = list(range(2 * n_samples))

    def find(node: int) -> int:
        while parent[node] != node:
            parent[node] = parent[parent[node]]
            node = parent[node]
        return node

    next_id = n_samples
    for left, right in linkage_matrix[:, :2].astype(int):
        if next_id - n_samples >= merges_needed:
            break
        root_left, root_right = find(int(left)), find(int(right))
        if root_left == root_right:
            continue
        parent[root_left] = next_id
        parent[root_right] = next_id
        parent[next_id] = next_id
        next_id += 1

    remap: Dict[int, int] = {}
    labels = np.empty(n_samples, dtype=int)
    for index in range(n_samples):
        root = find(index)
        if root not in remap:
            remap[root] = len(remap)
        labels[index] = remap[root]
    return labels


def hybrid_clustering(
    kmeans_result: Dict[str, Any],
    agglomerative_result: Dict[str, Any],
    dbscan_result: Dict[str, Any],
    scaled: np.ndarray,
    user_ids: Sequence[str],
    target_k: Optional[int] = None,
    max_k: int = 8,
) -> Dict[str, Any]:
    """
    HYBRID SEGMENTATION -- consensus clustering over a pairwise co-association
    ensemble.

    Why not just rename K-Means "hybrid"? Because a single algorithm's answer
    depends entirely on its own assumptions. This step instead combines three
    structurally different views of the same customers and only keeps groupings
    that several of them agree on.

    Method, exactly as implemented below:

    1. **Vote.** Each algorithm casts a binary vote for every customer pair: are
       *i* and *j* in the same group? DBSCAN abstains (does not vote) on any pair
       containing a noise customer, so a lack of opinion is never counted as
       disagreement.
    2. **Aggregate.** Every pair's agreement is the weighted mean of the votes it
       actually received. DBSCAN carries a reduced weight of 0.6 versus 1.0 for
       K-Means and Agglomerative because it abstains and produces a variable
       number of groups. Dividing by the votes received (rather than by three) is
       what makes DBSCAN's abstention safe rather than penalising.
    3. **Re-derive.** ``distance = 1 - agreement`` is a genuine metric, so
       average-linkage hierarchical clustering is applied to it. This is the same
       algorithm as the Agglomerative base model, but it is now operating on
       ensemble agreement instead of raw distance, so the dendrogram it produces
       reflects cross-model consensus.
    4. **Choose the cut.** The number of consensus groups is itself chosen by
       evidence: sweep the cut, score each partition with the silhouette index on
       the real feature space, and keep the best. This is deliberately *not*
       assumed to equal the base-model K.
    5. **Preserve noise.** Customers DBSCAN called noise stay noise (-1) in the
       final labels. They are never coerced into a segment just to make the
       output look complete. The exception is deliberate and reported: if the
       DBSCAN run itself is untrustworthy -- it found fewer than two groups, or
       flagged more than 35% of the base as noise, which in a 46-dimensional
       standardised space means the neighbourhood radius is wrong rather than
       that most customers are outliers -- its noise labels are demoted to an
       advisory flag and DBSCAN is allowed only to abstain inside the
       co-association matrix. The alternative would be to silently delete most
       of the customer base because of a parameter that never fitted.

    What this does and does not claim: consensus reduces the variance of the
    segmentation by requiring cross-model agreement, and the ARI agreement
    scores reported alongside make that agreement measurable. It does **not**
    prove the consensus partition is more *accurate* -- unsupervised clustering
    has no ground truth to be accurate against. The result is more defensible,
    not verifiably better.
    """
    n = len(user_ids)
    if n < 3:
        raise PipelineError("Consensus clustering needs at least 3 customers.", "insufficient_data")

    members: List[Tuple[str, Dict[str, float], np.ndarray, np.ndarray]] = []
    for name, result, weight in (
        ("kmeans", kmeans_result, CONSENSUS_WEIGHTS["kmeans"]),
        ("agglomerative", agglomerative_result, CONSENSUS_WEIGHTS["agglomerative"]),
        ("dbscan", dbscan_result, CONSENSUS_WEIGHTS["dbscan"]),
    ):
        labels_map = result.get("labels") or {}
        labels = np.array([int(labels_map.get(uid, NOISE_LABEL)) for uid in user_ids], dtype=int)
        valid = labels != NOISE_LABEL
        same, valid_pair = _co_association(labels, valid)
        members.append((name, {"weight": weight}, same, valid_pair))

    # Weighted, vote-count-normalised agreement.
    weighted_sum = np.zeros((n, n), dtype=np.float32)
    weight_sum = np.zeros((n, n), dtype=np.float32)
    for _, meta, same, valid_pair in members:
        weight = float(meta["weight"])
        weighted_sum += same * weight
        weight_sum += valid_pair * weight

    consensus = np.zeros((n, n), dtype=np.float32)
    np.divide(weighted_sum, weight_sum, out=consensus, where=weight_sum > 0)
    np.fill_diagonal(consensus, 1.0)

    distance = 1.0 - consensus
    np.fill_diagonal(distance, 0.0)
    np.clip(distance, 0.0, 1.0, out=distance)

    linkage_matrix = linkage(squareform(distance, checks=False), method="average")

    dbscan_labels = dbscan_result.get("labels") or {}
    dbscan_noise = np.array(
        [int(dbscan_labels.get(uid, NOISE_LABEL)) == NOISE_LABEL for uid in user_ids]
    )
    dbscan_trusted = bool(dbscan_result.get("trusted", True))

    # Noise policy. DBSCAN's noise is a genuine finding when its parameters fit the
    # data, and those customers are then kept as noise (-1) in the final labels --
    # never coerced into a segment to make the output look complete. But if the
    # DBSCAN run is not trusted (most of the base flagged as noise, which is a
    # symptom of an unsuitable neighbourhood radius in a high-dimensional space,
    # not an insight), propagating that noise would delete most of the customer
    # base. In that case DBSCAN still abstains inside the co-association matrix --
    # so it cannot vote -- but its noise labels do not become final labels, and are
    # returned as an advisory flag instead.
    if dbscan_trusted:
        noise_mask = dbscan_noise
        noise_policy = "dbscan-noise-preserved"
    else:
        noise_mask = np.zeros(n, dtype=bool)
        noise_policy = "dbscan-noise-advisory-only"
    # Consensus is computed on everyone (DBSCAN abstains on noise pairs), but the
    # cut is evaluated and reported on the clustered population only.
    clusterable = ~noise_mask
    clusterable_count = int(clusterable.sum())
    if clusterable_count < 2:
        # Every algorithm abstained on almost everyone. There is nothing to cut,
        # so say that instead of inventing a segmentation.
        raise PipelineError(
            "Only {} customer(s) could be clustered after the noise policy was applied, so no "
            "consensus segmentation is possible. Review the DBSCAN eps / min_samples, or lower "
            "MIN_CUSTOMERS.".format(clusterable_count),
            "insufficient_clusterable",
        )

    if target_k is not None:
        chosen_k = _validate_k(int(target_k), n)
        sweep: List[Dict[str, Any]] = []
        reason = "K={} was set explicitly by the admin for the consensus cut.".format(chosen_k)
    else:
        upper = int(min(max_k, max(clusterable_count - 1, 2), 12))
        sweep = []
        for k in range(2, max(2, upper) + 1):
            cut = _cut_linkage(linkage_matrix, k)
            score = None
            if clusterable_count >= k > 1:
                try:
                    score = round(float(silhouette_score(scaled[clusterable], cut[clusterable])), 4)
                except ValueError:
                    score = None
            sweep.append({"k": k, "silhouette": score, "distinctClusters": int(len(set(cut.tolist())))})
        scored = [entry for entry in sweep if entry["silhouette"] is not None]
        if scored:
            peak = max(entry["silhouette"] for entry in scored)
            # Tie-break towards the smaller consensus. The consensus matrix has
            # many exact ties, so several k can score identically; a segmentation
            # that names four segments is more useful than one that names eight
            # for the same evidence.
            best = next(entry for entry in scored if entry["silhouette"] == peak)
            chosen_k = int(best["k"])
            tied = [entry["k"] for entry in scored if entry["silhouette"] == peak]
            reason = (
                "Consensus cut K={} chosen as the maximum silhouette ({:.4f}) of the consensus "
                "partition swept over K={}..{}{}.".format(
                    chosen_k,
                    peak,
                    scored[0]["k"],
                    scored[-1]["k"],
                    "; K={} scored identically and the smaller was kept for parsimony".format(tied)
                    if len(tied) > 1
                    else "",
                )
            )
        else:
            chosen_k = 2
            reason = "Consensus cut defaulted to K=2 because no cut produced a valid silhouette."

    flat = _cut_linkage(linkage_matrix, chosen_k)

    # Renumber contiguously from 0 so the admin UI never shows a gap in cluster ids.
    present = sorted({int(value) for value in flat[clusterable].tolist()})
    remap = {value: index for index, value in enumerate(present)}
    flat = np.array([remap.get(int(value), -1) for value in flat], dtype=int)

    final_labels: Dict[str, int] = {}
    for index, uid in enumerate(user_ids):
        final_labels[uid] = int(flat[index]) if not noise_mask[index] else NOISE_LABEL

    label_array = np.array([final_labels[uid] for uid in user_ids], dtype=int)
    evaluation = evaluate_partition(scaled, label_array, ignore_label=NOISE_LABEL)
    distinct = len(set(label_array[clusterable].tolist()))

    per_algorithm = []
    for name, meta, same, valid_pair in members:
        per_algorithm.append(
            {
                "algorithm": name,
                "weight": float(meta["weight"]),
                "votedPairs": int(valid_pair.sum() // 2),
                "agreedPairs": int(same.sum() // 2),
                "abstainedPairs": int((~valid_pair).sum() // 2),
            }
        )

    return {
        "algorithm": "hybrid",
        "label": "Hybrid (consensus)",
        "nSamples": int(n),
        "numClusters": int(distinct),
        "requestedK": int(chosen_k),
        "labels": final_labels,
        "clusterSizes": [int(count) for count in np.bincount(label_array[clusterable])] if distinct else [],
        "noiseCount": int(noise_mask.sum()),
        "noisePercentage": round(100.0 * float(noise_mask.sum()) / n, 2),
        "metrics": {
            "silhouette": evaluation["silhouette"],
            "daviesBouldin": evaluation["daviesBouldin"],
            "calinskiHarabasz": evaluation["calinskiHarabasz"],
        },
        "metricNotes": evaluation["unavailable"],
        "parameters": {
            "consensusWeights": dict(CONSENSUS_WEIGHTS),
            "consensusLinkage": "average",
            "consensusK": int(chosen_k),
            "consensusKSource": "admin" if target_k is not None else "silhouette sweep",
        },
        "consensusKReason": reason,
        "consensusSweep": sweep,
        "meanAgreement": round(float(consensus[np.triu_indices(n, k=1)].mean()), 4) if n > 1 else 1.0,
        "contributions": per_algorithm,
        "noisePolicy": noise_policy,
        "dbscanTrusted": dbscan_trusted,
        "dbscanNoiseAdvisory": {
            uid: True for uid, flagged in zip(user_ids, dbscan_noise.tolist()) if flagged
        }
        if not dbscan_trusted
        else {},
        "notes": [
            "Consensus of {} algorithms via pairwise co-association and average-linkage "
            "re-clustering.".format(len(members)),
            "DBSCAN noise customers are preserved as noise and excluded from the metrics."
            if dbscan_trusted
            else "DBSCAN's noise labels were not trusted at the chosen parameters, so they are "
            "reported as advisory (dbscanNoiseAdvisory) instead of removing customers from the "
            "final segments.",
        ],
    }


def compute_agreement(
    kmeans_result: Dict[str, Any],
    agglomerative_result: Dict[str, Any],
    dbscan_result: Dict[str, Any],
    hybrid_result: Dict[str, Any],
    user_ids: Sequence[str],
) -> Dict[str, Any]:
    """
    How much do the base algorithms actually agree with the consensus?

    The Adjusted Rand Index is the right tool because it is invariant to cluster
    labelling -- comparing raw label ids across algorithms would be meaningless
    since "cluster 0" in K-Means has nothing to do with "cluster 0" in
    Agglomerative. ARI ranges from -1 (complete disagreement) through 0 (chance)
    to 1 (identical partitions), adjusted for chance.
    """

    def labels_of(result: Dict[str, Any]) -> np.ndarray:
        label_map = result.get("labels") or {}
        return np.array([int(label_map.get(uid, NOISE_LABEL)) for uid in user_ids], dtype=int)

    def safe_ari(a: np.ndarray, b: np.ndarray) -> Optional[float]:
        try:
            return round(float(adjusted_rand_score(a, b)), 4)
        except ValueError:  # pragma: no cover
            return None

    km = labels_of(kmeans_result)
    agg = labels_of(agglomerative_result)
    db = labels_of(dbscan_result)
    hy = labels_of(hybrid_result)

    # DBSCAN's noise is an abstention, not a group, so its ARI is only meaningful
    # over the customers it actually clustered.
    clustered = db != NOISE_LABEL
    ari_dbscan = safe_ari(db[clustered], hy[clustered]) if clustered.sum() > 1 else None

    scores = [value for value in (safe_ari(km, hy), safe_ari(agg, hy), ari_dbscan) if value is not None]
    return {
        "ariKmeansVsHybrid": safe_ari(km, hy),
        "ariAgglomerativeVsHybrid": safe_ari(agg, hy),
        "ariDbscanVsHybrid": ari_dbscan,
        "ariKmeansVsAgglomerative": safe_ari(km, agg),
        "consensusStrength": round(float(np.mean(scores)), 4) if scores else None,
        "meanAgreement": hybrid_result.get("meanAgreement"),
        "dbscanNoiseDetected": int((db == NOISE_LABEL).sum()),
        "interpretation": (
            "Adjusted Rand Index is label-invariant, so it is safe to compare partitions across "
            "algorithms. 1.0 = identical grouping, 0.0 = no better than chance. These values "
            "measure how strongly the consensus partition reflects each base algorithm; they are "
            "not accuracy scores, because unsupervised clustering has no ground truth."
        ),
    }


# ---------------------------------------------------------------------------
# Step 8: PCA (visualisation only)
# ---------------------------------------------------------------------------


def compute_pca(scaled: np.ndarray, user_ids: Sequence[str], top_loadings: int = 6) -> Dict[str, Any]:
    """
    Project the scaled feature matrix onto its first two principal components so
    the segments can be seen in 2D.

    PCA is a *visualisation* step. Clustering is performed on the full
    standardised feature space; replacing it with two components would discard
    most of the signal and is not done here. The reported explained variance makes
    that trade-off visible instead of hidden.
    """
    n_samples, n_features = scaled.shape
    if n_samples < 2:
        raise PipelineError("PCA needs at least 2 customers.", "insufficient_data")

    n_components = int(min(2, n_features, n_samples))
    model = PCA(n_components=n_components, random_state=RANDOM_STATE)
    coords = model.fit_transform(scaled)
    explained = model.explained_variance_ratio_

    points = {}
    for index, uid in enumerate(user_ids):
        point = {"x": round(float(coords[index, 0]), 4)}
        if n_components > 1:
            point["y"] = round(float(coords[index, 1]), 4)
        else:
            point["y"] = 0.0
        points[uid] = point

    components = []
    for component_index in range(n_components):
        loadings = model.components_[component_index]
        ranked = np.argsort(np.abs(loadings))[::-1][:top_loadings]
        components.append(
            {
                "name": "PC{}".format(component_index + 1),
                "explainedVariance": round(float(explained[component_index]), 4),
                "topFeatures": [
                    {
                        "name": FEATURE_COLUMNS[int(position)],
                        "label": FEATURE_BY_NAME[FEATURE_COLUMNS[int(position)]]["label"],
                        "loading": round(float(loadings[int(position)]), 4),
                    }
                    for position in ranked
                ],
            }
        )

    return {
        "points": points,
        "components": components,
        "explainedVariance": [round(float(value), 4) for value in explained],
        "totalExplainedVariance": round(float(np.sum(explained)), 4),
        "featureCount": int(n_features),
        "note": (
            "PCA is used only to draw the 2D map. All clustering is performed on the full "
            "{} -dimensional standardised feature space.".format(n_features)
        ),
    }


# ---------------------------------------------------------------------------
# Step 9: cluster profiles vs. the whole population
# ---------------------------------------------------------------------------


def _normalised_index(
    df: pd.DataFrame,
    components: Dict[str, float],
    reference: Optional[pd.DataFrame] = None,
) -> float:
    """
    Weighted 0-1 behavioural index.

    Each component is divided by the dataset maximum for that feature, so the
    result is 0 for a customer who does nothing on a dimension and 1 for the most
    active customer in the dataset. The weighting and the normalisation are both
    explicit, so the number can be recomputed by hand in a viva.

    ``reference`` is the frame the maxima come from. When profiling clusters it is
    the whole population, which is what makes two cluster indices comparable: a
    cluster's index then means "share of the most engaged customer in the entire
    dataset", not "share of its own most engaged member", which would let every
    cluster report a near-perfect score.
    """
    basis = reference if reference is not None else df
    score = 0.0
    for feature, weight in components.items():
        if feature not in df.columns or feature not in basis.columns:
            continue
        column_max = float(basis[feature].max())
        if column_max <= 0:
            continue
        score += weight * (float(df[feature].mean()) / column_max)
    divisor = sum(abs(weight) for weight in components.values()) or 1.0
    return round(score / divisor, 4)


def profile_clusters(
    df: pd.DataFrame, labels: Dict[str, int], user_ids: Sequence[str]
) -> Dict[int, Dict[str, Any]]:
    """
    Characterise every final cluster against the whole customer population.

    The z-score column is the useful part: it is the population standard
    deviation of the feature, so a cluster whose mean views sit 1.8 sigma above
    average genuinely differs from the typical customer, and "high" / "low"
    statements in the persona layer rest on a number rather than an impression.
    """
    frame = df.copy()
    frame["_cluster"] = [int(labels.get(uid, NOISE_LABEL)) for uid in user_ids]
    total = len(user_ids)

    population_mean = frame[FEATURE_COLUMNS].mean()
    population_std = frame[FEATURE_COLUMNS].std(ddof=0).replace(0.0, np.nan)

    profiles: Dict[int, Dict[str, Any]] = {}
    for cluster_id, group in frame.groupby("_cluster"):
        count = len(group)
        means = {column: float(group[column].mean()) for column in FEATURE_COLUMNS}
        z_scores: Dict[str, float] = {}
        for column in FEATURE_COLUMNS:
            std = population_std.get(column)
            if std is None or not np.isfinite(std) or float(std) == 0.0:
                z_scores[column] = 0.0
            else:
                z_scores[column] = round((means[column] - float(population_mean[column])) / float(std), 4)

        ranked = sorted(z_scores.items(), key=lambda item: abs(item[1]), reverse=True)
        top = [
            {
                "name": name,
                "label": FEATURE_BY_NAME[name]["label"],
                "zScore": value,
                "clusterMean": round(means[name], 3),
                "populationMean": round(float(population_mean[name]), 3),
                "direction": "above" if value > 0 else ("below" if value < 0 else "neutral"),
            }
            for name, value in ranked
            if abs(value) >= 0.35
        ]

        profiles[int(cluster_id)] = {
            "clusterId": int(cluster_id),
            "customerCount": count,
            "percentage": round(100.0 * count / total, 2) if total else 0.0,
            "customerIds": [
                uid for uid, label in zip(user_ids, frame["_cluster"].tolist()) if int(label) == int(cluster_id)
            ],
            "means": {column: round(value, 4) for column, value in means.items()},
            "populationMean": {column: round(float(value), 4) for column, value in population_mean.items()},
            "zScores": z_scores,
            "highFeatures": [entry for entry in top if entry["zScore"] > 0][:6],
            "lowFeatures": [entry for entry in top if entry["zScore"] < 0][:6],
            "engagementIndex": _normalised_index(group, ENGAGEMENT_COMPONENTS, frame),
            "purchaseTendency": _normalised_index(group, PURCHASE_TENDENCY_COMPONENTS, frame),
        }
    return profiles


# ---------------------------------------------------------------------------
# Step 10: persona interpretation
# ---------------------------------------------------------------------------


PERSONA_RULES: List[Dict[str, Any]] = [
    {
        "name": "Research-Heavy Buyer",
        "signature": "highCompareHighReviewLongDecision",
        "weight": {"comparisonCount": 2.5, "reviewsChecked": 2.0, "decisionTime": 1.8, "sellerProfileChecks": 1.2},
        "description": "Compares many products, reads reviews and checks sellers before committing, and takes far longer than average to decide.",
        "marketingStrategy": "Lead with specification depth, side-by-side comparison and review summaries rather than discount messaging.",
    },
    {
        "name": "Bargain Hunter",
        "signature": "highNegotiationHighDiscount",
        "weight": {"negotiationCount": 2.5, "averageOfferDiscount": 2.2, "averageDiscount": 1.8, "negotiationRounds": 1.4, "offerRejectionRate": 1.0},
        "description": "Treats every purchase as a negotiation: sends many offers, pushes hard below list price and leans on discounts.",
        "marketingStrategy": "Surface negotiable listings, price history and deal alerts, and route them into a counter-offer flow.",
    },
    {
        "name": "Quick Buyer",
        "signature": "fastDecisiveFrequentBuyer",
        "weight": {"purchaseFrequency": 2.0, "purchaseCount": 1.8, "decisionTime": 1.6, "repeatPurchaseRate": 1.4},
        "description": "Decides fast, orders often and comes back -- short decision times with high purchase cadence.",
        "marketingStrategy": "Reduce friction: one-tap checkout, in-stock badges, fast-seller filters and saved payment details.",
    },
    {
        "name": "Trust Seeker",
        "signature": "heavyTrustVerification",
        "weight": {"trustSignalInteractions": 2.4, "sellerProfileChecks": 2.0, "reviewsChecked": 1.8, "totalConversations": 1.0},
        "description": "Verifies before buying -- checks sellers, reads reviews and asks questions in chat rather than trusting the listing.",
        "marketingStrategy": "Put verified-seller badges, buyer protection and seller ratings above the fold, and answer chat fast.",
    },
    {
        "name": "Window Shopper",
        "signature": "browseHeavyLowConvert",
        "weight": {"wishlistCount": 2.0, "totalViews": 1.6, "uniqueProductsViewed": 1.2, "purchaseCount": -1.0},
        "description": "Explores heavily and saves items for later but rarely completes checkout -- high intent that is not converting.",
        "marketingStrategy": "Win them back with wishlist price-drop alerts and reminders rather than new prospecting spend.",
    },
    {
        "name": "Value Seeker",
        "signature": "budgetDiverseAbandoning",
        "weight": {"cartAbandonmentRate": 2.0, "categoryDiversity": 1.8, "averageSpending": -1.2, "offerRejectionRate": 1.0},
        "description": "Price-elastic across several categories: explores widely, adds to cart, then abandons rather than paying full price.",
        "marketingStrategy": "Offer bundles, student or budget pricing and win-back discounts on abandoned carts.",
    },
    {
        "name": "High-Intent Customer",
        "signature": "highSpendRepeatIntent",
        "weight": {"purchaseCount": 2.2, "totalSpending": 2.2, "repeatPurchaseRate": 2.0, "checkoutStarts": 1.2},
        "description": "Buys repeatedly at above-average value with strong checkout intent -- the highest commercial value segment.",
        "marketingStrategy": "Run loyalty rewards, early-access drops and a premium seller programme.",
    },
    {
        "name": "Category Specialist",
        "signature": "singleCategoryConcentrated",
        "weight": {"laptopInterest": 1.0, "phoneInterest": 1.0, "electronicsInterest": 1.0, "booksInterest": 1.0, "furnitureInterest": 1.0, "gamingInterest": 1.0, "cyclesInterest": 1.0, "categoryInterestBreadth": -1.5},
        "description": "Concentrates on a single product category rather than browsing across the marketplace.",
        "marketingStrategy": "Curate deep inventory and accessories within their category instead of cross-marketplace promotions.",
    },
    {
        "name": "Local Buyer",
        "signature": "localHometownPreference",
        "weight": {"localPreference": 2.6, "totalConversations": 1.0, "decisionTime": 0.8},
        "description": "Strongly prefers listings in their own city and is comfortable completing the transaction locally.",
        "marketingStrategy": "Prioritise nearby inventory, meet-up logistics and local pickup in their marketing.",
    },
    {
        "name": "Night Owl",
        "signature": "lateEveningEngagement",
        "weight": {"eveningActivity": 1.6, "weekendActivity": 1.4, "sessionFrequency": 1.2},
        "description": "Concentrates browsing into evening and weekend windows rather than shopping during the working day.",
        "marketingStrategy": "Schedule drop announcements and notifications for their active hours.",
    },
    {
        "name": "Casual Browser",
        "signature": "lightSporadicEngagement",
        "weight": {"sessionFrequency": 0.9, "totalSearches": 0.6, "activeDays": 0.8},
        "description": "Light, sporadic engagement with no dominant pattern -- an audience to activate rather than a segment to target.",
        "marketingStrategy": "Gentle lifecycle email and periodic curated recommendations to build a habit.",
    },
]

PERSONA_MIN_SCORE = 1.5
# A single feature cannot push a persona score past this multiple of its own
# reference value. See score_persona_rules for why the evidence saturates.
PERSONA_SATURATION_CAP = 1.5


def score_persona_rules(means: Dict[str, float]) -> Tuple[Dict[str, float], List[Dict[str, Any]]]:
    """
    Score every persona rule against a cluster's measured means.

    The score is ``sum(weight * min(mean / reference, 1.5))`` over the features the
    rule cares about. The reference constants only exist to put counts, rupee
    amounts and ratios on a comparable footing inside this scorer -- they never
    influence clustering, scaling or the choice of K. Negative weights let a rule
    express a requirement (e.g. "high browsing *and* low purchasing") instead of
    merely rewarding everything.

    The 1.5 cap is deliberate saturation: a rule should be able to say "this
    segment is strongly a bargain hunter" without one extreme feature on one
    customer being able to out-vote the whole cluster. Because it saturates, the
    effective ratio used in the score is reported separately from the raw ratio,
    and a feature that hit the cap is flagged, so the evidence shown to an admin
    can never claim a weaker signal than the rule actually received.
    """
    scores: Dict[str, float] = {}
    details: Dict[str, List[Dict[str, Any]]] = {}
    saturation_cap = PERSONA_SATURATION_CAP
    for rule in PERSONA_RULES:
        total = 0.0
        per_feature: List[Dict[str, Any]] = []
        for feature, weight in rule["weight"].items():
            mean = float(means.get(feature, 0.0) or 0.0)
            reference = max(float(FEATURE_BY_NAME[feature]["reference"]), 1e-9)
            raw_ratio = mean / reference
            effective_ratio = min(raw_ratio, saturation_cap)
            contribution = weight * effective_ratio
            total += contribution
            per_feature.append(
                {
                    "name": feature,
                    "label": FEATURE_BY_NAME[feature]["label"],
                    "weight": float(weight),
                    "clusterMean": round(mean, 3),
                    "reference": round(reference, 3),
                    "normalised": round(effective_ratio, 3),
                    "rawRatio": round(raw_ratio, 3),
                    "saturated": raw_ratio > saturation_cap,
                    "contribution": round(contribution, 3),
                }
            )
        scores[rule["name"]] = round(total, 4)
        details[rule["name"]] = per_feature
    return scores, details


def assign_personas(profiles: Dict[int, Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Name each segment from its dominant measured behaviour.

    Two properties make this defensible rather than decorative:

    1. **The name is earned.** A segment is only named when its best-scoring rule
       clears ``PERSONA_MIN_SCORE``. Below that threshold the algorithm had no
       evidence to call it anything, so it is reported as an unnamed segment
       rather than being given a flattering label.
    2. **Names are not duplicated.** Independent argmax per cluster tends to give
       two clusters the same name. A Hungarian assignment (optimal one-to-one
       matching) is used instead, so each persona describes at most one segment
       and the labelling is internally consistent.

    Every returned persona carries the evidence that produced it: the measured
    cluster means, the population means they were compared against, the z-scores,
    and a confidence value derived from the margin over the runner-up.
    """
    cluster_ids = sorted(cid for cid in profiles if cid != NOISE_LABEL)
    if not cluster_ids:
        return []

    rule_names = [rule["name"] for rule in PERSONA_RULES]
    score_matrix = np.zeros((len(cluster_ids), len(rule_names)), dtype=float)
    detail_lookup: Dict[Tuple[int, str], List[Dict[str, Any]]] = {}

    for row, cluster_id in enumerate(cluster_ids):
        means = profiles[cluster_id]["means"]
        scores, details = score_persona_rules(means)
        for column, rule_name in enumerate(rule_names):
            score_matrix[row, column] = scores.get(rule_name, 0.0)
            detail_lookup[(cluster_id, rule_name)] = details.get(rule_name, [])

    # Hungarian maximisation: maximise total evidence across the whole assignment.
    if len(cluster_ids) <= len(rule_names):
        rows, columns = linear_sum_assignment(-score_matrix)
        assignment = {int(r): int(c) for r, c in zip(rows, columns)}
    else:
        # More segments than personas: every persona is used once, and the extra
        # segments compete for the best remaining rule.
        assignment = {}
        taken: set[int] = set()
        for row, cluster_id in enumerate(cluster_ids):
            order = np.argsort(-score_matrix[row])
            for column in order:
                if int(column) not in taken:
                    assignment[cluster_id] = int(column)
                    taken.add(int(column))
                    break

    personas: List[Dict[str, Any]] = []
    for cluster_id in cluster_ids:
        profile = profiles[cluster_id]
        chosen_column = assignment.get(cluster_id)
        row = cluster_ids.index(cluster_id)
        ordered = np.argsort(-score_matrix[row])
        best_column = int(ordered[0])
        runner_up_score = float(score_matrix[row, int(ordered[1])]) if len(ordered) > 1 else 0.0
        best_score = float(score_matrix[row, best_column])

        if chosen_column is None or score_matrix[row, chosen_column] < PERSONA_MIN_SCORE:
            personas.append(_unnamed_persona(cluster_id, profile, score_matrix, rule_names, best_column, best_score))
            continue

        chosen_column = int(chosen_column)
        rule = PERSONA_RULES[chosen_column]
        name = rule_names[chosen_column]
        if best_score > 0:
            margin = (best_score - runner_up_score) / best_score
        else:
            margin = 0.0
        confidence = round(max(0.0, min(1.0, 0.6 * min(1.0, best_score / 4.0) + 0.4 * margin)), 3)

        evidence = sorted(
            detail_lookup[(cluster_id, name)], key=lambda item: abs(item["contribution"]), reverse=True
        )[:6]

        personas.append(
            {
                "id": int(cluster_id),
                "clusterId": int(cluster_id),
                "name": rule["name"],
                "signature": rule["signature"],
                "description": rule["description"],
                "marketingStrategy": rule["marketingStrategy"],
                "matchScore": round(best_score, 3),
                "confidence": confidence,
                "marginOverRunnerUp": round(margin, 3),
                "evidence": evidence,
                "definingBehaviors": [entry["label"] for entry in evidence if entry["contribution"] > 0][:4],
                "counterSignals": [entry["label"] for entry in evidence if entry["contribution"] < 0][:3],
                "alternatives": [
                    {"name": rule_names[int(index)], "score": round(float(score_matrix[row, int(index)]), 3)}
                    for index in ordered[1:4]
                ],
                "highFeatures": profile["highFeatures"],
                "lowFeatures": profile["lowFeatures"],
                "engagementIndex": profile["engagementIndex"],
                "purchaseTendency": profile["purchaseTendency"],
                "customerCount": profile["customerCount"],
                "percentage": profile["percentage"],
                "customerIds": profile["customerIds"],
                "characteristics": profile["means"],
                "populationMean": profile["populationMean"],
                "avgSpending": round(profile["means"].get("averageSpending", 0.0), 2),
                "avgDecisionTime": round(profile["means"].get("decisionTime", 0.0), 2),
                "avgViews": round(profile["means"].get("totalViews", 0.0), 2),
                "avgComparisons": round(profile["means"].get("comparisonCount", 0.0), 2),
                "avgNegotiations": round(profile["means"].get("negotiationCount", 0.0), 2),
                "avgDiscountUsage": round(profile["means"].get("averageDiscount", 0.0), 2),
                "avgSearches": round(profile["means"].get("totalSearches", 0.0), 2),
                "avgWishlist": round(profile["means"].get("wishlistCount", 0.0), 2),
                "purchaseFrequency": round(profile["means"].get("purchaseFrequency", 0.0), 3),
                "dominantCategories": _dominant_category_features(profile),
            }
        )
    return personas


def _dominant_category_features(profile: Dict[str, Dict[str, Any]]) -> List[str]:
    category_features = [name for name in FEATURE_COLUMNS if name.endswith("Interest")]
    ranked = sorted(
        category_features, key=lambda name: profile["zScores"].get(name, 0.0), reverse=True
    )
    return [
        FEATURE_BY_NAME[name]["label"]
        for name in ranked[:3]
        if profile["zScores"].get(name, 0.0) > 0
    ]


def _unnamed_persona(
    cluster_id: int,
    profile: Dict[str, Dict[str, Any]],
    score_matrix: np.ndarray,
    rule_names: List[str],
    best_column: int,
    best_score: float,
) -> Dict[str, Any]:
    row = int(cluster_id)
    return {
        "id": int(cluster_id),
        "clusterId": int(cluster_id),
        "name": "Unclassified Segment {}".format(cluster_id),
        "signature": "belowNamingThreshold",
        "description": (
            "This segment did not match any persona rule above the evidence threshold "
            "(best score {:.2f} < {:.2f}), so no behavioural label has been assigned. Its "
            "measured profile is shown below.".format(best_score, PERSONA_MIN_SCORE)
        ),
        "marketingStrategy": "No strategy assigned. Review the measured profile before targeting this segment.",
        "matchScore": round(float(best_score), 3),
        "confidence": 0.0,
        "marginOverRunnerUp": 0.0,
        "evidence": [],
        "definingBehaviors": [entry["label"] for entry in profile["highFeatures"][:4]],
        "counterSignals": [entry["label"] for entry in profile["lowFeatures"][:3]],
        "alternatives": [
            {"name": rule_names[index], "score": round(float(value), 3)}
            for index, value in sorted(enumerate(score_matrix[row].tolist()), key=lambda item: -item[1])[:3]
        ],
        "highFeatures": profile["highFeatures"],
        "lowFeatures": profile["lowFeatures"],
        "engagementIndex": profile["engagementIndex"],
        "purchaseTendency": profile["purchaseTendency"],
        "customerCount": profile["customerCount"],
        "percentage": profile["percentage"],
        "customerIds": profile["customerIds"],
        "characteristics": profile["means"],
        "populationMean": profile["populationMean"],
        "avgSpending": round(profile["means"].get("averageSpending", 0.0), 2),
        "avgDecisionTime": round(profile["means"].get("decisionTime", 0.0), 2),
        "avgViews": round(profile["means"].get("totalViews", 0.0), 2),
        "avgComparisons": round(profile["means"].get("comparisonCount", 0.0), 2),
        "avgNegotiations": round(profile["means"].get("negotiationCount", 0.0), 2),
        "avgDiscountUsage": round(profile["means"].get("averageDiscount", 0.0), 2),
        "avgSearches": round(profile["means"].get("totalSearches", 0.0), 2),
        "avgWishlist": round(profile["means"].get("wishlistCount", 0.0), 2),
        "purchaseFrequency": round(profile["means"].get("purchaseFrequency", 0.0), 3),
        "dominantCategories": _dominant_category_features(profile),
    }


# ---------------------------------------------------------------------------
# Step 0: dataset summary
# ---------------------------------------------------------------------------


def dataset_summary(df: pd.DataFrame, user_ids: Sequence[str]) -> Dict[str, Any]:
    """
    Describe the feature matrix the admin is about to cluster.

    This is what makes the run inspectable: every feature's distribution, how
    skewed it is, how many customers are exactly zero on it, and which features
    carry no variance at all (and therefore cannot influence the result).
    """
    columns: List[Dict[str, Any]] = []
    constant: List[str] = []
    for column in FEATURE_COLUMNS:
        values = df[column].to_numpy(dtype=float)
        std = float(np.std(values))
        if std == 0.0:
            constant.append(column)
        columns.append(
            {
                "name": column,
                "label": FEATURE_BY_NAME[column]["label"],
                "group": FEATURE_BY_NAME[column]["group"],
                "unit": FEATURE_BY_NAME[column]["unit"],
                "transform": FEATURE_BY_NAME[column]["transform"],
                "mean": round(float(np.mean(values)), 4),
                "std": round(std, 4),
                "min": round(float(np.min(values)), 4),
                "p25": round(float(np.quantile(values, 0.25)), 4),
                "median": round(float(np.median(values)), 4),
                "p75": round(float(np.quantile(values, 0.75)), 4),
                "max": round(float(np.max(values)), 4),
                "skew": round(float(pd.Series(values).skew()), 4) if len(values) > 2 else 0.0,
                "zeroRate": round(float(np.mean(values == 0)), 4),
                "distinctValues": int(len(np.unique(values))),
                "isConstant": std == 0.0,
            }
        )

    # Dataset-level health indicators. These tell the admin, before any clustering
    # happens, whether the data can actually support segmentation.
    activity_columns = [column for column in ACTIVITY_SIGNAL_FEATURES if column in df.columns]
    activity = df[activity_columns].sum(axis=1) if activity_columns else pd.Series(0.0, index=df.index)
    engagement = df[ENGAGEMENT_COMPONENTS.keys()].mean(axis=1)
    zero_feature_features = [
        column["name"] for column in columns if column["zeroRate"] >= 0.95
    ]
    quality_flags: List[str] = []
    if len(user_ids) < 10:
        quality_flags.append(
            "Fewer than 10 customers: indices will be unstable and segments are not "
            "generalisable."
        )
    if len(constant) > len(FEATURE_COLUMNS) / 2:
        quality_flags.append(
            "{} of {} features are constant, so they carry no information. This usually means "
            "the tracking events behind them have not been recorded yet.".format(
                len(constant), len(FEATURE_COLUMNS)
            )
        )
    if zero_feature_features:
        quality_flags.append(
            "{} feature(s) are zero for at least 95% of customers.".format(
                len(zero_feature_features)
            )
        )

    return {
        "customerCount": int(len(user_ids)),
        "featureCount": len(FEATURE_COLUMNS),
        "featureSchemaVersion": FEATURE_SCHEMA_VERSION,
        "constantFeatures": constant,
        "constantFeatureCount": len(constant),
        "activeCustomers": int((activity > 0).sum()),
        "inactiveCustomers": int((activity <= 0).sum()),
        "totalSessions": int(df["sessionFrequency"].sum()) if "sessionFrequency" in df else 0,
        "totalPurchases": int(df["purchaseCount"].sum()) if "purchaseCount" in df else 0,
        "totalOffers": int(df["negotiationCount"].sum()) if "negotiationCount" in df else 0,
        "zeroFeatureCount": len(zero_feature_features),
        "zeroHeavyFeatures": zero_feature_features,
        "avgEngagementScore": round(float(engagement.mean()), 4) if len(engagement) else None,
        "avgPurchaseTendency": _normalised_index(df, PURCHASE_TENDENCY_COMPONENTS),
        "avgEngagementIndex": _normalised_index(df, ENGAGEMENT_COMPONENTS),
        "qualityFlags": quality_flags,
        "features": columns,
        "schema": public_schema(),
    }


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------


def methodology_document(
    k_curve: List[Dict[str, Any]],
    k_reason: str,
    preprocessing: Dict[str, Any],
    scaling: Dict[str, Any],
    params: Dict[str, Any],
    hybrid: Dict[str, Any],
    warnings_: List[str],
) -> Dict[str, Any]:
    """
    A plain account of what the pipeline actually did.

    The primary result is K-Means, so that is what this document describes. The
    comparison algorithms are listed because they were genuinely fitted, and
    their agreement with K-Means is reported, but nothing here implies the
    reported segmentation is a blend of them.
    """
    return {
        "name": "K-Means customer segmentation",
        "primaryAlgorithm": "kmeans",
        "featureSchemaVersion": FEATURE_SCHEMA_VERSION,
        "featureCount": len(FEATURE_COLUMNS),
        "features": list(FEATURE_COLUMNS),
        "kSelection": {
            "reason": k_reason,
            "curve": k_curve,
            "criterion": "Silhouette sweep with a 5% parsimony tie-break; inertia recorded for the elbow check.",
        },
        "preprocessing": preprocessing,
        "scaling": scaling,
        "parameters": params,
        "comparison": {
            "note": (
                "Agglomerative and DBSCAN were also fitted on the same scaled matrix, and a "
                "consensus partition was built from their co-association. They are recorded for "
                "comparison only; the reported clusters and personas come from K-Means."
            ),
            "consensusReason": hybrid.get("consensusKReason"),
            "weights": hybrid.get("parameters", {}).get("consensusWeights"),
            "linkage": hybrid.get("parameters", {}).get("consensusLinkage"),
            "meanAgreement": hybrid.get("meanAgreement"),
            "contributions": hybrid.get("contributions"),
        },
        "steps": [
            "Customer behaviour is collected from MongoDB as explicit behaviour events, orders and offers.",
            "Behaviour is aggregated per customer into {} numeric features.".format(len(FEATURE_COLUMNS)),
            "Missing values are imputed with the column median.",
            "Heavily right-skewed count and currency features are log1p-transformed.",
            "Values are winsorised to the 1st/99th percentile to limit outlier leverage.",
            "Features are scaled with {} so no feature dominates the distance metric.".format(
                scaling.get("scalerClass", "StandardScaler")
            ),
            "K is chosen from a published sweep of silhouette, Davies-Bouldin, Calinski-Harabasz and inertia.",
            "K-Means is fitted on the scaled matrix; this partition is the reported segmentation.",
            "Each cluster is profiled against the whole population in standard deviations.",
            "Persona labels are assigned from measured evidence using an optimal one-to-one matching.",
            "Agglomerative and DBSCAN are fitted on the same matrix and a co-association consensus is built, "
            "purely so the K-Means result can be compared against alternatives. DBSCAN noise stays noise and is "
            "excluded from that comparison's validation indices.",
            "PCA projects the customers to 2D for the cluster map (visualisation only).",
        ],
        "warnings": warnings_,
    }
