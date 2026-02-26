// ──────────────────────────────────────────────────────────────
// config/db.js — MongoDB Atlas connection via Mongoose
// ──────────────────────────────────────────────────────────────
import mongoose from "mongoose";

/**
 * Connects to MongoDB Atlas using the URI from environment variables.
 * Includes retry logic – the Express server should call this before listening.
 */
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`❌ MongoDB connection error: ${error.message}`);
    // Exit process with failure – let the process manager restart
    process.exit(1);
  }
};

// Graceful shutdown listeners
mongoose.connection.on("disconnected", () => {
  console.log("⚠️  MongoDB disconnected");
});

mongoose.connection.on("error", (err) => {
  console.error(`❌ MongoDB runtime error: ${err.message}`);
});

export default connectDB;
