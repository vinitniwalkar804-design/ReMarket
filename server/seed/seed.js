import mongoose from "mongoose";
import { config } from "../config/index.js";
import {
  User, Category, Product, BehaviorEvent, Order,
  Review, Offer, Wishlist, Cart, Comparison, CustomerFeature,
  PriceWatch, PriceHistory, Chat, Notification, ClusterResult,
  CustomerPersona, ClusterRun, Settings,
} from "../models/index.js";
import { buildCustomerFeatures } from "../controllers/mlController.js";
import { imagesForProduct } from "./productImages.js";
import { generateCustomerBehaviour, PROFILE_ORDER, PROFILES } from "./behaviorProfiles.js";

const MONGODB_URI = config.mongodbUri;

const random = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[random(0, arr.length - 1)];
const randomId = () => new mongoose.Types.ObjectId();

const ago = (days, hours = 0) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(d.getHours() - hours, random(0, 59));
  return d;
};

const seed = async () => {
  await mongoose.connect(MONGODB_URI);
  const dbName = mongoose.connection.name;
  if (dbName !== "smart_second_hand_marketplace") {
    console.error(`REFUSING to seed database: ${dbName}`);
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log(`[Seed] Connected to: ${dbName}`);
  console.log("[Seed] Clearing existing data...");
  await Promise.all([
    User.deleteMany({}),
    Category.deleteMany({}),
    Product.deleteMany({}),
    BehaviorEvent.deleteMany({}),
    Order.deleteMany({}),
    Review.deleteMany({}),
    Offer.deleteMany({}),
    Wishlist.deleteMany({}),
    Cart.deleteMany({}),
    Comparison.deleteMany({}),
    CustomerFeature.deleteMany({}),
    PriceWatch.deleteMany({}),
    PriceHistory.deleteMany({}),
    Chat.deleteMany({}),
    Notification.deleteMany({}),
    ClusterResult.deleteMany({}),
    CustomerPersona.deleteMany({}),
    ClusterRun.deleteMany({}),
    Settings.deleteMany({}),
  ]);

  const admins = await User.create([
    { name: "Admin", email: "admin@marketplace.com", password: "admin123", role: "admin" },
    { name: "ML Admin", email: "mladmin@marketplace.com", password: "mladmin123", role: "admin" },
  ]);
  console.log("[Seed] Admins created");

  // The first 15 are kept verbatim so the documented demo login
  // (aarav@test.com / pass123) keeps working. The rest are generated to reach a
  // base large enough for clustering to mean something: five behavioural
  // profiles need enough members each for one cluster to be distinguishable from
  // the others.
  const ORIGINAL_CUSTOMERS = [
    { name: "Aarav Kumar", email: "aarav@test.com", password: "pass123", location: "Mumbai" },
    { name: "Sneha Patel", email: "sneha@test.com", password: "pass123", location: "Mumbai" },
    { name: "Rohan Gupta", email: "rohan@test.com", password: "pass123", location: "Delhi" },
    { name: "Priya Singh", email: "priya@test.com", password: "pass123", location: "Delhi" },
    { name: "Vikram Reddy", email: "vikram@test.com", password: "pass123", location: "Bangalore" },
    { name: "Ananya Sharma", email: "ananya@test.com", password: "pass123", location: "Bangalore" },
    { name: "Arjun Nair", email: "arjun@test.com", password: "pass123", location: "Chennai" },
    { name: "Kavya Iyer", email: "kavya@test.com", password: "pass123", location: "Chennai" },
    { name: "Rahul Verma", email: "rahul@test.com", password: "pass123", location: "Pune" },
    { name: "Deepa Menon", email: "deepa@test.com", password: "pass123", location: "Chennai" },
    { name: "Karthik Rao", email: "karthik@test.com", password: "pass123", location: "Hyderabad" },
    { name: "Nisha Joshi", email: "nisha@test.com", password: "pass123", location: "Mumbai" },
    { name: "Manish Tiwari", email: "manish@test.com", password: "pass123", location: "Delhi" },
    { name: "Pooja Agarwal", email: "pooja@test.com", password: "pass123", location: "Bangalore" },
    { name: "Aditya Saxena", email: "aditya@test.com", password: "pass123", location: "Pune" },
  ];

  const FIRST_NAMES = [
    "Ishaan", "Diya", "Kabir", "Anika", "Rohan", "Meera", "Arjun", "Sara", "Vihaan", "Tara",
    "Devansh", "Ira", "Kavya", "Yash", "Nitya", "Sameer", "Riya", "Aryan", "Sneha", "Varun",
    "Trisha", "Karan", "Aditi", "Rahul", "Neha", "Siddharth", "Pooja", "Manav", "Divya", "Nikhil",
    "Rhea", "Shreya", "Vivek", "Anjali", "Harsh", "Meenal", "Rajat", "Simran", "Akash",
    "Tanvi", "Gaurav", "Rishabh", "Sanjana", "Omkar", "Lakshmi", "Farhan",
  ];
  const LAST_NAMES = [
    "Sharma", "Verma", "Nair", "Iyer", "Kulkarni", "Chatterjee", "Bose", "Rao", "Desai", "Gill",
    "Malhotra", "Banerjee", "Pillai", "Shetty", "Reddy", "Kapoor", "Joshi", "Mehta", "Chauhan", "Sinha",
  ];
  const CITIES = [
    "Mumbai", "Delhi", "Bangalore", "Chennai", "Pune", "Hyderabad", "Kolkata", "Ahmedabad", "Jaipur", "Kochi",
  ];

  const GENERATED_CUSTOMERS = Array.from({ length: 45 }, (_, index) => {
    const first = FIRST_NAMES[index % FIRST_NAMES.length];
    const last = LAST_NAMES[(index * 7 + 3) % LAST_NAMES.length];
    return {
      name: `${first} ${last}`,
      email: `${first.toLowerCase()}.${last.toLowerCase()}${index}@test.com`,
      password: "pass123",
      location: CITIES[index % CITIES.length],
    };
  });

  const customerData = [...ORIGINAL_CUSTOMERS, ...GENERATED_CUSTOMERS];
  const customers = await User.create(customerData);
  console.log(`[Seed] ${customers.length} customers created`);

  const categories = await Category.create([
    { name: "Laptops", slug: "laptops", icon: "laptop", color: "#6366f1" },
    { name: "Smartphones", slug: "smartphones", icon: "smartphone", color: "#8b5cf6" },
    { name: "Books", slug: "books", icon: "book-open", color: "#ec4899" },
    { name: "Calculators", slug: "calculators", icon: "calculator", color: "#14b8a6" },
    { name: "Cycles", slug: "cycles", icon: "bike", color: "#f59e0b" },
    { name: "Furniture", slug: "furniture", icon: "armchair", color: "#ef4444" },
    { name: "Electronics", slug: "electronics", icon: "zap", color: "#3b82f6" },
    { name: "Gaming", slug: "gaming", icon: "gamepad-2", color: "#10b981" },
    { name: "Accessories", slug: "accessories", icon: "package", color: "#f97316" },
  ]);
  console.log("[Seed] Categories created");

  const productTemplates = [
    { title: "MacBook Pro 2021 M1 Pro", description: "Excellent condition, barely used. Apple M1 Pro, 16GB RAM, 512GB SSD. Includes charger and original box.", category: "Laptops", brand: "Apple", originalPrice: 199900, price: 125000, condition: "Like New" },
    { title: "Dell XPS 15 9510", description: "Intel i7 11th Gen, 16GB RAM, 512GB SSD, OLED display. Great for creative work.", category: "Laptops", brand: "Dell", originalPrice: 149999, price: 85000, condition: "Good" },
    { title: "Lenovo ThinkPad X1 Carbon Gen 9", description: "Business laptop, i7 1165G7, 16GB RAM, 512GB SSD. Lightweight and reliable.", category: "Laptops", brand: "Lenovo", originalPrice: 134999, price: 72000, condition: "Good" },
    { title: "HP Pavilion Gaming 15", description: "Ryzen 5 5600H, GTX 1650, 8GB RAM, 512GB SSD. Runs all modern titles at 1080p.", category: "Laptops", brand: "HP", originalPrice: 64999, price: 38000, condition: "Average" },
    { title: "iPhone 14 Pro Max", description: "256GB, Space Black, excellent condition with Apple Care till 2025.", category: "Smartphones", brand: "Apple", originalPrice: 139900, price: 95000, condition: "Like New" },
    { title: "Samsung Galaxy S23 Ultra", description: "256GB, Green, S Pen included, mint condition with box and cable.", category: "Smartphones", brand: "Samsung", originalPrice: 124999, price: 78000, condition: "Like New" },
    { title: "OnePlus 11", description: "128GB, Titan Black, 6 months old, no scratches.", category: "Smartphones", brand: "OnePlus", originalPrice: 56999, price: 35000, condition: "Good" },
    { title: "Xiaomi Redmi Note 13 Pro", description: "256GB, budget-friendly with great camera and big battery.", category: "Smartphones", brand: "Xiaomi", originalPrice: 24999, price: 14000, condition: "Good" },
    { title: "Engineering Mathematics Vol 1", description: "B.S. Grewal, latest edition, minimal highlighting, perfect for semester prep.", category: "Books", brand: "Pearson", originalPrice: 850, price: 400, condition: "Good" },
    { title: "Data Structures Textbook", description: "Tanenbaum Data Structures in C, comprehensive guide with solved examples.", category: "Books", brand: "Pearson", originalPrice: 650, price: 280, condition: "Average" },
    { title: "Casio FX-991EX Scientific Calculator", description: "Engineering standard calculator, works perfectly, screen protector included.", category: "Calculators", brand: "Casio", originalPrice: 1599, price: 800, condition: "Good" },
    { title: "HP 12C Financial Calculator", description: "Professional financial calculator in mint condition with sleeve.", category: "Calculators", brand: "HP", originalPrice: 4999, price: 2800, condition: "Like New" },
    { title: "Hercules MTB S Disc Cycle", description: "Mountain bike, 21 speed, 18 inch frame, recently serviced.", category: "Cycles", brand: "Hercules", originalPrice: 14999, price: 6500, condition: "Good" },
    { title: "Decathlon Rockrider ST 100", description: "Mountain bike, great for campus commute, brakes replaced.", category: "Cycles", brand: "Decathlon", originalPrice: 16999, price: 9000, condition: "Average" },
    { title: "IKEA Study Desk", description: "White, spacious study desk with cable management holes.", category: "Furniture", brand: "IKEA", originalPrice: 9999, price: 4500, condition: "Good" },
    { title: "Ergonomic Office Chair", description: "Adjustable lumbar support, mesh back, castors replaced.", category: "Furniture", brand: "Green Soul", originalPrice: 12999, price: 6000, condition: "Good" },
    { title: "Sony WH-1000XM5 Headphones", description: "Noise cancelling, barely used, carry case included.", category: "Electronics", brand: "Sony", originalPrice: 29990, price: 18000, condition: "Like New" },
    { title: "JBL Flip 6 Speaker", description: "Portable Bluetooth speaker, waterproof, punchy bass.", category: "Electronics", brand: "JBL", originalPrice: 12999, price: 6500, condition: "Good" },
    { title: "PS5 Disc Edition", description: "With 2 controllers and 3 games (Spider-Man 2, FC24, Elden Ring).", category: "Gaming", brand: "Sony", originalPrice: 49990, price: 38000, condition: "Good" },
    { title: "Nintendo Switch OLED", description: "With dock, pro controller, 5 games. Screen in perfect condition.", category: "Gaming", brand: "Nintendo", originalPrice: 37999, price: 26000, condition: "Like New" },
    { title: "Logitech G502 Gaming Mouse", description: "Wired, adjustable weight, RGB, zero issues.", category: "Gaming", brand: "Logitech", originalPrice: 4995, price: 2200, condition: "Good" },
    { title: "Mechanical Keyboard Redragon K552", description: "Blue switches, compact TKL design, RGB backlight.", category: "Accessories", brand: "Redragon", originalPrice: 2999, price: 1200, condition: "Like New" },
    { title: "USB-C Hub 7-in-1", description: "HDMI, USB 3.0, SD card reader, PD charging pass-through.", category: "Accessories", brand: "Anker", originalPrice: 2999, price: 1200, condition: "Good" },
    { title: "Samsung 27\" Monitor FHD", description: "IPS, 75Hz, great for study and gaming, no dead pixels.", category: "Electronics", brand: "Samsung", originalPrice: 16999, price: 8000, condition: "Good" },
  ];

  // A wider catalogue matters for more than realism. With only 24 listings spread
  // over 10 cities, almost every customer either matches their own city or does
  // not, so `localPreference` collapses to a 0/1 flag and `categoryDiversity` has
  // almost no range. Roughly six listings per category gives those features
  // something to actually measure.
  const EXTRA_PRODUCT_TEMPLATES = [
    { title: "HP EliteBook 840 G7", description: "i5 10th Gen, 16GB, 512GB, business grade with dongle.", category: "Laptops", brand: "HP", originalPrice: 115000, price: 62000, condition: "Good" },
    { title: "Acer Aspire 5 Ryzen 7", description: "16GB RAM, 512GB SSD, 15.6 inch IPS, one owner.", category: "Laptops", brand: "Acer", originalPrice: 78000, price: 41500, condition: "Good" },
    { title: "Apple MacBook Air M2 2022", description: "8GB, 256GB, midnight, 94% battery health.", category: "Laptops", brand: "Apple", originalPrice: 114900, price: 79900, condition: "Like New" },
    { title: "Asus ROG Strix G15", description: "RTX 3060, 16GB RAM, 144Hz display, gaming grade.", category: "Laptops", brand: "Asus", originalPrice: 165000, price: 99900, condition: "Good" },
    { title: "Google Pixel 8 Pro", description: "256GB, hazy, clean IMEI, box included.", category: "Smartphones", brand: "Google", originalPrice: 89999, price: 58000, condition: "Like New" },
    { title: "iPhone 13 128GB", description: "Midnight, battery health 89%, no screen scratches.", category: "Smartphones", brand: "Apple", originalPrice: 79900, price: 47500, condition: "Good" },
    { title: "Realme Narzo 60", description: "128GB, great battery, minor scratches on the back.", category: "Smartphones", brand: "Realme", originalPrice: 17999, price: 9900, condition: "Average" },
    { title: "Nothing Phone 2", description: "256GB, white, glyph interface works perfectly.", category: "Smartphones", brand: "Nothing", originalPrice: 46999, price: 28000, condition: "Like New" },
    { title: "iPad 10th Gen 64GB", description: "Wi-Fi model with pencil, screen protector on since new.", category: "Smartphones", brand: "Apple", originalPrice: 43900, price: 29500, condition: "Good" },
    { title: "Complete Physics Reference", description: "HC Verma concepts of physics, clean, all chapters intact.", category: "Books", brand: "Bharat Bhawan", originalPrice: 1100, price: 520, condition: "Good" },
    { title: "Introduction to Algorithms (CLRS)", description: "Hardcover, 3rd edition, tight binding, no markings.", category: "Books", brand: "MIT Press", originalPrice: 3200, price: 1500, condition: "Good" },
    { title: "Organic Chemistry Solomons", description: "Seventh edition, some pencil notes in first chapters.", category: "Books", brand: "Wiley", originalPrice: 2400, price: 1100, condition: "Average" },
    { title: "TI-84 Plus CE Graphing Calculator", description: "Works perfectly, includes cable and slide cover.", category: "Calculators", brand: "Texas Instruments", originalPrice: 12999, price: 6200, condition: "Like New" },
    { title: "Casio FX-82MS Scientific Calculator", description: "School standard, battery fresh, keypad clean.", category: "Calculators", brand: "Casio", originalPrice: 700, price: 380, condition: "Good" },
    { title: "Firefox Pro 26T Hybrid Cycle", description: "Hybrid frame, 21 speed, new tyres fitted last month.", category: "Cycles", brand: "Firefox", originalPrice: 32000, price: 18500, condition: "Like New" },
    { title: "Btwin Riverside 120 Hybrid", description: "Comfortable city commuter, 8 speed, serviced recently.", category: "Cycles", brand: "Decathlon", originalPrice: 24500, price: 12800, condition: "Good" },
    { title: "Kids Bicycle 16 inch", description: "Training wheels included, gentle use, ideal for ages 5-8.", category: "Cycles", brand: "BSA", originalPrice: 6500, price: 3100, condition: "Good" },
    { title: "Bookshelf 5 Tier Unit", description: "Sturdy wood finish, anti-tip kit included, minor scratches.", category: "Furniture", brand: "Urban Ladder", originalPrice: 8500, price: 4200, condition: "Good" },
    { title: "Recliner Chair with Ottoman", description: "Fabric recliner, manual mechanism, very comfortable.", category: "Furniture", brand: "Sharma Furnishings", originalPrice: 22000, price: 12500, condition: "Good" },
    { title: "Study Chair with Footrest", description: "Ergonomic mesh chair, adjustable height, lumbar support.", category: "Furniture", brand: "Green Soul", originalPrice: 7500, price: 3600, condition: "Like New" },
    { title: "Apple AirPods Pro 2", description: "Original box, silicone tips replaced, excellent battery.", category: "Electronics", brand: "Apple", originalPrice: 24900, price: 14900, condition: "Good" },
    { title: "Bose SoundLink Revolve+", description: "360 speaker, 20 hour battery, minor scuff on base.", category: "Electronics", brand: "Bose", originalPrice: 32999, price: 18500, condition: "Good" },
    { title: "Canon EOS 200D with 18-55mm", description: "Shutter count around 12k, two batteries and charger.", category: "Electronics", brand: "Canon", originalPrice: 54990, price: 33500, condition: "Good" },
    { title: "LG 43 inch 4K Smart TV", description: "IPS panel, one dead pixel corner, remote included.", category: "Electronics", brand: "LG", originalPrice: 44999, price: 24500, condition: "Average" },
    { title: "Xbox Series S 512GB", description: "Disc-less console, one controller, two games.", category: "Gaming", brand: "Microsoft", originalPrice: 29999, price: 19500, condition: "Good" },
    { title: "PlayStation VR Headset", description: "PSVR with controllers and box, tracking works perfectly.", category: "Gaming", brand: "Sony", originalPrice: 33990, price: 18500, condition: "Good" },
    { title: "Steam Deck 256GB", description: "Screen protector on since new, carry case included.", category: "Gaming", brand: "Valve", originalPrice: 48990, price: 31500, condition: "Like New" },
    { title: "HyperX Cloud II Headset", description: "7.1 surround, detachable mic, comfortable pads.", category: "Gaming", brand: "HyperX", originalPrice: 9499, price: 4600, condition: "Good" },
    { title: "Anker 65W GaN Charger", description: "Two ports, supports laptops and phones, cable included.", category: "Accessories", brand: "Anker", originalPrice: 4999, price: 2400, condition: "Like New" },
    { title: "Laptop Backpack 15.6 inch", description: "Water resistant, padded compartment, USB charging port.", category: "Accessories", brand: "Wildcraft", originalPrice: 2499, price: 1100, condition: "Good" },
    { title: "External SSD 1TB", description: "USB 3.2, 1050MB/s read, healthy SMART status.", category: "Accessories", brand: "Samsung", originalPrice: 8999, price: 4700, condition: "Like New" },
    { title: "boAt Airdopes 141", description: "TWS earbuds, 42 hour case battery, clean sound.", category: "Accessories", brand: "boAt", originalPrice: 2499, price: 1150, condition: "Good" },
  ];

  const allProductTemplates = [...productTemplates, ...EXTRA_PRODUCT_TEMPLATES];

  const products = [];
  for (const pt of allProductTemplates) {
    const cat = categories.find((c) => c.name === pt.category);
    const seller = pick(customers);
    products.push(
      await Product.create({
        ...pt,
        category: cat._id,
        categoryName: cat.name,
        seller: seller._id,
        sellerName: seller.name,
        location: seller.location,
        images: imagesForProduct(pt),
        negotiable: Math.random() > 0.3,
        exchangeable: Math.random() > 0.5,
        views: random(20, 500),
        rating: (Math.random() * 3 + 2).toFixed(1),
        reviewCount: random(1, 15),
      })
    );
  }
  console.log(`[Seed] ${products.length} products created`);

  console.log("[Seed] Generating price history...");
  const historyToCreate = [];
  for (const product of products) {
    const steps = random(5, 8);
    const start = product.originalPrice;
    const end = product.price;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const trend = start + (end - start) * t;
      const jitter = trend * (random(-6, 6) / 100);
      historyToCreate.push({
        productId: product._id,
        price: Math.round(Math.max(1, trend + jitter)),
        source: "seed",
        note: "Price history (seed)",
        createdAt: ago(random(3, 45), random(0, 8)),
      });
    }
  }
  await PriceHistory.insertMany(historyToCreate, { ordered: false }).catch(() => {});
  console.log(`[Seed] ${historyToCreate.length} price history entries created`);

  console.log("[Seed] Creating default settings...");
  await Settings.create([
    { key: "siteName", value: "ReMarket", label: "Site name", group: "general" },
    { key: "siteTagline", value: "Give good things a second life.", label: "Tagline", group: "general" },
    { key: "contactEmail", value: "hello@remarket.in", label: "Contact email", group: "general" },
    { key: "heroHeadline", value: "Great finds, second life, zero waste.", label: "Hero headline", group: "marketing" },
    { key: "heroSubheadline", value: "The campus marketplace where trusted sellers and smart buyers meet. Every purchase funds a greener habit.", label: "Hero subheadline", group: "marketing" },
    { key: "commissionRate", value: 5, label: "Commission rate (%)", group: "financial" },
    { key: "deliveryEnabled", value: true, label: "Delivery enabled", group: "operations" },
    { key: "minClusterSize", value: 2, label: "Min cluster size", group: "ml" },
    { key: "mlFeatureVersion", value: "2026.2", label: "ML feature version", group: "ml" },
  ]);
  console.log("[Seed] Settings created");

  console.log("[Seed] Generating behavioral profiles as coherent sessions...");

  const purchasesByUser = {};
  const offersByUser = {};
  const allEvents = [];
  const profileCounts = {};

  for (let i = 0; i < customers.length; i += 1) {
    const user = customers[i];
    // Round-robin the five archetypes so each ends up with a comparable number of
    // members. A lopsided split would give one cluster most of the base and leave
    // the rest too small to interpret.
    const profileType = PROFILE_ORDER[i % PROFILE_ORDER.length];

    const { events, purchases, offers } = generateCustomerBehaviour({
      user,
      profileType,
      products,
    });

    for (const event of events) allEvents.push(event);
    purchasesByUser[String(user._id)] = purchases;
    offersByUser[String(user._id)] = offers;
    profileCounts[profileType] = (profileCounts[profileType] || 0) + 1;
  }

  if (allEvents.length > 0) {
    await BehaviorEvent.insertMany(allEvents, { ordered: false });
  }

  const totalSessions = new Set(allEvents.map((event) => event.sessionId)).size;
  const profileBreakdown = Object.entries(profileCounts)
    .map(([key, count]) => `${PROFILES[key].label}: ${count}`)
    .join(", ");
  console.log(
    `[Seed] ${allEvents.length} events across ${totalSessions} sessions (${profileBreakdown})`
  );

  console.log("[Seed] Creating orders consistent with purchases...");
  const ordersToCreate = [];
  for (const user of customers) {
    // Only customers who actually bought get an order. Inventing a delivered
    // order for a customer with no purchase would make purchaseCount non-zero for
    // every user and erase the difference between buyers and browsers.
    for (const p of purchasesByUser[String(user._id)] || []) {
      // A "discount" is a reduction against the seller's asking price, which is
      // the product price. Comparing against the original retail price instead
      // would make every single order look discounted and leave discountUsage
      // perfectly correlated with purchaseCount.
      const askingPrice = Number(p.product.price) || 0;
      const finalPrice = Number(p.finalPrice) || askingPrice;
      const discountPercent =
        askingPrice > 0 ? Math.round(((askingPrice - finalPrice) / askingPrice) * 100) : 0;
      ordersToCreate.push({
        buyerId: user._id,
        sellerId: p.product.seller,
        productId: p.product._id,
        productTitle: p.product.title,
        finalPrice,
        listedPrice: askingPrice,
        discount: Math.max(0, askingPrice - finalPrice),
        discountPercent: Math.max(0, discountPercent),
        type: "buy",
        status: "delivered",
        decisionTimeMinutes: p.decisionTimeMinutes,
        purchaseReason: p.purchaseReason,
        createdAt: p.createdAt,
      });
    }
  }
  await Order.insertMany(ordersToCreate, { ordered: false }).catch(() => {});
  console.log(`[Seed] ${ordersToCreate.length} orders created`);

  console.log("[Seed] Creating offers...");
  const offerDocs = [];
  for (const user of customers) {
    for (const off of offersByUser[String(user._id)] || []) {
      offerDocs.push({
        buyerId: user._id,
        sellerId: off.product.seller,
        productId: off.product._id,
        listedPrice: off.listedPrice,
        offerAmount: off.offerAmount,
        status: off.status,
        counterAmount:
          off.status === "countered" ? Math.round((off.listedPrice + off.offerAmount) / 2) : null,
        rounds: off.rounds,
        finalPrice: off.status === "accepted" ? off.offerAmount : null,
        message: pick([
          "Hi, is this available?",
          "Would you accept a lower price?",
          "Can you negotiate?",
        ]),
        createdAt: off.createdAt,
      });
    }
  }
  await Offer.insertMany(offerDocs, { ordered: false }).catch(() => {});
  console.log(`[Seed] ${offerDocs.length} offers created`);

  console.log("[Seed] Creating price watches...");
  const watchDates = await BehaviorEvent.find({ eventType: "PRICE_WATCH" })
    .select("userId productId metadata timestamp")
    .lean();
  const watchDocs = watchDates.map((e) => ({
    userId: e.userId,
    productId: e.productId,
    targetPrice: e.metadata?.targetPrice || null,
    triggered: Math.random() < 0.3,
    purchasedAfterTrigger: false,
  }));
  const uniqueWatches = [];
  const seen = new Set();
  for (const w of watchDocs) {
    const key = `${String(w.userId)}:${String(w.productId)}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueWatches.push(w);
    }
  }
  await PriceWatch.insertMany(uniqueWatches, { ordered: false }).catch(() => {});
  console.log(`[Seed] ${uniqueWatches.length} price watches created`);

  console.log("[Seed] Creating chats + notifications...");
  const chatDocs = [];
  const notifyDocs = [];
  for (const user of customers) {
    const chats = await BehaviorEvent.countDocuments({ userId: user._id, eventType: "CHAT_STARTED" });
    if (chats > 0) {
      const seller = pick(customers.filter((c) => String(c._id) !== String(user._id)));
      const product = pick(
        products.filter((p) => String(p.seller) === String(seller._id)).length
          ? products.filter((p) => String(p.seller) === String(seller._id))
          : products
      );
      chatDocs.push({
        participants: [user._id, seller._id],
        productId: product._id,
        messages: [
          { senderId: user._id, text: pick(["Hi, is this still available?", "What's the final price?", "Any issues with it?"]), read: true, timestamp: ago(random(1, 9)) },
          { senderId: seller._id, text: pick(["Yes, still available!", "I can do a small discount.", "It's in great condition."]), read: true, timestamp: ago(random(1, 8)) },
          { senderId: user._id, text: "Great, thanks!", read: false, timestamp: ago(0, random(2, 10)) },
        ],
        lastMessage: "Great, thanks!",
        lastMessageAt: ago(0, random(2, 10)),
      });
    }
  }
  for (const user of customers) {
    const sellers = customers.filter((c) => String(c._id) !== String(user._id));
    const mySales = products.filter((p) => String(p.seller) === String(user._id));
    if (mySales.length && Math.random() < 0.8) {
      const prod = pick(mySales);
      const buyerName = pick(sellers).name;
      notifyDocs.push({
        userId: user._id,
        type: "offer",
        title: "New offer on your listing",
        message: `${buyerName} offered ${prod.price ? "a price" : "to buy"} your \"${prod.title}\".`,
        link: `/sell`,
        timestamp: ago(random(0, 3), random(1, 6)),
      });
    }
    if (String(user._id) && Math.random() < 0.5) {
      const watched = products[random(0, products.length - 1)];
      notifyDocs.push({
        userId: user._id,
        type: "priceDrop",
        title: "Price drop alert",
        message: `\"${watched.title}\" just dropped to ₹${watched.price.toLocaleString("en-IN")}.`,
        link: `/product/${watched._id}`,
        timestamp: ago(random(0, 4), random(1, 8)),
      });
    }
  }
  if (chatDocs.length) await Chat.insertMany(chatDocs, { ordered: false }).catch(() => {});
  if (notifyDocs.length) await Notification.insertMany(notifyDocs, { ordered: false }).catch(() => {});
  console.log(`[Seed] ${chatDocs.length} chats + ${notifyDocs.length} notifications created`);

  const reviewsToCreate = [];
  for (const customer of customers) {
    const count = random(2, 5);
    for (let i = 0; i < count; i++) {
      const product = pick(products);
      reviewsToCreate.push({
        userId: customer._id,
        productId: product._id,
        sellerId: product.seller,
        rating: random(2, 5),
        comment: pick(["Great product!", "As described", "Fast delivery", "Excellent condition", "Would recommend", "Genuine seller"]),
        createdAt: ago(random(1, 20)),
      });
    }
  }
  await Review.insertMany(reviewsToCreate, { ordered: false }).catch(() => {});
  console.log(`[Seed] ${reviewsToCreate.length} reviews created`);

  console.log("[Seed] Building customer features from behavior (same math as ML pipeline)...");
  const builtFeatures = await buildCustomerFeatures();
  console.log(`[Seed] ${builtFeatures.length} customer feature profiles built`);

  console.log("[Seed] Seed complete!");
  console.log("[Seed] Admin: admin@marketplace.com / admin123");
  console.log("[Seed] Customers: aarav@test.com / pass123");
  await mongoose.disconnect();
};

seed().catch((err) => {
  console.error("[Seed] Error:", err);
  process.exit(1);
});
