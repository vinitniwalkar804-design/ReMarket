import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config();

/**
 * Resolve the JWT signing secret.
 *
 * The signing key is the one value in this file that must never have a usable
 * default. `JWT_SECRET || "supersecret"` meant a deployment that simply forgot
 * to set the variable still booted, and every token it issued was forgeable by
 * anyone who had read the repository - including by promoting a customer token
 * to an admin one, since the same secret signs both.
 *
 * So the behaviour depends on the environment:
 *
 *  - production: refuse to start. A missing secret is a deployment error, and
 *    failing loudly is far cheaper than running with a publicly known key.
 *  - development/test: generate a strong random secret for this process. Tokens
 *    stop being valid across restarts, which is the correct trade for never
 *    using a value an attacker could look up.
 */
const resolveJwtSecret = () => {
  const fromEnv = process.env.JWT_SECRET?.trim();

  if (fromEnv) {
    if (fromEnv === "supersecret" || fromEnv === "change_this_to_a_long_random_secret") {
      throw new Error(
        "JWT_SECRET is still the placeholder value from .env.example. " +
          "Generate a real one, for example: node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\""
      );
    }
    if (fromEnv.length < 32) {
      throw new Error("JWT_SECRET must be at least 32 characters to be safe for HS256 signing.");
    }
    return fromEnv;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET is required in production. Refusing to start with a default signing key.");
  }

  const generated = crypto.randomBytes(48).toString("hex");
  console.warn(
    "[config] JWT_SECRET is not set - generated a random secret for this process. " +
      "Sessions will not survive a restart. Set JWT_SECRET in backend/.env to keep them."
  );
  return generated;
};

export const config = {
  port: process.env.PORT || 5050,
  mongodbUri: process.env.MONGODB_URI || "mongodb://localhost:27017/smart_second_hand_marketplace",
  jwtSecret: resolveJwtSecret(),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  mlServiceUrl: process.env.ML_SERVICE_URL || "http://localhost:8000",
  clientUrl: process.env.CLIENT_URL || "http://localhost:5174",
};
