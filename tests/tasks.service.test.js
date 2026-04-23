const assert = require("node:assert/strict");
const test = require("node:test");

const { initTestEnvironment, resetDatabase } = require("./helpers/test-env");

initTestEnvironment("tasks-service");

const db = require("../server/db/database");
const tasksService = require("../server/services/tasks.service");

function seedUser(userId = "user-1") {
  db.prepare(
    `
    INSERT INTO users (
      id, name, contactType, encryptedContact, contactHash, passwordHash,
      isVerified, verificationCodeHash, verificationExpiresAt, createdAt
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run(
    userId,
    "Test User",
    "email",
    "encrypted-contact",
    `hash-${userId}`,
    "password-hash",
    1,
    null,
    null,
    Date.now()
  );
}

test.beforeEach(() => {
  resetDatabase(db);
});

test("createTask stores normalized task and listTasks returns boolean completed", () => {
  seedUser("user-1");

  const createResult = tasksService.createTask("user-1", {
    title: "  Buy milk  ",
    category: " Home ",
    priority: "HIGH",
    deadline: " 2026-05-01 "
  });

  assert.equal(createResult.status, 201);
  assert.equal(createResult.body.title, "Buy milk");
  assert.equal(createResult.body.category, "Home");
  assert.equal(createResult.body.priority, "high");

  const listResult = tasksService.listTasks("user-1");
  assert.equal(listResult.length, 1);
  assert.equal(listResult[0].completed, false);
});

test("updateTask returns 404 for missing task", () => {
  const updateResult = tasksService.updateTask("user-1", "missing-id", {
    title: "Updated"
  });

  assert.equal(updateResult.status, 404);
  assert.equal(updateResult.body.code, "TASK_NOT_FOUND");
});

test("clearCompletedTasks removes only completed tasks", () => {
  seedUser("user-1");

  const firstTask = tasksService.createTask("user-1", { title: "Task A" });
  const secondTask = tasksService.createTask("user-1", { title: "Task B" });

  tasksService.updateTask("user-1", firstTask.body.id, { completed: true });

  const clearResult = tasksService.clearCompletedTasks("user-1", true);
  assert.equal(clearResult.status, 200);
  assert.equal(clearResult.body.deletedCount, 1);

  const tasks = tasksService.listTasks("user-1");
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].id, secondTask.body.id);
  assert.equal(tasks[0].completed, false);
});

test("createTask validates incoming payload", () => {
  seedUser("user-1");

  const result = tasksService.createTask("user-1", {
    title: "",
    priority: "urgent"
  });

  assert.equal(result.status, 400);
  assert.equal(result.body.code, "VALIDATION_ERROR");
  assert.ok(Array.isArray(result.body.details));
});

test.after(() => {
  db.close();
});
