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
    draggedTaskId: null,
    activeView: "dashboard",
    security: null,
    preferences: loadPreferences()
  };

  window.appState.trash = window.appState.trash || [];

  const elements = collectElements();
  bindEvents();

  taskManager.loadTasks = loadTasks;
  taskManager.renderTasks = renderTasks;
  applyPreferences();
  renderTasks();

  async function loadTasks() {
    showInfo("Loading workspace...");

    try {
      const [tasks, trash, session] = await Promise.all([
        window.request("/api/tasks"),
        window.request("/api/tasks/trash"),
        window.request("/api/auth/session")
      ]);

      window.appState.tasks = tasks;
      window.appState.trash = trash;
      uiState.security = session.security || null;
      hydrateManualOrder();
      syncManualOrderWithTasks();
      uiState.selectedTaskIds.clear();
      uiState.visibleLimit = uiState.pageSize;
      window.hideBanner(elements.taskStatusBanner);
      renderTasks();
    } catch (error) {
      showError(`Failed to load workspace. ${error.message}`);
    }
  }

  function bindEvents() {
    elements.form.addEventListener("submit", handleTaskSubmit);
    elements.quickAddBtn.addEventListener("click", openQuickTaskModal);
    elements.searchInput.addEventListener("input", handleQueryChange);
    elements.statusFilter.addEventListener("change", handleQueryChange);
    elements.sortSelect.addEventListener("change", handleQueryChange);
    elements.clearCompletedBtn.addEventListener("click", clearCompletedTasks);
    elements.selectVisibleBtn.addEventListener("click", toggleSelectVisible);
    elements.markSelectedCompletedBtn.addEventListener("click", completeSelectedTasks);
    elements.deleteSelectedBtn.addEventListener("click", deleteSelectedTasks);
    elements.bulkEditBtn.addEventListener("click", openBulkEditModal);
    elements.exportSelectedBtn.addEventListener("click", exportSelectedTasks);
    elements.loadMoreBtn.addEventListener("click", loadMoreTasks);
    elements.clearTrashBtn.addEventListener("click", clearTrash);
    elements.exportAllBtn.addEventListener("click", exportAllTasks);
    elements.importTasksBtn.addEventListener("click", openImportModal);
    elements.logoutAllBtn.addEventListener("click", logoutAllSessions);
    elements.openSecurityBtn.addEventListener("click", () => switchView("settings"));
    elements.compactModeInput.addEventListener("change", () => {
      uiState.preferences.compactMode = elements.compactModeInput.checked;
      savePreferences(uiState.preferences);
      applyPreferences();
    });
    elements.dashboardDoneInput.addEventListener("change", () => {
      uiState.preferences.dashboardDone = elements.dashboardDoneInput.checked;
      savePreferences(uiState.preferences);
      renderDashboard();
    });

    elements.viewButtons.forEach((button) => {
      button.addEventListener("click", () => switchView(button.dataset.view));
    });

    elements.taskModalForm.addEventListener("submit", saveTaskFromModal);
    elements.bulkModalForm.addEventListener("submit", applyBulkEdit);
    document.addEventListener("keydown", handleEscapeKey);
    document.querySelectorAll("[data-close-modal]").forEach((node) => {
      node.addEventListener("click", closeModals);
    });
    elements.confirmCancelBtn.addEventListener("click", closeModals);
    elements.textModalSecondaryBtn.addEventListener("click", closeModals);
  }

  async function handleTaskSubmit(event) {
    event.preventDefault();

    const title = elements.taskInput.value.trim();

    if (!title) {
      elements.taskInput.focus();
      return;
    }

    await createTask({
      title,
      category: elements.categoryInput.value.trim(),
      priority: elements.priorityInput.value,
      deadline: elements.deadlineInput.value,
      notes: ""
    });

    elements.form.reset();
    elements.priorityInput.value = "medium";
    elements.taskInput.focus();
  }

  async function createTask(payload) {
    try {
      const createdTask = await window.request("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      window.appState.tasks.unshift(createdTask);
      syncManualOrderWithTasks(true);
      uiState.visibleLimit = uiState.pageSize;
      window.hideBanner(elements.taskStatusBanner);
      renderTasks();
      return createdTask;
    } catch (error) {
      showError(`Failed to create task. ${error.message}`);
      return null;
    }
  }

  function renderTasks() {
    pruneSelectedIds();
    renderTaskList();
    renderDashboard();
    renderTimeline();
    renderTrash();
    renderAnalytics();
    renderSettings();
    updateCounters();
  }

  function renderTaskList() {
    const preparedTasks = getPreparedTasks();
    const visibleTasks = preparedTasks.slice(0, uiState.visibleLimit);
    const canDrag = canUseManualOrder();

    elements.taskList.innerHTML = "";
    elements.emptyState.classList.toggle("empty-state--visible", preparedTasks.length === 0);

    visibleTasks.forEach((task) => {
      elements.taskList.append(createTaskNode(task, canDrag));
    });

    updateLoadMore(preparedTasks.length, visibleTasks.length);
    updateSummary(preparedTasks.length);
    updateBulkControls(visibleTasks);
  }

  function createTaskNode(task, canDrag) {
    const taskNode = elements.taskTemplate.content.firstElementChild.cloneNode(true);
    const dragHandle = taskNode.querySelector(".drag-handle");
    const select = taskNode.querySelector(".task-select");
    const toggle = taskNode.querySelector(".task-toggle");
    const title = taskNode.querySelector(".task-title");
    const notes = taskNode.querySelector(".task-notes");
    const priorityBadge = taskNode.querySelector(".priority-badge");
    const category = taskNode.querySelector(".task-category");
    const created = taskNode.querySelector(".task-created");
    const deadline = taskNode.querySelector(".task-deadline");

    taskNode.dataset.id = task.id;
    taskNode.classList.toggle("task-item--completed", task.completed);
    taskNode.classList.toggle("task-item--drag-enabled", canDrag);
    taskNode.draggable = canDrag;
    dragHandle.hidden = !canDrag;

    if (canDrag) {
      taskNode.addEventListener("dragstart", () => handleDragStart(task.id, taskNode));
      taskNode.addEventListener("dragover", (event) => handleDragOver(event, taskNode));
      taskNode.addEventListener("dragleave", () =>
        taskNode.classList.remove("task-item--drag-over")
      );
      taskNode.addEventListener("drop", () => handleDrop(task.id));
      taskNode.addEventListener("dragend", () => {
        uiState.draggedTaskId = null;
        taskNode.classList.remove("task-item--dragging", "task-item--drag-over");
      });
    }

    select.checked = uiState.selectedTaskIds.has(task.id);
    select.addEventListener("change", () => toggleTaskSelection(task.id, select.checked));
    toggle.checked = task.completed;
    toggle.addEventListener("change", () => toggleTaskStatus(task.id));

    title.textContent = task.title;
    notes.textContent = task.notes || "";
    notes.hidden = !task.notes;
    priorityBadge.textContent = priorityLabel(task.priority);
    priorityBadge.dataset.priority = task.priority;
    category.textContent = task.category ? `Category: ${task.category}` : "No category";
    created.textContent = `Created: ${formatDate(task.createdAt)}`;
    deadline.textContent = task.deadline ? `Deadline: ${formatDate(task.deadline)}` : "No deadline";

    taskNode
      .querySelector(".details-button")
      .addEventListener("click", () => openTaskModal(task.id));
    taskNode
      .querySelector(".duplicate-button")
      .addEventListener("click", () => duplicateTask(task.id));
    taskNode.querySelector(".snooze-button").addEventListener("click", () => snoozeTask(task.id));
    taskNode.querySelector(".delete-button").addEventListener("click", () => deleteTask(task.id));

    return taskNode;
  }

  function getPreparedTasks() {
    const searchTerm = elements.searchInput.value.trim().toLowerCase();
    const filterValue = elements.statusFilter.value;

    const filteredTasks = window.appState.tasks.filter((task) => {
      const matchesSearch = [task.title, task.category, task.notes, priorityLabel(task.priority)]
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
        const firstIndex = orderMap.has(firstTask.id)
          ? orderMap.get(firstTask.id)
          : Number.MAX_SAFE_INTEGER;
        const secondIndex = orderMap.has(secondTask.id)
          ? orderMap.get(secondTask.id)
          : Number.MAX_SAFE_INTEGER;

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
    const task = findTask(taskId);

    if (!task) {
      return;
    }

    await updateTask(taskId, { completed: !task.completed });
  }

  async function updateTask(taskId, changes) {
    const task = findTask(taskId);

    if (!task) {
      return null;
    }

    try {
      const updatedTask = await window.request(`/api/tasks/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...task, ...changes })
      });

      replaceTask(updatedTask);
      window.hideBanner(elements.taskStatusBanner);
      renderTasks();
      return updatedTask;
    } catch (error) {
      showError(`Failed to update task. ${error.message}`);
      return null;
    }
  }

  function openQuickTaskModal() {
    openTaskModal(null);
  }

  function openTaskModal(taskId) {
    const task = taskId ? findTask(taskId) : null;

    elements.taskModalTitle.textContent = task ? "Task details" : "Quick add";
    elements.taskModalId.value = task ? task.id : "";
    elements.taskModalTaskTitle.value = task ? task.title : "";
    elements.taskModalCategory.value = task ? task.category || "" : "";
    elements.taskModalPriority.value = task ? task.priority : "medium";
    elements.taskModalDeadline.value = task && task.deadline ? toDateTimeLocal(task.deadline) : "";
    elements.taskModalCompleted.checked = task ? task.completed : false;
    elements.taskModalNotes.value = task ? task.notes || "" : "";
    openModal(elements.taskModal);
    elements.taskModalTaskTitle.focus();
  }

  async function saveTaskFromModal(event) {
    event.preventDefault();

    const taskId = elements.taskModalId.value;
    const payload = {
      title: elements.taskModalTaskTitle.value.trim(),
      category: elements.taskModalCategory.value.trim(),
      priority: elements.taskModalPriority.value,
      deadline: elements.taskModalDeadline.value,
      completed: elements.taskModalCompleted.checked,
      notes: elements.taskModalNotes.value.trim()
    };

    if (!payload.title) {
      elements.taskModalTaskTitle.focus();
      return;
    }

    const result = taskId ? await updateTask(taskId, payload) : await createTask(payload);

    if (result) {
      closeModals();
    }
  }

  async function duplicateTask(taskId) {
    const task = findTask(taskId);

    if (!task) {
      return;
    }

    await createTask({
      title: `${task.title} copy`,
      category: task.category,
      priority: task.priority,
      deadline: task.deadline,
      notes: task.notes
    });
  }

  async function snoozeTask(taskId) {
    const task = findTask(taskId);

    if (!task) {
      return;
    }

    const base = task.deadline ? new Date(task.deadline) : new Date();
    base.setDate(base.getDate() + 1);
    await updateTask(taskId, { deadline: toDateTimeLocal(base.toISOString()) });
  }

  async function deleteTask(taskId) {
    const confirmed = await confirmAction("Move to trash", "Move this task to trash?");

    if (!confirmed) {
      return;
    }

    try {
      await window.request(`/api/tasks/${taskId}`, { method: "DELETE" });
      const deletedTask = findTask(taskId);
      window.appState.tasks = window.appState.tasks.filter((task) => task.id !== taskId);
      if (deletedTask) {
        window.appState.trash.unshift({ ...deletedTask, deletedAt: Date.now() });
      }
      uiState.selectedTaskIds.delete(taskId);
      syncManualOrderWithTasks();
      renderTasks();
    } catch (error) {
      showError(`Failed to delete task. ${error.message}`);
    }
  }

  async function clearCompletedTasks() {
    const completedTasks = window.appState.tasks.filter((task) => task.completed).length;

    if (completedTasks === 0) {
      showInfo("No completed tasks to clear.");
      return;
    }

    const confirmed = await confirmAction(
      "Clear completed",
      `Move ${completedTasks} completed tasks to trash?`
    );

    if (!confirmed) {
      return;
    }

    try {
      await window.request("/api/tasks?completed=true", { method: "DELETE" });
      await loadTasks();
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
    updateSummary(getPreparedTasks().length);
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

    renderTaskList();
  }

  async function completeSelectedTasks() {
    const ids = selectedIds();

    if (ids.length === 0) {
      showInfo("Select at least one task.");
      return;
    }

    await runBulkUpdate({ completed: true });
  }

  function openBulkEditModal() {
    if (selectedIds().length === 0) {
      showInfo("Select at least one task.");
      return;
    }

    elements.bulkModalForm.reset();
    openModal(elements.bulkModal);
  }

  async function applyBulkEdit(event) {
    event.preventDefault();

    const changes = {};
    if (elements.bulkCategory.value.trim()) {
      changes.category = elements.bulkCategory.value.trim();
    }
    if (elements.bulkPriority.value) {
      changes.priority = elements.bulkPriority.value;
    }
    if (elements.bulkDeadline.value) {
      changes.deadline = elements.bulkDeadline.value;
    }
    if (elements.bulkCompleted.checked) {
      changes.completed = true;
    }

    if (Object.keys(changes).length === 0) {
      closeModals();
      return;
    }

    await runBulkUpdate(changes);
    closeModals();
  }

  async function runBulkUpdate(changes) {
    const ids = selectedIds();

    try {
      const result = await window.request("/api/tasks/bulk", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, changes })
      });

      result.tasks.forEach(replaceTask);
      showInfo(`Updated ${result.updatedCount} tasks.`);
      renderTasks();
    } catch (error) {
      showError(`Failed to update selected tasks. ${error.message}`);
    }
  }

  async function deleteSelectedTasks() {
    const ids = selectedIds();

    if (ids.length === 0) {
      showInfo("Select at least one task.");
      return;
    }

    const confirmed = await confirmAction(
      "Move selected to trash",
      `Move ${ids.length} selected tasks to trash?`
    );

    if (!confirmed) {
      return;
    }

    try {
      await Promise.all(
        ids.map((taskId) => window.request(`/api/tasks/${taskId}`, { method: "DELETE" }))
      );
      uiState.selectedTaskIds.clear();
      await loadTasks();
    } catch (error) {
      showError(`Failed to delete selected tasks. ${error.message}`);
    }
  }

  function exportSelectedTasks() {
    const ids = selectedIds();

    if (ids.length === 0) {
      showInfo("Select at least one task.");
      return;
    }

    const tasks = window.appState.tasks.filter((task) => uiState.selectedTaskIds.has(task.id));
    openExportModal({ exportedAt: new Date().toISOString(), tasks });
  }

  async function exportAllTasks() {
    try {
      const data = await window.request("/api/tasks/export");
      openExportModal(data);
    } catch (error) {
      showError(`Failed to export tasks. ${error.message}`);
    }
  }

  function openExportModal(data) {
    elements.textModalTitle.textContent = "Export JSON";
    elements.textModalValue.value = JSON.stringify(data, null, 2);
    elements.textModalValue.readOnly = true;
    elements.textModalPrimaryBtn.textContent = "Close";
    elements.textModalPrimaryBtn.onclick = closeModals;
    openModal(elements.textModal);
  }

  function openImportModal() {
    elements.textModalTitle.textContent = "Import JSON";
    elements.textModalValue.value = "";
    elements.textModalValue.readOnly = false;
    elements.textModalPrimaryBtn.textContent = "Import";
    elements.textModalPrimaryBtn.onclick = importTasks;
    openModal(elements.textModal);
    elements.textModalValue.focus();
  }

  async function importTasks() {
    try {
      const parsed = JSON.parse(elements.textModalValue.value);
      const tasks = Array.isArray(parsed) ? parsed : parsed.tasks;
      const result = await window.request("/api/tasks/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tasks })
      });

      closeModals();
      showInfo(`Imported ${result.importedCount} tasks.`);
      await loadTasks();
    } catch (error) {
      showError(`Failed to import tasks. ${error.message}`);
    }
  }

  function renderDashboard() {
    const today = startOfDay(new Date());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const overdue = window.appState.tasks.filter((task) => isOverdue(task));
    const dueToday = window.appState.tasks.filter((task) => {
      const deadline = task.deadline ? new Date(task.deadline) : null;
      return deadline && deadline >= today && deadline < tomorrow;
    });
    const highPriority = window.appState.tasks.filter(
      (task) => task.priority === "high" && !task.completed
    );
    const recentlyDone = window.appState.tasks.filter((task) => task.completed).slice(0, 4);

    const cards = [
      dashboardCard("Overdue", overdue),
      dashboardCard("Due today", dueToday),
      dashboardCard("High priority", highPriority)
    ];

    if (uiState.preferences.dashboardDone) {
      cards.push(dashboardCard("Recently completed", recentlyDone));
    }

    elements.dashboardGrid.innerHTML = cards.join("");
  }

  function dashboardCard(title, tasks) {
    const items = tasks
      .slice(0, 5)
      .map((task) => `<li>${escapeHtml(task.title)}</li>`)
      .join("");
    return `
      <article class="dashboard-card">
        <div class="dashboard-card__top">
          <h3>${title}</h3>
          <strong>${tasks.length}</strong>
        </div>
        <ul>${items || "<li>No tasks</li>"}</ul>
      </article>
    `;
  }

  function renderTimeline() {
    const tasks = window.appState.tasks
      .filter((task) => task.deadline)
      .sort(sortByDeadline)
      .slice(0, 30);

    elements.timelineList.innerHTML =
      tasks
        .map(
          (task) => `
            <article class="timeline-item">
              <time>${formatDate(task.deadline)}</time>
              <div>
                <h3>${escapeHtml(task.title)}</h3>
                <p>${escapeHtml(task.category || "No category")} • ${priorityLabel(task.priority)}</p>
              </div>
            </article>
          `
        )
        .join("") ||
      `<div class="empty-state empty-state--visible"><h3>No deadlines</h3><p>Add deadlines to build a timeline.</p></div>`;
  }

  function renderTrash() {
    elements.trashList.innerHTML = "";
    elements.trashEmptyState.classList.toggle(
      "empty-state--visible",
      window.appState.trash.length === 0
    );

    window.appState.trash.forEach((task) => {
      const node = elements.trashTemplate.content.firstElementChild.cloneNode(true);
      node.querySelector(".task-title").textContent = task.title;
      node.querySelector(".task-notes").textContent = task.notes || "";
      node.querySelector(".task-notes").hidden = !task.notes;
      const badge = node.querySelector(".priority-badge");
      badge.textContent = priorityLabel(task.priority);
      badge.dataset.priority = task.priority;
      node.querySelector(".task-category").textContent = task.category
        ? `Category: ${task.category}`
        : "No category";
      node.querySelector(".task-deleted").textContent = `Deleted: ${formatDate(task.deletedAt)}`;
      node.querySelector(".restore-button").addEventListener("click", () => restoreTask(task.id));
      node
        .querySelector(".permanent-delete-button")
        .addEventListener("click", () => permanentlyDeleteTask(task.id));
      elements.trashList.append(node);
    });
  }

  async function restoreTask(taskId) {
    try {
      const restored = await window.request(`/api/tasks/${taskId}/restore`, { method: "POST" });
      window.appState.trash = window.appState.trash.filter((task) => task.id !== taskId);
      window.appState.tasks.unshift(restored);
      syncManualOrderWithTasks(true);
      renderTasks();
    } catch (error) {
      showError(`Failed to restore task. ${error.message}`);
    }
  }

  async function permanentlyDeleteTask(taskId) {
    const confirmed = await confirmAction(
      "Delete forever",
      "This task cannot be restored after deletion."
    );

    if (!confirmed) {
      return;
    }

    try {
      await window.request(`/api/tasks/${taskId}/permanent`, { method: "DELETE" });
      window.appState.trash = window.appState.trash.filter((task) => task.id !== taskId);
      renderTrash();
    } catch (error) {
      showError(`Failed to delete task forever. ${error.message}`);
    }
  }

  async function clearTrash() {
    if (window.appState.trash.length === 0) {
      showInfo("Trash is already empty.");
      return;
    }

    const confirmed = await confirmAction("Clear trash", "Delete every task in trash forever?");

    if (!confirmed) {
      return;
    }

    try {
      await window.request("/api/tasks/trash/clear", { method: "DELETE" });
      window.appState.trash = [];
      renderTrash();
    } catch (error) {
      showError(`Failed to clear trash. ${error.message}`);
    }
  }

  function renderAnalytics() {
    const total = window.appState.tasks.length;
    const done = window.appState.tasks.filter((task) => task.completed).length;
    const byPriority = ["high", "medium", "low"].map((priority) => ({
      label: priorityLabel(priority),
      count: window.appState.tasks.filter((task) => task.priority === priority).length
    }));
    const categories = countBy(window.appState.tasks.map((task) => task.category || "No category"));
    const completionRate = total === 0 ? 0 : Math.round((done / total) * 100);

    elements.analyticsGrid.innerHTML = `
      <article class="analytics-card">
        <h3>Completion</h3>
        <strong>${completionRate}%</strong>
        <div class="progress"><span style="width: ${completionRate}%"></span></div>
      </article>
      <article class="analytics-card">
        <h3>Priority mix</h3>
        ${byPriority.map((item) => statRow(item.label, item.count, total)).join("")}
      </article>
      <article class="analytics-card">
        <h3>Categories</h3>
        ${
          Object.entries(categories)
            .slice(0, 6)
            .map(([label, count]) => statRow(label, count, total))
            .join("") || "<p>No categories yet</p>"
        }
      </article>
    `;
  }

  function statRow(label, count, total) {
    const percent = total === 0 ? 0 : Math.round((count / total) * 100);
    return `
      <div class="stat-row">
        <span>${escapeHtml(label)}</span>
        <strong>${count}</strong>
        <div class="progress"><span style="width: ${percent}%"></span></div>
      </div>
    `;
  }

  function renderSettings() {
    elements.activeSessionsValue.textContent = String(uiState.security?.activeSessions || 1);
    elements.sessionExpiresValue.textContent = uiState.security?.currentSessionExpiresAt
      ? formatDate(uiState.security.currentSessionExpiresAt)
      : "Unknown";
  }

  async function logoutAllSessions() {
    const confirmed = await confirmAction(
      "Sign out everywhere",
      "End all sessions for this account?"
    );

    if (!confirmed) {
      return;
    }

    try {
      await window.request("/api/auth/logout-all", { method: "POST" });
      window.appState.currentUser = null;
      window.appState.tasks = [];
      window.appState.trash = [];
      if (typeof window.updateAuthView === "function") {
        window.updateAuthView();
      }
      renderTasks();
      showInfo("All sessions ended.");
    } catch (error) {
      showError(`Failed to sign out everywhere. ${error.message}`);
    }
  }

  function switchView(viewName) {
    uiState.activeView = viewName;
    elements.viewButtons.forEach((button) => {
      button.classList.toggle("tab-pill--active", button.dataset.view === viewName);
    });
    elements.viewPanels.forEach((panel) => {
      panel.classList.toggle("workspace-view--active", panel.dataset.viewPanel === viewName);
    });
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
    renderTaskList();
  }

  function canUseManualOrder() {
    return elements.sortSelect.value === "manual";
  }

  function handleQueryChange() {
    uiState.visibleLimit = uiState.pageSize;
    renderTaskList();
  }

  function loadMoreTasks() {
    uiState.visibleLimit += uiState.pageSize;
    renderTaskList();
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

    elements.selectVisibleBtn.textContent = allVisibleSelected
      ? "Unselect visible"
      : "Select visible";
    elements.markSelectedCompletedBtn.disabled = selectedCount === 0;
    elements.deleteSelectedBtn.disabled = selectedCount === 0;
    elements.bulkEditBtn.disabled = selectedCount === 0;
    elements.exportSelectedBtn.disabled = selectedCount === 0;
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
      elements.taskSummary.textContent = window.appState.currentUser
        ? "No tasks yet"
        : "Sign in to manage tasks";
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
      uiState.manualOrderIds = prependNewest
        ? [...missingIds, ...uiState.manualOrderIds]
        : [...uiState.manualOrderIds, ...missingIds];
    }

    persistManualOrder();
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
    } catch {
      uiState.manualOrderIds = [];
    }
  }

  function persistManualOrder() {
    const storageKey = manualOrderStorageKey();

    if (storageKey) {
      localStorage.setItem(storageKey, JSON.stringify(uiState.manualOrderIds));
    }
  }

  function manualOrderStorageKey() {
    const userId = window.appState.currentUser && window.appState.currentUser.id;
    return userId ? `taskflow.manualOrder.${userId}` : null;
  }

  function selectedIds() {
    return Array.from(uiState.selectedTaskIds);
  }

  function findTask(taskId) {
    return window.appState.tasks.find((task) => task.id === taskId);
  }

  function openModal(modal) {
    closeModals();
    modal.hidden = false;
    document.body.classList.add("modal-open");
  }

  function closeModals() {
    document.querySelectorAll(".modal").forEach((modal) => {
      modal.hidden = true;
    });
    document.body.classList.remove("modal-open");
  }

  function confirmAction(title, message) {
    elements.confirmTitle.textContent = title;
    elements.confirmMessage.textContent = message;
    openModal(elements.confirmModal);

    return new Promise((resolve) => {
      elements.confirmOkBtn.onclick = () => {
        closeModals();
        resolve(true);
      };
      elements.confirmCancelBtn.onclick = () => {
        closeModals();
        resolve(false);
      };
    });
  }

  function handleEscapeKey(event) {
    if (event.key === "Escape") {
      closeModals();
    }
  }

  function applyPreferences() {
    elements.compactModeInput.checked = uiState.preferences.compactMode;
    elements.dashboardDoneInput.checked = uiState.preferences.dashboardDone;
    document.body.classList.toggle("compact-mode", uiState.preferences.compactMode);
  }

  function showError(message) {
    window.showBanner(elements.taskStatusBanner, message, "error");
  }

  function showInfo(message) {
    window.showBanner(elements.taskStatusBanner, message, "info");
  }
}

function collectElements() {
  return {
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
    trashTemplate: document.getElementById("trashTemplate"),
    emptyState: document.getElementById("emptyState"),
    totalCount: document.getElementById("totalCount"),
    completedCount: document.getElementById("completedCount"),
    activeCount: document.getElementById("activeCount"),
    taskSummary: document.getElementById("taskSummary"),
    selectVisibleBtn: document.getElementById("selectVisibleBtn"),
    markSelectedCompletedBtn: document.getElementById("markSelectedCompletedBtn"),
    deleteSelectedBtn: document.getElementById("deleteSelectedBtn"),
    bulkEditBtn: document.getElementById("bulkEditBtn"),
    exportSelectedBtn: document.getElementById("exportSelectedBtn"),
    loadMoreWrap: document.getElementById("loadMoreWrap"),
    loadMoreInfo: document.getElementById("loadMoreInfo"),
    loadMoreBtn: document.getElementById("loadMoreBtn"),
    quickAddBtn: document.getElementById("quickAddBtn"),
    dashboardGrid: document.getElementById("dashboardGrid"),
    timelineList: document.getElementById("timelineList"),
    trashList: document.getElementById("trashList"),
    trashEmptyState: document.getElementById("trashEmptyState"),
    clearTrashBtn: document.getElementById("clearTrashBtn"),
    analyticsGrid: document.getElementById("analyticsGrid"),
    importTasksBtn: document.getElementById("importTasksBtn"),
    exportAllBtn: document.getElementById("exportAllBtn"),
    logoutAllBtn: document.getElementById("logoutAllBtn"),
    openSecurityBtn: document.getElementById("openSecurityBtn"),
    compactModeInput: document.getElementById("compactModeInput"),
    dashboardDoneInput: document.getElementById("dashboardDoneInput"),
    activeSessionsValue: document.getElementById("activeSessionsValue"),
    sessionExpiresValue: document.getElementById("sessionExpiresValue"),
    viewButtons: document.querySelectorAll("[data-view]"),
    viewPanels: document.querySelectorAll("[data-view-panel]"),
    taskModal: document.getElementById("taskModal"),
    taskModalForm: document.getElementById("taskModalForm"),
    taskModalTitle: document.getElementById("taskModalTitle"),
    taskModalId: document.getElementById("taskModalId"),
    taskModalTaskTitle: document.getElementById("taskModalTaskTitle"),
    taskModalCategory: document.getElementById("taskModalCategory"),
    taskModalPriority: document.getElementById("taskModalPriority"),
    taskModalDeadline: document.getElementById("taskModalDeadline"),
    taskModalCompleted: document.getElementById("taskModalCompleted"),
    taskModalNotes: document.getElementById("taskModalNotes"),
    bulkModal: document.getElementById("bulkModal"),
    bulkModalForm: document.getElementById("bulkModalForm"),
    bulkCategory: document.getElementById("bulkCategory"),
    bulkPriority: document.getElementById("bulkPriority"),
    bulkDeadline: document.getElementById("bulkDeadline"),
    bulkCompleted: document.getElementById("bulkCompleted"),
    textModal: document.getElementById("textModal"),
    textModalTitle: document.getElementById("textModalTitle"),
    textModalValue: document.getElementById("textModalValue"),
    textModalPrimaryBtn: document.getElementById("textModalPrimaryBtn"),
    textModalSecondaryBtn: document.getElementById("textModalSecondaryBtn"),
    confirmModal: document.getElementById("confirmModal"),
    confirmTitle: document.getElementById("confirmTitle"),
    confirmMessage: document.getElementById("confirmMessage"),
    confirmOkBtn: document.getElementById("confirmOkBtn"),
    confirmCancelBtn: document.getElementById("confirmCancelBtn")
  };
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

function toDateTimeLocal(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60 * 1000);
  return localDate.toISOString().slice(0, 16);
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

function isOverdue(task) {
  return Boolean(
    task.deadline && !task.completed && new Date(task.deadline).getTime() < Date.now()
  );
}

function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function countBy(values) {
  return values.reduce((accumulator, value) => {
    accumulator[value] = (accumulator[value] || 0) + 1;
    return accumulator;
  }, {});
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function loadPreferences() {
  try {
    return {
      compactMode: localStorage.getItem("taskflow.compactMode") === "true",
      dashboardDone: localStorage.getItem("taskflow.dashboardDone") !== "false"
    };
  } catch {
    return { compactMode: false, dashboardDone: true };
  }
}

function savePreferences(preferences) {
  localStorage.setItem("taskflow.compactMode", String(preferences.compactMode));
  localStorage.setItem("taskflow.dashboardDone", String(preferences.dashboardDone));
}
