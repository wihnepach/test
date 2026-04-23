function toTaskDto(task) {
  return {
    ...task,
    completed: Boolean(task.completed)
  };
}

function toTaskListDto(tasks) {
  return tasks.map(toTaskDto);
}

module.exports = {
  toTaskDto,
  toTaskListDto
};
