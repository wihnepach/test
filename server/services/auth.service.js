const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");

const env = require("../../config/env");
const db = require("../db/database");
const {
  hashValue,
  encryptValue,
  decryptValue,
  generateVerificationCode,
  maskContact
} = require("../utils/crypto");
const {
  normalizeRegistrationPayload,
  normalizeLoginPayload,
  normalizeVerificationPayload,
  validateRegistrationPayload,
  validateLoginPayload,
  validateVerificationPayload,
  buildContactKey
} = require("../utils/validators");
const { createErrorResult, createValidationError } = require("../utils/errors");

async function registerUser(payload) {
  const validationDetails = validateRegistrationPayload(payload);

  if (validationDetails.length > 0) {
    return createValidationError(validationDetails, "Registration payload is invalid.");
  }

  const normalizedPayload = normalizeRegistrationPayload(payload);
  const contactHash = hashValue(
    buildContactKey(normalizedPayload.contactType, normalizedPayload.contact)
  );
  const existingUser = db.prepare("SELECT id, isVerified FROM users WHERE contactHash = ?").get(contactHash);

  if (existingUser) {
    return createErrorResult(
      409,
      "CONTACT_EXISTS",
      existingUser.isVerified
        ? "User with this contact already exists."
        : "Contact already exists but is not verified yet."
    );
  }

  const verificationCode = generateVerificationCode();
  const user = {
    id: uuidv4(),
    name: normalizedPayload.name,
    contactType: normalizedPayload.contactType,
    encryptedContact: encryptValue(normalizedPayload.contact),
    contactHash,
    passwordHash: await bcrypt.hash(normalizedPayload.password, 12),
    isVerified: 0,
    verificationCodeHash: hashValue(verificationCode),
    verificationExpiresAt: Date.now() + env.VERIFICATION_CODE_TTL_MINUTES * 60 * 1000,
    createdAt: Date.now()
  };

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

  return {
    status: 201,
    body: {
      message: `Verification code sent to ${
        normalizedPayload.contactType === "email" ? "email" : "phone"
      }.`,
      pendingContact: normalizedPayload.contact,
      contactType: normalizedPayload.contactType,
      verificationPreview: env.NODE_ENV === "development" ? verificationCode : undefined
    }
  };
}

function verifyUser(payload) {
  const validationDetails = validateVerificationPayload(payload);

  if (validationDetails.length > 0) {
    return createValidationError(validationDetails, "Verification payload is invalid.");
  }

  const normalizedPayload = normalizeVerificationPayload(payload);
  const contactHash = hashValue(
    buildContactKey(normalizedPayload.contactType, normalizedPayload.contact)
  );
  const user = db.prepare("SELECT * FROM users WHERE contactHash = ?").get(contactHash);

  if (!user) {
    return createErrorResult(404, "USER_NOT_FOUND", "User not found.");
  }

  if (user.isVerified) {
    return createErrorResult(400, "CONTACT_ALREADY_VERIFIED", "Contact is already verified.");
  }

  if (!user.verificationCodeHash || Date.now() > user.verificationExpiresAt) {
    return createErrorResult(400, "VERIFICATION_CODE_EXPIRED", "Verification code expired.");
  }

  if (hashValue(normalizedPayload.code) !== user.verificationCodeHash) {
    return createErrorResult(400, "INVALID_VERIFICATION_CODE", "Invalid verification code.");
  }

  db.prepare(
    `
    UPDATE users
    SET isVerified = 1,
        verificationCodeHash = NULL,
        verificationExpiresAt = NULL
    WHERE id = ?
    `
  ).run(user.id);

  const sessionUser = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id);

  return {
    status: 200,
    body: {
      message: "Contact verified successfully. You are now logged in.",
      user: serializeUser(sessionUser)
    },
    userId: sessionUser.id
  };
}

function resendVerificationCode(payload) {
  const validationDetails = validateVerificationPayload({
    ...payload,
    code: "000000"
  }).filter((item) => item.field !== "code");

  if (validationDetails.length > 0) {
    return createValidationError(validationDetails, "Verification resend payload is invalid.");
  }

  const normalizedPayload = normalizeVerificationPayload(payload);
  const contactHash = hashValue(
    buildContactKey(normalizedPayload.contactType, normalizedPayload.contact)
  );
  const user = db.prepare("SELECT * FROM users WHERE contactHash = ?").get(contactHash);

  if (!user) {
    return createErrorResult(404, "USER_NOT_FOUND", "User not found.");
  }

  if (user.isVerified) {
    return createErrorResult(400, "CONTACT_ALREADY_VERIFIED", "Contact is already verified.");
  }

  const verificationCode = generateVerificationCode();

  db.prepare(
    `
    UPDATE users
    SET verificationCodeHash = ?,
        verificationExpiresAt = ?
    WHERE id = ?
    `
  ).run(
    hashValue(verificationCode),
    Date.now() + env.VERIFICATION_CODE_TTL_MINUTES * 60 * 1000,
    user.id
  );

  return {
    status: 200,
    body: {
      message: "New verification code generated.",
      verificationPreview: env.NODE_ENV === "development" ? verificationCode : undefined
    }
  };
}

async function loginUser(payload) {
  const validationDetails = validateLoginPayload(payload);

  if (validationDetails.length > 0) {
    return createValidationError(validationDetails, "Login payload is invalid.");
  }

  const normalizedPayload = normalizeLoginPayload(payload);
  const contactHash = hashValue(
    buildContactKey(normalizedPayload.contactType, normalizedPayload.contact)
  );
  const user = db.prepare("SELECT * FROM users WHERE contactHash = ?").get(contactHash);

  if (!user) {
    return createErrorResult(401, "INVALID_CREDENTIALS", "Invalid login or password.");
  }

  if (!user.isVerified) {
    return createErrorResult(
      403,
      "CONTACT_NOT_VERIFIED",
      "Please verify email or phone before logging in."
    );
  }

  const passwordMatches = await bcrypt.compare(normalizedPayload.password, user.passwordHash);

  if (!passwordMatches) {
    return createErrorResult(401, "INVALID_CREDENTIALS", "Invalid login or password.");
  }

  return {
    status: 200,
    body: {
      message: "Login successful.",
      user: serializeUser(user)
    },
    userId: user.id
  };
}

function getSessionUser(request) {
  const token = request.cookies[env.COOKIE_NAME];

  if (!token) {
    return null;
  }

  db.prepare("DELETE FROM sessions WHERE expiresAt <= ?").run(Date.now());

  return (
    db.prepare(
      `
      SELECT sessions.userId, users.*
      FROM sessions
      JOIN users ON users.id = sessions.userId
      WHERE sessions.tokenHash = ? AND sessions.expiresAt > ?
      `
    ).get(hashValue(token), Date.now()) || null
  );
}

function createSession(response, userId) {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + env.SESSION_TTL_HOURS * 60 * 60 * 1000;

  db.prepare("DELETE FROM sessions WHERE userId = ?").run(userId);
  db.prepare(
    `
    INSERT INTO sessions (id, userId, tokenHash, expiresAt, createdAt)
    VALUES (?, ?, ?, ?, ?)
    `
  ).run(uuidv4(), userId, hashValue(rawToken), expiresAt, Date.now());

  response.cookie(env.COOKIE_NAME, rawToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    maxAge: env.SESSION_TTL_HOURS * 60 * 60 * 1000
  });
}

function destroySession(request, response) {
  const token = request.cookies[env.COOKIE_NAME];

  if (token) {
    db.prepare("DELETE FROM sessions WHERE tokenHash = ?").run(hashValue(token));
  }

  response.clearCookie(env.COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production"
  });
}

function serializeUser(user) {
  const decryptedContact = decryptValue(user.encryptedContact);

  return {
    id: user.id,
    name: user.name,
    contactType: user.contactType,
    contactMasked: maskContact(user.contactType, decryptedContact),
    isVerified: Boolean(user.isVerified),
    createdAt: user.createdAt
  };
}

module.exports = {
  registerUser,
  verifyUser,
  resendVerificationCode,
  loginUser,
  getSessionUser,
  createSession,
  destroySession,
  serializeUser
};
