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
  isValidContact,
  buildContactKey
} = require("../utils/validators");

async function registerUser(payload) {
  const normalizedPayload = normalizeRegistrationPayload(payload);

  if (!normalizedPayload.name || !normalizedPayload.contact || !normalizedPayload.password) {
    return { status: 400, body: { message: "Заполните имя, контакт и пароль." } };
  }

  if (!isValidContact(normalizedPayload.contactType, normalizedPayload.contact)) {
    return { status: 400, body: { message: "Укажите корректный email или номер телефона." } };
  }

  if (normalizedPayload.password.length < 8) {
    return { status: 400, body: { message: "Пароль должен содержать минимум 8 символов." } };
  }

  const contactHash = hashValue(
    buildContactKey(normalizedPayload.contactType, normalizedPayload.contact)
  );
  const existingUser = db.prepare("SELECT id, isVerified FROM users WHERE contactHash = ?").get(contactHash);

  if (existingUser) {
    return {
      status: 409,
      body: {
        message: existingUser.isVerified
          ? "Пользователь с таким контактом уже зарегистрирован."
          : "Контакт уже зарегистрирован, подтвердите его кодом."
      }
    };
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
      message: `Код подтверждения отправлен на ${
        normalizedPayload.contactType === "email" ? "email" : "телефон"
      }.`,
      pendingContact: normalizedPayload.contact,
      contactType: normalizedPayload.contactType,
      verificationPreview: env.NODE_ENV === "development" ? verificationCode : undefined
    }
  };
}

function verifyUser(payload) {
  const normalizedPayload = normalizeVerificationPayload(payload);

  if (!normalizedPayload.contact || !normalizedPayload.code) {
    return { status: 400, body: { message: "Введите контакт и код подтверждения." } };
  }

  const contactHash = hashValue(
    buildContactKey(normalizedPayload.contactType, normalizedPayload.contact)
  );
  const user = db.prepare("SELECT * FROM users WHERE contactHash = ?").get(contactHash);

  if (!user) {
    return { status: 404, body: { message: "Пользователь не найден." } };
  }

  if (user.isVerified) {
    return { status: 400, body: { message: "Контакт уже подтвержден." } };
  }

  if (!user.verificationCodeHash || Date.now() > user.verificationExpiresAt) {
    return { status: 400, body: { message: "Код подтверждения истек. Запросите новый." } };
  }

  if (hashValue(normalizedPayload.code) !== user.verificationCodeHash) {
    return { status: 400, body: { message: "Неверный код подтверждения." } };
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
      message: "Контакт успешно подтвержден. Вы вошли в систему.",
      user: serializeUser(sessionUser)
    },
    userId: sessionUser.id
  };
}

function resendVerificationCode(payload) {
  const normalizedPayload = normalizeVerificationPayload(payload);

  if (!normalizedPayload.contact) {
    return { status: 400, body: { message: "Введите email или номер телефона." } };
  }

  const contactHash = hashValue(
    buildContactKey(normalizedPayload.contactType, normalizedPayload.contact)
  );
  const user = db.prepare("SELECT * FROM users WHERE contactHash = ?").get(contactHash);

  if (!user) {
    return { status: 404, body: { message: "Пользователь не найден." } };
  }

  if (user.isVerified) {
    return { status: 400, body: { message: "Контакт уже подтвержден." } };
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
      message: "Новый код подтверждения сформирован.",
      verificationPreview: env.NODE_ENV === "development" ? verificationCode : undefined
    }
  };
}

async function loginUser(payload) {
  const normalizedPayload = normalizeLoginPayload(payload);

  if (!normalizedPayload.contact || !normalizedPayload.password) {
    return { status: 400, body: { message: "Введите контакт и пароль." } };
  }

  const contactHash = hashValue(
    buildContactKey(normalizedPayload.contactType, normalizedPayload.contact)
  );
  const user = db.prepare("SELECT * FROM users WHERE contactHash = ?").get(contactHash);

  if (!user) {
    return { status: 401, body: { message: "Неверный логин или пароль." } };
  }

  if (!user.isVerified) {
    return { status: 403, body: { message: "Сначала подтвердите email или номер телефона." } };
  }

  const passwordMatches = await bcrypt.compare(normalizedPayload.password, user.passwordHash);

  if (!passwordMatches) {
    return { status: 401, body: { message: "Неверный логин или пароль." } };
  }

  return {
    status: 200,
    body: {
      message: "Вход выполнен успешно.",
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
