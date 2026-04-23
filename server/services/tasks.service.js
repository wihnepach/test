const { v4: uuidv4 } = require("uuid");

const tasksRepository = require("../repositories/tasks.repository");
const { toTaskListDto } = require("../dto/task.dto");
const { normalizeTaskPayload, validateTaskPayload } = require("../utils/validators");
const { createErrorResult, createValidationError } = require("../utils/errors");
const { TASK_PRIORITY } = require("../constants/task.constants");

function listTasks(userId) {
  const tasks = tasksRepository.listTasksByUserId(userId);
  return toTaskListDto(tasks);
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
    priority: normalizedPayload.priority || TASK_PRIORITY.MEDIUM,
    deadline: normalizedPayload.deadline,
    completed: false,
    createdAt: Date.now()
  };

  tasksRepository.createTask(task);

  return { status: 201, body: task };
}

function updateTask(userId, taskId, payload) {
  const existingTask = tasksRepository.findTaskByIdAndUserId(taskId, userId);

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

  tasksRepository.updateTask({
    ...updatedTask,
    title: updatedTask.title.trim()
  });

  return { status: 200, body: updatedTask };
}

function deleteTask(userId, taskId) {
  const result = tasksRepository.deleteTaskByIdAndUserId(taskId, userId);

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

  const result = tasksRepository.clearCompletedTasksByUserId(userId);

  return {
    status: 200,
    body: { deletedCount: result.changes }
  };
}

module.exports = {
  listTasks,
  createTask,
  updateTask,
  deleteTask,
  clearCompletedTasks
};
