import mongoose from "mongoose";
import AppError from "./AppError.js";

export const ok = (res, message, data = {}, status = 200) => res.status(status).json({ success: true, message, data });
export const assertObjectId = (id, label = "Resource") => { if (!mongoose.isValidObjectId(id)) throw new AppError(`${label} was not found.`, { code: "NOT_FOUND", statusCode: 404 }); };
export const parsePagination = (query) => ({ page: Math.max(1, Number.parseInt(query.page, 10) || 1), limit: Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 20)) });
export async function list(Model, filter, query, populate = "", sort = { createdAt: -1 }) { const { page, limit } = parsePagination(query); const [items, total] = await Promise.all([Model.find(filter).populate(populate).sort(sort).skip((page - 1) * limit).limit(limit), Model.countDocuments(filter)]); return { items, page, limit, total, totalPages: Math.ceil(total / limit) }; }
