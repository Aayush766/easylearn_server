import dotenv from "dotenv";

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const serverDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
dotenv.config({ path: resolve(serverDirectory, process.env.NODE_ENV === "test" ? ".env.test" : ".env") });

const parseOrigins = (value) => value.split(",").map((origin) => origin.trim()).filter(Boolean);
const nodeEnv = process.env.NODE_ENV || "development";
const productionClientOrigins = ["https://easylearnlms.netlify.app", "https://admineasylearn.netlify.app"];
const configuredClientOrigins = parseOrigins(process.env.CLIENT_URL || (nodeEnv === "production" ? "" : "http://localhost:5173,http://localhost:5174"))
  .map((origin) => origin.replace(/\/+$/, ""));
const clientOrigins = [...new Set([...configuredClientOrigins, ...productionClientOrigins])];

if (nodeEnv === "production") {
  const required = [
    ["MONGODB_URI", process.env.MONGODB_URI],
    ["JWT_ACCESS_SECRET", process.env.JWT_ACCESS_SECRET],
    ["JWT_REFRESH_SECRET", process.env.JWT_REFRESH_SECRET],
    ["CLOUDINARY_CLOUD_NAME", process.env.CLOUDINARY_CLOUD_NAME],
    ["CLOUDINARY_API_KEY", process.env.CLOUDINARY_API_KEY],
    ["CLOUDINARY_API_SECRET", process.env.CLOUDINARY_API_SECRET],
    ["SUPER_ADMIN_EMAIL", process.env.SUPER_ADMIN_EMAIL],
    ["SUPER_ADMIN_PASSWORD", process.env.SUPER_ADMIN_PASSWORD],
  ];
  const missing = required.filter(([, value]) => !value?.trim()).map(([name]) => name);
  if (missing.length) throw new Error(`Missing required production environment variables: ${missing.join(", ")}`);
  if (process.env.JWT_ACCESS_SECRET.length < 32 || process.env.JWT_REFRESH_SECRET.length < 32) throw new Error("Production JWT secrets must each be at least 32 characters.");
  if (process.env.SUPER_ADMIN_PASSWORD.length < 12) throw new Error("SUPER_ADMIN_PASSWORD must be at least 12 characters in production.");
  if (clientOrigins.some((origin) => !origin.startsWith("https://"))) throw new Error("CLIENT_URL must contain only HTTPS origins in production.");
}

export const env = Object.freeze({
  clientOrigins,
  mongoUri: process.env.MONGODB_URI || "",
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET || "",
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "15m",
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || "",
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
  cookieSecure: process.env.COOKIE_SECURE === "true",
  cookieSameSite: ["lax", "strict", "none"].includes(process.env.COOKIE_SAME_SITE) ? process.env.COOKIE_SAME_SITE : nodeEnv === "production" ? "none" : "lax",
  cloudinary: Object.freeze({ cloudName: process.env.CLOUDINARY_CLOUD_NAME || "", apiKey: process.env.CLOUDINARY_API_KEY || "", apiSecret: process.env.CLOUDINARY_API_SECRET || "" }),
  superAdmin: Object.freeze({ name: process.env.SUPER_ADMIN_NAME || "Platform Owner", email: process.env.SUPER_ADMIN_EMAIL || "", password: process.env.SUPER_ADMIN_PASSWORD || "" }),
  cloudflareStream: Object.freeze({ accountId: process.env.CLOUDFLARE_ACCOUNT_ID || "", token: process.env.CLOUDFLARE_STREAM_TOKEN || "", customerCode: process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE || "" }),
  cloudflareImages: Object.freeze({ accountId: process.env.CLOUDFLARE_IMAGES_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID || "", token: process.env.CLOUDFLARE_IMAGES_API_TOKEN || "", deliveryHash: process.env.CLOUDFLARE_IMAGES_DELIVERY_HASH || "" }),
  nodeEnv,
  port: Number.parseInt(process.env.PORT || "5000", 10),
});
