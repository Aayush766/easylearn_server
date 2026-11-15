import { databaseHealth } from "../config/db.js";

export function getHealth(req, res) {
  res.status(200).json({
    success: true,
    message: "API is healthy",
    data: { database: databaseHealth(), environment: process.env.NODE_ENV || "development" },
  });
}
