import { env } from "../config/env.js";
import AppError from "../utils/AppError.js";
import { ok } from "../utils/api.js";
import User from "../models/User.js";
import { completeTwoFactorLogin, login, refreshSession } from "../services/authService.js";
import { authenticatorUri, createTotpSecret, protectTotpSecret, revealTotpSecret, verifyTotp } from "../services/totp.js";

const cookieOptions = { httpOnly: true, sameSite: env.cookieSameSite, secure: env.nodeEnv === "production" || env.cookieSecure, path: "/api/auth" };

export async function loginUser(req, res, next) {
  try {
    const { email, password, role, challengeToken, twoFactorCode } = req.body;
    if (challengeToken) {
      const session = await completeTwoFactorLogin({ challengeToken, code: twoFactorCode, expectedRole: role });
      res.cookie("refreshToken", session.refreshToken, cookieOptions);
      return ok(res, "Login successful.", { accessToken: session.accessToken, user: session.user });
    }
    if (typeof email !== "string" || typeof password !== "string" || password.length < 8) throw new AppError("Email and password are required.", { code: "VALIDATION_ERROR", statusCode: 400 });
    const session = await login({ email, expectedRole: role, password });
    if (session.requiresTwoFactor) return ok(res, "Enter the code from your authenticator app.", session);
    res.cookie("refreshToken", session.refreshToken, cookieOptions);
    return ok(res, "Login successful.", { accessToken: session.accessToken, user: session.user });
  } catch (error) { next(error); }
}

export async function setupTwoFactor(req, res, next) {
  try {
    const user = await User.findById(req.user._id).select("+twoFactorPendingSecret");
    if (!user) throw new AppError("User was not found.", { code: "NOT_FOUND", statusCode: 404 });
    if (user.twoFactorEnabled) throw new AppError("Two-factor authentication is already enabled.", { code: "TWO_FACTOR_ALREADY_ENABLED", statusCode: 409 });
    const secret = createTotpSecret();
    user.twoFactorPendingSecret = protectTotpSecret(secret);
    await user.save();
    ok(res, "Authenticator setup started.", { secret, otpauthUrl: authenticatorUri(secret, user.email) });
  } catch (error) { next(error); }
}

export async function enableTwoFactor(req, res, next) {
  try {
    const user = await User.findById(req.user._id).select("+twoFactorPendingSecret");
    if (!user || !user.twoFactorPendingSecret) throw new AppError("Start two-factor setup before enabling it.", { code: "TWO_FACTOR_SETUP_REQUIRED", statusCode: 409 });
    const secret = revealTotpSecret(user.twoFactorPendingSecret);
    if (!verifyTotp(secret, req.body.code)) throw new AppError("The authenticator code is invalid or expired.", { code: "INVALID_TWO_FACTOR_CODE", statusCode: 400 });
    user.twoFactorSecret = user.twoFactorPendingSecret;
    user.twoFactorPendingSecret = undefined;
    user.twoFactorEnabled = true;
    await user.save();
    ok(res, "Two-factor authentication is enabled.", { enabled: true });
  } catch (error) { next(error); }
}

export async function disableTwoFactor(req, res, next) {
  try {
    if (typeof req.body.currentPassword !== "string" || !req.body.currentPassword) throw new AppError("Current password is required.", { code: "VALIDATION_ERROR", statusCode: 400 });
    const user = await User.findById(req.user._id).select("+passwordHash +twoFactorSecret");
    if (!user || !user.twoFactorEnabled) throw new AppError("Two-factor authentication is not enabled.", { code: "TWO_FACTOR_NOT_ENABLED", statusCode: 409 });
    if (!(await user.comparePassword(req.body.currentPassword))) throw new AppError("Current password is incorrect.", { code: "UNAUTHORIZED", statusCode: 401 });
    const secret = revealTotpSecret(user.twoFactorSecret);
    if (!verifyTotp(secret, req.body.code)) throw new AppError("The authenticator code is invalid or expired.", { code: "INVALID_TWO_FACTOR_CODE", statusCode: 401 });
    user.twoFactorEnabled = false;
    user.twoFactorSecret = undefined;
    user.twoFactorPendingSecret = undefined;
    await user.save();
    ok(res, "Two-factor authentication is disabled.", { enabled: false });
  } catch (error) { next(error); }
}

export async function refreshToken(req, res, next) {
  try { res.status(200).json({ success: true, message: "Session refreshed.", data: { accessToken: await refreshSession(req.cookies.refreshToken) } }); }
  catch (error) { next(error); }
}

export function logoutUser(req, res) {
  res.clearCookie("refreshToken", cookieOptions).status(200).json({ success: true, message: "Logout successful.", data: {} });
}

export function getCurrentUser(req, res) {
  res.status(200).json({ success: true, message: "User fetched successfully.", data: { user: req.user.toSafeJSON() } });
}

export async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body;
    if (typeof currentPassword !== "string" || !currentPassword || typeof newPassword !== "string" || newPassword.length < 8) {
      throw new AppError("Enter your current password and a new password of at least 8 characters.", { code: "VALIDATION_ERROR", statusCode: 400 });
    }
    const user = await User.findById(req.user._id).select("+passwordHash");
    if (!user || !(await user.comparePassword(currentPassword))) throw new AppError("Current password is incorrect.", { code: "UNAUTHORIZED", statusCode: 401 });
    await user.setPassword(newPassword);
    await user.save();
    ok(res, "Password updated successfully.");
  } catch (error) { next(error); }
}
