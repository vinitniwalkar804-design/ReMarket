# ML Service — Customer Segmentation & Persona Discovery

Python FastAPI REST service consumed by the Node.js backend.

## Running

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Layout

| Path | Purpose |
|---|---|
| `app/main.py` | FastAPI app, request/response models, endpoint definitions |
| `app/clustering/engine.py` | The whole pipeline: preprocessing, scaling, K-Means, Agglomerative, DBSCAN, consensus hybrid, PCA, persona naming |
| `app/clustering/feature_schema.py` | The 46-feature schema the backend must match, grouped for the admin UI |
| `tests/synthetic_data.py` | Generates customers with four planted behavioural archetypes |
| `tests/clustering_smoke_test.py` | Engine-level check: does the pipeline recover the planted structure? |
| `tests/api_smoke_test.py` | API-level check through the FastAPI test client, including validation failures and determinism |

```bash
python tests/clustering_smoke_test.py   # engine correctness
python tests/api_smoke_test.py           # endpoint behaviour
```

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Service health check |
| POST | `/cluster` | Run the full clustering + persona pipeline on a feature payload |

`POST /cluster` accepts `{ "features": [ { userId, totalViews, ..., decisionTime, ... } ] }` and returns:

```json
{
  "kmeans":       { "numClusters", "labels", "metrics", "noiseCount" },
  "agglomerative":{ ... },
  "dbscan":       { "numClusters", "labels", "metrics", "noiseCount" },
  "hybrid":       { "numClusters", "labels", "metrics", "noiseCount" },
  "pcaData":      { "points": { userId: {x, y} }, "explainedVariance": [..] },
  "personas":     [ { id, name, description, characteristics, marketingStrategy, ... } ],
  "optimalK":     int,
  "totalCustomers": int
}
```

## Pipeline (`app/clustering/engine.py`)

1. `preprocess_features` — coerce + impute missing values (0).
2. `scale_features` — `StandardScaler`.
3. `find_optimal_k` — elbow via inertia + best Silhouette over k ∈ [2, 8].
4. `run_kmeans` — K-Means with `n_init=10`, fixed seed.
5. `run_agglomerative` — Ward linkage.
6. `run_dbscan` — `eps` from k-distance knee, `min_samples` heuristic; returns noise.
7. `hybrid_clustering` — **consensus ensemble**:
   - co-association matrices for K-Means and Agglomerative,
   - consensus = mean of the two, diagonal = 1,
   - final partition via average-linkage on `1 − consensus`,
   - DBSCAN noise kept as `-1`.
8. `compute_hybrid_metrics` — Silhouette / Davies-Bouldin / Calinski-Harabasz on non-noise points.
9. `compute_pca` — 2 components for the admin scatter visualization.
10. `generate_personas` — rule-based naming from measured cluster averages (Research-Heavy Buyer, Bargain Hunter, Quick Buyer, Trust Seeker, Window Shopper, High-Intent Customer, Student Saver, Casual Browser), each with a suggested marketing strategy.

## Academic Notes (viva)

- **Why hybrid?** A single algorithm can overfit one notion of similarity. The co-association consensus makes the final partition robust to the weaknesses of each base method while keeping DBSCAN's outlier handling.
- **Why PCA?** 30+ features are not directly plottable; PCA preserves the largest variance directions so cluster separation can be inspected visually, and it is the standard dimensionality-reduction step for unsupervised visualization.
- **Evaluation metrics**: Silhouette (cohesion + separation), Davies-Bouldin (ratio of within-cluster scatter to between-cluster separation — lower is better), Calinski-Harabasz (variance ratio — higher is better).