const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");

const env = require("../../config/env");
const authRepository = require("../repositories/auth.repository");
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
const {
  toUserDto,
  toRegisterResponse,
  toVerificationSuccessResponse,
  toLoginSuccessResponse
} = require("../dto/auth.dto");
const { createErrorResult, createValidationError } = require("../utils/errors");

const loginSecurityState = new Map();

async function registerUser(payload) {
  const validationDetails = validateRegistrationPayload(payload);

  if (validationDetails.length > 0) {
    return createValidationError(validationDetails, "Registration payload is invalid.");
  }

  const normalizedPayload = normalizeRegistrationPayload(payload);
  const contactHash = hashValue(
    buildContactKey(normalizedPayload.contactType, normalizedPayload.contact)
  );
  const existingUser = authRepository.findUserIdentityByContactHash(contactHash);

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

  authRepository.createUser(user);

  return {
    status: 201,
    body: toRegisterResponse(
      normalizedPayload.contactType,
      normalizedPayload.contact,
      env.NODE_ENV === "development" ? verificationCode : undefined
    )
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
  const user = authRepository.findUserByContactHash(contactHash);

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

  authRepository.verifyUserById(user.id);

  const sessionUser = authRepository.findUserById(user.id);

  return {
    status: 200,
    body: toVerificationSuccessResponse(serializeUser(sessionUser)),
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
  const user = authRepository.findUserByContactHash(contactHash);

  if (!user) {
    return createErrorResult(404, "USER_NOT_FOUND", "User not found.");
  }

  if (user.isVerified) {
    return createErrorResult(400, "CONTACT_ALREADY_VERIFIED", "Contact is already verified.");
  }

  const verificationCode = generateVerificationCode();

  authRepository.updateVerificationCode(
    user.id,
    hashValue(verificationCode),
    Date.now() + env.VERIFICATION_CODE_TTL_MINUTES * 60 * 1000
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
  const blockedState = getBlockedLoginState(contactHash);

  if (blockedState) {
    return createErrorResult(429, "LOGIN_BLOCKED", "Too many failed login attempts.", {
      retryAfterSeconds: Math.max(1, Math.ceil((blockedState.blockedUntil - Date.now()) / 1000))
    });
  }

  const user = authRepository.findUserByContactHash(contactHash);

  if (!user) {
    markFailedLoginAttempt(contactHash);
    await delayFailureResponse();
    return createErrorResult(401, "INVALID_CREDENTIALS", "Invalid login or password.");
  }

  if (!user.isVerified) {
    markFailedLoginAttempt(contactHash);
    await delayFailureResponse();
    return createErrorResult(
      403,
      "CONTACT_NOT_VERIFIED",
      "Please verify email or phone before logging in."
    );
  }

  const passwordMatches = await bcrypt.compare(normalizedPayload.password, user.passwordHash);

  if (!passwordMatches) {
    markFailedLoginAttempt(contactHash);
    await delayFailureResponse();
    return createErrorResult(401, "INVALID_CREDENTIALS", "Invalid login or password.");
  }

  clearLoginAttemptState(contactHash);

  return {
    status: 200,
    body: toLoginSuccessResponse(serializeUser(user)),
    userId: user.id
  };
}

function getSessionUser(request) {
  const token = request.cookies[env.COOKIE_NAME];

  if (!token) {
    return null;
  }

  const currentTimestamp = Date.now();
  authRepository.deleteExpiredSessions(currentTimestamp);

  return authRepository.findSessionUserByTokenHash(hashValue(token), currentTimestamp);
}

function createSession(response, userId) {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + env.SESSION_TTL_HOURS * 60 * 60 * 1000;

  authRepository.deleteSessionsByUserId(userId);
  authRepository.createSession({
    id: uuidv4(),
    userId,
    tokenHash: hashValue(rawToken),
    expiresAt,
    createdAt: Date.now()
  });

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
    authRepository.deleteSessionByTokenHash(hashValue(token));
  }

  response.clearCookie(env.COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production"
  });
}

function serializeUser(user) {
  return toUserDto(user, decryptValue, maskContact);
}

function getBlockedLoginState(contactHash) {
  const now = Date.now();
  const state = loginSecurityState.get(contactHash);

  if (!state) {
    return null;
  }

  if (state.blockedUntil && now < state.blockedUntil) {
    return state;
  }

  if (now > state.firstFailedAt + env.LOGIN_ATTEMPT_WINDOW_MS) {
    loginSecurityState.delete(contactHash);
  }

  return null;
}

function markFailedLoginAttempt(contactHash) {
  const now = Date.now();
  const state = loginSecurityState.get(contactHash);

  if (!state || now > state.firstFailedAt + env.LOGIN_ATTEMPT_WINDOW_MS) {
    loginSecurityState.set(contactHash, {
      attempts: 1,
      firstFailedAt: now,
      blockedUntil: null
    });
    return;
  }

  state.attempts += 1;
  if (state.attempts >= env.LOGIN_MAX_ATTEMPTS) {
    state.blockedUntil = now + env.LOGIN_BLOCK_MS;
    state.attempts = 0;
    state.firstFailedAt = now;
  }
}

function clearLoginAttemptState(contactHash) {
  loginSecurityState.delete(contactHash);
}

function delayFailureResponse() {
  return new Promise((resolve) => {
    setTimeout(resolve, env.LOGIN_FAILURE_DELAY_MS);
  });
}

function __resetLoginSecurityStateForTests() {
  loginSecurityState.clear();
}

module.exports = {
  registerUser,
  verifyUser,
  resendVerificationCode,
  loginUser,
  getSessionUser,
  createSession,
  destroySession,
  serializeUser,
  __resetLoginSecurityStateForTests
};
