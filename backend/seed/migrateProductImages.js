import mongoose from "mongoose";
import dotenv from "dotenv";
import { Product } from "../models/index.js";
import { imagesForProduct } from "./productImages.js";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/smart_second_hand_marketplace";
const EXPECTED_DB = "smart_second_hand_marketplace";
const DRY_RUN = process.argv.includes("--dry-run");

/**
 * Targeted, repeatable repair of the product catalog images.
 *
 * Guarantees
 * ----------
 * - Only the `images` field is ever written. Every other field, and crucially
 *   every `_id`, is left untouched, so orders, offers, reviews, wishlists,
 *   price watches, behaviour events, chats and price history all keep pointing
 *   at the same products.
 * - Nothing is deleted and no collection is dropped.
 * - A product that owns a real uploaded image (`/uploads/...`) is NEVER
 *   modified - seller/admin uploads win over catalog artwork.
 * - Idempotent: a second run reports 0 changes.
 *
 * Usage:  node seed/migrateProductImages.js [--dry-run]
 */

/** A locally uploaded, seller/admin supplied image. */
const isLocalUpload = (url) => /\/uploads\/[^/?#]+/i.test(String(url || ""));

/** Catalog artwork served from the Unsplash CDN. */
const isCatalogArtwork = (url) => /images\.unsplash\.com\/photo-/i.test(String(url || ""));

const cleanList = (images) => (Array.isArray(images) ? images.filter(Boolean).map(String) : []);

const migrate = async () => {
  await mongoose.connect(MONGODB_URI);
  const dbName = mongoose.connection.name;
  if (dbName !== EXPECTED_DB) {
    console.error(`[MigrateImages] REFUSING to touch unexpected database "${dbName}" (expected "${EXPECTED_DB}")`);
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log(`[MigrateImages] database=${dbName} dryRun=${DRY_RUN}`);

  const products = await Product.find().lean();
  console.log(`[MigrateImages] scanned ${products.length} products`);

  let updated = 0;
  let preservedUpload = 0;
  let alreadyCorrect = 0;
  let unresolved = 0;

  for (const product of products) {
    const current = cleanList(product.images);
    const title = product.title || "";

    // 1. A real upload always wins. Never overwrite seller/admin media.
    if (current.some(isLocalUpload)) {
      preservedUpload++;
      console.log(`[MigrateImages] KEEP   ${title} -> local upload preserved (${current.length} img)`);
      continue;
    }

    // 2. Only catalog artwork is eligible for repair.
    if (current.length && !current.every(isCatalogArtwork)) {
      preservedUpload++;
      console.log(`[MigrateImages] KEEP   ${title} -> non-catalog image, left untouched`);
      continue;
    }

    const resolved = imagesForProduct({ title, category: product.categoryName, categoryName: product.categoryName });

    if (!resolved.length) {
      // No known image for this product. Store nothing rather than borrowing a
      // category image or another product's photo. The client renders a neutral
      // placeholder that is clearly a fallback.
      unresolved++;
      if (current.length) {
        await Product.updateOne({ _id: product._id }, { $set: { images: [] } });
        updated++;
        console.log(`[MigrateImages] CLEAR  ${title} -> no known image; placeholder will render`);
      } else {
        console.log(`[MigrateImages] NONE   ${title} -> already image-less; placeholder will render`);
      }
      continue;
    }

    const sameAsCurrent =
      current.length === resolved.length && current.every((url, i) => url === resolved[i]);

    if (sameAsCurrent) {
      alreadyCorrect++;
      continue;
    }

    await Product.updateOne({ _id: product._id }, { $set: { images: resolved } });
    updated++;
    console.log(`[MigrateImages] FIX    ${title} -> ${resolved[0]}`);
  }

  console.log(
    `\n[MigrateImages] done: ${updated} updated, ${alreadyCorrect} already correct, ` +
      `${preservedUpload} preserved (uploads/non-catalog), ${unresolved} without a known image`
  );
  await mongoose.disconnect();
};

migrate().catch(async (err) => {
  console.error("[MigrateImages] failed:", err);
  try {
    await mongoose.disconnect();
  } catch {
    /* already disconnected */
  }
  process.exit(1);
});
