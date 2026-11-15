import LandingContent from "../models/LandingContent.js";
import AuditLog from "../models/AuditLog.js";
import AppError from "../utils/AppError.js";
import { ok } from "../utils/api.js";
export async function getLanding(req, res, next) { try { const doc = await LandingContent.findOne({ key: "main" }).lean(); ok(res, "Landing page content fetched successfully.", { content: doc?.content || {} }); } catch (error) { next(error); } }
export async function updateLanding(req, res, next) { try { if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) throw new AppError("Landing content must be an object.", { code: "VALIDATION_ERROR", statusCode: 400 }); const doc = await LandingContent.findOneAndUpdate({ key: "main" }, { $set: { content: req.body } }, { upsert: true, new: true, runValidators: true }); await AuditLog.create({ actorId: req.user._id, action: "LANDING_PAGE_UPDATED", entityType: "LandingContent", entityId: doc._id }); ok(res, "Landing page content saved successfully.", { content: doc.content }); } catch (error) { next(error); } }
