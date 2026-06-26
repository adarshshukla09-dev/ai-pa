// db.ts
import mongoose from "mongoose";
import dotenv from "dotenv";
import { MongoClient } from "mongodb"; // 👈 Import native client type

dotenv.config();
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://adarshpccoer_db_user:Q9I1Kg9fvODhLgev@cluster0.yc4qv05.mongodb.net/?appName=Cluster0";

if (!MONGO_URI) {
  throw new Error("Please define the MONGO_URI environment variable inside .env");
}

// Keep a placeholder for our shared native client
export let nativeMongoClient: MongoClient;

export async function connectDB() {
  try {
    // 1. Connect via Mongoose
    const mongooseInstance = await mongoose.connect(MONGO_URI);
    console.log("🚀 MongoDB connected successfully via Mongoose & Bun!");

    // 2. Extract and store the native MongoClient connection pool
    nativeMongoClient = mongooseInstance.connection.getClient() as unknown as MongoClient;
    
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
    process.exit(1);
  }
}