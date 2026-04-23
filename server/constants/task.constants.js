const TASK_PRIORITY = Object.freeze({
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high"
});

const TASK_COMPLETION = Object.freeze({
  INCOMPLETE: 0,
  COMPLETE: 1
});

const TASK_PRIORITY_VALUES = Object.freeze(Object.values(TASK_PRIORITY));

module.exports = {
  TASK_PRIORITY,
  TASK_COMPLETION,
  TASK_PRIORITY_VALUES
};
