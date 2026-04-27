const assert = require("node:assert/strict");
const test = require("node:test");

const { initTestEnvironment } = require("./helpers/test-env");

initTestEnvironment("utils");

const {
  decryptValue,
  encryptValue,
  generateVerificationCode,
  hashValue,
  maskContact
} = require("../server/utils/crypto");
const {
  AppError,
  createErrorResult,
  createValidationError,
  toHttpErrorPayload
} = require("../server/utils/errors");
const { asyncHandler } = require("../server/utils/async-handler");

test("hashValue returns stable sha256 hashes", () => {
  assert.equal(hashValue("value"), hashValue("value"));
  assert.notEqual(hashValue("value"), hashValue("other-value"));
  assert.equal(hashValue("value").length, 64);
});

test("encryptValue and decryptValue round-trip sensitive values", () => {
  const encrypted = encryptValue("alex@example.com");

  assert.notEqual(encrypted, "alex@example.com");
  assert.equal(decryptValue(encrypted), "alex@example.com");
});

test("generateVerificationCode returns a 6 digit string", () => {
  assert.match(generateVerificationCode(), /^\d{6}$/);
});

test("maskContact hides email and phone contacts", () => {
  assert.equal(maskContact("email", "alex@example.com"), "al***@example.com");
  assert.equal(maskContact("phone", "+79991234567"), "********4567");
});

test("error helpers build consistent payloads", () => {
  assert.deepEqual(createErrorResult(404, "NOT_FOUND", "Missing."), {
    status: 404,
    body: {
      code: "NOT_FOUND",
      message: "Missing."
    }
  });

  assert.deepEqual(createValidationError([{ field: "title", issue: "required" }]).body, {
    code: "VALIDATION_ERROR",
    message: "Validation failed.",
    details: [{ field: "title", issue: "required" }]
  });
});

test("toHttpErrorPayload maps app, JSON parse, and unknown errors", () => {
  assert.deepEqual(toHttpErrorPayload(new AppError(403, "DENIED", "Nope.")).body, {
    code: "DENIED",
    message: "Nope."
  });

  assert.deepEqual(toHttpErrorPayload({ type: "entity.parse.failed", statusCode: 400 }).body, {
    code: "INVALID_JSON",
    message: "Request body contains invalid JSON."
  });

  assert.equal(toHttpErrorPayload(new Error("boom")).status, 500);
});

test("asyncHandler passes rejected errors to next", async () => {
  const expectedError = new Error("boom");
  const wrapped = asyncHandler(async () => {
    throw expectedError;
  });

  await new Promise((resolve) => {
    wrapped({}, {}, (error) => {
      assert.equal(error, expectedError);
      resolve();
    });
  });
});
