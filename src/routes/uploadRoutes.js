import { Router } from "express";
import crypto from "node:crypto";
import { env } from "../config/env.js";
import { authenticate, authorize } from "../middleware/authenticate.js";
import { rateLimit } from "../middleware/rateLimit.js";
import AppError from "../utils/AppError.js";
import { ok } from "../utils/api.js";

const router = Router();
const allowedFormats = "7z,csv,doc,docx,epub,gif,jpeg,jpg,json,md,mov,mp4,odp,ods,odt,pdf,png,ppt,pptx,rar,rtf,txt,webm,webp,xls,xlsx,zip";
router.post("/cloudflare-image", rateLimit({ max: 20, windowMs: 60_000 }), authenticate, authorize("ADMIN", "SUPER_ADMIN"), async (req, res, next) => {
  try {
    const { accountId, token, deliveryHash } = env.cloudflareImages;
    if (!accountId || !token) throw new AppError("Cloudflare Images is not configured on the server.", { code: "MEDIA_PROVIDER_NOT_CONFIGURED", statusCode: 503 });
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/images/v2/direct_upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ requireSignedURLs: false, metadata: { uploadedBy: String(req.user._id), role: req.user.role } }),
      signal: AbortSignal.timeout(15000),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.success !== true || !result.result?.uploadURL || !result.result?.id) {
      const message = result.errors?.[0]?.message || "Cloudflare could not create a direct image upload.";
      throw new AppError(message, { code: "CLOUDFLARE_UPLOAD_FAILED", statusCode: 502 });
    }
    ok(res, "Cloudflare image upload authorized.", { uploadUrl: result.result.uploadURL, imageId: result.result.id, deliveryHash });
  } catch (error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") return next(new AppError("Cloudflare image service timed out. Try again.", { code: "CLOUDFLARE_TIMEOUT", statusCode: 504 }));
    next(error);
  }
});
router.post("/signature", rateLimit({ max: 20, windowMs: 60_000 }), authenticate, authorize("LEARNER", "TRAINER", "ADMIN", "SUPER_ADMIN"), (req, res, next) => {
  try {
    const { cloudName, apiKey, apiSecret } = env.cloudinary;
    if (!cloudName || !apiKey || !apiSecret) throw new AppError("Cloudinary is not configured on the server.", { code: "MEDIA_PROVIDER_NOT_CONFIGURED", statusCode: 503 });
    const resourceType = req.body?.resourceType || "image";
    if (!["image", "video", "raw"].includes(resourceType)) throw new AppError("Unsupported Cloudinary resource type.", { code: "VALIDATION_ERROR", statusCode: 400 });
    const extension = String(req.body?.extension || "").toLowerCase();
    if (resourceType === "raw" && !allowedFormats.split(",").includes(extension)) throw new AppError("Choose a supported document file type.", { code: "VALIDATION_ERROR", statusCode: 400 });
    const timestamp = Math.floor(Date.now() / 1000);
    const roleFolder = req.user.role.toLowerCase().replace(/[^a-z0-9_-]/g, "");
    const folder = `prime-easy-learn/${roleFolder}/${req.user.id}`;
    const publicId = `${crypto.randomUUID()}${resourceType === "raw" ? `.${extension}` : ""}`;
    const params = `allowed_formats=${allowedFormats}&folder=${folder}&overwrite=false&public_id=${publicId}&timestamp=${timestamp}`;
    const signature = crypto.createHash("sha1").update(`${params}${apiSecret}`).digest("hex");
    ok(res, "Upload signature created.", { cloudName, apiKey, timestamp, folder, allowedFormats, publicId, overwrite: false, signature, resourceType });
  } catch (error) { next(error); }
});
export default router;


