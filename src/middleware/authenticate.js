import User from "../models/User.js";
import AppError from "../utils/AppError.js";
import { verifyAccessToken } from "../services/authService.js";

export async function authenticate(req, res, next) {
  try {
    const token = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null;
    if (!token) throw new AppError("Authentication is required.", { code: "UNAUTHORIZED", statusCode: 401 });
    const claims = verifyAccessToken(token);
    if (claims.purpose === "2fa") throw new AppError("Authentication is required.", { code: "UNAUTHORIZED", statusCode: 401 });
    const user = await User.findById(claims.sub);
    if (!user || user.status !== "ACTIVE") throw new AppError("Authentication is required.", { code: "UNAUTHORIZED", statusCode: 401 });
    req.user = user;
    next();
  } catch (error) { next(error.statusCode ? error : new AppError("Session expired or invalid.", { code: "UNAUTHORIZED", statusCode: 401 })); }
}

export const authorize = (...roles) => (req, res, next) => roles.includes(req.user.role) ? next() : next(new AppError("You do not have permission for this action.", { code: "FORBIDDEN", statusCode: 403 }));
