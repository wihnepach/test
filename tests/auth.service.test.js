const assert = require("node:assert/strict");
const test = require("node:test");

const { initTestEnvironment, resetDatabase } = require("./helpers/test-env");

initTestEnvironment("auth-service");

const db = require("../server/db/database");
const authService = require("../server/services/auth.service");

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

test.after(() => {
  db.close();
});
