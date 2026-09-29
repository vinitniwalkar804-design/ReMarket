# Smart Second-Hand Marketplace

## Customer Segmentation & Persona Discovery using Hybrid Clustering Methods

A production-style full-stack application (HTML/CSS/JavaScript + Node.js + MongoDB + Python ML). The website is itself the **data-generation platform**: real customer interactions (searches, product views, comparisons, negotiations, purchases) are tracked into MongoDB, and a Python ML pipeline segments those customers into behavioral personas.

---

## Problem Statement

Understanding *why* and *how* customers behave is central to any marketplace. In a second-hand marketplace for students, buyers show enormous variation: some compare obsessively and trust few sellers, others negotiate aggressively and buy cheap, others decide in minutes. Marketing as if every user is the same loses revenue and trust.

## Project Objective

Segment marketplace customers into **distinct behavioral personas** using hybrid clustering, so that marketing and personalization strategies become data-driven instead of guesswork.

The ML system is not fed a CSV. It is fed **behavior that real users generated on this website** — every search, view, comparison, offer, and purchase is tracked and stored.

---

## Key Features

### Marketplace (Customer experience)
- Landing/Home page with personalized "shopping style" recommendations
- Product marketplace: search, category/price/condition filters, sort
- Product detail: specifications, seller profile, reviews, condition
- Wishlist, Compare (2–5 products), Cart, Checkout
- Buy / Sell / Exchange listings
- **Price negotiation**: buyer offers, seller accept/reject/counter, multiple rounds
- Seller profiles with ratings and verified-seller badges
- Chat between buyers and sellers
- Orders, notifications, messages, profile
- Post-purchase "why did you buy" reason capture

### Behavior intelligence
Every meaningful interaction writes a `BehaviorEvent`:
`SEARCH · PRODUCT_VIEW · PRODUCT_COMPARE · WISHLIST_ADD/REMOVE · CART_ADD/REMOVE · CHECKOUT_START · PURCHASE · OFFER_SENT/ACCEPTED/REJECTED · COUNTER_OFFER · SELLER_PROFILE_VIEW · REVIEW_VIEW · REVIEW_SUBMITTED · PRICE_WATCH · CHAT_STARTED · EXCHANGE_REQUEST · PRODUCT_RETURN · LOGIN/LOGOUT`

From these raw events a feature-engineering pipeline computes **30+ customer-level features** (view counts, search counts, comparison rate, negotiation behavior, decision time, price sensitivity, trust signals, session/weekend/evening activity, category diversity, etc.).

### Admin intelligence
- Real dashboard: customers, products, orders, revenue, conversion, repeat rate — computed live from MongoDB
- Behavior analytics: most searched categories, most viewed/compared/wishlisted products, cart abandonment, decision time, negotiation rounds, discount stats
- ML analytics: cluster distributions, evaluation metrics (Silhouette, Davies-Bouldin, Calinski-Harabasz), PCA scatter plot
- Per-customer drill-down: feature vector, behavioral timeline, assigned persona, purchase history

### Machine learning
- `K-Means` (partitional)
- `Agglomerative / Hierarchical clustering` (Ward linkage)
- `DBSCAN` (density-based with automatic eps; detects noise/outliers)
- **Hybrid consensus clustering** combining all three
- `PCA` to 2D for visualization
- Elbow method + Silhouette for optimal K
- **Persona discovery**: clusters are labeled with meaningful names (Research-Heavy Buyer, Bargain Hunter, Quick Buyer, Trust Seeker, Window Shopper, High-Intent Customer…) derived from cluster characteristics + marketing strategies.

---

## Architecture

```
HTML + CSS + Vanilla JavaScript (Vite bundler)
        │  REST (fetch, JWT)
        ▼
Node.js + Express  ──►  MongoDB  (smart_second_hand_marketplace)
        │
        │ HTTP (feature vectors → cluster results)
        ▼
Python FastAPI ML Service
        ├─ Feature cleaning + StandardScaler
        ├─ K-Means                (find_optimal_k by elbow+silhouette)
        ├─ Agglomerative          (Ward linkage)
        ├─ DBSCAN                 (auto eps, noise handling)
        ├─ Hybrid consensus ensemble
        ├─ PCA (2D)
        └─ Persona discovery + evaluation metrics
        │
        ▼  results persisted back into MongoDB (customer_personas, cluster_results)
        └──────► Admin Dashboard
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3 (frozen compiled Tailwind output), Vanilla JavaScript (ES modules), Vite 6 |
| Backend | Node.js, Express, Mongoose, JWT, bcrypt |
| Database | MongoDB (`smart_second_hand_marketplace` only) |
| ML | Python 3.12, FastAPI, pandas, NumPy, scikit-learn, scipy |
| Auth | JWT + role-based authorization (`customer` / `admin`) |

---

## Database Design

All data lives in the `smart_second_hand_marketplace` database (the server refuses to connect to any other database — hard guard in `backend/config/db.js`).

| Collection | Purpose |
|---|---|
| `users` | customers & admins (bcrypt-hashed passwords, seller rating) |
| `categories` | product categories |
| `products` | listings (price, original price, condition, negotiable, exchangeable) |
| `orders` | purchases (listed/final price, discount %, decision time, purchase reason) |
| `offers` | negotiation records (offer amount, counter, rounds, status, final price) |
| `behavior_events` | the raw behavioral timeline |
| `wishlists` / `comparisons` / `carts` | pre-purchase state |
| `chats` / `messages` | conversations + behavioral metadata |
| `reviews` | product/seller reviews |
| `price_watches` | price-drop watch |
| `notifications` | user notifications |
| `customer_features` | engineered per-customer feature vectors |
| `customer_personas` | discovered personas per run |
| `cluster_results` | K-Means / Agglomerative / DBSCAN / Hybrid assignments + metrics + PCA |

---

## ML Pipeline

1. **Data collection** — behavior events generated by real UI interactions.
2. **Feature extraction** — aggregate events into customer-level features (`backend/controllers/mlController.js`, `buildCustomerFeatures`).
3. **Preprocessing** — missing values → 0, numeric coercion.
4. **Scaling** — `StandardScaler` (zero mean, unit variance).
5. **Optimal k** — Elbow + Silhouette across k ∈ [2, 8].
6. **Algorithms** — K-Means, Agglomerative (Ward), DBSCAN (auto eps via k-distance knee).
7. **Hybrid clustering** — consensus ensemble (see below).
8. **Evaluation** — Silhouette, Davies-Bouldin, Calinski-Harabasz.
9. **PCA** — 2D projection for the scatter visualization.
10. **Persona discovery** — rule-driven labeling grounded in the measured cluster averages.

### Hybrid clustering methodology (implemented in `ml-service/app/clustering/engine.py`)

The hybrid method is a **consensus/ensemble approach**:

1. K-Means and Agglomerative each assign every customer to a cluster (non-noise partitions).
2. DBSCAN marks outlier customers as noise (`label = -1`) using density.
3. For K-Means and Agglomerative we build **co-association matrices**: entry `(i,j)` = 1 if customers i and j share a cluster, else 0.
4. The **consensus similarity matrix** is the mean of the two co-association matrices, fused with the diagonal set to 1.
5. A final partition is extracted by running **average-linkage hierarchical clustering on the consensus distance** (`1 − consensus`).
6. Customers DBSCAN flagged as noise are preserved as `-1` in the final hybrid labels.

Result: a partition that agrees broadly with both base algorithms, is more robust than either alone, and inherits DBSCAN's outlier handling. This is fully explained in comments in `engine.py` — viva-ready.

### Persona discovery

Not "Cluster 0". For each cluster the system computes average behavioral features and matches them against interpretable rules, e.g.:

- high comparisons + high review-checks + long decision time → **Research-Heavy Buyer**
- high negotiation + low spending → **Bargain Hunter**
- low comparison + short decision + high conversion → **Quick Buyer**
- many seller/review checks → **Trust Seeker**
- high views + low purchases + many wishlists → **Window Shopper**

Each persona includes a business-interpretable **suggested marketing strategy** produced from the same measured averages. Real discoveries are made from seed data **and** live data — nothing is hardcoded.

---

## Setup

### Prerequisites
- Node.js 18+
- MongoDB running locally on `localhost:27017`
- Python 3.10+
- npm

### 1. Clone & install

```bash
cd smart-second-hand-marketplace
npm install --prefix backend
npm install --prefix frontend
pip install -r ml-service/requirements.txt
```

Or install both JavaScript workspaces and the ML dependencies in one step:

```bash
npm run install:all
```

### 2. Environment

```bash
cp .env.example .env                    # root reference only
cp backend/.env.example backend/.env    # real backend env is backend/.env
```

`backend/.env` must contain `MONGODB_URI=mongodb://localhost:27017/smart_second_hand_marketplace` (already provided).

> The backend **refuses to connect** to any database other than `smart_second_hand_marketplace`. The `findlink`, `portfolio`, `admin`, `config`, and `local` databases are never touched.

### 3. Seed demo data

Generates admins, customers, categories, products, ~1100+ behavior events across 5 distinct behavioral profiles, orders, reviews and precomputed features.

```bash
cd backend && npm run seed
```

> Seed customers have clearly labeled demo emails (`aarav@test.com` etc.). Personas are **not** assigned in seed — they are discovered by the ML run.

### 4. Run

```bash
# Terminal 1 — Backend  → http://localhost:5050
cd backend && npm run dev

# Terminal 2 — ML service  → http://localhost:8000
cd ml-service && uvicorn app.main:app --reload --port 8000

# Terminal 3 — Frontend  → http://localhost:5174
cd frontend && npm run dev
```

From the repository root these are also available as `npm run dev:backend`,
`npm run dev:ml` and `npm run dev:frontend`.

### Demo accounts

| Role | Email | Password |
|---|---|---|
| Admin | `admin@marketplace.com` | `admin123` |
| Customer | `aarav@test.com` | `pass123` |

### Run segmentation (admin)

Admin → **Dashboard** → **Run Segmentation**, or open **Personas / Clusters** pages and click re-run. This executes the full pipeline (feature engineering → clustering → personas → persistence) and updates all visualizations with results.

---

## API Structure

```
POST   /api/auth/register            Register (role defaults to customer)
POST   /api/auth/login               Login → JWT
GET    /api/auth/me                  Current user
POST   /api/auth/logout

GET    /api/products                 List + search + filters + sort + pagination
GET    /api/products/featured        Featured / trending
GET    /api/products/categories      Categories
GET    /api/products/recommended     Personalized recommendations (auth)
GET    /api/products/my              My listings (auth)
GET    /api/products/:id             Detail (logs PRODUCT_VIEW)
POST   /api/products                 Create listing (auth)
PUT    /api/products/:id             Update (owner/admin)
DELETE /api/products/:id             Remove (owner/admin)

POST   /api/behavior/events          Track a behavior event (auth)
GET    /api/behavior/timeline/:id?   Behavior timeline (auth)

GET/POST/DELETE /api/wishlist        Wishlist (auth)
GET/POST/DELETE /api/cart            Cart (auth)
GET/POST/DELETE /api/compare         Compare session (auth)
POST   /api/compare/select           Finalize comparison with selection

GET/POST /api/offers                 Send offer (auth)
GET    /api/offers/my                My sent offers
GET    /api/offers/incoming          Offers on my products
PUT    /api/offers/:id/respond       Accept / Reject / Counter

GET/POST /api/orders                 Orders (auth)
GET    /api/orders/seller            Seller orders
PUT    /api/orders/:id/status        Update status / return

GET    /api/reviews/:productId       Product reviews
POST   /api/reviews                  Submit review (purchase-gated)

GET/POST /api/chats · /api/chats/:id/send    Messaging (auth)
GET    /api/notifications · POST /api/notifications/read

GET/PUT /api/users/profile · GET /api/users/seller/:id

GET    /api/admin/stats              Dashboard KPIs        (admin)
GET    /api/admin/analytics          Behavior analytics    (admin)
GET    /api/admin/customers          Customer list         (admin)
GET    /api/admin/customers/:id      Customer drill-down   (admin)
GET    /api/admin/products | /api/admin/orders            (admin)
GET    /api/admin/personas           Discovered personas   (admin)
GET    /api/admin/clusters           Cluster history       (admin)
GET    /api/admin/visualization      PCA + all algorithms  (admin)

POST   /api/ml/run                   Run full segmentation (admin)
GET    /api/ml/results               Latest ML results
```

All admin routes use `authenticateUser → requireAdmin` middleware. Role is always verified server-side from the JWT + DB, never trusted from the client.

---

## Security

- Passwords hashed with **bcrypt** (never stored in plain text, not returned by APIs)
- **JWT** auth with `id` + `role`, expiry configurable
- Role-based middleware (`requireAdmin`)
- Ownership checks on product/offer/order operations
- Basic rate limiting (`express-rate-limit`)
- CORS restricted to the frontend origin
- Input validation on required fields
- Error handler that hides internal error detail from clients
- `.gitignore` excludes `.env` and secrets; `.env.example` documents required vars

---

## Project Structure

```
smart-second-hand-marketplace/
├── frontend/           HTML + CSS + Vanilla JS, bundled by Vite
│   ├── html/           37 physical entry pages, one HTML file per route
│   │   ├── *.html         18 customer pages (index, home, products, product-detail, …)
│   │   └── admin/         19 admin pages (dashboard, customers, personas, ml-lab, …)
│   ├── css/            style.css, components.css, pages.css, admin.css
│   ├── js/             105 ES modules
│   │   ├── components/   shared renderers (header, toast, rating, …)
│   │   ├── pages/        one controller module per HTML page
│   │   │   └── admin/      + admin/intel/ for the clustering-visualisation pages
│   │   ├── services/     API access (fetch wrappers, auth token handling)
│   │   ├── store/        shared client state
│   │   └── utils/        formatting, validation, comparison logic
│   ├── vite.config.js  dev server (port 5174), /api proxy, static build
│   └── package.json
├── backend/            Node + Express + Mongoose
│   ├── controllers/ models/ routes/ middleware/ services/ utils/
│   ├── config/         DB guard (only smart_second_hand_marketplace)
│   ├── seed/           demo data generator
│   ├── uploads/        seller-uploaded product images (git-ignored)
│   ├── .env.example
│   └── server.js
├── ml-service/         FastAPI ML service
│   ├── app/main.py                 endpoints + request/response models
│   ├── app/clustering/engine.py    preprocessing → 4 algorithms → consensus → personas
│   ├── app/clustering/feature_schema.py   the 46-feature schema the backend must match
│   └── tests/                      synthetic_data.py + 2 smoke tests
├── mongodb-backup/     local mongodump of smart_second_hand_marketplace (git-ignored)
├── logs/               runtime stdout/stderr from the three dev processes (git-ignored)
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

---

## Testing Checklist

Verified in this build:
- [x] MongoDB connects to the correct database (`smart_second_hand_marketplace`)
- [x] Registration / Login / JWT / role checks
- [x] Admin APIs blocked for customers (403) and for anonymous requests (401)
- [x] Every customer page's data endpoint returns 200 (home, products, product-detail, categories, wishlist, cart, compare, offers, orders, chats, notifications, profile, sell, recommended, price-watch, seller-profile)
- [x] Every admin page's data endpoint returns 200 (stats, analytics, trends, customers + detail + attraction, sellers, listings, products + detail intelligence, orders, moderation stats + queue, personas, clusters, ml-lab visualization, journey, marketplace reports, product/seller intelligence, sales insights, settings, ML results)
- [x] All 37 HTML pages load over HTTP with all 52 referenced assets (no broken/missing)
- [x] All 105 frontend modules pass `node --check`; 0 unresolved/case-mismatched imports
- [x] All 78 backend modules pass `node --check`; 0 unresolved relative imports
- [x] `vite build` succeeds (37 pages, 46 JS chunks, 1 CSS chunk)
- [x] ML engine smoke test + ML API smoke test pass
- [x] ML service health reports 46 features / 4 algorithms
- [x] End-to-end segmentation run (backend → Python ML → MongoDB) discovers personas from 65 clusterable customers
- [x] Compare, wishlist, cart, offers, orders, reviews persist; behavior events stored
- [x] Admin charts render from live aggregation; customer timeline from real events
- [x] Existing databases (`findlink`, `portfolio`, `admin`, `config`, `local`) untouched

---

## Screenshots

*(Screenshots will be added here)*

---

## Future Scope

- Real-time negotiation via WebSockets
- Advanced embeddings / deep learning on purchase sequences
- Churn prediction & retention flows per persona
- Multi-city logistics and verified exchange guarantees
- A/B testing framework to validate persona-based marketing strategies
- Time-series persona evolution tracking
