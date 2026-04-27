const assert = require("node:assert/strict");
const test = require("node:test");

const { initTestEnvironment } = require("./helpers/test-env");

initTestEnvironment("email-service");

const emailService = require("../server/services/email.service");

test.beforeEach(() => {
  emailService.__resetEmailTransportForTests();
});

test("sendVerificationCode skips unsupported contact types", async () => {
  const result = await emailService.sendVerificationCode("phone", "+79991234567", "123456");

  assert.deepEqual(result, {
    sent: false,
    skipped: "UNSUPPORTED_CONTACT_TYPE"
  });
});

test("sendVerificationCode skips email when SMTP is optional and not configured", async () => {
  const result = await emailService.sendVerificationCode("email", "alex@example.com", "123456");

  assert.deepEqual(result, {
    sent: false,
    skipped: "SMTP_NOT_CONFIGURED"
  });
});

test("sendVerificationCode requires SMTP when delivery is mandatory", async () => {
  process.env.EMAIL_REQUIRE_DELIVERY = "true";
  delete require.cache[require.resolve("../config/env")];
  delete require.cache[require.resolve("../server/services/email.service")];
  const mandatoryEmailService = require("../server/services/email.service");

  const result = await mandatoryEmailService.sendVerificationCode(
    "email",
    "alex@example.com",
    "123456"
  );

  assert.equal(result.status, 503);
  assert.equal(result.body.code, "EMAIL_NOT_CONFIGURED");

  process.env.EMAIL_REQUIRE_DELIVERY = "false";
  delete require.cache[require.resolve("../config/env")];
  delete require.cache[require.resolve("../server/services/email.service")];
});
