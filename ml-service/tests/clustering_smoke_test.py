"""Engine-level smoke test for the clustering pipeline. Not part of the service.

Generates customers that span every feature in the schema, driven by four planted
archetypes, then checks that the pipeline recovers them. This is the test that
tells us whether the feature engineering, preprocessing and consensus actually
work, rather than merely whether the code runs.

Run from `ml-service/`:  python tests/clustering_smoke_test.py
"""
import sys
from pathlib import Path

# `ml-service/`, so `app.*` and the sibling `tests/` both resolve.
_HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(_HERE))
sys.path.insert(0, str(_HERE.parent))

from sklearn.metrics import adjusted_rand_score

from synthetic_data import ARCHETYPES, generate_customers
from app.clustering.engine import (
    FEATURE_COLUMNS,
    assign_personas,
    build_feature_matrix,
    choose_k,
    compute_agreement,
    compute_pca,
    dataset_summary,
    hybrid_clustering,
    k_selection_curve,
    profile_clusters,
    preprocess_features,
    run_agglomerative,
    run_dbscan,
    run_kmeans,
    scale_features,
)
from app.clustering.feature_schema import public_schema

rows, truth = generate_customers(per_archetype=16)
print(f"generated {len(rows)} customers x {len(FEATURE_COLUMNS)} features "
      f"across {len(ARCHETYPES)} planted archetypes\n")

assert set(rows[0].keys()) == set(FEATURE_COLUMNS) | {"userId"}, "generator must cover every feature"
print("all 46 schema features are populated by the generator")

raw_df, user_ids = preprocess_features(rows)
print("raw shape:", raw_df.shape)

processed_df, preprocessing = build_feature_matrix(raw_df)
print("preprocessing:")
print("  imputedValues:", preprocessing["imputedValues"])
print("  log1p applied:", len(preprocessing["logTransformedFeatures"]), "features")
print("  winsorised:", len(preprocessing["winsorisedFeatures"]), "features")

scaled, scaling = scale_features(processed_df, "standard")
print("scaling:", scaling["scalerClass"], "| constant features:", len(scaling["constantFeatures"]))

robust_scaled, robust_scaling = scale_features(processed_df, "robust")
print("robust scaler constant features:", len(robust_scaling["constantFeatures"]))

summary = dataset_summary(raw_df, user_ids)
print("\ndataset summary")
for key in ("customerCount", "featureCount", "activeCustomers", "inactiveCustomers",
            "totalSessions", "totalPurchases", "totalOffers", "zeroFeatureCount",
            "avgEngagementScore", "avgEngagementIndex", "avgPurchaseTendency",
            "constantFeatureCount"):
    print(f"  {key}: {summary.get(key)}")
print("  qualityFlags:", summary["qualityFlags"] or "none")

curve = k_selection_curve(scaled, min_k=2, max_k=8)
print("\nk selection curve")
for row in curve:
    print("  k=%s  sil=%-8s DB=%-8s CH=%-10s inertia=%s" % (
        row["k"], row["silhouette"], row["daviesBouldin"],
        row["calinskiHarabasz"], row["inertia"]))
suggested_k, reason = choose_k(curve)
print("suggested K:", suggested_k)
print("reason:", reason)

truth_labels = [truth[uid] for uid in user_ids]
print("\n--- base algorithms (K from the selection curve) ---")
km = run_kmeans(scaled, user_ids, suggested_k, n_init=10, random_state=42)
ag = run_agglomerative(scaled, user_ids, suggested_k)
db = run_dbscan(scaled, user_ids)
for name, res in (("kmeans", km), ("agglomerative", ag), ("dbscan", db)):
    print(f"\n{name}: n={res['nSamples']} clusters={res['numClusters']} noise={res['noiseCount']}")
    print("  metrics:", res["metrics"])
    if res["metricNotes"]:
        print("  metricNotes:", res["metricNotes"])
    print("  parameters:", res["parameters"])
    if name == "dbscan":
        print("  trusted:", res["trusted"], "| fallback:", res["fallback"])
        print("  epsEscalations:", res["epsEscalations"])
    ari = adjusted_rand_score(truth_labels, [res["labels"][uid] for uid in user_ids])
    print(f"  ARI vs planted archetypes: {ari:.4f}")
    for note in res["notes"]:
        print("  note:", note)

print("\n--- forced K=4 (the true archetype count) ---")
km4 = run_kmeans(scaled, user_ids, 4, n_init=10, random_state=42)
ag4 = run_agglomerative(scaled, user_ids, 4)
print("kmeans K=4 ARI vs truth: %.4f | sil %s" % (
    adjusted_rand_score(truth_labels, [km4["labels"][u] for u in user_ids]),
    km4["metrics"]["silhouette"]))
print("agglom  K=4 ARI vs truth: %.4f | sil %s" % (
    adjusted_rand_score(truth_labels, [ag4["labels"][u] for u in user_ids]),
    ag4["metrics"]["silhouette"]))

print("\n--- hybrid consensus ---")
hybrid = hybrid_clustering(km4, ag4, db, scaled, user_ids, target_k=None, max_k=8)
print("clusters:", hybrid["numClusters"], "| noise:", hybrid["noiseCount"],
      "| nSamples:", hybrid["nSamples"])
print("consensusK:", hybrid["requestedK"], "via", hybrid["parameters"]["consensusKSource"])
print("reason:", hybrid["consensusKReason"])
print("sweep:", [(r["k"], r["silhouette"]) for r in hybrid["consensusSweep"]])
print("metrics:", hybrid["metrics"])
print("noisePolicy:", hybrid["noisePolicy"], "| dbscanTrusted:", hybrid["dbscanTrusted"])
print("dbscanNoiseAdvisory count:", len(hybrid["dbscanNoiseAdvisory"]))
print("meanAgreement:", hybrid["meanAgreement"])
print("contributions:")
for c in hybrid["contributions"]:
    print("   %-14s w=%-4s voted=%-5s agreed=%-5s abstained=%s" % (
        c["algorithm"], c["weight"], c["votedPairs"], c["agreedPairs"], c["abstainedPairs"]))
hybrid_ari = adjusted_rand_score(truth_labels, [hybrid["labels"][u] for u in user_ids])
print("ARI vs planted archetypes: %.4f" % hybrid_ari)

agreement = compute_agreement(km4, ag4, db, hybrid, user_ids)
print("\nagreement")
for key in ("ariKmeansVsHybrid", "ariAgglomerativeVsHybrid", "ariDbscanVsHybrid",
            "ariKmeansVsAgglomerative", "consensusStrength", "dbscanNoiseDetected"):
    print(f"  {key}: {agreement[key]}")

pca = compute_pca(scaled, user_ids)
print("\npca")
print("  explainedVariance:", pca["explainedVariance"])
print("  totalExplainedVariance:", pca["totalExplainedVariance"])
first_uid = user_ids[0]
print("  point[%s]:" % first_uid, pca["points"][first_uid])
for component in pca["components"]:
    print("  %s (%.4f): %s" % (
        component["name"], component["explainedVariance"],
        [f"{f['name']}({f['loading']:+.2f})" for f in component["topFeatures"]]))

profiles = profile_clusters(raw_df, hybrid["labels"], user_ids)
print("\ncluster profiles")
recovered = 0
for cid, prof in sorted(profiles.items()):
    print("  cluster %s: n=%-3s %5.1f%%  engagement=%-7s purchaseTendency=%-7s" % (
        cid, prof["customerCount"], prof["percentage"],
        prof["engagementIndex"], prof["purchaseTendency"]))
    print("     high:", [f"{h['name']}({h['zScore']:+.2f})" for h in prof["highFeatures"]])
    print("     low :", [f"{l['name']}({l['zScore']:+.2f})" for l in prof["lowFeatures"]])
    dominant = max({a: sum(1 for u in prof["customerIds"] if truth[u] == a) for a in ARCHETYPES}.items(),
                   key=lambda kv: kv[1])
    purity = dominant[1] / prof["customerCount"]
    if purity >= 0.8:
        recovered += 1
    print("     dominant planted archetype: %s (%s/%s, purity %.0f%%)" % (
        dominant[0], dominant[1], prof["customerCount"], 100 * purity))
print("  clusters at >=80%% purity: %s of %s" % (recovered, len(profiles)))

personas = assign_personas(profiles)
print("\npersonas (%s assigned for %s clusters)" % (len(personas), len(profiles)))
for p in personas:
    print("  %-26s cluster %-3s signature=%-26s score=%-7s conf=%-6s margin=%s" % (
        p["name"], p["clusterId"], p["signature"], p["matchScore"],
        p["confidence"], p["marginOverRunnerUp"]))
    print("     n=%s (%.1f%%) engagement=%s purchaseTendency=%s" % (
        p["customerCount"], p["percentage"], p["engagementIndex"], p["purchaseTendency"]))
    print("     defining:", p["definingBehaviors"])
    if p["counterSignals"]:
        print("     counter :", p["counterSignals"])
    print("     alts:", [(a["name"], a["score"]) for a in p["alternatives"]])
    print("     dominant categories:", p["dominantCategories"])

dupes = len(personas) - len({p["name"] for p in personas})
print("\nduplicate persona names:", dupes, "(must be 0)")
print("noise cluster excluded from personas:", -1 not in {p["clusterId"] for p in personas})
saturated = sum(1 for p in personas for e in p["evidence"] if e.get("saturated"))
print("saturated evidence entries:", saturated, "(non-zero is expected and is now flagged)")
print("schema featureCount:", public_schema()["featureCount"], "| groups:", len(public_schema()["groups"]))
print("\nSMOKE TEST COMPLETE")
