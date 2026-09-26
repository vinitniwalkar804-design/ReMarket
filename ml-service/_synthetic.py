"""
Synthetic customer generator shared by the smoke tests.

Four planted behavioural archetypes, each expressed across every feature in the
schema, so the tests can ask the only question that matters: does the pipeline
recover structure that is genuinely there? Anything less than a clean recovery
would mean the preprocessing, the scaling or the consensus is destroying real
signal.
"""
from __future__ import annotations

from typing import Any, Dict, List, Tuple

import numpy as np

RNG_SEED = 7

# Ratios are bounded 0-1 and get additive noise; everything else is a positive
# count or currency amount and gets multiplicative noise.
RATIO_FEATURES = {
    "cartAbandonmentRate", "repeatPurchaseRate", "averageOfferDiscount",
    "offerAcceptanceRate", "offerRejectionRate", "averageDiscount", "returnRate",
    "localPreference", "weekendActivity", "eveningActivity",
}

CATEGORY_KEYS = ("laptop", "phone", "electronics", "books", "furniture", "gaming", "cycles")

ARCHETYPES: Dict[str, Dict[str, Any]] = {
    "bargain_hunter": {
        "category": {"laptop": 7, "phone": 6, "electronics": 8, "books": 2, "furniture": 1, "gaming": 3, "cycles": 1},
        "values": dict(
            totalViews=310, totalSearches=180, uniqueProductsViewed=62, repeatedSearches=118,
            categoryDiversity=7, priceWatchCount=44, priceRangePreference=9000,
            comparisonCount=12, reviewsChecked=3, sellerProfileChecks=2,
            trustSignalInteractions=4, reviewSubmissions=1, decisionTime=95,
            wishlistCount=26, cartCount=31, cartAbandonmentRate=0.82, cartViewCount=29,
            checkoutStarts=14, purchaseCount=3, totalSpending=2400, averageSpending=800,
            purchaseFrequency=0.4, repeatPurchaseRate=0.15, exchangePreference=2,
            negotiationCount=38, averageOfferDiscount=0.45, offerAcceptanceRate=0.32,
            offerRejectionRate=0.58, negotiationRounds=4.2, discountUsage=19,
            averageDiscount=0.31, returnRate=0.33, totalConversations=41,
            localPreference=0.7, sessionFrequency=2.2, activeDays=26,
            weekendActivity=0.55, eveningActivity=0.6,
        ),
    },
    "premium_buyer": {
        "category": {"laptop": 9, "phone": 8, "electronics": 7, "books": 3, "furniture": 2, "gaming": 2, "cycles": 1},
        "values": dict(
            totalViews=140, totalSearches=48, uniqueProductsViewed=34, repeatedSearches=14,
            categoryDiversity=4, priceWatchCount=9, priceRangePreference=92000,
            comparisonCount=22, reviewsChecked=17, sellerProfileChecks=14,
            trustSignalInteractions=19, reviewSubmissions=6, decisionTime=140,
            wishlistCount=8, cartCount=10, cartAbandonmentRate=0.18, cartViewCount=11,
            checkoutStarts=9, purchaseCount=7, totalSpending=68500, averageSpending=9800,
            purchaseFrequency=1.3, repeatPurchaseRate=0.62, exchangePreference=5,
            negotiationCount=5, averageOfferDiscount=0.11, offerAcceptanceRate=0.78,
            offerRejectionRate=0.09, negotiationRounds=1.1, discountUsage=3,
            averageDiscount=0.06, returnRate=0.02, totalConversations=9,
            localPreference=0.15, sessionFrequency=1.1, activeDays=30,
            weekendActivity=0.4, eveningActivity=0.45,
        ),
    },
    "casual_browser": {
        "category": {"laptop": 2, "phone": 3, "electronics": 2, "books": 5, "furniture": 4, "gaming": 2, "cycles": 2},
        "values": dict(
            totalViews=48, totalSearches=14, uniqueProductsViewed=21, repeatedSearches=4,
            categoryDiversity=3, priceWatchCount=3, priceRangePreference=7000,
            comparisonCount=1, reviewsChecked=2, sellerProfileChecks=1,
            trustSignalInteractions=2, reviewSubmissions=0, decisionTime=18,
            wishlistCount=4, cartCount=2, cartAbandonmentRate=0.5, cartViewCount=3,
            checkoutStarts=1, purchaseCount=1, totalSpending=1800, averageSpending=1800,
            purchaseFrequency=0.15, repeatPurchaseRate=0.0, exchangePreference=0,
            negotiationCount=1, averageOfferDiscount=0.2, offerAcceptanceRate=0.5,
            offerRejectionRate=0.2, negotiationRounds=0.6, discountUsage=1,
            averageDiscount=0.1, returnRate=0.0, totalConversations=2,
            localPreference=0.4, sessionFrequency=0.3, activeDays=9,
            weekendActivity=0.5, eveningActivity=0.5,
        ),
    },
    "trust_heavy": {
        "category": {"laptop": 8, "phone": 6, "electronics": 6, "books": 7, "furniture": 5, "gaming": 4, "cycles": 3},
        "values": dict(
            totalViews=225, totalSearches=96, uniqueProductsViewed=78, repeatedSearches=41,
            categoryDiversity=6, priceWatchCount=17, priceRangePreference=24000,
            comparisonCount=41, reviewsChecked=52, sellerProfileChecks=38,
            trustSignalInteractions=46, reviewSubmissions=11, decisionTime=215,
            wishlistCount=17, cartCount=15, cartAbandonmentRate=0.3, cartViewCount=16,
            checkoutStarts=11, purchaseCount=5, totalSpending=18400, averageSpending=3680,
            purchaseFrequency=0.8, repeatPurchaseRate=0.4, exchangePreference=7,
            negotiationCount=13, averageOfferDiscount=0.19, offerAcceptanceRate=0.66,
            offerRejectionRate=0.12, negotiationRounds=1.6, discountUsage=6,
            averageDiscount=0.12, returnRate=0.03, totalConversations=24,
            localPreference=0.3, sessionFrequency=1.5, activeDays=28,
            weekendActivity=0.42, eveningActivity=0.5,
        ),
    },
}


def build_customer(archetype: str, index: int, rng: np.random.Generator) -> Dict[str, Any]:
    spec = ARCHETYPES[archetype]
    row: Dict[str, Any] = {"userId": f"u{index:03d}"}
    for name, mean in spec["values"].items():
        if name in RATIO_FEATURES:
            row[name] = round(float(np.clip(mean + rng.normal(0, 0.04), 0.0, 1.0)), 3)
        else:
            value = max(0.0, mean * (1 + rng.normal(0, 0.22)))
            if name.endswith("Rate") or name.endswith("Preference") or name == "purchaseFrequency":
                value = round(value, 3)
            row[name] = value
    category: Dict[str, float] = {}
    for key in CATEGORY_KEYS:
        column = f"{key}Interest"
        if column in RATIO_FEATURES:
            category[column] = round(float(np.clip(spec["category"][key] + rng.normal(0, 0.3), 0, 10)), 3)
        else:
            category[column] = round(max(0.0, spec["category"][key] * (1 + rng.normal(0, 0.2))), 3)
    row.update(category)
    row["categoryInterestBreadth"] = float(sum(1 for v in category.values() if v >= 1.0))
    return row


def generate_customers(
    per_archetype: int = 16, seed: int = RNG_SEED, shuffle: bool = True
) -> Tuple[List[Dict[str, Any]], Dict[str, str]]:
    """Return ``(rows, ground_truth)`` where ground_truth maps userId -> archetype."""
    rng = np.random.default_rng(seed)
    rows: List[Dict[str, Any]] = []
    truth: Dict[str, str] = {}
    counter = 0
    for archetype in ARCHETYPES:
        for _ in range(per_archetype):
            counter += 1
            row = build_customer(archetype, counter, rng)
            rows.append(row)
            truth[row["userId"]] = archetype
    if shuffle:
        order = rng.permutation(len(rows))
        rows = [rows[int(index)] for index in order]
    return rows, truth
