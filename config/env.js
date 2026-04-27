require("dotenv").config();

const crypto = require("crypto");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT_DIR, "data");
const LEGACY_DATABASE_PATH = process.env.LEGACY_DATABASE_PATH || path.join(ROOT_DIR, "todo.db");
const DATABASE_PATH = process.env.DATABASE_PATH || path.join(DATA_DIR, "todo.db");

const ENCRYPTION_SECRET =
  process.env.AUTH_ENCRYPTION_KEY || "development-secret-change-me-before-production";
const CORS_ALLOWED_ORIGINS = String(process.env.CORS_ALLOWED_ORIGINS || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;
const VERIFICATION_CODE_PREVIEW =
  String(process.env.VERIFICATION_CODE_PREVIEW || "").toLowerCase() === "true";

module.exports = {
  HOST: process.env.HOST || "127.0.0.1",
  PORT: Number(process.env.PORT) || 3000,
  NODE_ENV: process.env.NODE_ENV || "development",
  COOKIE_NAME: process.env.SESSION_COOKIE_NAME || "todo_session",
  SESSION_TTL_HOURS: Number(process.env.SESSION_TTL_HOURS) || 24,
  VERIFICATION_CODE_TTL_MINUTES: Number(process.env.VERIFICATION_CODE_TTL_MINUTES) || 10,
  AUTH_RATE_LIMIT_WINDOW_MS: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS) || 60 * 1000,
  AUTH_RATE_LIMIT_MAX: Number(process.env.AUTH_RATE_LIMIT_MAX) || 20,
  LOGIN_ATTEMPT_WINDOW_MS: Number(process.env.LOGIN_ATTEMPT_WINDOW_MS) || 15 * 60 * 1000,
  LOGIN_MAX_ATTEMPTS: Number(process.env.LOGIN_MAX_ATTEMPTS) || 5,
  LOGIN_BLOCK_MS: Number(process.env.LOGIN_BLOCK_MS) || 15 * 60 * 1000,
  LOGIN_FAILURE_DELAY_MS: Number(process.env.LOGIN_FAILURE_DELAY_MS) || 300,
  SMTP_HOST: process.env.SMTP_HOST || "",
  SMTP_PORT,
  SMTP_SECURE: String(process.env.SMTP_SECURE || "").toLowerCase() === "true",
  SMTP_USER: process.env.SMTP_USER || "",
  SMTP_PASS: process.env.SMTP_PASS || "",
  EMAIL_FROM:
    process.env.EMAIL_FROM || process.env.SMTP_USER || "TaskFlow <no-reply@taskflow.local>",
  EMAIL_REQUIRE_DELIVERY:
    process.env.EMAIL_REQUIRE_DELIVERY !== undefined
      ? String(process.env.EMAIL_REQUIRE_DELIVERY).toLowerCase() === "true"
      : !VERIFICATION_CODE_PREVIEW,
  VERIFICATION_CODE_PREVIEW,
  CORS_ALLOWED_ORIGINS,
  ENCRYPTION_KEY: crypto.createHash("sha256").update(ENCRYPTION_SECRET).digest(),
  ROOT_DIR,
  PUBLIC_DIR,
  DATA_DIR,
  DATABASE_PATH,
  LEGACY_DATABASE_PATH
};
