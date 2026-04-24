const express = require("express");

const tasksController = require("../controllers/tasks.controller");
const { requireAuth } = require("../middleware/auth.middleware");
const { asyncHandler } = require("../utils/async-handler");

const router = express.Router();

router.get("/", requireAuth, asyncHandler(tasksController.list));

router.get("/trash", requireAuth, asyncHandler(tasksController.listTrash));

router.get("/export", requireAuth, asyncHandler(tasksController.exportTasks));

router.post("/import", requireAuth, asyncHandler(tasksController.importTasks));

router.put("/bulk", requireAuth, asyncHandler(tasksController.bulkUpdate));

router.post("/", requireAuth, asyncHandler(tasksController.create));

router.put("/:id", requireAuth, asyncHandler(tasksController.update));

router.post("/:id/restore", requireAuth, asyncHandler(tasksController.restore));

router.delete("/:id", requireAuth, asyncHandler(tasksController.remove));

router.delete("/:id/permanent", requireAuth, asyncHandler(tasksController.permanentlyRemove));

router.delete("/", requireAuth, asyncHandler(tasksController.clearCompleted));

router.delete("/trash/clear", requireAuth, asyncHandler(tasksController.clearTrash));

module.exports = router;
