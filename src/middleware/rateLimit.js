import AppError from "../utils/AppError.js";

const windows = new Map();
const MAX_KEYS = 20_000;

export function rateLimit({ max = 100, windowMs = 60_000 } = {}) {
  return (req, res, next) => {
    const now = Date.now();
    const key = `${req.ip}:${req.baseUrl}`;
    let state = windows.get(key);
    if (!state || now >= state.resetAt) state = { count: 0, resetAt: now + windowMs };
    state.count += 1;
    windows.set(key, state);

    if (windows.size > MAX_KEYS) {
      for (const [entryKey, entry] of windows) if (now >= entry.resetAt) windows.delete(entryKey);
      while (windows.size > MAX_KEYS) windows.delete(windows.keys().next().value);
    }

    res.set("RateLimit-Limit", String(max));
    res.set("RateLimit-Remaining", String(Math.max(0, max - state.count)));
    if (state.count > max) return next(new AppError("Too many requests. Please try again later.", { code: "RATE_LIMITED", statusCode: 429 }));
    next();
  };
}
