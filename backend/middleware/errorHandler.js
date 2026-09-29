export const errorHandler = (err, req, res, next) => {
  console.error("[Error]", err.message);
  if (err.name === "ValidationError") {
    const msgs = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ message: "Validation error", errors: msgs });
  }
  if (err.code === 11000) {
    return res.status(400).json({ message: "Duplicate value detected" });
  }
  if (err.name === "CastError") {
    return res.status(400).json({ message: "Invalid ID format" });
  }
  res.status(err.statusCode || 500).json({ message: err.message || "Internal server error" });
};

export const notFound = (req, res) => {
  res.status(404).json({ message: "Route not found" });
};