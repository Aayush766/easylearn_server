import { env } from "../config/env.js";

function errorHandler(error, req, res, next) {
  let statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
  let code = error.code || "INTERNAL_ERROR";
  if (["MongooseServerSelectionError", "MongoNetworkError", "MongoNetworkTimeoutError"].includes(error.name)) {
    statusCode = 503;
    code = "DATABASE_UNAVAILABLE";
    error.message = "The database is unavailable. Check the MongoDB connection and try again.";
  }
  if (error.name === "ValidationError") { statusCode = 400; code = "VALIDATION_ERROR"; }
  if (error.name === "CastError") { statusCode = 404; code = "NOT_FOUND"; }
  if (error.code === 11000) { statusCode = 409; code = "DUPLICATE_RESOURCE"; error.message = "A record with this value already exists."; }

  if (statusCode >= 500) {
    console.error(JSON.stringify({ code, method: req.method, path: req.originalUrl, timestamp: new Date().toISOString() }));
  }

  res.status(statusCode).json({
    success: false,
    message: statusCode >= 500 && env.nodeEnv === "production" ? "Something went wrong." : error.message || "Something went wrong.",
    code,
  });
}

export default errorHandler;
