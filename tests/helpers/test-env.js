const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..", "..");

const MODULES_TO_CLEAR = [
  "config/env.js",
  "server/app.js",
  "server/db/database.js",
  "server/middleware/auth.middleware.js",
  "server/routes/auth.routes.js",
  "server/routes/tasks.routes.js",
  "server/services/auth.service.js",
  "server/services/tasks.service.js",
  "server/utils/crypto.js"
];

function initTestEnvironment(suiteName) {
  const normalizedName = String(suiteName || "suite")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
  const tempRoot = path.join(ROOT_DIR, ".tmp-tests");
  fs.mkdirSync(tempRoot, { recursive: true });
  const tempDir = fs.mkdtempSync(path.join(tempRoot, `todo-${normalizedName}-`));

  process.env.NODE_ENV = "development";
  process.env.AUTH_ENCRYPTION_KEY = "test-encryption-key";
  process.env.SESSION_COOKIE_NAME = `todo_session_${normalizedName}`;
  process.env.DATA_DIR = tempDir;
  process.env.DATABASE_PATH = path.join(tempDir, "todo.test.db");
  process.env.LEGACY_DATABASE_PATH = path.join(tempDir, "legacy.todo.test.db");

  purgeModuleCache();

  return {
    tempDir
  };
}

function purgeModuleCache() {
  for (const relativePath of MODULES_TO_CLEAR) {
    const absolutePath = path.join(ROOT_DIR, relativePath);

    try {
      delete require.cache[require.resolve(absolutePath)];
    } catch (error) {
      // Ignore modules that are not loaded yet.
    }
  }
}

function resetDatabase(db) {
  db.exec(`
    DELETE FROM sessions;
    DELETE FROM tasks;
    DELETE FROM users;
  `);
}

module.exports = {
  initTestEnvironment,
  resetDatabase
};
