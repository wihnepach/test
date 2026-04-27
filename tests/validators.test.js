const assert = require("node:assert/strict");
const test = require("node:test");

const { initTestEnvironment } = require("./helpers/test-env");

initTestEnvironment("validators");

const validators = require("../server/utils/validators");

test("normalizeContactType defaults to email and preserves phone", () => {
  assert.equal(validators.normalizeContactType("phone"), "phone");
  assert.equal(validators.normalizeContactType("unknown"), "email");
  assert.equal(validators.normalizeContactType(undefined), "email");
});

test("normalizeContact lowercases email and normalizes phone digits", () => {
  assert.equal(validators.normalizeContact("email", "  Alex@Example.COM "), "alex@example.com");
  assert.equal(validators.normalizeContact("phone", "8 (999) 123-45-67"), "+89991234567");
  assert.equal(validators.normalizeContact("phone", "+7 999 123 45 67"), "+79991234567");
  assert.equal(validators.normalizeContact("email", null), "");
});

test("isValidContact validates email and phone formats", () => {
  assert.equal(validators.isValidContact("email", "alex@example.com"), true);
  assert.equal(validators.isValidContact("email", "bad-email"), false);
  assert.equal(validators.isValidContact("phone", "+79991234567"), true);
  assert.equal(validators.isValidContact("phone", "89991234567"), false);
});

test("normalize payload helpers trim and default values", () => {
  assert.deepEqual(
    validators.normalizeRegistrationPayload({
      name: " Alex ",
      contactType: "email",
      contact: " ALEX@EXAMPLE.COM ",
      password: " password123 "
    }),
    {
      name: "Alex",
      contactType: "email",
      contact: "alex@example.com",
      password: "password123"
    }
  );

  assert.deepEqual(
    validators.normalizeVerificationPayload({
      contactType: "email",
      contact: " ALEX@EXAMPLE.COM ",
      code: " 123456 "
    }),
    {
      contactType: "email",
      contact: "alex@example.com",
      code: "123456"
    }
  );
});

test("validate auth payloads report invalid fields", () => {
  assert.deepEqual(
    validators.validateRegistrationPayload({
      name: "A",
      contactType: "email",
      contact: "bad",
      password: "short"
    }),
    [
      { field: "name", issue: "length must be between 2 and 80" },
      { field: "contact", issue: "invalid format" },
      { field: "password", issue: "length must be between 8 and 72" }
    ]
  );

  assert.deepEqual(validators.validateLoginPayload({ contact: "", password: "" }), [
    { field: "contact", issue: "required" },
    { field: "password", issue: "required" }
  ]);

  assert.deepEqual(
    validators.validateVerificationPayload({
      contactType: "email",
      contact: "alex@example.com",
      code: "abc"
    }),
    [{ field: "code", issue: "must be a 6-digit string" }]
  );
});

test("normalize and validate task payloads handle full and partial changes", () => {
  assert.deepEqual(
    validators.normalizeTaskPayload({
      title: " Task ",
      category: " Work ",
      notes: " Note ",
      priority: "HIGH",
      deadline: " 2026-05-01 ",
      completed: true
    }),
    {
      title: "Task",
      category: "Work",
      notes: "Note",
      priority: "high",
      deadline: "2026-05-01",
      completed: true
    }
  );

  assert.deepEqual(validators.normalizeTaskPayload({}, true), {
    title: undefined,
    category: undefined,
    notes: undefined,
    priority: undefined,
    deadline: undefined,
    completed: undefined
  });

  assert.deepEqual(
    validators.validateTaskPayload({
      title: "",
      category: 1,
      notes: 1,
      priority: "urgent",
      deadline: "not-date",
      completed: "yes"
    }),
    [
      { field: "title", issue: "required" },
      { field: "category", issue: "must be a string" },
      { field: "notes", issue: "must be a string" },
      { field: "priority", issue: "must be one of: low, medium, high" },
      { field: "deadline", issue: "must be a valid date" },
      { field: "completed", issue: "must be a boolean" }
    ]
  );
});

test("buildContactKey uses normalized contact type", () => {
  assert.equal(validators.buildContactKey("unknown", "alex@example.com"), "email:alex@example.com");
});
