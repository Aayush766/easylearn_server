import mongoose from "mongoose";
import { env } from "./env.js";

let connectionAttempted = false;

export async function connectDatabase() {
  if (!env.mongoUri) {
    throw new Error("MONGODB_URI is required. The database-backed API cannot start without a MongoDB connection.");
  }

  if (mongoose.connection.readyState === 1) return true;
  connectionAttempted = true;
  try {
    await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 10_000 });
  } catch (error) {
    throw new Error(`MongoDB connection failed before server startup: ${error.message}`, { cause: error });
  }
  console.info(JSON.stringify({ event: "database_connected", host: mongoose.connection.host }));
  return true;
}

export function databaseHealth() {
  return {
    configured: Boolean(env.mongoUri),
    connected: mongoose.connection.readyState === 1,
    connectionAttempted,
  };
}

export async function disconnectDatabase() {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
}
