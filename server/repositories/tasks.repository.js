const db = require("../db/database");
const { TASK_COMPLETION } = require("../constants/task.constants");

function listTasksByUserId(userId) {
  return db
    .prepare(
      `
      SELECT id, userId, title, category, priority, deadline, completed, createdAt
      FROM tasks
      WHERE userId = ?
      ORDER BY createdAt DESC
      `
    )
    .all(userId);
}

function createTask(task) {
  db.prepare(
    `
    INSERT INTO tasks (id, userId, title, category, priority, deadline, completed, createdAt)
    VALUES (@id, @userId, @title, @category, @priority, @deadline, @completed, @createdAt)
    `
  ).run({
    ...task,
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
        priority = @priority,
        deadline = @deadline,
        completed = @completed
    WHERE id = @id AND userId = @userId
    `
  ).run({
    ...task,
    completed: Number(Boolean(task.completed))
  });
}

function deleteTaskByIdAndUserId(taskId, userId) {
  return db.prepare("DELETE FROM tasks WHERE id = ? AND userId = ?").run(taskId, userId);
}

function clearCompletedTasksByUserId(userId) {
  return db
    .prepare("DELETE FROM tasks WHERE completed = ? AND userId = ?")
    .run(TASK_COMPLETION.COMPLETE, userId);
}

module.exports = {
  listTasksByUserId,
  createTask,
  findTaskByIdAndUserId,
  updateTask,
  deleteTaskByIdAndUserId,
  clearCompletedTasksByUserId
};
