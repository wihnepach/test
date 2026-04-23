const assert = require("node:assert/strict");
const test = require("node:test");

const { initTestEnvironment, resetDatabase } = require("./helpers/test-env");

initTestEnvironment("auth-service");

const db = require("../server/db/database");
const authService = require("../server/services/auth.service");

test.beforeEach(() => {
  resetDatabase(db);
});

test("registerUser rejects invalid contact", async () => {
  const result = await authService.registerUser({
    name: "Alex",
    contactType: "email",
    contact: "invalid-contact",
    password: "password123"
  });

  assert.equal(result.status, 400);
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
  assert.equal(loginAfterVerify.body.user.isVerified, true);
  assert.match(loginAfterVerify.body.user.contactMasked, /@example\.com$/);
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
});
