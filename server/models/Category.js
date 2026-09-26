import mongoose from "mongoose";

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    icon: { type: String, default: "tag" },
    color: { type: String, default: "#6366f1" },
  },
  { timestamps: true }
);

const Category = mongoose.model("Category", categorySchema);
export default Category;