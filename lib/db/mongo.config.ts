// db.ts
import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  throw new Error("Please define the MONGO_URI environment variable inside .env");
}

export async function connectDB() {
  try {
    await mongoose.connect(MONGO_URI!);
    console.log("🚀 MongoDB connected successfully via Bun!");
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
    process.exit(1);
  }
}