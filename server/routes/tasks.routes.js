const express = require("express");

const tasksService = require("../services/tasks.service");
const { requireAuth } = require("../middleware/auth.middleware");
const { asyncHandler } = require("../utils/async-handler");

const router = express.Router();

router.get(
  "/",
  requireAuth,
  asyncHandler(async (request, response) => {
    response.json(tasksService.listTasks(request.user.id));
  })
);

router.post(
  "/",
  requireAuth,
  asyncHandler(async (request, response) => {
    const result = tasksService.createTask(request.user.id, request.body);
    response.status(result.status).json(result.body);
  })
);

router.put(
  "/:id",
  requireAuth,
  asyncHandler(async (request, response) => {
    const result = tasksService.updateTask(request.user.id, request.params.id, request.body);
    response.status(result.status).json(result.body);
  })
);

router.delete(
  "/:id",
  requireAuth,
  asyncHandler(async (request, response) => {
    const result = tasksService.deleteTask(request.user.id, request.params.id);

    if (result.status === 204) {
      response.status(204).end();
      return;
    }

    response.status(result.status).json(result.body);
  })
);

router.delete(
  "/",
  requireAuth,
  asyncHandler(async (request, response) => {
    const result = tasksService.clearCompletedTasks(
      request.user.id,
      request.query.completed === "true"
    );

    response.status(result.status).json(result.body);
  })
);

module.exports = router;
