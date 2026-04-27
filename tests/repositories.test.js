const assert = require("node:assert/strict");
const test = require("node:test");

const { initTestEnvironment, resetDatabase } = require("./helpers/test-env");

initTestEnvironment("repositories");

const db = require("../server/db/database");
const authRepository = require("../server/repositories/auth.repository");
const tasksRepository = require("../server/repositories/tasks.repository");

function seedUser(id = "user-1") {
  authRepository.createUser({
    id,
    name: "Alex",
    contactType: "email",
    encryptedContact: `encrypted-${id}`,
    contactHash: `contact-hash-${id}`,
    passwordHash: "password-hash",
    isVerified: 0,
    verificationCodeHash: "verification-hash",
    verificationExpiresAt: Date.now() + 60000,
    createdAt: Date.now()
  });

  return authRepository.findUserById(id);
}

function seedTask(task = {}) {
  const payload = {
    id: task.id || "task-1",
    userId: task.userId || "user-1",
    title: task.title || "Task",
    category: task.category || "",
    notes: task.notes || "",
    priority: task.priority || "medium",
    deadline: task.deadline || "",
    completed: Boolean(task.completed),
    deletedAt: task.deletedAt || null,
    createdAt: task.createdAt || Date.now()
  };

  tasksRepository.createTask(payload);
  return payload;
}

test.beforeEach(() => {
  resetDatabase(db);
});

test("auth repository creates, verifies, updates codes, and finds users", () => {
  const user = seedUser("user-1");

  assert.equal(user.name, "Alex");
  assert.equal(authRepository.findUserByContactHash("contact-hash-user-1").id, "user-1");
  assert.deepEqual(authRepository.findUserIdentityByContactHash("contact-hash-user-1"), {
    id: "user-1",
    isVerified: 0
  });

  authRepository.updateVerificationCode("user-1", "new-verification-hash", 123);
  assert.equal(authRepository.findUserById("user-1").verificationCodeHash, "new-verification-hash");

  authRepository.updateLoginCode("user-1", "login-hash", 456);
  assert.equal(authRepository.findUserById("user-1").loginCodeHash, "login-hash");

  authRepository.clearLoginCode("user-1");
  assert.equal(authRepository.findUserById("user-1").loginCodeHash, null);

  authRepository.updateEncryptedContact("user-1", "encrypted-current");
  assert.equal(authRepository.findUserById("user-1").encryptedContact, "encrypted-current");

  authRepository.verifyUserById("user-1");
  assert.equal(authRepository.findUserById("user-1").isVerified, 1);
  assert.equal(authRepository.findUserById("user-1").verificationCodeHash, null);
});

test("auth repository creates, finds, counts, and deletes sessions", () => {
  seedUser("user-1");

  authRepository.createSession({
    id: "session-1",
    userId: "user-1",
    tokenHash: "token-hash",
    expiresAt: Date.now() + 60000,
    createdAt: 100
  });

  const sessionUser = authRepository.findSessionUserByTokenHash("token-hash", Date.now());
  assert.equal(sessionUser.id, "user-1");
  assert.equal(sessionUser.sessionCreatedAt, 100);
  assert.equal(authRepository.countSessionsByUserId("user-1"), 1);

  authRepository.deleteSessionByTokenHash("token-hash");
  assert.equal(authRepository.countSessionsByUserId("user-1"), 0);

  authRepository.createSession({
    id: "session-2",
    userId: "user-1",
    tokenHash: "expired-token",
    expiresAt: Date.now() - 1,
    createdAt: 100
  });
  authRepository.deleteExpiredSessions(Date.now());
  assert.equal(authRepository.countSessionsByUserId("user-1"), 0);
});

test("task repository supports create, update, soft delete, restore, and permanent delete", () => {
  seedUser("user-1");
  seedTask({ id: "task-1", title: "First", completed: false, createdAt: 100 });
  seedTask({ id: "task-2", title: "Second", completed: true, createdAt: 200 });

  assert.deepEqual(
    tasksRepository.listTasksByUserId("user-1").map((task) => task.id),
    ["task-2", "task-1"]
  );

  tasksRepository.updateTask({
    id: "task-1",
    userId: "user-1",
    title: "Updated",
    category: "Work",
    notes: "Note",
    priority: "high",
    deadline: "2026-05-01",
    completed: true
  });
  assert.equal(tasksRepository.findTaskByIdAndUserId("task-1", "user-1").title, "Updated");

  assert.equal(tasksRepository.deleteTaskByIdAndUserId("task-1", "user-1").changes, 1);
  assert.deepEqual(
    tasksRepository.listDeletedTasksByUserId("user-1").map((task) => task.id),
    ["task-1"]
  );

  assert.equal(tasksRepository.restoreTaskByIdAndUserId("task-1", "user-1").changes, 1);
  assert.equal(tasksRepository.listDeletedTasksByUserId("user-1").length, 0);

  assert.equal(tasksRepository.clearCompletedTasksByUserId("user-1").changes, 2);
  assert.equal(tasksRepository.clearTrashByUserId("user-1").changes, 2);
});

test("task repository permanent delete only removes trashed tasks", () => {
  seedUser("user-1");
  seedTask({ id: "active-task" });
  seedTask({ id: "deleted-task", deletedAt: Date.now() });

  assert.equal(
    tasksRepository.permanentlyDeleteTaskByIdAndUserId("active-task", "user-1").changes,
    0
  );
  assert.equal(
    tasksRepository.permanentlyDeleteTaskByIdAndUserId("deleted-task", "user-1").changes,
    1
  );
});

test.after(() => {
  db.close();
});
