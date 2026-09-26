import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/smart_second_hand_marketplace";

const connectDB = async () => {
  try {
    await mongoose.connect(MONGODB_URI);
    const dbName = mongoose.connection.name;
    if (dbName !== "smart_second_hand_marketplace") {
      console.error(`[DB] REFUSING connection to unexpected database: ${dbName}`);
      await mongoose.disconnect();
      process.exit(1);
    }
    console.log(`[DB] Connected to MongoDB database: ${dbName}`);
  } catch (err) {
    console.error("[DB] MongoDB connection error:", err.message);
    process.exit(1);
  }
};

export default connectDB;
export { MONGODB_URI };