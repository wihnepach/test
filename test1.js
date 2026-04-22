// test1.js
// Клиентская логика To-Do приложения.
// Работает с DOM, отправляет запросы на сервер и обновляет интерфейс.

const API_URL = "/api/tasks";

const form = document.getElementById("taskForm");
const taskInput = document.getElementById("taskInput");
const categoryInput = document.getElementById("categoryInput");
const priorityInput = document.getElementById("priorityInput");
const deadlineInput = document.getElementById("deadlineInput");
const searchInput = document.getElementById("searchInput");
const statusFilter = document.getElementById("statusFilter");
const sortSelect = document.getElementById("sortSelect");
const clearCompletedBtn = document.getElementById("clearCompletedBtn");
const taskList = document.getElementById("taskList");
const taskTemplate = document.getElementById("taskTemplate");
const emptyState = document.getElementById("emptyState");
const totalCount = document.getElementById("totalCount");
const completedCount = document.getElementById("completedCount");
const activeCount = document.getElementById("activeCount");
const taskSummary = document.getElementById("taskSummary");
const statusBanner = document.getElementById("statusBanner");

let tasks = [];

form.addEventListener("submit", handleTaskSubmit);
searchInput.addEventListener("input", renderTasks);
statusFilter.addEventListener("change", renderTasks);
sortSelect.addEventListener("change", renderTasks);
clearCompletedBtn.addEventListener("click", clearCompletedTasks);

initializeApp();

// Выполняем первую загрузку задач при открытии страницы.
async function initializeApp() {
  showStatus("Загрузка задач...");

  try {
    tasks = await fetchTasks();
    hideStatus();
    renderTasks();
  } catch (error) {
    handleRequestError("Не удалось загрузить задачи с сервера.", error);
  }
}

// Создаем новую задачу через API и сразу обновляем интерфейс.
async function handleTaskSubmit(event) {
  event.preventDefault();

  const title = taskInput.value.trim();

  if (!title) {
    taskInput.focus();
    return;
  }

  const payload = {
    title,
    category: categoryInput.value.trim(),
    priority: priorityInput.value,
    deadline: deadlineInput.value
  };

  try {
    const createdTask = await request(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    tasks.unshift(createdTask);
    form.reset();
    priorityInput.value = "medium";
    taskInput.focus();
    hideStatus();
    renderTasks();
  } catch (error) {
    handleRequestError("Не удалось создать задачу.", error);
  }
}

// Отрисовываем задачи с учетом поиска, фильтрации и сортировки.
function renderTasks() {
  const preparedTasks = getPreparedTasks();
  taskList.innerHTML = "";

  emptyState.classList.toggle("empty-state--visible", preparedTasks.length === 0);

  preparedTasks.forEach((task) => {
    const taskNode = taskTemplate.content.firstElementChild.cloneNode(true);
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
    deadline.textContent = task.deadline
      ? `Дедлайн: ${formatDate(task.deadline)}`
      : "Без дедлайна";

    editButton.addEventListener("click", () => editTask(task.id));
    deleteButton.addEventListener("click", () => deleteTask(task.id));

    taskList.append(taskNode);
  });

  updateSummary(preparedTasks.length);
  updateCounters();
}

// Подготавливаем список задач перед отрисовкой на странице.
function getPreparedTasks() {
  const searchTerm = searchInput.value.trim().toLowerCase();
  const filterValue = statusFilter.value;

  const filteredTasks = tasks.filter((task) => {
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
    switch (sortSelect.value) {
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

// Переключаем состояние выполнения и синхронизируем его с сервером.
async function toggleTaskStatus(taskId) {
  const task = tasks.find((item) => item.id === taskId);

  if (!task) {
    return;
  }

  try {
    const updatedTask = await request(`${API_URL}/${taskId}`, {
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
    hideStatus();
    renderTasks();
  } catch (error) {
    handleRequestError("Не удалось изменить статус задачи.", error);
  }
}

// Редактируем задачу через простые prompt-окна и отправляем обновление на сервер.
async function editTask(taskId) {
  const task = tasks.find((item) => item.id === taskId);

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

  const nextPriority = window.prompt(
    "Введите приоритет: low, medium или high",
    task.priority
  );

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
    const updatedTask = await request(`${API_URL}/${taskId}`, {
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
    hideStatus();
    renderTasks();
  } catch (error) {
    handleRequestError("Не удалось сохранить изменения задачи.", error);
  }
}

// Удаляем одну задачу по идентификатору.
async function deleteTask(taskId) {
  try {
    await request(`${API_URL}/${taskId}`, {
      method: "DELETE"
    });

    tasks = tasks.filter((task) => task.id !== taskId);
    hideStatus();
    renderTasks();
  } catch (error) {
    handleRequestError("Не удалось удалить задачу.", error);
  }
}

// Удаляем все выполненные задачи одним серверным запросом.
async function clearCompletedTasks() {
  const completedTasks = tasks.filter((task) => task.completed).length;

  if (completedTasks === 0) {
    window.alert("Нет выполненных задач для удаления.");
    return;
  }

  try {
    await request(`${API_URL}?completed=true`, {
      method: "DELETE"
    });

    tasks = tasks.filter((task) => !task.completed);
    hideStatus();
    renderTasks();
  } catch (error) {
    handleRequestError("Не удалось очистить выполненные задачи.", error);
  }
}

// Получаем список задач с сервера.
async function fetchTasks() {
  return request(API_URL);
}

// Унифицированная обертка над fetch с разбором ошибок от API.
async function request(url, options = {}) {
  const response = await fetch(url, options);
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message =
      typeof data === "object" && data !== null && "message" in data
        ? data.message
        : "Ошибка запроса.";
    throw new Error(message);
  }

  return data;
}

// Подменяем задачу в локальном массиве после успешного ответа сервера.
function replaceTask(updatedTask) {
  tasks = tasks.map((task) => (task.id === updatedTask.id ? updatedTask : task));
}

// Обновляем счетчики в верхней части интерфейса.
function updateCounters() {
  const completedTasks = tasks.filter((task) => task.completed).length;
  const activeTasks = tasks.length - completedTasks;

  totalCount.textContent = String(tasks.length);
  completedCount.textContent = String(completedTasks);
  activeCount.textContent = String(activeTasks);
}

// Показываем краткую сводку по отображаемым задачам.
function updateSummary(visibleCount) {
  if (tasks.length === 0) {
    taskSummary.textContent = "Нет задач";
    return;
  }

  taskSummary.textContent = `Показано задач: ${visibleCount} из ${tasks.length}`;
}

// Форматируем дату в удобный для пользователя вид.
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

// Сортировка с дедлайном в приоритете, а задачи без дедлайна идут в конец.
function sortByDeadline(firstTask, secondTask) {
  const firstDeadline = firstTask.deadline ? new Date(firstTask.deadline).getTime() : Infinity;
  const secondDeadline = secondTask.deadline ? new Date(secondTask.deadline).getTime() : Infinity;
  return firstDeadline - secondDeadline;
}

// Вес приоритета используется для сортировки списка.
function priorityWeight(priority) {
  const weights = {
    low: 1,
    medium: 2,
    high: 3
  };

  return weights[priority] ?? weights.medium;
}

// Человекочитаемые подписи для отображения приоритета.
function priorityLabel(priority) {
  const labels = {
    low: "Низкий приоритет",
    medium: "Средний приоритет",
    high: "Высокий приоритет"
  };

  return labels[priority] ?? labels.medium;
}

// Нормализуем приоритет на клиенте до отправки на сервер.
function normalizePriority(priority) {
  const value = priority.trim().toLowerCase();
  return ["low", "medium", "high"].includes(value) ? value : "medium";
}

// Показываем пользователю статус загрузки или ошибки.
function showStatus(message, type = "info") {
  statusBanner.hidden = false;
  statusBanner.textContent = message;
  statusBanner.dataset.type = type;
}

// Прячем строку статуса, когда операция завершилась успешно.
function hideStatus() {
  statusBanner.hidden = true;
  statusBanner.textContent = "";
  statusBanner.dataset.type = "info";
}

// Общая обработка ошибок сети и сервера.
function handleRequestError(message, error) {
  console.error(message, error);
  showStatus(`${message} ${error.message}`, "error");
}
