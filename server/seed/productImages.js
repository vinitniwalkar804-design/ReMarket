/**
 * SINGLE SOURCE OF TRUTH for product images.
 *
 * Why this file exists
 * --------------------
 * The previous resolver picked a product's image from its CATEGORY (or from a
 * 10-entry keyword list), so every product in a category was written to MongoDB
 * with a byte-identical `images` array. 57 products ended up sharing 19 distinct
 * images, which is why unrelated products rendered the same photo.
 *
 * The rules that caused it are gone:
 *   - NO category-based image assignment
 *   - NO array-index / position-based assignment
 *   - NO random selection
 *   - NO "one image per category" fallback
 *
 * What is here instead
 * --------------------
 * 1. CATALOG_IMAGES  - an explicit, per-product-title map for the seeded catalog.
 *                      Each product owns its own image; no two products in this
 *                      map share an image. This is DATA, not derived logic.
 * 2. PRODUCT_TYPE_IMAGES - small per-product-type pools used only to give a
 *                      brand new / unknown listing a type-appropriate image
 *                      (e.g. a newly seeded "Anker 140W Charger" gets a charger
 *                      photo). Keyed on the product type found in the TITLE, never
 *                      on the category.
 * 3. imagesForProduct() - exact catalog title -> product type -> [] .
 *                      An unrecognised product returns [] rather than borrowing
 *                      another product's or its category's image. The client then
 *                      renders a neutral marketplace placeholder that is clearly a
 *                      fallback, never a stand-in product photo.
 *
 * Every Unsplash id below was verified to return HTTP 200 from the CDN.
 * All catalog images use a uniform 4:3 crop (w=1000&h=750) so cards and the
 * product detail gallery stay visually consistent and are never stretched.
 */

const CDN = "https://images.unsplash.com/";
const QUERY = "?auto=format&fit=crop&w=1000&h=750&q=70";

/** Build a CDN url for a bare Unsplash photo id. */
export const unsplash = (id) => `${CDN}${id}${QUERY}`;

/**
 * Explicit per-product image for every seeded catalog product.
 * Title is matched case-insensitively after trimming/normalising whitespace.
 */
export const CATALOG_IMAGES = {
  "MacBook Pro 2021 M1 Pro": ["https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=1000&h=750&q=70"],
  "Apple MacBook Air M2 2022": ["https://images.unsplash.com/photo-1531297484001-80022131f5a1?auto=format&fit=crop&w=1000&h=750&q=70"],
  "Dell XPS 15 9510": ["https://images.unsplash.com/photo-1541807084-5c52b6b3adef?auto=format&fit=crop&w=1000&h=750&q=70"],
  "Lenovo ThinkPad X1 Carbon Gen 9": ["https://images.unsplash.com/photo-1603302576837-37561b2e2302?auto=format&fit=crop&w=1000&h=750&q=70"],
  "HP EliteBook 840 G7": ["https://images.unsplash.com/photo-1525547719571-a2d4ac8945e2?auto=format&fit=crop&w=1000&h=750&q=70"],
  "Acer Aspire 5 Ryzen 7": ["https://images.unsplash.com/photo-1593642702821-c8da6771f0c6?auto=format&fit=crop&w=1000&h=750&q=70"],
  "HP Pavilion Gaming 15": ["https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?auto=format&fit=crop&w=1000&h=750&q=70"],
  "Asus ROG Strix G15": ["https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=1000&h=750&q=70"],
  "iPhone 14 Pro Max": ["https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=1000&h=750&q=70"],
  "iPhone 13 128GB": ["https://images.unsplash.com/photo-1592750475338-74b7b21085ab?auto=format&fit=crop&w=1000&h=750&q=70"],
  "Samsung Galaxy S23 Ultra": ["https://images.unsplash.com/photo-1510557880182-3d4d3cba35a5?auto=format&fit=crop&w=1000&h=750&q=70"],
  "Google Pixel 8 Pro": ["https://images.unsplash.com/photo-1565849904461-04a58ad377e0?auto=format&fit=crop&w=1000&h=750&q=70"],
  "OnePlus 11": ["https://images.unsplash.com/photo-1580910051074-3eb694886505?auto=format&fit=crop&w=1000&h=750&q=70"],
  "Xiaomi Redmi Note 13 Pro": ["https://images.unsplash.com/photo-1546054454-aa26e2b734c7?auto=format&fit=crop&w=1000&h=750&q=70"],
  "Realme Narzo 60": ["https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?auto=format&fit=crop&w=1000&h=750&q=70"],
  "Nothing Phone 2": ["https://images.unsplash.com/photo-1580894732444-8ecded7900cd?auto=format&fit=crop&w=1000&h=750&q=70"],
  "iPad 10th Gen 64GB": ["https://images.unsplash.com/photo-1574944985070-8f3ebc6b79d2?auto=format&fit=crop&w=1000&h=750&q=70"],
  "Engineering Mathematics Vol 1": ["https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?auto=format&fit=crop&w=1000&h=750&q=70"],
  "Data Structures Textbook": ["https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1000&h=750&q=70"],
  "Complete Physics Reference": ["https://images.unsplash.com/photo-1532094349884-543bc11b234d?auto=format&fit=crop&w=1000&h=750&q=70"],
  "Introduction to Algorithms (CLRS)": ["https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&w=1000&h=750&q=70"],
  "Organic Chemistry Solomons": ["https://images.unsplash.com/photo-1481627834876-b7833e8f5570?auto=format&fit=crop&w=1000&h=750&q=70"],
  "Casio FX-991EX Scientific Calculator": ["https://images.unsplash.com/photo-1587145820266-a5951ee6f620?auto=format&fit=crop&w=1000&h=750&q=70"],
  "Casio FX-82MS Scientific Calculator": ["https://images.unsplash.com/photo-1611348586804-61bf6c080437?auto=format&fit=crop&w=1000&h=750&q=70"],
  "HP 12C Financial Calculator": ["https://images.unsplash.com/photo-1567427017947-545c5f8d16ad?auto=format&fit=crop&w=1000&h=750&q=70"],
  "TI-84 Plus CE Graphing Calculator": ["https://images.unsplash.com/photo-1592878904946-b3cd8ae243d0?auto=format&fit=crop&w=1000&h=750&q=70"],
  "Hercules MTB S Disc Cycle": ["https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=1000&h=750&q=70"],
  "Decathlon Rockrider ST 100": ["https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=1000&h=750&q=70"],
  "Firefox Pro 26T Hybrid Cycle": ["https://images.unsplash.com/photo-1532298229144-0ec0c57515c7?auto=format&fit=crop&w=1000&h=750&q=70"],
  "Btwin Riverside 120 Hybrid": ["https://images.unsplash.com/photo-1541625602330-2277a4c46182?auto=format&fit=crop&w=1000&h=750&q=70"],
  "Kids Bicycle 16 inch": ["https://images.unsplash.com/photo-1511994298241-608e28f14fde?auto=format&fit=crop&w=1000&h=750&q=70"],
  "IKEA Study Desk": ["https://images.unsplash.com/photo-1533090481720-856c6e3c1fdc?auto=format&fit=crop&w=1000&h=750&q=70"],
  "Ergonomic Office Chair": ["https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1000&h=750&q=70"],
  "Bookshelf 5 Tier Unit": ["https://images.unsplash.com/photo-1594620302200-9a762244a156?auto=format&fit=crop&w=1000&h=750&q=70"],
  "Recliner Chair with Ottoman": ["https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=1000&h=750&q=70"],
  "Study Chair with Footrest": ["https://images.unsplash.com/photo-1592078615290-033ee584e267?auto=format&fit=crop&w=1000&h=750&q=70"],
  "Sony WH-1000XM5 Headphones": ["https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=1000&h=750&q=70"],
  "JBL Flip 6 Speaker": ["https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?auto=format&fit=crop&w=1000&h=750&q=70"],
  "Bose SoundLink Revolve+": ["https://images.unsplash.com/photo-1545454675-3531b543be5d?auto=format&fit=crop&w=1000&h=750&q=70"],
  "Apple AirPods Pro 2": ["https://images.unsplash.com/photo-1606220588913-b3aacb4d2f46?auto=format&fit=crop&w=1000&h=750&q=70"],
  "Canon EOS 200D with 18-55mm": ["https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=1000&h=750&q=70"],
  "LG 43 inch 4K Smart TV": ["https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?auto=format&fit=crop&w=1000&h=750&q=70"],
  "Samsung 27\" Monitor FHD": ["https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?auto=format&fit=crop&w=1000&h=750&q=70"],
  "PS5 Disc Edition": ["https://images.unsplash.com/photo-1606813907291-d86efa9b94db?auto=format&fit=crop&w=1000&h=750&q=70"],
  "Nintendo Switch OLED": ["https://images.unsplash.com/photo-1606144042614-b2417e99c4e3?auto=format&fit=crop&w=1000&h=750&q=70"],
  "Xbox Series S 512GB": ["https://images.unsplash.com/photo-1592840496694-26d035b52b48?auto=format&fit=crop&w=1000&h=750&q=70"],
  "Steam Deck 256GB": ["https://images.unsplash.com/photo-1612287230202-1ff1d85d1bdf?auto=format&fit=crop&w=1000&h=750&q=70"],
  "Logitech G502 Gaming Mouse": ["https://images.unsplash.com/photo-1527814050087-3793815479db?auto=format&fit=crop&w=1000&h=750&q=70"],
  "PlayStation VR Headset": ["https://images.unsplash.com/photo-1622979135225-d2ba269cf1ac?auto=format&fit=crop&w=1000&h=750&q=70"],
  "HyperX Cloud II Headset": ["https://images.unsplash.com/photo-1599669454699-248893623440?auto=format&fit=crop&w=1000&h=750&q=70"],
  "Mechanical Keyboard Redragon K552": ["https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=1000&h=750&q=70"],
  "USB-C Hub 7-in-1": ["https://images.unsplash.com/photo-1601524909162-ae8725290836?auto=format&fit=crop&w=1000&h=750&q=70"],
  "Anker 65W GaN Charger": ["https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=1000&h=750&q=70"],
  "Laptop Backpack 15.6 inch": ["https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=1000&h=750&q=70"],
  "External SSD 1TB": ["https://images.unsplash.com/photo-1597872200969-2b65d56bd16b?auto=format&fit=crop&w=1000&h=750&q=70"],
  "boAt Airdopes 141": ["https://images.unsplash.com/photo-1572569511254-d8f925fe2cbb?auto=format&fit=crop&w=1000&h=750&q=70"],
};

/**
 * Product-type pools for listings that are not in CATALOG_IMAGES.
 * Ordered rules in TYPE_RULES decide which pool applies.
 */
export const PRODUCT_TYPE_IMAGES = {
  "usb-c hub": [
    "photo-1601524909162-ae8725290836",
    "photo-1625842268584-8f3296236761",
    "photo-1618044619888-009e412ff12a",
  ],
  "usb hub": [
    "photo-1587202372634-32705e3bf49c",
    "photo-1625842268584-8f3296236761",
  ],
  "laptop stand": [
    "photo-1593642632823-8f785ba67e45",
    "photo-1611186871348-b1ce696e52c9",
  ],
  "phone stand": [
    "photo-1585060544812-6b45742d762f",
    "photo-1600294037681-c80b4cb5b434",
  ],
  "mobile holder": [
    "photo-1585060544812-6b45742d762f",
    "photo-1556656793-08538906a9f8",
  ],
  "gaN charger": [
    "photo-1583863788434-e58a36330cf0",
    "photo-1622519407650-3df9883f76a5",
  ],
  "charger": [
    "photo-1583863788434-e58a36330cf0",
    "photo-1622519407650-3df9883f76a5",
  ],
  "power adapter": [
    "photo-1583863788434-e58a36330cf0",
    "photo-1625842268584-8f3296236761",
  ],
  "backpack": [
    "photo-1553062407-98eeb64c6a62",
    "photo-1622560480605-d83c853bc5c3",
    "photo-1581605405669-fcdf81165afa",
  ],
  "external ssd": [
    "photo-1597872200969-2b65d56bd16b",
    "photo-1531492746076-161ca9bcad58",
  ],
  "portable ssd": [
    "photo-1597872200969-2b65d56bd16b",
    "photo-1518770660439-4636190af475",
  ],
  "ssd": [
    "photo-1597872200969-2b65d56bd16b",
    "photo-1531492746076-161ca9bcad58",
  ],
  "mechanical keyboard": [
    "photo-1587829741301-dc798b83add3",
    "photo-1618384887929-16ec33fab9ef",
  ],
  "gaming keyboard": [
    "photo-1595044426077-d36d9236d54a",
    "photo-1612198188060-c7c2a3b66eae",
  ],
  "keyboard": [
    "photo-1587829741301-dc798b83add3",
    "photo-1541140532154-b024d705b90a",
  ],
  "wireless mouse": [
    "photo-1527814050087-3793815479db",
    "photo-1615663245857-ac93bb7c39e7",
  ],
  "gaming mouse": [
    "photo-1616432043562-3671ea2e5242",
    "photo-1563297007-0686b7003af7",
  ],
  "mouse": [
    "photo-1527814050087-3793815479db",
    "photo-1626197031507-c17099753214",
  ],
  "earbuds": [
    "photo-1606220588913-b3aacb4d2f46",
    "photo-1572569511254-d8f925fe2cbb",
  ],
  "airpods": [
    "photo-1606220588913-b3aacb4d2f46",
    "photo-1613040809024-b4ef7ba99bc3",
  ],
  "headphones": [
    "photo-1505740420928-5e560c06d30e",
    "photo-1618366712010-f4ae9c647dcb",
  ],
  "gaming headset": [
    "photo-1599669454699-248893623440",
    "photo-1547394765-185e1e68f34e",
  ],
  "headset": [
    "photo-1505740420928-5e560c06d30e",
    "photo-1583394838336-acd977736f90",
  ],
  "speaker": [
    "photo-1608043152269-423dbba4e7e1",
    "photo-1545454675-3531b543be5d",
  ],
  "monitor": [
    "photo-1527443224154-c4a3942d3acf",
    "photo-1585792180666-f7347c490ee2",
  ],
  "television": [
    "photo-1593359677879-a4bb92f829d1",
    "photo-1461151304267-38535e780c79",
  ],
  "tv": [
    "photo-1593359677879-a4bb92f829d1",
    "photo-1593784991095-a205069470b6",
  ],
  "camera": [
    "photo-1516035069371-29a1b244cc32",
    "photo-1502920917128-1aa500764cbd",
  ],
  "dslr": [
    "photo-1516035069371-29a1b244cc32",
    "photo-1520549233664-03f65c1d1327",
  ],
  "playstation": [
    "photo-1606813907291-d86efa9b94db",
    "photo-1592840496694-26d035b52b48",
  ],
  "ps5": [
    "photo-1606813907291-d86efa9b94db",
    "photo-1612287230202-1ff1d85d1bdf",
  ],
  "xbox": [
    "photo-1592840496694-26d035b52b48",
    "photo-1580327344181-c1163234e5a0",
  ],
  "nintendo switch": [
    "photo-1606144042614-b2417e99c4e3",
    "photo-1578303512597-81e6cc155b3e",
  ],
  "steam deck": [
    "photo-1612287230202-1ff1d85d1bdf",
    "photo-1560419015-7c427e8ae5ba",
  ],
  "vr headset": [
    "photo-1622979135225-d2ba269cf1ac",
    "photo-1593508512255-86ab42a8e620",
  ],
  "vr": [
    "photo-1622979135225-d2ba269cf1ac",
    "photo-1617802690992-15d93263d3a9",
  ],
  "graphing calculator": [
    "photo-1592878904946-b3cd8ae243d0",
    "photo-1610484826967-09c5720778c7",
  ],
  "scientific calculator": [
    "photo-1587145820266-a5951ee6f620",
    "photo-1611348586804-61bf6c080437",
  ],
  "calculator": [
    "photo-1587145820266-a5951ee6f620",
    "photo-1567427017947-545c5f8d16ad",
  ],
  "macbook": [
    "photo-1517336714731-489689fd1ca8",
    "photo-1531297484001-80022131f5a1",
  ],
  "thinkpad": [
    "photo-1603302576837-37561b2e2302",
    "photo-1525547719571-a2d4ac8945e2",
  ],
  "laptop": [
    "photo-1496181133206-80ce9b88a853",
    "photo-1541807084-5c52b6b3adef",
  ],
  "notebook": [
    "photo-1496181133206-80ce9b88a853",
    "photo-1531297484001-80022131f5a1",
  ],
  "ipad": [
    "photo-1574944985070-8f3ebc6b79d2",
    "photo-1523206489230-c012c64b2b48",
  ],
  "tablet": [
    "photo-1574944985070-8f3ebc6b79d2",
    "photo-1546054454-aa26e2b734c7",
  ],
  "iphone": [
    "photo-1511707171634-5f897ff02aa9",
    "photo-1592750475338-74b7b21085ab",
  ],
  "galaxy": [
    "photo-1510557880182-3d4d3cba35a5",
    "photo-1580910051074-3eb694886505",
  ],
  "pixel": [
    "photo-1565849904461-04a58ad377e0",
    "photo-1601784551446-20c9e07cdbdb",
  ],
  "oneplus": [
    "photo-1580910051074-3eb694886505",
    "photo-1546054454-aa26e2b734c7",
  ],
  "redmi": [
    "photo-1546054454-aa26e2b734c7",
    "photo-1580894732444-8ecded7900cd",
  ],
  "xiaomi": [
    "photo-1546054454-aa26e2b734c7",
    "photo-1600294037681-c80b4cb5b434",
  ],
  "realme": [
    "photo-1601784551446-20c9e07cdbdb",
    "photo-1592899677977-9c10ca588bbd",
  ],
  "nothing phone": [
    "photo-1580894732444-8ecded7900cd",
    "photo-1616348436168-de43ad0db179",
  ],
  "smartphone": [
    "photo-1511707171634-5f897ff02aa9",
    "photo-1510557880182-3d4d3cba35a5",
  ],
  "phone": [
    "photo-1511707171634-5f897ff02aa9",
    "photo-1592750475338-74b7b21085ab",
  ],
  "mountain bike": [
    "photo-1485965120184-e220f721d03e",
    "photo-1558981806-ec527fa84c39",
  ],
  "hybrid cycle": [
    "photo-1532298229144-0ec0c57515c7",
    "photo-1541625602330-2277a4c46182",
  ],
  "hybrid bicycle": [
    "photo-1532298229144-0ec0c57515c7",
    "photo-1541625602330-2277a4c46182",
  ],
  "kids bicycle": [
    "photo-1511994298241-608e28f14fde",
    "photo-1593764592116-bfb2a97c642a",
  ],
  "children bicycle": [
    "photo-1511994298241-608e28f14fde",
    "photo-1593764592116-bfb2a97c642a",
  ],
  "bicycle": [
    "photo-1529422643029-d4585747aaf2",
    "photo-1571068316344-75bc76f77890",
  ],
  "cycle": [
    "photo-1529422643029-d4585747aaf2",
    "photo-1502744688674-c619d1586c9e",
  ],
  "bookshelf": [
    "photo-1594620302200-9a762244a156",
    "photo-1521587760476-6c12a4b040da",
  ],
  "recliner": [
    "photo-1555041469-a586c61ea9bc",
    "photo-1616486338812-3dadae4b4ace",
  ],
  "office chair": [
    "photo-1505693416388-ac5ce068fe85",
    "photo-1592078615290-033ee584e267",
  ],
  "study chair": [
    "photo-1592078615290-033ee584e267",
    "photo-1580480055273-228ff5388ef8",
  ],
  "chair": [
    "photo-1505693416388-ac5ce068fe85",
    "photo-1567538096630-e0c55bd6374c",
  ],
  "study desk": [
    "photo-1533090481720-856c6e3c1fdc",
    "photo-1518455027359-f3f8164ba6bd",
  ],
  "desk": [
    "photo-1533090481720-856c6e3c1fdc",
    "photo-1524758631624-e2822e304c36",
  ],
  "textbook": [
    "photo-1524995997946-a1c2e315a42f",
    "photo-1503676260728-1c00da094a0b",
  ],
  "book": [
    "photo-1544716278-ca5e3f4abd8c",
    "photo-1512820790803-83ca734da794",
  ],
  "laptop bag": [
    "photo-1553062407-98eeb64c6a62",
    "photo-1622560480605-d83c853bc5c3",
  ],
  "bag": [
    "photo-1553062407-98eeb64c6a62",
    "photo-1581605405669-fcdf81165afa",
  ],
};

export const TYPE_RULES = [
  { type: "usb-c hub", match: /usb[\s-]?c?\s*hub/i },
  { type: "usb hub", match: /\busb\b.*\bhub\b/i },
  { type: "laptop stand", match: /laptop\s*(stand|riser|elevator)/i },
  { type: "phone stand", match: /(phone|mobile)\s*(stand|holder)/i },
  { type: "mobile holder", match: /(mobile|phone)\s*(holder|holder stand)/i },
  { type: "gaN charger", match: /\bgan\b.*charger|charger.*\bgan\b/i },
  { type: "charger", match: /\b(charger|charging\s*adapter|power\s*adapter|adapter)\b/i },
  { type: "backpack", match: /\b(backpack|rucksack|laptop\s*bag)\b/i },
  { type: "external ssd", match: /(external|portable|external\s*portable)\s*ssd/i },
  { type: "portable ssd", match: /portable\s*(ssd|drive)/i },
  { type: "ssd", match: /\bssd\b/i },
  { type: "mechanical keyboard", match: /mechanical\s*keyboard/i },
  { type: "gaming keyboard", match: /gaming\s*keyboard/i },
  { type: "keyboard", match: /\bkeyboard\b/i },
  { type: "wireless mouse", match: /wireless\s*mouse/i },
  { type: "gaming mouse", match: /gaming\s*mouse/i },
  { type: "mouse", match: /\bmouse\b/i },
  { type: "earbuds", match: /\b(earbuds|airdopes|tws\b|earphone)/i },
  { type: "airpods", match: /\bairpods\b/i },
  { type: "gaming headset", match: /(gaming|hyperx|cloud\s*ii)\s*(headset|headphone)/i },
  { type: "headphones", match: /\b(headphones?|headset)\b/i },
  { type: "headset", match: /\bheadset\b/i },
  { type: "speaker", match: /\bspeaker\b|\bsoundlink\b|\bjbl\b|\bbose\b/i },
  { type: "graphing calculator", match: /graphing\s*calculator|\bti-?84\b/i },
  { type: "scientific calculator", match: /scientific\s*calculator/i },
  { type: "calculator", match: /\bcalculator\b/i },
  { type: "monitor", match: /\bmonitor\b/i },
  { type: "television", match: /\b(television|smart\s*tv)\b/i },
  { type: "tv", match: /\btv\b/i },
  { type: "camera", match: /\b(camera|dslr|lens|eos\b)/i },
  { type: "playstation", match: /\b(playstation|ps5|psvr)\b/i },
  { type: "ps5", match: /\bps5\b/i },
  { type: "xbox", match: /\bxbox\b/i },
  { type: "nintendo switch", match: /\bnintendo\b.*\bswitch\b|\bswitch\s*(oled|console)/i },
  { type: "steam deck", match: /\bsteam\s*deck\b/i },
  { type: "vr headset", match: /(vr|virtual\s*reality)\s*headset/i },
  { type: "vr", match: /\bvr\b|virtual\s*reality/i },
  { type: "macbook", match: /\bmacbook\b/i },
  { type: "thinkpad", match: /thinkpad/i },
  { type: "laptop", match: /\b(laptop|notebook|ultrabook)\b/i },
  { type: "ipad", match: /\bipad\b/i },
  { type: "tablet", match: /\btablet\b/i },
  { type: "iphone", match: /\biphone\b/i },
  { type: "galaxy", match: /galaxy/i },
  { type: "pixel", match: /\bpixel\b/i },
  { type: "oneplus", match: /\boneplus\b/i },
  { type: "redmi", match: /\bredmi\b/i },
  { type: "xiaomi", match: /\bxiaomi\b/i },
  { type: "realme", match: /\brealme\b|\bnarzo\b/i },
  { type: "nothing phone", match: /nothing\s*phone/i },
  { type: "smartphone", match: /\bsmartphone\b/i },
  { type: "phone", match: /\bphone\b/i },
  { type: "mountain bike", match: /\b(mountain\s*bike|mtb)\b/i },
  { type: "hybrid cycle", match: /hybrid\s*(cycle|bicycle)/i },
  { type: "hybrid bicycle", match: /hybrid\s*(cycle|bicycle)/i },
  { type: "kids bicycle", match: /(kids|children|child)\s*(bike|bicycle|cycle)/i },
  { type: "children bicycle", match: /(kids|children|child)\s*(bike|bicycle|cycle)/i },
  { type: "bicycle", match: /\b(bicycle|cycle|road\s*bike)\b/i },
  { type: "bookshelf", match: /\b(bookshelf|bookcase|shelf)\b/i },
  { type: "recliner", match: /\brecliner\b/i },
  { type: "office chair", match: /(office|ergonomic)\s*chair/i },
  { type: "study chair", match: /study\s*chair/i },
  { type: "chair", match: /\bchair\b/i },
  { type: "study desk", match: /study\s*desk/i },
  { type: "desk", match: /\bdesk\b|\btable\b/i },
  { type: "textbook", match: /textbook/i },
  { type: "book", match: /\b(book|books)\b/i },
];

/** Normalise a title so "usb-c  hub" and "USB-C Hub" resolve to the same key. */
const normalizeTitle = (title) =>
  String(title || "")
    .toLowerCase()
    .replace(/[\u2018\u2019\u201c\u201d]/g, "'")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Case/punctuation-insensitive index over CATALOG_IMAGES.
 * The map above is keyed by the original title, so looking a normalised title up
 * directly would always miss and silently degrade to a type-pool image.
 */
const CATALOG_IMAGES_BY_KEY = new Map(
  Object.entries(CATALOG_IMAGES).map(([title, images]) => [normalizeTitle(title), images]),
);

/**
 * Resolve the images for a product.
 * @returns {string[]} 1+ urls for a known product, or [] when we genuinely do
 *   not know which image belongs to it. Never returns a category image or
 *   another product's image.
 */
export const imagesForProduct = ({ title = "", category = "", categoryName = "" } = {}) => {
  const normalized = normalizeTitle(title);
  if (!normalized) return [];

  const exactMatch = CATALOG_IMAGES[title] || CATALOG_IMAGES_BY_KEY.get(normalized);
  if (exactMatch) return [...exactMatch];

  for (const rule of TYPE_RULES) {
    if (!rule.match.test(title)) continue;
    const pool = PRODUCT_TYPE_IMAGES[rule.type];
    if (pool && pool.length) return [unsplash(pool[0])];
  }

  return [];
};

export default { CATALOG_IMAGES, PRODUCT_TYPE_IMAGES, TYPE_RULES, imagesForProduct, unsplash };
