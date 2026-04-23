const taskManager = {
  async loadTasks() {},
  renderTasks() {}
};

window.taskManagerReady = initializeTaskManager();
window.loadTasks = async (...args) => {
  await window.taskManagerReady;
  return taskManager.loadTasks(...args);
};
window.renderTasks = async (...args) => {
  await window.taskManagerReady;
  return taskManager.renderTasks(...args);
};

async function initializeTaskManager() {
  if (window.appShellReady) {
    await window.appShellReady;
  }

  const elements = {
    taskStatusBanner: document.getElementById("taskStatusBanner"),
    form: document.getElementById("taskForm"),
    taskInput: document.getElementById("taskInput"),
    categoryInput: document.getElementById("categoryInput"),
    priorityInput: document.getElementById("priorityInput"),
    deadlineInput: document.getElementById("deadlineInput"),
    searchInput: document.getElementById("searchInput"),
    statusFilter: document.getElementById("statusFilter"),
    sortSelect: document.getElementById("sortSelect"),
    clearCompletedBtn: document.getElementById("clearCompletedBtn"),
    taskList: document.getElementById("taskList"),
    taskTemplate: document.getElementById("taskTemplate"),
    emptyState: document.getElementById("emptyState"),
    totalCount: document.getElementById("totalCount"),
    completedCount: document.getElementById("completedCount"),
    activeCount: document.getElementById("activeCount"),
    taskSummary: document.getElementById("taskSummary")
  };

  elements.form.addEventListener("submit", handleTaskSubmit);
  elements.searchInput.addEventListener("input", renderTasks);
  elements.statusFilter.addEventListener("change", renderTasks);
  elements.sortSelect.addEventListener("change", renderTasks);
  elements.clearCompletedBtn.addEventListener("click", clearCompletedTasks);

  taskManager.loadTasks = loadTasks;
  taskManager.renderTasks = renderTasks;
  renderTasks();

  async function loadTasks() {
    window.showBanner(elements.taskStatusBanner, "Загрузка задач...", "info");

    try {
      window.appState.tasks = await window.request("/api/tasks");
      window.hideBanner(elements.taskStatusBanner);
      renderTasks();
    } catch (error) {
      window.showBanner(elements.taskStatusBanner, `Не удалось загрузить задачи. ${error.message}`, "error");
    }
  }

  async function handleTaskSubmit(event) {
    event.preventDefault();

    const title = elements.taskInput.value.trim();

    if (!title) {
      elements.taskInput.focus();
      return;
    }

    try {
      const createdTask = await window.request("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          category: elements.categoryInput.value.trim(),
          priority: elements.priorityInput.value,
          deadline: elements.deadlineInput.value
        })
      });

      window.appState.tasks.unshift(createdTask);
      elements.form.reset();
      elements.priorityInput.value = "medium";
      elements.taskInput.focus();
      window.hideBanner(elements.taskStatusBanner);
      renderTasks();
    } catch (error) {
      window.showBanner(elements.taskStatusBanner, `Не удалось создать задачу. ${error.message}`, "error");
    }
  }

  function renderTasks() {
    const preparedTasks = getPreparedTasks();
    elements.taskList.innerHTML = "";

    elements.emptyState.classList.toggle("empty-state--visible", preparedTasks.length === 0);

    preparedTasks.forEach((task) => {
      const taskNode = elements.taskTemplate.content.firstElementChild.cloneNode(true);
      const toggle = taskNode.querySelector(".task-toggle");
      const title = taskNode.querySelector(".task-title");
      const priorityBadge = taskNode.querySelector(".priority-badge");
      const category = taskNode.querySelector(".task-category");
      const created = taskNode.querySelector(".task-created");
      const deadline = taskNode.querySelector(".task-deadline");
      const editButton = taskNode.querySelector(".edit-button");
      const deleteButton = taskNode.querySelector(".delete-button");

      taskNode.dataset.id = task.id;
      taskNode.classList.toggle("task-item--completed", task.completed);

      toggle.checked = task.completed;
      toggle.addEventListener("change", () => toggleTaskStatus(task.id));

      title.textContent = task.title;
      priorityBadge.textContent = priorityLabel(task.priority);
      priorityBadge.dataset.priority = task.priority;
      category.textContent = task.category ? `Категория: ${task.category}` : "Без категории";
      created.textContent = `Создано: ${formatDate(task.createdAt)}`;
      deadline.textContent = task.deadline ? `Дедлайн: ${formatDate(task.deadline)}` : "Без дедлайна";

      editButton.addEventListener("click", () => editTask(task.id));
      deleteButton.addEventListener("click", () => deleteTask(task.id));

      elements.taskList.append(taskNode);
    });

    updateSummary(preparedTasks.length);
    updateCounters();
  }

  function getPreparedTasks() {
    const searchTerm = elements.searchInput.value.trim().toLowerCase();
    const filterValue = elements.statusFilter.value;

    const filteredTasks = window.appState.tasks.filter((task) => {
      const matchesSearch = [task.title, task.category, priorityLabel(task.priority)]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(searchTerm));

      const matchesStatus =
        filterValue === "all" ||
        (filterValue === "completed" && task.completed) ||
        (filterValue === "active" && !task.completed);

      return matchesSearch && matchesStatus;
    });

    filteredTasks.sort((firstTask, secondTask) => {
      switch (elements.sortSelect.value) {
        case "oldest":
          return firstTask.createdAt - secondTask.createdAt;
        case "deadline":
          return sortByDeadline(firstTask, secondTask);
        case "priority":
          return priorityWeight(secondTask.priority) - priorityWeight(firstTask.priority);
        case "newest":
        default:
          return secondTask.createdAt - firstTask.createdAt;
      }
    });

    return filteredTasks;
  }

  async function toggleTaskStatus(taskId) {
    const task = window.appState.tasks.find((item) => item.id === taskId);

    if (!task) {
      return;
    }

    try {
      const updatedTask = await window.request(`/api/tasks/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: task.title,
          category: task.category,
          priority: task.priority,
          deadline: task.deadline,
          completed: !task.completed
        })
      });

      replaceTask(updatedTask);
      window.hideBanner(elements.taskStatusBanner);
      renderTasks();
    } catch (error) {
      window.showBanner(elements.taskStatusBanner, `Не удалось изменить статус задачи. ${error.message}`, "error");
    }
  }

  async function editTask(taskId) {
    const task = window.appState.tasks.find((item) => item.id === taskId);

    if (!task) {
      return;
    }

    const nextTitle = window.prompt("Измените текст задачи:", task.title);

    if (nextTitle === null) {
      return;
    }

    const trimmedTitle = nextTitle.trim();

    if (!trimmedTitle) {
      window.alert("Название задачи не может быть пустым.");
      return;
    }

    const nextCategory = window.prompt("Измените категорию:", task.category);

    if (nextCategory === null) {
      return;
    }

    const nextPriority = window.prompt("Введите приоритет: low, medium или high", task.priority);

    if (nextPriority === null) {
      return;
    }

    const nextDeadline = window.prompt(
      "Введите дедлайн в формате YYYY-MM-DDTHH:MM или оставьте пустым:",
      task.deadline
    );

    if (nextDeadline === null) {
      return;
    }

    try {
      const updatedTask = await window.request(`/api/tasks/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: trimmedTitle,
          category: nextCategory.trim(),
          priority: normalizePriority(nextPriority),
          deadline: nextDeadline.trim(),
          completed: task.completed
        })
      });

      replaceTask(updatedTask);
      window.hideBanner(elements.taskStatusBanner);
      renderTasks();
    } catch (error) {
      window.showBanner(elements.taskStatusBanner, `Не удалось сохранить изменения. ${error.message}`, "error");
    }
  }

  async function deleteTask(taskId) {
    try {
      await window.request(`/api/tasks/${taskId}`, { method: "DELETE" });
      window.appState.tasks = window.appState.tasks.filter((task) => task.id !== taskId);
      window.hideBanner(elements.taskStatusBanner);
      renderTasks();
    } catch (error) {
      window.showBanner(elements.taskStatusBanner, `Не удалось удалить задачу. ${error.message}`, "error");
    }
  }

  async function clearCompletedTasks() {
    const completedTasks = window.appState.tasks.filter((task) => task.completed).length;

    if (completedTasks === 0) {
      window.alert("Нет выполненных задач для удаления.");
      return;
    }

    try {
      await window.request("/api/tasks?completed=true", { method: "DELETE" });
      window.appState.tasks = window.appState.tasks.filter((task) => !task.completed);
      window.hideBanner(elements.taskStatusBanner);
      renderTasks();
    } catch (error) {
      window.showBanner(elements.taskStatusBanner, `Не удалось очистить выполненные задачи. ${error.message}`, "error");
    }
  }

  function replaceTask(updatedTask) {
    window.appState.tasks = window.appState.tasks.map((task) =>
      task.id === updatedTask.id ? updatedTask : task
    );
  }

  function updateCounters() {
    const completedTasks = window.appState.tasks.filter((task) => task.completed).length;
    const activeTasks = window.appState.tasks.length - completedTasks;

    elements.totalCount.textContent = String(window.appState.tasks.length);
    elements.completedCount.textContent = String(completedTasks);
    elements.activeCount.textContent = String(activeTasks);
  }

  function updateSummary(visibleCount) {
    if (window.appState.tasks.length === 0) {
      elements.taskSummary.textContent = window.appState.currentUser ? "Нет задач" : "Войдите в аккаунт";
      return;
    }

    elements.taskSummary.textContent = `Показано задач: ${visibleCount} из ${window.appState.tasks.length}`;
  }
}

function formatDate(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Некорректная дата";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function sortByDeadline(firstTask, secondTask) {
  const firstDeadline = firstTask.deadline ? new Date(firstTask.deadline).getTime() : Infinity;
  const secondDeadline = secondTask.deadline ? new Date(secondTask.deadline).getTime() : Infinity;
  return firstDeadline - secondDeadline;
}

function priorityWeight(priority) {
  const weights = {
    low: 1,
    medium: 2,
    high: 3
  };

  return weights[priority] ?? weights.medium;
}

function priorityLabel(priority) {
  const labels = {
    low: "Низкий приоритет",
    medium: "Средний приоритет",
    high: "Высокий приоритет"
  };

  return labels[priority] ?? labels.medium;
}

function normalizePriority(priority) {
  const value = priority.trim().toLowerCase();
  return ["low", "medium", "high"].includes(value) ? value : "medium";
}
