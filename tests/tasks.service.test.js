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

test("deleteTask moves task to trash and restoreTask brings it back", () => {
  seedUser("user-1");
  const task = tasksService.createTask("user-1", { title: "Recover me" });

  const deleteResult = tasksService.deleteTask("user-1", task.body.id);
  assert.equal(deleteResult.status, 204);
  assert.equal(tasksService.listTasks("user-1").length, 0);

  const trash = tasksService.listDeletedTasks("user-1");
  assert.equal(trash.length, 1);
  assert.equal(trash[0].id, task.body.id);
  assert.ok(trash[0].deletedAt);

  const restoreResult = tasksService.restoreTask("user-1", task.body.id);
  assert.equal(restoreResult.status, 200);
  assert.equal(restoreResult.body.deletedAt, null);
  assert.equal(tasksService.listTasks("user-1").length, 1);
});

test("permanentlyDeleteTask and clearTrash remove only deleted tasks", () => {
  seedUser("user-1");
  const activeTask = tasksService.createTask("user-1", { title: "Active" });
  const deletedTask = tasksService.createTask("user-1", { title: "Deleted" });

  assert.equal(tasksService.permanentlyDeleteTask("user-1", activeTask.body.id).status, 404);
  tasksService.deleteTask("user-1", deletedTask.body.id);

  const permanentDeleteResult = tasksService.permanentlyDeleteTask("user-1", deletedTask.body.id);
  assert.equal(permanentDeleteResult.status, 204);

  tasksService.deleteTask("user-1", activeTask.body.id);
  const clearTrashResult = tasksService.clearTrash("user-1");
  assert.equal(clearTrashResult.status, 200);
  assert.equal(clearTrashResult.body.deletedCount, 1);
});

test("clearCompletedTasks requires completed=true flag", () => {
  const result = tasksService.clearCompletedTasks("user-1", false);

  assert.equal(result.status, 400);
  assert.equal(result.body.code, "VALIDATION_ERROR");
  assert.equal(result.body.details[0].field, "completed");
});

test("bulkUpdateTasks validates ids and updates existing tasks", () => {
  seedUser("user-1");
  const firstTask = tasksService.createTask("user-1", { title: "First" });
  const secondTask = tasksService.createTask("user-1", { title: "Second" });

  const missingIdsResult = tasksService.bulkUpdateTasks("user-1", {
    ids: [],
    changes: { completed: true }
  });
  assert.equal(missingIdsResult.status, 400);

  const updateResult = tasksService.bulkUpdateTasks("user-1", {
    ids: [firstTask.body.id, secondTask.body.id, "missing"],
    changes: { completed: true, priority: "high" }
  });

  assert.equal(updateResult.status, 200);
  assert.equal(updateResult.body.updatedCount, 2);
  assert.equal(updateResult.body.tasks[0].completed, true);
  assert.equal(updateResult.body.tasks[0].priority, "high");
});

test("exportTasks and importTasks serialize task collections", () => {
  seedUser("user-1");
  tasksService.createTask("user-1", { title: "Existing" });

  const exportResult = tasksService.exportTasks("user-1");
  assert.equal(exportResult.status, 200);
  assert.match(exportResult.body.exportedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(exportResult.body.tasks.length, 1);

  const emptyImportResult = tasksService.importTasks("user-1", { tasks: [] });
  assert.equal(emptyImportResult.status, 400);

  const importResult = tasksService.importTasks("user-1", {
    tasks: [
      { title: "Imported", priority: "low" },
      { title: "", priority: "urgent" }
    ]
  });

  assert.equal(importResult.status, 207);
  assert.equal(importResult.body.importedCount, 1);
  assert.equal(importResult.body.errors.length, 1);
});

test.after(() => {
  db.close();
});
