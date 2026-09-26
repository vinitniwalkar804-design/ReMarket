"""API-level smoke test using the FastAPI test client. Not part of the service."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient

from _synthetic import generate_customers
from app.main import app

client = TestClient(app)

health = client.get("/health")
print("GET /health ->", health.status_code)
print(" ", health.json())

schema = client.get("/features")
print("\nGET /features ->", schema.status_code)
body = schema.json()
print("  version:", body["version"], "| featureCount:", body["featureCount"],
      "| groups:", len(body["groups"]))

rows, _truth = generate_customers(per_archetype=14)
print(f"\nbuilt {len(rows)} customers for the API tests")

summary = client.post("/dataset/summary", json={"features": rows})
print("\nPOST /dataset/summary ->", summary.status_code)
s = summary.json()
for key in ("customerCount", "featureCount", "activeCustomers", "totalPurchases",
            "constantFeatureCount", "avgEngagementIndex", "clusterable", "durationMs"):
    print(f"  {key}: {s.get(key)}")
print("  features[0]:", s["features"][0])

for path, payload in (
    ("/cluster/kmeans", {"features": rows, "k": 4}),
    ("/cluster/agglomerative", {"features": rows, "k": 4, "linkage": "complete", "metric": "manhattan"}),
    ("/cluster/dbscan", {"features": rows}),
):
    response = client.post(path, json=payload)
    print(f"\nPOST {path} -> {response.status_code}")
    data = response.json()
    if response.status_code != 200:
        print("  detail:", data)
        continue
    algo = list(data["results"].keys())[0]
    result = data["results"][algo]
    print(f"  {algo}: clusters={result['numClusters']} noise={result['noiseCount']}")
    print("  metrics:", result["metrics"])
    print("  parameters:", result["parameters"])
    print("  kSelection:", {k: v for k, v in result.get("kSelection", {}).items() if k != "curve"})
    print("  durationMs:", data["durationMs"], "| warnings:", data["warnings"])

full = client.post("/cluster", json={"features": rows, "minK": 2, "maxK": 8})
print("\nPOST /cluster ->", full.status_code)
if full.status_code != 200:
    print("  detail:", full.json())
else:
    r = full.json()["results"]
    print("  optimalK:", r["optimalK"], "| suggestedK:", r["suggestedK"],
          "| totalCustomers:", r["totalCustomers"], "| selectedModel:", r["selectedModel"])
    print("  noiseCount:", r["noiseCount"], "| noisePolicy:", r["hybrid"]["noisePolicy"])
    for algo in ("kmeans", "agglomerative", "dbscan", "hybrid"):
        print("   %-14s clusters=%-3s noise=%-3s sil=%s" % (
            algo, r[algo]["numClusters"], r[algo]["noiseCount"], r[algo]["metrics"]["silhouette"]))
    print("  agreement:", {k: v for k, v in r["agreement"].items()
                           if k.startswith("ari") or k == "consensusStrength"})
    print("  personas:", [p["name"] for p in r["personas"]])
    print("  clusterProfiles:", sorted(r["clusterProfiles"].keys()))
    print("  pca points:", len(r["pcaData"]["points"]),
          "| explained:", r["pcaData"]["explainedVariance"])
    print("  methodology steps:", len(r["methodology"]["steps"]))
    print("  warnings:", full.json()["warnings"])
    print("  durationMs:", full.json()["durationMs"])

hybrid_only = client.post("/cluster/hybrid", json={"features": rows, "hybridK": 5})
print("\nPOST /cluster/hybrid (forced K=5) ->", hybrid_only.status_code)
if hybrid_only.status_code == 200:
    h = hybrid_only.json()["results"]["hybrid"]
    print("  clusters:", h["numClusters"], "| reason:", h["consensusKReason"])
    print("  metrics:", h["metrics"])
else:
    print("  detail:", hybrid_only.json())

print("\n--- validation and error handling ---")
three = [{"userId": f"u{i}", "totalViews": i + 1} for i in range(3)]
checks = [
    ("k below 2", "/cluster/kmeans", {"features": rows, "k": 1}),
    ("k above sample size", "/cluster/kmeans", {"features": rows, "k": 100}),
    ("bad scaler", "/cluster/kmeans", {"features": rows, "scaler": "banana"}),
    ("ward + manhattan", "/cluster/agglomerative", {"features": rows, "linkage": "ward", "metric": "manhattan"}),
    ("bad linkage", "/cluster/agglomerative", {"features": rows, "linkage": "nope"}),
    ("bad metric", "/cluster/agglomerative", {"features": rows, "metric": "cosine"}),
    ("negative eps", "/cluster/dbscan", {"features": rows, "eps": -1}),
    ("minSamples 1", "/cluster/dbscan", {"features": rows, "minSamples": 1}),
    ("minSamples > n", "/cluster/dbscan", {"features": rows, "minSamples": 1000}),
    ("maxK < minK", "/cluster", {"features": rows, "minK": 6, "maxK": 3}),
    ("consensus k too high", "/cluster/hybrid", {"features": rows, "hybridK": 100}),
    ("missing userId", "/cluster", {"features": [{"totalViews": 1}, {"userId": "a"}, {"userId": "b"}]}),
    ("blank userId", "/cluster", {"features": [{"userId": "a"}, {"userId": "  "}, {"userId": "c"}]}),
    ("duplicate userId", "/cluster", {"features": [{"userId": "a"}, {"userId": "a"}, {"userId": "c"}]}),
    ("non-numeric features", "/cluster", {"features": [{"userId": f"u{i}", "totalViews": "abc"} for i in range(6)]}),
    ("too few customers", "/cluster", {"features": three}),
    ("negative seed", "/cluster", {"features": rows, "seed": -1}),
]
for label, path, payload in checks:
    response = client.post(path, json=payload)
    detail = response.json().get("detail", response.json())
    if isinstance(detail, list):
        detail = detail[0].get("msg", detail)
    print("  %-22s -> %s  %s" % (label, response.status_code, str(detail)[:100]))

print("\n--- determinism ---")
a = client.post("/cluster", json={"features": rows}).json()["results"]
b = client.post("/cluster", json={"features": rows}).json()["results"]
print("  identical labels across two runs:",
      a["hybrid"]["labels"] == b["hybrid"]["labels"]
      and a["kmeans"]["labels"] == b["kmeans"]["labels"])

robust = client.post("/cluster/kmeans", json={"features": rows, "scaler": "robust", "k": 4})
print("  robust scaler ->", robust.status_code,
      "| sil:", robust.json()["results"]["kmeans"]["metrics"]["silhouette"])
print("\nAPI SMOKE TEST COMPLETE")
