import mongoose from "mongoose";
import { env } from "./env.js";

let connectionAttempted = false;

export async function connectDatabase() {
  if (!env.mongoUri) {
    if (env.nodeEnv === "production") throw new Error("MONGODB_URI is required in production.");
    return false;
  }

  connectionAttempted = true;
  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 10_000 });
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
