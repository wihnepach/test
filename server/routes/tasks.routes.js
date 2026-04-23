const express = require("express");

const tasksController = require("../controllers/tasks.controller");
const { requireAuth } = require("../middleware/auth.middleware");
const { asyncHandler } = require("../utils/async-handler");

const router = express.Router();

router.get(
  "/",
  requireAuth,
  asyncHandler(tasksController.list)
);

router.post(
  "/",
  requireAuth,
  asyncHandler(tasksController.create)
);

router.put(
  "/:id",
  requireAuth,
  asyncHandler(tasksController.update)
);

router.delete(
  "/:id",
  requireAuth,
  asyncHandler(tasksController.remove)
);

router.delete(
  "/",
  requireAuth,
  asyncHandler(tasksController.clearCompleted)
);

module.exports = router;
