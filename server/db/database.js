const fs = require("fs");
const Database = require("better-sqlite3");

const env = require("../../config/env");

fs.mkdirSync(env.DATA_DIR, { recursive: true });

const resolvedDatabasePath =
  fs.existsSync(env.DATABASE_PATH) || !fs.existsSync(env.LEGACY_DATABASE_PATH)
    ? env.DATABASE_PATH
    : env.LEGACY_DATABASE_PATH;

const db = new Database(resolvedDatabasePath);

setupDatabase();

module.exports = db;

function setupDatabase() {
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      contactType TEXT NOT NULL,
      encryptedContact TEXT NOT NULL,
      contactHash TEXT NOT NULL UNIQUE,
      passwordHash TEXT NOT NULL,
      isVerified INTEGER NOT NULL DEFAULT 0,
      verificationCodeHash TEXT,
      verificationExpiresAt INTEGER,
      createdAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      tokenHash TEXT NOT NULL UNIQUE,
      expiresAt INTEGER NOT NULL,
      createdAt INTEGER NOT NULL,
      FOREIGN KEY (userId) REFERENCES users (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      userId TEXT,
      title TEXT NOT NULL,
      category TEXT DEFAULT '',
      priority TEXT NOT NULL DEFAULT 'medium',
      deadline TEXT DEFAULT '',
      completed INTEGER NOT NULL DEFAULT 0,
      createdAt INTEGER NOT NULL,
      FOREIGN KEY (userId) REFERENCES users (id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_tokenHash ON sessions (tokenHash);
  `);

  const columns = db
    .prepare("PRAGMA table_info(tasks)")
    .all()
    .map((column) => column.name);

  if (!columns.includes("userId")) {
    db.exec("ALTER TABLE tasks ADD COLUMN userId TEXT");
  }

  db.exec("CREATE INDEX IF NOT EXISTS idx_tasks_userId ON tasks (userId)");
}
