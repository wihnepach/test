const { v4: uuidv4 } = require("uuid");

const db = require("../db/database");
const { normalizeTaskPayload, validateTaskPayload } = require("../utils/validators");
const { createErrorResult, createValidationError } = require("../utils/errors");

function listTasks(userId) {
  return db
    .prepare(
      `
      SELECT id, userId, title, category, priority, deadline, completed, createdAt
      FROM tasks
      WHERE userId = ?
      ORDER BY createdAt DESC
      `
    )
    .all(userId)
    .map(mapTaskRow);
}

function createTask(userId, payload) {
  const validationDetails = validateTaskPayload(payload, false);

  if (validationDetails.length > 0) {
    return createValidationError(validationDetails, "Task payload is invalid.");
  }

  const normalizedPayload = normalizeTaskPayload(payload);
  const task = {
    id: uuidv4(),
    userId,
    title: normalizedPayload.title,
    category: normalizedPayload.category,
    priority: normalizedPayload.priority || "medium",
    deadline: normalizedPayload.deadline,
    completed: false,
    createdAt: Date.now()
  };

  db.prepare(
    `
    INSERT INTO tasks (id, userId, title, category, priority, deadline, completed, createdAt)
    VALUES (@id, @userId, @title, @category, @priority, @deadline, @completed, @createdAt)
    `
  ).run({
    ...task,
    completed: Number(task.completed)
  });

  return { status: 201, body: task };
}

function updateTask(userId, taskId, payload) {
  const existingTask = db
    .prepare("SELECT * FROM tasks WHERE id = ? AND userId = ?")
    .get(taskId, userId);

  if (!existingTask) {
    return createErrorResult(404, "TASK_NOT_FOUND", "Task not found.");
  }

  const validationDetails = validateTaskPayload(payload, true);

  if (validationDetails.length > 0) {
    return createValidationError(validationDetails, "Task payload is invalid.");
  }

  const normalizedPayload = normalizeTaskPayload(payload, true);
  const updatedTask = {
    id: existingTask.id,
    userId: existingTask.userId,
    title: normalizedPayload.title || existingTask.title,
    category: normalizedPayload.category ?? existingTask.category,
    priority: normalizedPayload.priority || existingTask.priority,
    deadline: normalizedPayload.deadline ?? existingTask.deadline,
    completed:
      typeof normalizedPayload.completed === "boolean"
        ? normalizedPayload.completed
        : Boolean(existingTask.completed),
    createdAt: existingTask.createdAt
  };

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
    ...updatedTask,
    title: updatedTask.title.trim(),
    completed: Number(updatedTask.completed)
  });

  return { status: 200, body: updatedTask };
}

function deleteTask(userId, taskId) {
  const result = db.prepare("DELETE FROM tasks WHERE id = ? AND userId = ?").run(taskId, userId);

  if (result.changes === 0) {
    return createErrorResult(404, "TASK_NOT_FOUND", "Task not found.");
  }

  return { status: 204 };
}

function clearCompletedTasks(userId, shouldDeleteCompleted) {
  if (!shouldDeleteCompleted) {
    return createValidationError(
      [{ field: "completed", issue: "query parameter completed=true is required" }],
      "Task cleanup query is invalid."
    );
  }

  const result = db.prepare("DELETE FROM tasks WHERE completed = 1 AND userId = ?").run(userId);

  return {
    status: 200,
    body: { deletedCount: result.changes }
  };
}

function mapTaskRow(task) {
  return {
    ...task,
    completed: Boolean(task.completed)
  };
}

module.exports = {
  listTasks,
  createTask,
  updateTask,
  deleteTask,
  clearCompletedTasks
};
