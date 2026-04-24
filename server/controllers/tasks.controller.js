const tasksService = require("../services/tasks.service");

async function list(request, response) {
  response.json(tasksService.listTasks(request.user.id));
}

async function listTrash(request, response) {
  response.json(tasksService.listDeletedTasks(request.user.id));
}

async function create(request, response) {
  const result = tasksService.createTask(request.user.id, request.body);
  response.status(result.status).json(result.body);
}

async function update(request, response) {
  const result = tasksService.updateTask(request.user.id, request.params.id, request.body);
  response.status(result.status).json(result.body);
}

async function remove(request, response) {
  const result = tasksService.deleteTask(request.user.id, request.params.id);

  if (result.status === 204) {
    response.status(204).end();
    return;
  }

  response.status(result.status).json(result.body);
}

async function restore(request, response) {
  const result = tasksService.restoreTask(request.user.id, request.params.id);
  response.status(result.status).json(result.body);
}

async function permanentlyRemove(request, response) {
  const result = tasksService.permanentlyDeleteTask(request.user.id, request.params.id);

  if (result.status === 204) {
    response.status(204).end();
    return;
  }

  response.status(result.status).json(result.body);
}

async function clearCompleted(request, response) {
  const result = tasksService.clearCompletedTasks(
    request.user.id,
    request.query.completed === "true"
  );

  response.status(result.status).json(result.body);
}

async function clearTrash(request, response) {
  const result = tasksService.clearTrash(request.user.id);
  response.status(result.status).json(result.body);
}

async function bulkUpdate(request, response) {
  const result = tasksService.bulkUpdateTasks(request.user.id, request.body);
  response.status(result.status).json(result.body);
}

async function exportTasks(request, response) {
  const result = tasksService.exportTasks(request.user.id);
  response.status(result.status).json(result.body);
}

async function importTasks(request, response) {
  const result = tasksService.importTasks(request.user.id, request.body);
  response.status(result.status).json(result.body);
}

module.exports = {
  list,
  listTrash,
  create,
  update,
  remove,
  restore,
  permanentlyRemove,
  clearCompleted,
  clearTrash,
  bulkUpdate,
  exportTasks,
  importTasks
};
