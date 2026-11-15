import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import AppError from "../utils/AppError.js";
import User from "../models/User.js";
import { revealTotpSecret, verifyTotp } from "./totp.js";

const assertJwtConfig = () => {
  if (!env.jwtAccessSecret || !env.jwtRefreshSecret) throw new AppError("Authentication is not configured.", { code: "AUTH_NOT_CONFIGURED", statusCode: 503 });
};

function issueSession(user, twoFactorVerified = false) {
  const claims = { role: user.role, ...(twoFactorVerified ? { mfa: true } : {}) };
  return {
    accessToken: jwt.sign(claims, env.jwtAccessSecret, { expiresIn: env.jwtAccessExpiresIn, subject: user.id }),
    refreshToken: jwt.sign(claims, env.jwtRefreshSecret, { expiresIn: env.jwtRefreshExpiresIn, subject: user.id }),
    user: user.toSafeJSON(),
  };
}

export async function login({ email, password, expectedRole }) {
  assertJwtConfig();
  const user = await User.findOne({ email: email.toLowerCase() }).select("+passwordHash");
  if (!user || user.status !== "ACTIVE" || !(await user.comparePassword(password))) throw new AppError("Invalid email or password.", { code: "UNAUTHORIZED", statusCode: 401 });
  if (expectedRole && user.role !== expectedRole) throw new AppError("This account cannot use this login portal.", { code: "FORBIDDEN", statusCode: 403 });
  if (user.twoFactorEnabled) {
    const challengeToken = jwt.sign({ role: user.role, purpose: "2fa" }, env.jwtAccessSecret, { expiresIn: "5m", subject: user.id });
    return { requiresTwoFactor: true, challengeToken };
  }
  user.lastLoginAt = new Date();
  await user.save();
  return issueSession(user, false);
}

export async function completeTwoFactorLogin({ challengeToken, code, expectedRole }) {
  assertJwtConfig();
  let claims;
  try { claims = jwt.verify(challengeToken, env.jwtAccessSecret); }
  catch { throw new AppError("The two-factor login challenge expired. Sign in again.", { code: "UNAUTHORIZED", statusCode: 401 }); }
  if (claims.purpose !== "2fa" || !claims.sub) throw new AppError("Invalid two-factor login challenge.", { code: "UNAUTHORIZED", statusCode: 401 });
  const user = await User.findById(claims.sub).select("+twoFactorSecret");
  if (!user || user.status !== "ACTIVE" || !user.twoFactorEnabled || user.role !== claims.role || (expectedRole && user.role !== expectedRole)) {
    throw new AppError("This two-factor login challenge is no longer valid.", { code: "UNAUTHORIZED", statusCode: 401 });
  }
  let secret;
  try { secret = revealTotpSecret(user.twoFactorSecret); }
  catch { throw new AppError("Two-factor authentication needs to be set up again.", { code: "TWO_FACTOR_SETUP_REQUIRED", statusCode: 409 }); }
  if (!verifyTotp(secret, code)) throw new AppError("The authenticator code is invalid or expired.", { code: "INVALID_TWO_FACTOR_CODE", statusCode: 401 });
  user.lastLoginAt = new Date();
  await user.save();
  return issueSession(user, true);
}

export function verifyAccessToken(token) {
  assertJwtConfig();
  return jwt.verify(token, env.jwtAccessSecret);
}

export async function refreshSession(token) {
  assertJwtConfig();
  let claims;
  try { claims = jwt.verify(token, env.jwtRefreshSecret); }
  catch { throw new AppError("Session expired or invalid.", { code: "UNAUTHORIZED", statusCode: 401 }); }
  const user = await User.findById(claims.sub);
  if (!user || user.status !== "ACTIVE" || user.role !== claims.role || (user.twoFactorEnabled && claims.mfa !== true)) {
    throw new AppError("Sign in again to refresh this session.", { code: "UNAUTHORIZED", statusCode: 401 });
  }
  return jwt.sign({ role: user.role, ...(claims.mfa === true ? { mfa: true } : {}) }, env.jwtAccessSecret, { expiresIn: env.jwtAccessExpiresIn, subject: user.id });
}
