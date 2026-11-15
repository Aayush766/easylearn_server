import crypto from "node:crypto";
import { env } from "../config/env.js";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const issuer = "Prime Easy Learn";

export function createTotpSecret() {
  const bytes = crypto.randomBytes(20);
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
      value &= (1 << bits) - 1;
    }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}

function decodeBase32(value) {
  let bits = 0;
  let buffer = 0;
  const output = [];
  for (const char of value.replace(/=+$/g, "").toUpperCase()) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error("Invalid authenticator secret.");
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
      buffer &= (1 << bits) - 1;
    }
  }
  return Buffer.from(output);
}

export function protectTotpSecret(secret) {
  const key = crypto.createHash("sha256").update(env.jwtAccessSecret).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(part => part.toString("base64url")).join(".");
}

export function revealTotpSecret(value) {
  const [iv, tag, data] = value.split(".").map(part => Buffer.from(part, "base64url"));
  const key = crypto.createHash("sha256").update(env.jwtAccessSecret).digest();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

function codeAt(secret, timeStep) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(timeStep));
  const digest = crypto.createHmac("sha1", decodeBase32(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  const binary = ((digest[offset] & 127) << 24) | ((digest[offset + 1] & 255) << 16) | ((digest[offset + 2] & 255) << 8) | (digest[offset + 3] & 255);
  return String(binary % 1_000_000).padStart(6, "0");
}

export function verifyTotp(secret, suppliedCode) {
  const code = String(suppliedCode || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return false;
  const currentStep = Math.floor(Date.now() / 30_000);
  const candidate = Buffer.from(code);
  for (let offset = -1; offset <= 1; offset += 1) {
    const expected = Buffer.from(codeAt(secret, currentStep + offset));
    if (crypto.timingSafeEqual(candidate, expected)) return true;
  }
  return false;
}

export function authenticatorUri(secret, email) {
  const label = encodeURIComponent(`${issuer}:${email}`);
  const query = new URLSearchParams({ secret, issuer, algorithm: "SHA1", digits: "6", period: "30" });
  return `otpauth://totp/${label}?${query.toString()}`;
}
