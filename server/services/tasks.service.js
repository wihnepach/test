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

function listDeletedTasks(userId) {
  const tasks = tasksRepository.listDeletedTasksByUserId(userId);
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
    notes: normalizedPayload.notes || "",
    priority: normalizedPayload.priority || TASK_PRIORITY.MEDIUM,
    deadline: normalizedPayload.deadline,
    completed: false,
    deletedAt: null,
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
    notes: normalizedPayload.notes ?? existingTask.notes,
    priority: normalizedPayload.priority || existingTask.priority,
    deadline: normalizedPayload.deadline ?? existingTask.deadline,
    completed:
      typeof normalizedPayload.completed === "boolean"
        ? normalizedPayload.completed
        : Boolean(existingTask.completed),
    deletedAt: existingTask.deletedAt,
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

function restoreTask(userId, taskId) {
  const result = tasksRepository.restoreTaskByIdAndUserId(taskId, userId);

  if (result.changes === 0) {
    return createErrorResult(404, "TASK_NOT_FOUND", "Deleted task not found.");
  }

  const restoredTask = tasksRepository.findTaskByIdAndUserId(taskId, userId);
  return { status: 200, body: toTaskListDto([restoredTask])[0] };
}

function permanentlyDeleteTask(userId, taskId) {
  const result = tasksRepository.permanentlyDeleteTaskByIdAndUserId(taskId, userId);

  if (result.changes === 0) {
    return createErrorResult(404, "TASK_NOT_FOUND", "Deleted task not found.");
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

function clearTrash(userId) {
  const result = tasksRepository.clearTrashByUserId(userId);
  return {
    status: 200,
    body: { deletedCount: result.changes }
  };
}

function bulkUpdateTasks(userId, payload = {}) {
  const ids = Array.isArray(payload.ids) ? payload.ids.filter((id) => typeof id === "string") : [];

  if (ids.length === 0) {
    return createValidationError([{ field: "ids", issue: "at least one id is required" }]);
  }

  const validationDetails = validateTaskPayload(payload.changes || {}, true);

  if (validationDetails.length > 0) {
    return createValidationError(validationDetails, "Bulk task payload is invalid.");
  }

  const updated = [];
  ids.forEach((taskId) => {
    const result = updateTask(userId, taskId, payload.changes || {});
    if (result.status === 200) {
      updated.push(result.body);
    }
  });

  return {
    status: 200,
    body: { updatedCount: updated.length, tasks: updated }
  };
}

function exportTasks(userId) {
  return {
    status: 200,
    body: {
      exportedAt: new Date().toISOString(),
      tasks: listTasks(userId)
    }
  };
}

function importTasks(userId, payload = {}) {
  const tasks = Array.isArray(payload.tasks) ? payload.tasks : [];

  if (tasks.length === 0) {
    return createValidationError([{ field: "tasks", issue: "at least one task is required" }]);
  }

  const imported = [];
  const errors = [];

  tasks.slice(0, 250).forEach((task, index) => {
    const result = createTask(userId, {
      title: task.title,
      category: task.category || "",
      notes: task.notes || "",
      priority: task.priority || TASK_PRIORITY.MEDIUM,
      deadline: task.deadline || ""
    });

    if (result.status === 201) {
      imported.push(result.body);
    } else {
      errors.push({ index, details: result.body.details || result.body.message });
    }
  });

  return {
    status: errors.length > 0 ? 207 : 201,
    body: { importedCount: imported.length, tasks: imported, errors }
  };
}

module.exports = {
  listTasks,
  listDeletedTasks,
  createTask,
  updateTask,
  deleteTask,
  restoreTask,
  permanentlyDeleteTask,
  clearCompletedTasks,
  clearTrash,
  bulkUpdateTasks,
  exportTasks,
  importTasks
};
