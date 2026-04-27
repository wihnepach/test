const db = require("../db/database");

function findUserByContactHash(contactHash) {
  return db.prepare("SELECT * FROM users WHERE contactHash = ?").get(contactHash);
}

function findUserIdentityByContactHash(contactHash) {
  return db.prepare("SELECT id, isVerified FROM users WHERE contactHash = ?").get(contactHash);
}

function createUser(user) {
  db.prepare(
    `
    INSERT INTO users (
      id, name, contactType, encryptedContact, contactHash, passwordHash,
      isVerified, verificationCodeHash, verificationExpiresAt, createdAt
    )
    VALUES (
      @id, @name, @contactType, @encryptedContact, @contactHash, @passwordHash,
      @isVerified, @verificationCodeHash, @verificationExpiresAt, @createdAt
    )
    `
  ).run(user);
}

function verifyUserById(userId) {
  db.prepare(
    `
    UPDATE users
    SET isVerified = 1,
        verificationCodeHash = NULL,
        verificationExpiresAt = NULL
    WHERE id = ?
    `
  ).run(userId);
}

function updateVerificationCode(userId, verificationCodeHash, verificationExpiresAt) {
  db.prepare(
    `
    UPDATE users
    SET verificationCodeHash = ?,
        verificationExpiresAt = ?
    WHERE id = ?
    `
  ).run(verificationCodeHash, verificationExpiresAt, userId);
}

function updateLoginCode(userId, loginCodeHash, loginCodeExpiresAt) {
  db.prepare(
    `
    UPDATE users
    SET loginCodeHash = ?,
        loginCodeExpiresAt = ?
    WHERE id = ?
    `
  ).run(loginCodeHash, loginCodeExpiresAt, userId);
}

function updateEncryptedContact(userId, encryptedContact) {
  db.prepare(
    `
    UPDATE users
    SET encryptedContact = ?
    WHERE id = ?
    `
  ).run(encryptedContact, userId);
}

function clearLoginCode(userId) {
  db.prepare(
    `
    UPDATE users
    SET loginCodeHash = NULL,
        loginCodeExpiresAt = NULL
    WHERE id = ?
    `
  ).run(userId);
}

function findUserById(userId) {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
}

function deleteExpiredSessions(currentTimestamp) {
  db.prepare("DELETE FROM sessions WHERE expiresAt <= ?").run(currentTimestamp);
}

function findSessionUserByTokenHash(tokenHash, currentTimestamp) {
  return (
    db
      .prepare(
        `
      SELECT sessions.userId, users.*
      , sessions.expiresAt AS sessionExpiresAt
      , sessions.createdAt AS sessionCreatedAt
      FROM sessions
      JOIN users ON users.id = sessions.userId
      WHERE sessions.tokenHash = ? AND sessions.expiresAt > ?
      `
      )
      .get(tokenHash, currentTimestamp) || null
  );
}

function deleteSessionsByUserId(userId) {
  db.prepare("DELETE FROM sessions WHERE userId = ?").run(userId);
}

function countSessionsByUserId(userId) {
  return db.prepare("SELECT COUNT(*) AS count FROM sessions WHERE userId = ?").get(userId).count;
}

function createSession(session) {
  db.prepare(
    `
    INSERT INTO sessions (id, userId, tokenHash, expiresAt, createdAt)
    VALUES (?, ?, ?, ?, ?)
    `
  ).run(session.id, session.userId, session.tokenHash, session.expiresAt, session.createdAt);
}

function deleteSessionByTokenHash(tokenHash) {
  db.prepare("DELETE FROM sessions WHERE tokenHash = ?").run(tokenHash);
}

module.exports = {
  findUserByContactHash,
  findUserIdentityByContactHash,
  createUser,
  verifyUserById,
  updateVerificationCode,
  updateLoginCode,
  updateEncryptedContact,
  clearLoginCode,
  findUserById,
  deleteExpiredSessions,
  findSessionUserByTokenHash,
  deleteSessionsByUserId,
  countSessionsByUserId,
  createSession,
  deleteSessionByTokenHash
};
