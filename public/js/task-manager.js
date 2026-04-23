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

  const uiState = {
    pageSize: 12,
    visibleLimit: 12,
    selectedTaskIds: new Set(),
    manualOrderIds: [],
    draggedTaskId: null
  };

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
    taskSummary: document.getElementById("taskSummary"),
    selectVisibleBtn: document.getElementById("selectVisibleBtn"),
    markSelectedCompletedBtn: document.getElementById("markSelectedCompletedBtn"),
    deleteSelectedBtn: document.getElementById("deleteSelectedBtn"),
    loadMoreWrap: document.getElementById("loadMoreWrap"),
    loadMoreInfo: document.getElementById("loadMoreInfo"),
    loadMoreBtn: document.getElementById("loadMoreBtn")
  };

  elements.form.addEventListener("submit", handleTaskSubmit);
  elements.searchInput.addEventListener("input", handleQueryChange);
  elements.statusFilter.addEventListener("change", handleQueryChange);
  elements.sortSelect.addEventListener("change", handleQueryChange);
  elements.clearCompletedBtn.addEventListener("click", clearCompletedTasks);
  elements.selectVisibleBtn.addEventListener("click", toggleSelectVisible);
  elements.markSelectedCompletedBtn.addEventListener("click", completeSelectedTasks);
  elements.deleteSelectedBtn.addEventListener("click", deleteSelectedTasks);
  elements.loadMoreBtn.addEventListener("click", loadMoreTasks);

  taskManager.loadTasks = loadTasks;
  taskManager.renderTasks = renderTasks;
  renderTasks();

  async function loadTasks() {
    showInfo("Loading tasks...");

    try {
      window.appState.tasks = await window.request("/api/tasks");
      hydrateManualOrder();
      syncManualOrderWithTasks();
      uiState.selectedTaskIds.clear();
      uiState.visibleLimit = uiState.pageSize;
      window.hideBanner(elements.taskStatusBanner);
      renderTasks();
    } catch (error) {
      showError(`Failed to load tasks. ${error.message}`);
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
      syncManualOrderWithTasks(true);
      elements.form.reset();
      elements.priorityInput.value = "medium";
      elements.taskInput.focus();
      uiState.visibleLimit = uiState.pageSize;
      window.hideBanner(elements.taskStatusBanner);
      renderTasks();
    } catch (error) {
      showError(`Failed to create task. ${error.message}`);
    }
  }

  function renderTasks() {
    pruneSelectedIds();

    const preparedTasks = getPreparedTasks();
    const visibleTasks = preparedTasks.slice(0, uiState.visibleLimit);
    const canDrag = canUseManualOrder();

    elements.taskList.innerHTML = "";

    elements.emptyState.classList.toggle("empty-state--visible", preparedTasks.length === 0);

    visibleTasks.forEach((task) => {
      const taskNode = elements.taskTemplate.content.firstElementChild.cloneNode(true);
      const dragHandle = taskNode.querySelector(".drag-handle");
      const select = taskNode.querySelector(".task-select");
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
      taskNode.classList.toggle("task-item--drag-enabled", canDrag);

      taskNode.draggable = canDrag;
      dragHandle.hidden = !canDrag;

      if (canDrag) {
        taskNode.addEventListener("dragstart", () => handleDragStart(task.id, taskNode));
        taskNode.addEventListener("dragover", (event) => handleDragOver(event, taskNode));
        taskNode.addEventListener("dragleave", () => taskNode.classList.remove("task-item--drag-over"));
        taskNode.addEventListener("drop", () => handleDrop(task.id));
        taskNode.addEventListener("dragend", () => {
          uiState.draggedTaskId = null;
          taskNode.classList.remove("task-item--dragging");
          taskNode.classList.remove("task-item--drag-over");
        });
      }

      select.checked = uiState.selectedTaskIds.has(task.id);
      select.addEventListener("change", () => toggleTaskSelection(task.id, select.checked));

      toggle.checked = task.completed;
      toggle.addEventListener("change", () => toggleTaskStatus(task.id));

      title.textContent = task.title;
      priorityBadge.textContent = priorityLabel(task.priority);
      priorityBadge.dataset.priority = task.priority;
      category.textContent = task.category ? `Category: ${task.category}` : "No category";
      created.textContent = `Created: ${formatDate(task.createdAt)}`;
      deadline.textContent = task.deadline ? `Deadline: ${formatDate(task.deadline)}` : "No deadline";

      editButton.addEventListener("click", () => editTask(task.id));
      deleteButton.addEventListener("click", () => deleteTask(task.id));

      elements.taskList.append(taskNode);
    });

    updateLoadMore(preparedTasks.length, visibleTasks.length);
    updateSummary(preparedTasks.length);
    updateCounters();
    updateBulkControls(visibleTasks);
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

    if (elements.sortSelect.value === "manual") {
      const orderMap = new Map(uiState.manualOrderIds.map((id, index) => [id, index]));
      return filteredTasks.sort((firstTask, secondTask) => {
        const firstIndex = orderMap.has(firstTask.id) ? orderMap.get(firstTask.id) : Number.MAX_SAFE_INTEGER;
        const secondIndex = orderMap.has(secondTask.id) ? orderMap.get(secondTask.id) : Number.MAX_SAFE_INTEGER;

        if (firstIndex !== secondIndex) {
          return firstIndex - secondIndex;
        }

        return secondTask.createdAt - firstTask.createdAt;
      });
    }

    return filteredTasks.sort((firstTask, secondTask) => {
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
      showError(`Failed to update task status. ${error.message}`);
    }
  }

  async function editTask(taskId) {
    const task = window.appState.tasks.find((item) => item.id === taskId);

    if (!task) {
      return;
    }

    const nextTitle = window.prompt("Edit task title:", task.title);

    if (nextTitle === null) {
      return;
    }

    const trimmedTitle = nextTitle.trim();

    if (!trimmedTitle) {
      window.alert("Task title cannot be empty.");
      return;
    }

    const nextCategory = window.prompt("Edit category:", task.category);

    if (nextCategory === null) {
      return;
    }

    const nextPriority = window.prompt("Enter priority: low, medium or high", task.priority);

    if (nextPriority === null) {
      return;
    }

    const nextDeadline = window.prompt(
      "Enter deadline in format YYYY-MM-DDTHH:MM or leave empty:",
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
      showError(`Failed to save task changes. ${error.message}`);
    }
  }

  async function deleteTask(taskId) {
    try {
      await window.request(`/api/tasks/${taskId}`, { method: "DELETE" });
      window.appState.tasks = window.appState.tasks.filter((task) => task.id !== taskId);
      uiState.selectedTaskIds.delete(taskId);
      syncManualOrderWithTasks();
      window.hideBanner(elements.taskStatusBanner);
      renderTasks();
    } catch (error) {
      showError(`Failed to delete task. ${error.message}`);
    }
  }

  async function clearCompletedTasks() {
    const completedTasks = window.appState.tasks.filter((task) => task.completed).length;

    if (completedTasks === 0) {
      window.alert("No completed tasks to clear.");
      return;
    }

    try {
      await window.request("/api/tasks?completed=true", { method: "DELETE" });
      window.appState.tasks = window.appState.tasks.filter((task) => !task.completed);
      pruneSelectedIds();
      syncManualOrderWithTasks();
      window.hideBanner(elements.taskStatusBanner);
      renderTasks();
    } catch (error) {
      showError(`Failed to clear completed tasks. ${error.message}`);
    }
  }

  function toggleTaskSelection(taskId, isSelected) {
    if (isSelected) {
      uiState.selectedTaskIds.add(taskId);
    } else {
      uiState.selectedTaskIds.delete(taskId);
    }

    updateBulkControls(getPreparedTasks().slice(0, uiState.visibleLimit));
  }

  function toggleSelectVisible() {
    const visibleTasks = getPreparedTasks().slice(0, uiState.visibleLimit);
    const allVisibleSelected =
      visibleTasks.length > 0 && visibleTasks.every((task) => uiState.selectedTaskIds.has(task.id));

    visibleTasks.forEach((task) => {
      if (allVisibleSelected) {
        uiState.selectedTaskIds.delete(task.id);
      } else {
        uiState.selectedTaskIds.add(task.id);
      }
    });

    renderTasks();
  }

  async function completeSelectedTasks() {
    const selectedTasks = window.appState.tasks.filter((task) => uiState.selectedTaskIds.has(task.id));

    if (selectedTasks.length === 0) {
      window.alert("Select at least one task.");
      return;
    }

    const targets = selectedTasks.filter((task) => !task.completed);

    if (targets.length === 0) {
      window.alert("Selected tasks are already completed.");
      return;
    }

    try {
      await Promise.all(
        targets.map((task) =>
          window.request(`/api/tasks/${task.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: task.title,
              category: task.category,
              priority: task.priority,
              deadline: task.deadline,
              completed: true
            })
          })
        )
      );

      window.appState.tasks = window.appState.tasks.map((task) =>
        uiState.selectedTaskIds.has(task.id) ? { ...task, completed: true } : task
      );
      window.hideBanner(elements.taskStatusBanner);
      renderTasks();
    } catch (error) {
      showError(`Failed to complete selected tasks. ${error.message}`);
    }
  }

  async function deleteSelectedTasks() {
    const selectedIds = Array.from(uiState.selectedTaskIds);

    if (selectedIds.length === 0) {
      window.alert("Select at least one task.");
      return;
    }

    const shouldDelete = window.confirm(`Delete selected tasks: ${selectedIds.length}?`);

    if (!shouldDelete) {
      return;
    }

    try {
      await Promise.all(selectedIds.map((taskId) => window.request(`/api/tasks/${taskId}`, { method: "DELETE" })));
      window.appState.tasks = window.appState.tasks.filter((task) => !uiState.selectedTaskIds.has(task.id));
      uiState.selectedTaskIds.clear();
      syncManualOrderWithTasks();
      window.hideBanner(elements.taskStatusBanner);
      renderTasks();
    } catch (error) {
      showError(`Failed to delete selected tasks. ${error.message}`);
    }
  }

  function handleDragStart(taskId, node) {
    uiState.draggedTaskId = taskId;
    node.classList.add("task-item--dragging");
  }

  function handleDragOver(event, node) {
    if (!uiState.draggedTaskId) {
      return;
    }

    event.preventDefault();
    node.classList.add("task-item--drag-over");
  }

  function handleDrop(targetTaskId) {
    if (!canUseManualOrder() || !uiState.draggedTaskId || uiState.draggedTaskId === targetTaskId) {
      return;
    }

    const order = [...uiState.manualOrderIds];
    const draggedIndex = order.indexOf(uiState.draggedTaskId);
    const targetIndex = order.indexOf(targetTaskId);

    if (draggedIndex < 0 || targetIndex < 0) {
      return;
    }

    order.splice(draggedIndex, 1);
    order.splice(targetIndex, 0, uiState.draggedTaskId);
    uiState.manualOrderIds = order;
    persistManualOrder();
    renderTasks();
  }

  function canUseManualOrder() {
    return elements.sortSelect.value === "manual";
  }

  function handleQueryChange() {
    uiState.visibleLimit = uiState.pageSize;
    renderTasks();
  }

  function loadMoreTasks() {
    uiState.visibleLimit += uiState.pageSize;
    renderTasks();
  }

  function updateLoadMore(totalPreparedCount, visibleCount) {
    const hasMore = visibleCount < totalPreparedCount;
    elements.loadMoreWrap.hidden = !hasMore;

    if (hasMore) {
      const remaining = totalPreparedCount - visibleCount;
      elements.loadMoreInfo.textContent = `Showing ${visibleCount} of ${totalPreparedCount}. Remaining: ${remaining}.`;
    }
  }

  function updateBulkControls(visibleTasks) {
    const selectedCount = uiState.selectedTaskIds.size;
    const allVisibleSelected =
      visibleTasks.length > 0 && visibleTasks.every((task) => uiState.selectedTaskIds.has(task.id));

    elements.selectVisibleBtn.textContent = allVisibleSelected ? "Unselect visible" : "Select visible";
    elements.markSelectedCompletedBtn.disabled = selectedCount === 0;
    elements.deleteSelectedBtn.disabled = selectedCount === 0;
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
      elements.taskSummary.textContent = window.appState.currentUser ? "No tasks yet" : "Sign in to manage tasks";
      return;
    }

    const selectedCount = uiState.selectedTaskIds.size;
    elements.taskSummary.textContent =
      `Visible: ${visibleCount} of ${window.appState.tasks.length}` +
      (selectedCount > 0 ? ` • Selected: ${selectedCount}` : "");
  }

  function pruneSelectedIds() {
    const allTaskIds = new Set(window.appState.tasks.map((task) => task.id));

    for (const taskId of uiState.selectedTaskIds) {
      if (!allTaskIds.has(taskId)) {
        uiState.selectedTaskIds.delete(taskId);
      }
    }
  }

  function syncManualOrderWithTasks(prependNewest = false) {
    const known = new Set(window.appState.tasks.map((task) => task.id));
    uiState.manualOrderIds = uiState.manualOrderIds.filter((id) => known.has(id));

    const existing = new Set(uiState.manualOrderIds);
    const missingIds = window.appState.tasks
      .map((task) => task.id)
      .filter((taskId) => !existing.has(taskId));

    if (missingIds.length > 0) {
      if (prependNewest) {
        uiState.manualOrderIds = [...missingIds, ...uiState.manualOrderIds];
      } else {
        uiState.manualOrderIds.push(...missingIds);
      }
    }

    persistManualOrder();
  }

  function manualOrderStorageKey() {
    const userId = window.appState.currentUser && window.appState.currentUser.id;

    if (!userId) {
      return null;
    }

    return `taskflow.manualOrder.${userId}`;
  }

  function hydrateManualOrder() {
    const storageKey = manualOrderStorageKey();

    if (!storageKey) {
      uiState.manualOrderIds = [];
      return;
    }

    try {
      const value = localStorage.getItem(storageKey);
      uiState.manualOrderIds = value ? JSON.parse(value) : [];
    } catch (error) {
      uiState.manualOrderIds = [];
    }
  }

  function persistManualOrder() {
    const storageKey = manualOrderStorageKey();

    if (!storageKey) {
      return;
    }

    localStorage.setItem(storageKey, JSON.stringify(uiState.manualOrderIds));
  }

  function showError(message) {
    window.showBanner(elements.taskStatusBanner, message, "error");
  }

  function showInfo(message) {
    window.showBanner(elements.taskStatusBanner, message, "info");
  }
}

function formatDate(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Invalid date";
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
    low: "Low priority",
    medium: "Medium priority",
    high: "High priority"
  };

  return labels[priority] ?? labels.medium;
}

function normalizePriority(priority) {
  const value = priority.trim().toLowerCase();
  return ["low", "medium", "high"].includes(value) ? value : "medium";
}
