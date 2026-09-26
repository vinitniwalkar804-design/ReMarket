import mongoose from "mongoose";

/**
 * One document per customer holding the aggregated behavioural features that the
 * ML service clusters on. This is a materialised view: it is rebuilt from
 * behaviour events, orders and offers on every run, and it is what the admin
 * console displays so the numbers on screen are the numbers that were clustered.
 */
const numeric = { type: Number, default: 0 };

const customerFeatureSchema = new mongoose.Schema(
  {
    // `unique: true` already creates the index; adding `index: true` as well makes
    // Mongoose register it twice and warn.
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },

    // Discovery and search
    totalViews: numeric,
    totalSearches: numeric,
    uniqueProductsViewed: numeric,
    repeatedSearches: numeric,
    categoryDiversity: numeric,
    priceWatchCount: numeric,
    priceRangePreference: numeric,

    // Consideration
    comparisonCount: numeric,
    reviewsChecked: numeric,
    sellerProfileChecks: numeric,
    trustSignalInteractions: numeric,
    reviewSubmissions: numeric,
    decisionTime: numeric,

    // Cart and intent signals
    wishlistCount: numeric,
    cartCount: numeric,
    cartAbandonmentRate: numeric,
    cartViewCount: numeric,
    checkoutStarts: numeric,

    // Purchase and value
    purchaseCount: numeric,
    totalSpending: numeric,
    averageSpending: numeric,
    purchaseFrequency: numeric,
    repeatPurchaseRate: numeric,
    exchangePreference: numeric,

    // Price and negotiation
    negotiationCount: numeric,
    averageOfferDiscount: numeric,
    offerAcceptanceRate: numeric,
    offerRejectionRate: numeric,
    negotiationRounds: numeric,
    discountUsage: numeric,
    averageDiscount: numeric,

    // Trust and risk
    returnRate: numeric,

    // Engagement rhythm
    totalConversations: numeric,
    localPreference: numeric,
    sessionFrequency: numeric,
    activeDays: numeric,
    weekendActivity: numeric,
    eveningActivity: numeric,

    // Category interest (weighted interaction scores)
    laptopInterest: numeric,
    phoneInterest: numeric,
    electronicsInterest: numeric,
    booksInterest: numeric,
    furnitureInterest: numeric,
    gamingInterest: numeric,
    cyclesInterest: numeric,
    categoryInterestBreadth: numeric,

    lastActive: { type: Date, default: Date.now },
  },
  { timestamps: true, minimize: false }
);

const CustomerFeature = mongoose.model("CustomerFeature", customerFeatureSchema);
export default CustomerFeature;
