const db = require("../db/database");
const { TASK_COMPLETION } = require("../constants/task.constants");

function listTasksByUserId(userId) {
  return db
    .prepare(
      `
      SELECT id, userId, title, category, notes, priority, deadline, completed, deletedAt, createdAt
      FROM tasks
      WHERE userId = ? AND deletedAt IS NULL
      ORDER BY createdAt DESC
      `
    )
    .all(userId);
}

function listDeletedTasksByUserId(userId) {
  return db
    .prepare(
      `
      SELECT id, userId, title, category, notes, priority, deadline, completed, deletedAt, createdAt
      FROM tasks
      WHERE userId = ? AND deletedAt IS NOT NULL
      ORDER BY deletedAt DESC
      `
    )
    .all(userId);
}

function createTask(task) {
  db.prepare(
    `
    INSERT INTO tasks (id, userId, title, category, notes, priority, deadline, completed, deletedAt, createdAt)
    VALUES (@id, @userId, @title, @category, @notes, @priority, @deadline, @completed, @deletedAt, @createdAt)
    `
  ).run({
    ...task,
    notes: task.notes || "",
    deletedAt: task.deletedAt || null,
    completed: Number(Boolean(task.completed))
  });
}

function findTaskByIdAndUserId(taskId, userId) {
  return db.prepare("SELECT * FROM tasks WHERE id = ? AND userId = ?").get(taskId, userId);
}

function updateTask(task) {
  db.prepare(
    `
    UPDATE tasks
    SET title = @title,
        category = @category,
        notes = @notes,
        priority = @priority,
        deadline = @deadline,
        completed = @completed
    WHERE id = @id AND userId = @userId AND deletedAt IS NULL
    `
  ).run({
    ...task,
    notes: task.notes || "",
    completed: Number(Boolean(task.completed))
  });
}

function deleteTaskByIdAndUserId(taskId, userId) {
  return db
    .prepare("UPDATE tasks SET deletedAt = ? WHERE id = ? AND userId = ? AND deletedAt IS NULL")
    .run(Date.now(), taskId, userId);
}

function restoreTaskByIdAndUserId(taskId, userId) {
  return db
    .prepare(
      "UPDATE tasks SET deletedAt = NULL WHERE id = ? AND userId = ? AND deletedAt IS NOT NULL"
    )
    .run(taskId, userId);
}

function permanentlyDeleteTaskByIdAndUserId(taskId, userId) {
  return db
    .prepare("DELETE FROM tasks WHERE id = ? AND userId = ? AND deletedAt IS NOT NULL")
    .run(taskId, userId);
}

function clearCompletedTasksByUserId(userId) {
  return db
    .prepare(
      "UPDATE tasks SET deletedAt = ? WHERE completed = ? AND userId = ? AND deletedAt IS NULL"
    )
    .run(Date.now(), TASK_COMPLETION.COMPLETE, userId);
}

function clearTrashByUserId(userId) {
  return db.prepare("DELETE FROM tasks WHERE userId = ? AND deletedAt IS NOT NULL").run(userId);
}

module.exports = {
  listTasksByUserId,
  listDeletedTasksByUserId,
  createTask,
  findTaskByIdAndUserId,
  updateTask,
  deleteTaskByIdAndUserId,
  restoreTaskByIdAndUserId,
  permanentlyDeleteTaskByIdAndUserId,
  clearCompletedTasksByUserId,
  clearTrashByUserId
};
