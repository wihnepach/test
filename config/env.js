require("dotenv").config();

const crypto = require("crypto");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT_DIR, "data");
const LEGACY_DATABASE_PATH =
  process.env.LEGACY_DATABASE_PATH || path.join(ROOT_DIR, "todo.db");
const DATABASE_PATH = process.env.DATABASE_PATH || path.join(DATA_DIR, "todo.db");

const ENCRYPTION_SECRET =
  process.env.AUTH_ENCRYPTION_KEY || "development-secret-change-me-before-production";

module.exports = {
  HOST: process.env.HOST || "127.0.0.1",
  PORT: Number(process.env.PORT) || 3000,
  NODE_ENV: process.env.NODE_ENV || "development",
  COOKIE_NAME: process.env.SESSION_COOKIE_NAME || "todo_session",
  SESSION_TTL_HOURS: Number(process.env.SESSION_TTL_HOURS) || 24,
  VERIFICATION_CODE_TTL_MINUTES: Number(process.env.VERIFICATION_CODE_TTL_MINUTES) || 10,
  ENCRYPTION_KEY: crypto.createHash("sha256").update(ENCRYPTION_SECRET).digest(),
  ROOT_DIR,
  PUBLIC_DIR,
  DATA_DIR,
  DATABASE_PATH,
  LEGACY_DATABASE_PATH
};
