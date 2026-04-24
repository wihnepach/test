function toTaskDto(task) {
  return {
    ...task,
    completed: Boolean(task.completed),
    notes: task.notes || "",
    deletedAt: task.deletedAt || null
  };
}

function toTaskListDto(tasks) {
  return tasks.map(toTaskDto);
}

module.exports = {
  toTaskDto,
  toTaskListDto
};
