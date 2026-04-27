const assert = require("node:assert/strict");
const test = require("node:test");

const { initTestEnvironment, resetDatabase } = require("./helpers/test-env");

initTestEnvironment("auth-service");

const db = require("../server/db/database");
const authRepository = require("../server/repositories/auth.repository");
const authService = require("../server/services/auth.service");
const { hashValue } = require("../server/utils/crypto");
const { buildContactKey } = require("../server/utils/validators");

test.beforeEach(() => {
  resetDatabase(db);
  authService.__resetLoginSecurityStateForTests();
});

test("registerUser rejects invalid contact", async () => {
  const result = await authService.registerUser({
    name: "Alex",
    contactType: "email",
    contact: "invalid-contact",
    password: "password123"
  });

  assert.equal(result.status, 400);
  assert.equal(result.body.code, "VALIDATION_ERROR");
  assert.ok(Array.isArray(result.body.details));
  assert.equal(result.body.details[0].field, "contact");
});

test("login is blocked until contact verification is completed", async () => {
  const registerResult = await authService.registerUser({
    name: "Alex",
    contactType: "email",
    contact: "alex@example.com",
    password: "password123"
  });
  assert.equal(registerResult.status, 201);

  const loginBeforeVerify = await authService.loginUser({
    contactType: "email",
    contact: "alex@example.com",
    password: "password123"
  });
  assert.equal(loginBeforeVerify.status, 403);
  assert.equal(loginBeforeVerify.body.code, "CONTACT_NOT_VERIFIED");

  const verifyResult = authService.verifyUser({
    contactType: "email",
    contact: "alex@example.com",
    code: registerResult.body.verificationPreview
  });
  assert.equal(verifyResult.status, 200);

  const loginAfterVerify = await authService.loginUser({
    contactType: "email",
    contact: "alex@example.com",
    password: "password123"
  });
  assert.equal(loginAfterVerify.status, 200);
  assert.equal(loginAfterVerify.body.requiresLoginCode, true);
  assert.ok(loginAfterVerify.body.verificationPreview);

  const loginCodeResult = authService.verifyLoginCode({
    contactType: "email",
    contact: "alex@example.com",
    code: loginAfterVerify.body.verificationPreview
  });
  assert.equal(loginCodeResult.status, 200);
  assert.equal(loginCodeResult.body.user.isVerified, true);
  assert.match(loginCodeResult.body.user.contactMasked, /@example\.com$/);
});

test("registerUser rejects duplicate contact", async () => {
  const firstRegistration = await authService.registerUser({
    name: "Alex",
    contactType: "phone",
    contact: "+79991234567",
    password: "password123"
  });
  assert.equal(firstRegistration.status, 201);

  const secondRegistration = await authService.registerUser({
    name: "Alex 2",
    contactType: "phone",
    contact: "+79991234567",
    password: "password456"
  });
  assert.equal(secondRegistration.status, 409);
  assert.equal(secondRegistration.body.code, "CONTACT_EXISTS");
});

test("loginUser temporarily blocks after repeated failed attempts", async () => {
  const payload = {
    contactType: "email",
    contact: "nobody@example.com",
    password: "password123"
  };

  const firstAttempt = await authService.loginUser(payload);
  const secondAttempt = await authService.loginUser(payload);
  const thirdAttempt = await authService.loginUser(payload);
  const blockedAttempt = await authService.loginUser(payload);

  assert.equal(firstAttempt.status, 401);
  assert.equal(secondAttempt.status, 401);
  assert.equal(thirdAttempt.status, 401);
  assert.equal(blockedAttempt.status, 429);
  assert.equal(blockedAttempt.body.code, "LOGIN_BLOCKED");
  assert.ok(blockedAttempt.body.details.retryAfterSeconds >= 1);
});

test("verifyUser handles missing, invalid, expired, and already verified codes", async () => {
  const missingUserResult = authService.verifyUser({
    contactType: "email",
    contact: "missing@example.com",
    code: "123456"
  });
  assert.equal(missingUserResult.status, 404);

  const registerResult = await authService.registerUser({
    name: "Alex",
    contactType: "email",
    contact: "verify@example.com",
    password: "password123"
  });

  const invalidCodeResult = authService.verifyUser({
    contactType: "email",
    contact: "verify@example.com",
    code: "000000"
  });
  assert.equal(invalidCodeResult.status, 400);
  assert.equal(invalidCodeResult.body.code, "INVALID_VERIFICATION_CODE");

  const contactHash = hashValue(buildContactKey("email", "verify@example.com"));
  const user = authRepository.findUserByContactHash(contactHash);
  authRepository.updateVerificationCode(
    user.id,
    hashValue(registerResult.body.verificationPreview),
    1
  );

  const expiredCodeResult = authService.verifyUser({
    contactType: "email",
    contact: "verify@example.com",
    code: registerResult.body.verificationPreview
  });
  assert.equal(expiredCodeResult.status, 400);
  assert.equal(expiredCodeResult.body.code, "VERIFICATION_CODE_EXPIRED");

  authRepository.updateVerificationCode(
    user.id,
    hashValue(registerResult.body.verificationPreview),
    Date.now() + 60000
  );
  const successResult = authService.verifyUser({
    contactType: "email",
    contact: "verify@example.com",
    code: registerResult.body.verificationPreview
  });
  assert.equal(successResult.status, 200);

  const alreadyVerifiedResult = authService.verifyUser({
    contactType: "email",
    contact: "verify@example.com",
    code: registerResult.body.verificationPreview
  });
  assert.equal(alreadyVerifiedResult.status, 400);
  assert.equal(alreadyVerifiedResult.body.code, "CONTACT_ALREADY_VERIFIED");
});

test("resendVerificationCode updates pending user code and rejects verified users", async () => {
  const missingResult = await authService.resendVerificationCode({
    contactType: "email",
    contact: "missing@example.com"
  });
  assert.equal(missingResult.status, 404);

  const registerResult = await authService.registerUser({
    name: "Alex",
    contactType: "email",
    contact: "resend@example.com",
    password: "password123"
  });
  assert.equal(registerResult.status, 201);

  const resendResult = await authService.resendVerificationCode({
    contactType: "email",
    contact: "resend@example.com"
  });
  assert.equal(resendResult.status, 200);
  assert.ok(resendResult.body.verificationPreview);
  assert.notEqual(resendResult.body.verificationPreview, registerResult.body.verificationPreview);

  const verifyResult = authService.verifyUser({
    contactType: "email",
    contact: "resend@example.com",
    code: resendResult.body.verificationPreview
  });
  assert.equal(verifyResult.status, 200);

  const verifiedResendResult = await authService.resendVerificationCode({
    contactType: "email",
    contact: "resend@example.com"
  });
  assert.equal(verifiedResendResult.status, 400);
  assert.equal(verifiedResendResult.body.code, "CONTACT_ALREADY_VERIFIED");
});

test("verifyLoginCode rejects missing, invalid, and expired login codes", async () => {
  const missingResult = authService.verifyLoginCode({
    contactType: "email",
    contact: "missing@example.com",
    code: "123456"
  });
  assert.equal(missingResult.status, 404);

  const registerResult = await authService.registerUser({
    name: "Alex",
    contactType: "email",
    contact: "login-code@example.com",
    password: "password123"
  });
  authService.verifyUser({
    contactType: "email",
    contact: "login-code@example.com",
    code: registerResult.body.verificationPreview
  });

  const noCodeResult = authService.verifyLoginCode({
    contactType: "email",
    contact: "login-code@example.com",
    code: "123456"
  });
  assert.equal(noCodeResult.status, 400);
  assert.equal(noCodeResult.body.code, "LOGIN_CODE_EXPIRED");

  const loginResult = await authService.loginUser({
    contactType: "email",
    contact: "login-code@example.com",
    password: "password123"
  });
  assert.equal(loginResult.status, 200);

  const invalidCodeResult = authService.verifyLoginCode({
    contactType: "email",
    contact: "login-code@example.com",
    code: "000000"
  });
  assert.equal(invalidCodeResult.status, 400);
  assert.equal(invalidCodeResult.body.code, "INVALID_LOGIN_CODE");

  const contactHash = hashValue(buildContactKey("email", "login-code@example.com"));
  const user = authRepository.findUserByContactHash(contactHash);
  authRepository.updateLoginCode(user.id, hashValue(loginResult.body.verificationPreview), 1);

  const expiredCodeResult = authService.verifyLoginCode({
    contactType: "email",
    contact: "login-code@example.com",
    code: loginResult.body.verificationPreview
  });
  assert.equal(expiredCodeResult.status, 400);
  assert.equal(expiredCodeResult.body.code, "LOGIN_CODE_EXPIRED");
});

test("phone login creates immediate session response without login code", async () => {
  const registerResult = await authService.registerUser({
    name: "Alex",
    contactType: "phone",
    contact: "+79991234567",
    password: "password123"
  });
  assert.equal(registerResult.status, 201);

  const verifyResult = authService.verifyUser({
    contactType: "phone",
    contact: "+79991234567",
    code: registerResult.body.verificationPreview
  });
  assert.equal(verifyResult.status, 200);

  const loginResult = await authService.loginUser({
    contactType: "phone",
    contact: "+79991234567",
    password: "password123"
  });
  assert.equal(loginResult.status, 200);
  assert.equal(loginResult.body.requiresLoginCode, undefined);
  assert.equal(Boolean(loginResult.userId), true);
});

test("session helpers create, summarize, destroy current and all sessions", async () => {
  const registerResult = await authService.registerUser({
    name: "Alex",
    contactType: "phone",
    contact: "+79991234567",
    password: "password123"
  });
  const verifyResult = authService.verifyUser({
    contactType: "phone",
    contact: "+79991234567",
    code: registerResult.body.verificationPreview
  });

  const cookies = new Map();
  const response = {
    cookie(name, value) {
      cookies.set(name, value);
    },
    clearCookie(name) {
      cookies.delete(name);
    }
  };

  authService.createSession(response, verifyResult.userId);
  const cookieName = [...cookies.keys()][0];
  const token = cookies.get(cookieName);
  assert.ok(token);

  const request = {
    cookies: {
      [cookieName]: token
    }
  };
  const sessionUser = authService.getSessionUser(request);
  assert.equal(sessionUser.id, verifyResult.userId);
  assert.equal(authService.getSessionSummary(sessionUser).activeSessions, 1);

  authService.destroySession(request, response);
  assert.equal(cookies.has(process.env.SESSION_COOKIE_NAME), false);
  assert.equal(authService.getSessionUser(request), null);

  authService.createSession(response, verifyResult.userId);
  const secondToken = cookies.get(cookieName);
  authService.destroyAllSessions(
    {
      cookies: {
        [cookieName]: secondToken
      }
    },
    response
  );
  assert.equal(authRepository.countSessionsByUserId(verifyResult.userId), 0);
});

test.after(() => {
  db.close();
});
