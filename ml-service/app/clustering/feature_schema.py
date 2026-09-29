"""
Feature schema — the single source of truth for the customer behavioural feature set.

Every feature used by the clustering pipeline is declared here with:
  * ``name``          the exact key present in the feature documents sent by the
                      Node.js backend (must match the ``CustomerFeature`` model)
  * ``label``         human readable name used in the admin UI
  * ``group``         behavioural dimension the feature belongs to
  * ``unit``          ``count`` | ``currency`` | ``ratio`` | ``minutes`` | ``score``
  * ``transform``     ``log1p`` for heavily right-skewed magnitude features,
                      ``none`` for already-bounded ratios
  * ``higherIsBetter`` used by the persona evidence layer
  * ``reference``     a "high activity" reference magnitude. Only used to make
                      features of wildly different units comparable inside the
                      persona scorer. Never used to cluster or to pick K.
  * ``description``   plain-language explanation shown in the Cluster Lab

Keeping the schema declarative means the admin UI can render the exact feature
list for a run, and the pipeline can never silently drift from what is displayed.
"""

from typing import Any, Dict, List

# Behavioural groups drive the Cluster Lab's feature browser and the persona
# radar axes.
GROUPS = [
    {
        "key": "discovery",
        "label": "Discovery & Search",
        "description": "How actively the customer browses and searches the marketplace.",
    },
    {
        "key": "consideration",
        "label": "Consideration",
        "description": "Deliberate evaluation: comparing products, reading reviews, checking sellers.",
    },
    {
        "key": "intent",
        "label": "Cart & Intent Signals",
        "description": "Wishlist and cart behaviour, including cart abandonment.",
    },
    {
        "key": "purchase",
        "label": "Purchase & Value",
        "description": "Order history, spend, order value and purchase cadence.",
    },
    {
        "key": "price",
        "label": "Price & Negotiation",
        "description": "Offer negotiation, discount behaviour and price sensitivity.",
    },
    {
        "key": "trust",
        "label": "Trust & Risk",
        "description": "Verification behaviour, returns and after-sale engagement.",
    },
    {
        "key": "engagement",
        "label": "Engagement Rhythm",
        "description": "Session cadence and time-of-day / day-of-week activity pattern.",
    },
    {
        "key": "category",
        "label": "Category Interest",
        "description": "Interest strength per product category, derived from real interactions.",
    },
]

FEATURES: List[Dict[str, Any]] = [
    # ---------------------------------------------------------------- discovery
    {
        "name": "totalViews",
        "label": "Total product views",
        "group": "discovery",
        "unit": "count",
        "transform": "log1p",
        "higherIsBetter": True,
        "reference": 80,
        "description": "How many individual product detail pages the customer opened.",
    },
    {
        "name": "totalSearches",
        "label": "Total searches",
        "group": "discovery",
        "unit": "count",
        "transform": "log1p",
        "higherIsBetter": True,
        "reference": 25,
        "description": "Number of marketplace search queries issued by the customer.",
    },
    {
        "name": "uniqueProductsViewed",
        "label": "Unique products viewed",
        "group": "discovery",
        "unit": "count",
        "transform": "log1p",
        "higherIsBetter": True,
        "reference": 40,
        "description": "Distinct products viewed — breadth of exploration as opposed to repeat views.",
    },
    {
        "name": "repeatedSearches",
        "label": "Repeated searches",
        "group": "discovery",
        "unit": "count",
        "transform": "log1p",
        "higherIsBetter": True,
        "reference": 10,
        "description": "Searches that repeated an earlier query — a sign of an unresolved information need.",
    },
    {
        "name": "categoryDiversity",
        "label": "Category diversity",
        "group": "discovery",
        "unit": "count",
        "transform": "log1p",
        "higherIsBetter": True,
        "reference": 6,
        "description": "Number of distinct product categories the customer interacted with.",
    },
    {
        "name": "priceWatchCount",
        "label": "Price watch alerts",
        "group": "discovery",
        "unit": "count",
        "transform": "log1p",
        "higherIsBetter": True,
        "reference": 8,
        "description": "Price-drop alerts the customer subscribed to instead of buying immediately.",
    },
    {
        "name": "priceRangePreference",
        "label": "Preferred price range",
        "group": "discovery",
        "unit": "currency",
        "transform": "log1p",
        "higherIsBetter": True,
        "reference": 50000,
        "description": "Average amount the customer actually pays per order.",
    },
    # ------------------------------------------------------------ consideration
    {
        "name": "comparisonCount",
        "label": "Product comparisons",
        "group": "consideration",
        "unit": "count",
        "transform": "log1p",
        "higherIsBetter": True,
        "reference": 10,
        "description": "Compare-tool sessions — the strongest explicit evaluation signal in the app.",
    },
    {
        "name": "reviewsChecked",
        "label": "Reviews checked",
        "group": "consideration",
        "unit": "count",
        "transform": "log1p",
        "higherIsBetter": True,
        "reference": 20,
        "description": "Individual reviews the customer opened before deciding.",
    },
    {
        "name": "sellerProfileChecks",
        "label": "Seller profile checks",
        "group": "consideration",
        "unit": "count",
        "transform": "log1p",
        "higherIsBetter": True,
        "reference": 15,
        "description": "Seller profiles opened — due diligence on the counterparty.",
    },
    {
        "name": "trustSignalInteractions",
        "label": "Trust signal interactions",
        "group": "consideration",
        "unit": "count",
        "transform": "log1p",
        "higherIsBetter": True,
        "reference": 30,
        "description": "Combined total of seller checks, reviews read and reviews written.",
    },
    {
        "name": "reviewSubmissions",
        "label": "Reviews written",
        "group": "consideration",
        "unit": "count",
        "transform": "log1p",
        "higherIsBetter": True,
        "reference": 6,
        "description": "Reviews the customer published after a purchase.",
    },
    {
        "name": "decisionTime",
        "label": "Decision time (minutes)",
        "group": "consideration",
        "unit": "minutes",
        "transform": "log1p",
        "higherIsBetter": False,
        "reference": 2000,
        "description": "Average minutes between first viewing a product and ordering it.",
    },
    # ------------------------------------------------------------------- intent
    {
        "name": "wishlistCount",
        "label": "Wishlist items",
        "group": "intent",
        "unit": "count",
        "transform": "log1p",
        "higherIsBetter": True,
        "reference": 15,
        "description": "Net wishlist items (adds minus removes) — accumulated, deferred intent.",
    },
    {
        "name": "cartCount",
        "label": "Cart additions (net)",
        "group": "intent",
        "unit": "count",
        "transform": "log1p",
        "higherIsBetter": True,
        "reference": 10,
        "description": "Net cart additions remaining in the cart.",
    },
    {
        "name": "cartAbandonmentRate",
        "label": "Cart abandonment rate",
        "group": "intent",
        "unit": "ratio",
        "transform": "none",
        "higherIsBetter": False,
        "reference": 1.0,
        "description": "Cart removals divided by cart additions — a direct hesitation signal.",
    },
    {
        "name": "cartViewCount",
        "label": "Cart views",
        "group": "intent",
        "unit": "count",
        "transform": "log1p",
        "higherIsBetter": True,
        "reference": 12,
        "description": "Times the customer opened the cart to review pending items.",
    },
    {
        "name": "checkoutStarts",
        "label": "Checkout starts",
        "group": "intent",
        "unit": "count",
        "transform": "log1p",
        "higherIsBetter": True,
        "reference": 6,
        "description": "Times checkout was begun — funnel top-of-payment intent.",
    },
    # ----------------------------------------------------------------- purchase
    {
        "name": "purchaseCount",
        "label": "Purchase count",
        "group": "purchase",
        "unit": "count",
        "transform": "log1p",
        "higherIsBetter": True,
        "reference": 6,
        "description": "Number of completed, non-cancelled orders placed by the customer.",
    },
    {
        "name": "totalSpending",
        "label": "Lifetime spend",
        "group": "purchase",
        "unit": "currency",
        "transform": "log1p",
        "higherIsBetter": True,
        "reference": 120000,
        "description": "Total amount paid across all completed orders.",
    },
    {
        "name": "averageSpending",
        "label": "Average order value",
        "group": "purchase",
        "unit": "currency",
        "transform": "log1p",
        "higherIsBetter": True,
        "reference": 30000,
        "description": "Mean amount per completed order.",
    },
    {
        "name": "purchaseFrequency",
        "label": "Purchase frequency",
        "group": "purchase",
        "unit": "score",
        "transform": "log1p",
        "higherIsBetter": True,
        "reference": 3,
        "description": "Orders per week across the customer's observed lifetime.",
    },
    {
        "name": "repeatPurchaseRate",
        "label": "Repeat purchase rate",
        "group": "purchase",
        "unit": "ratio",
        "transform": "none",
        "higherIsBetter": True,
        "reference": 1.0,
        "description": "Share of orders that were not the customer's first purchase.",
    },
    {
        "name": "exchangePreference",
        "label": "Exchange requests",
        "group": "purchase",
        "unit": "count",
        "transform": "log1p",
        "higherIsBetter": True,
        "reference": 4,
        "description": "Exchange-type orders requested instead of a straight purchase.",
    },
    # -------------------------------------------------------- price & negotiation
    {
        "name": "negotiationCount",
        "label": "Offers sent",
        "group": "price",
        "unit": "count",
        "transform": "log1p",
        "higherIsBetter": True,
        "reference": 12,
        "description": "Negotiating offers the customer sent to sellers.",
    },
    {
        "name": "averageOfferDiscount",
        "label": "Average offer discount (%)",
        "group": "price",
        "unit": "ratio",
        "transform": "none",
        "higherIsBetter": True,
        "reference": 25,
        "description": "Mean percentage below list price that the customer offers.",
    },
    {
        "name": "offerAcceptanceRate",
        "label": "Offer acceptance rate",
        "group": "price",
        "unit": "ratio",
        "transform": "none",
        "higherIsBetter": True,
        "reference": 1.0,
        "description": "Share of the customer's offers that sellers accepted.",
    },
    {
        "name": "offerRejectionRate",
        "label": "Offer rejection rate",
        "group": "price",
        "unit": "ratio",
        "transform": "none",
        "higherIsBetter": False,
        "reference": 1.0,
        "description": "Share of the customer's offers that sellers rejected outright.",
    },
    {
        "name": "negotiationRounds",
        "label": "Average negotiation rounds",
        "group": "price",
        "unit": "score",
        "transform": "log1p",
        "higherIsBetter": True,
        "reference": 3,
        "description": "Mean back-and-forth rounds per negotiation — persistence in haggling.",
    },
    {
        "name": "discountUsage",
        "label": "Orders using a discount",
        "group": "price",
        "unit": "count",
        "transform": "log1p",
        "higherIsBetter": True,
        "reference": 5,
        "description": "Completed orders that were closed with a discount applied.",
    },
    {
        "name": "averageDiscount",
        "label": "Average discount (%)",
        "group": "price",
        "unit": "ratio",
        "transform": "none",
        "higherIsBetter": True,
        "reference": 25,
        "description": "Mean discount percentage across the customer's completed orders.",
    },
    # -------------------------------------------------------------- trust & risk
    {
        "name": "returnRate",
        "label": "Return rate",
        "group": "trust",
        "unit": "ratio",
        "transform": "none",
        "higherIsBetter": False,
        "reference": 1.0,
        "description": "Product returns relative to purchases — post-purchase friction.",
    },
    {
        "name": "totalConversations",
        "label": "Seller conversations",
        "group": "trust",
        "unit": "count",
        "transform": "log1p",
        "higherIsBetter": True,
        "reference": 10,
        "description": "Chat threads opened with sellers — used to resolve doubts pre-purchase.",
    },
    {
        "name": "localPreference",
        "label": "Local preference",
        "group": "trust",
        "unit": "ratio",
        "transform": "none",
        "higherIsBetter": True,
        "reference": 1.0,
        "description": "Share of interactions with listings in the customer's own city.",
    },
    # ---------------------------------------------------------------- engagement
    {
        "name": "sessionFrequency",
        "label": "Sessions",
        "group": "engagement",
        "unit": "count",
        "transform": "log1p",
        "higherIsBetter": True,
        "reference": 25,
        "description": "Distinct real sessions in which the customer was active.",
    },
    {
        "name": "activeDays",
        "label": "Active days",
        "group": "engagement",
        "unit": "count",
        "transform": "log1p",
        "higherIsBetter": True,
        "reference": 20,
        "description": "Distinct calendar days on which the customer was active.",
    },
    {
        "name": "weekendActivity",
        "label": "Weekend activity share",
        "group": "engagement",
        "unit": "ratio",
        "transform": "none",
        "higherIsBetter": True,
        "reference": 1.0,
        "description": "Fraction of the customer's events falling on Saturday or Sunday.",
    },
    {
        "name": "eveningActivity",
        "label": "Evening activity share",
        "group": "engagement",
        "unit": "ratio",
        "transform": "none",
        "higherIsBetter": True,
        "reference": 1.0,
        "description": "Fraction of the customer's events falling between 18:00 and 23:59.",
    },
    # ------------------------------------------------------------------ category
    {
        "name": "laptopInterest",
        "label": "Laptop interest",
        "group": "category",
        "unit": "score",
        "transform": "log1p",
        "higherIsBetter": True,
        "reference": 20,
        "description": "Weighted interaction count across the Laptops category.",
    },
    {
        "name": "phoneInterest",
        "label": "Smartphone interest",
        "group": "category",
        "unit": "score",
        "transform": "log1p",
        "higherIsBetter": True,
        "reference": 20,
        "description": "Weighted interaction count across the Smartphones category.",
    },
    {
        "name": "electronicsInterest",
        "label": "Electronics interest",
        "group": "category",
        "unit": "score",
        "transform": "log1p",
        "higherIsBetter": True,
        "reference": 20,
        "description": "Weighted interaction count across Electronics and Accessories.",
    },
    {
        "name": "booksInterest",
        "label": "Books interest",
        "group": "category",
        "unit": "score",
        "transform": "log1p",
        "higherIsBetter": True,
        "reference": 20,
        "description": "Weighted interaction count across the Books category.",
    },
    {
        "name": "furnitureInterest",
        "label": "Furniture interest",
        "group": "category",
        "unit": "score",
        "transform": "log1p",
        "higherIsBetter": True,
        "reference": 20,
        "description": "Weighted interaction count across the Furniture category.",
    },
    {
        "name": "gamingInterest",
        "label": "Gaming interest",
        "group": "category",
        "unit": "score",
        "transform": "log1p",
        "higherIsBetter": True,
        "reference": 20,
        "description": "Weighted interaction count across the Gaming category.",
    },
    {
        "name": "cyclesInterest",
        "label": "Cycles interest",
        "group": "category",
        "unit": "score",
        "transform": "log1p",
        "higherIsBetter": True,
        "reference": 20,
        "description": "Weighted interaction count across the Cycles category.",
    },
    {
        "name": "categoryInterestBreadth",
        "label": "Category interest breadth",
        "group": "category",
        "unit": "count",
        "transform": "log1p",
        "higherIsBetter": True,
        "reference": 5,
        "description": "How many distinct categories show meaningful interest for this customer.",
    },
]

# Ordered list of feature names actually fed to the model.
FEATURE_COLUMNS: List[str] = [feature["name"] for feature in FEATURES]

FEATURE_BY_NAME: Dict[str, Dict[str, Any]] = {feature["name"]: feature for feature in FEATURES}

GROUP_BY_KEY: Dict[str, Dict[str, Any]] = {group["key"]: group for group in GROUPS}

# Categories are grouped into broader interest dimensions so the feature set stays
# interpretable instead of exploding to one column per catalogue category.
#
# This is the reference list: every category that exists in the marketplace must
# appear in exactly one axis. It must stay in step with CATEGORY_INTEREST_MAP in
# backend/services/clusterFeatures.js, which is the case-insensitive normaliser
# applied to stored event categories. When they disagree, interactions in the
# category present in one map and absent from the other are silently excluded
# from the feature vector, so the Node side reports any category it could not map
# as `stats.unmappedCategories` on a clustering run.
CATEGORY_INTEREST_MAP: Dict[str, List[str]] = {
    "laptopInterest": ["Laptops"],
    "phoneInterest": ["Smartphones"],
    "electronicsInterest": ["Electronics", "Accessories"],
    # Books is an education/study axis rather than a books-only axis. Calculators
    # are study tools and are grouped here for the same reason; recorded
    # explicitly so the choice is reviewable rather than implied by a default.
    "booksInterest": ["Books", "Calculators"],
    "furnitureInterest": ["Furniture"],
    "gamingInterest": ["Gaming"],
    "cyclesInterest": ["Cycles"],
}

# Weight applied per interaction type when accumulating category interest. Deep
# intent (purchase) counts more than a passive view.
CATEGORY_INTERACTION_WEIGHTS: Dict[str, float] = {
    "PURCHASE": 4.0,
    "OFFER_SENT": 3.0,
    "COUNTER_OFFER": 2.5,
    "OFFER_ACCEPTED": 2.5,
    "CART_ADD": 2.0,
    "WISHLIST_ADD": 2.0,
    "PRICE_WATCH": 1.5,
    "PRODUCT_COMPARE": 1.5,
    "COMPARE_SELECTED": 1.5,
    "CHECKOUT_START": 2.0,
    "EXCHANGE_REQUEST": 3.0,
    "PRODUCT_VIEW": 1.0,
    "CATEGORY_VIEW": 1.0,
    "REVIEW_VIEW": 0.5,
    "SEARCH": 0.5,
}

# Relative interaction weights used to build the two derived behavioural
# summaries reported per cluster / persona. They are deliberately simple and
# fully transparent so the numbers can be defended in a viva.
ENGAGEMENT_COMPONENTS: Dict[str, float] = {
    "totalViews": 1.0,
    "totalSearches": 1.0,
    "uniqueProductsViewed": 1.0,
    "comparisonCount": 2.0,
    "wishlistCount": 1.0,
    "cartCount": 1.0,
    "sessionFrequency": 2.0,
    "activeDays": 1.0,
    "totalConversations": 1.5,
    "priceWatchCount": 1.0,
}

PURCHASE_TENDENCY_COMPONENTS: Dict[str, float] = {
    "purchaseCount": 3.0,
    "totalSpending": 2.0,
    "purchaseFrequency": 2.0,
    "repeatPurchaseRate": 3.0,
    "averageSpending": 1.0,
    "returnRate": -1.5,
}


def public_schema() -> Dict[str, Any]:
    """Schema payload returned to the admin UI so the displayed feature list can
    never drift from what the model actually consumed."""
    return {
        "version": FEATURE_SCHEMA_VERSION,
        "featureCount": len(FEATURES),
        "features": [
            {
                "name": feature["name"],
                "label": feature["label"],
                "group": feature["group"],
                "groupLabel": GROUP_BY_KEY[feature["group"]]["label"],
                "unit": feature["unit"],
                "transform": feature["transform"],
                "higherIsBetter": feature["higherIsBetter"],
                "description": feature["description"],
            }
            for feature in FEATURES
        ],
        "groups": GROUPS,
    }


# Bumped whenever the feature set changes so stored run history stays
# interpretable across versions.
FEATURE_SCHEMA_VERSION = "2026.2"
