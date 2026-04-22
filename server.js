// server.js
// Сервер приложения To-Do List на Node.js + Express.
// Отвечает за выдачу статических файлов и работу API для задач.

require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const morgan = require("morgan");
const Database = require("better-sqlite3");
const { v4: uuidv4 } = require("uuid");
const path = require("path");

const app = express();
const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT) || 3000;
const ROOT_DIR = __dirname;
const DATABASE_PATH = path.join(ROOT_DIR, "todo.db");

// Инициализируем SQLite-базу и создаем таблицу, если проект запускается впервые.
const db = new Database(DATABASE_PATH);
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    category TEXT DEFAULT '',
    priority TEXT NOT NULL DEFAULT 'medium',
    deadline TEXT DEFAULT '',
    completed INTEGER NOT NULL DEFAULT 0,
    createdAt INTEGER NOT NULL
  )
`);

// Базовые middleware для безопасности, логирования и чтения JSON-тела запросов.
app.use(
  helmet({
    contentSecurityPolicy: false
  })
);
app.use(morgan("dev"));
app.use(express.json());

// Отдаем клиентскую часть приложения из текущей папки проекта.
app.use(express.static(ROOT_DIR));

// Получение всех задач для первоначальной загрузки и обновления интерфейса.
app.get("/api/tasks", (request, response) => {
  const tasks = db
    .prepare(
      `
      SELECT id, title, category, priority, deadline, completed, createdAt
      FROM tasks
      ORDER BY createdAt DESC
      `
    )
    .all()
    .map(mapTaskRow);

  response.json(tasks);
});

// Создание новой задачи с серверной генерацией UUID.
app.post("/api/tasks", (request, response) => {
  const payload = normalizeTaskPayload(request.body);

  if (!payload.title) {
    response.status(400).json({ message: "Название задачи обязательно." });
    return;
  }

  const task = {
    id: uuidv4(),
    title: payload.title,
    category: payload.category,
    priority: payload.priority,
    deadline: payload.deadline,
    completed: false,
    createdAt: Date.now()
  };

  db.prepare(
    `
    INSERT INTO tasks (id, title, category, priority, deadline, completed, createdAt)
    VALUES (@id, @title, @category, @priority, @deadline, @completed, @createdAt)
    `
  ).run({
    ...task,
    completed: Number(task.completed)
  });

  response.status(201).json(task);
});

// Обновление существующей задачи после редактирования или смены статуса.
app.put("/api/tasks/:id", (request, response) => {
  const taskId = request.params.id;
  const existingTask = db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId);

  if (!existingTask) {
    response.status(404).json({ message: "Задача не найдена." });
    return;
  }

  const payload = normalizeTaskPayload(request.body, true);
  const updatedTask = {
    id: existingTask.id,
    title: payload.title || existingTask.title,
    category: payload.category ?? existingTask.category,
    priority: payload.priority || existingTask.priority,
    deadline: payload.deadline ?? existingTask.deadline,
    completed:
      typeof payload.completed === "boolean"
        ? payload.completed
        : Boolean(existingTask.completed),
    createdAt: existingTask.createdAt
  };

  if (!updatedTask.title.trim()) {
    response.status(400).json({ message: "Название задачи не может быть пустым." });
    return;
  }

  db.prepare(
    `
    UPDATE tasks
    SET title = @title,
        category = @category,
        priority = @priority,
        deadline = @deadline,
        completed = @completed
    WHERE id = @id
    `
  ).run({
    ...updatedTask,
    title: updatedTask.title.trim(),
    completed: Number(updatedTask.completed)
  });

  response.json(updatedTask);
});

// Удаление одной задачи по идентификатору.
app.delete("/api/tasks/:id", (request, response) => {
  const result = db.prepare("DELETE FROM tasks WHERE id = ?").run(request.params.id);

  if (result.changes === 0) {
    response.status(404).json({ message: "Задача не найдена." });
    return;
  }

  response.status(204).end();
});

// Массовое удаление всех выполненных задач.
app.delete("/api/tasks", (request, response) => {
  const deleteCompleted = request.query.completed === "true";

  if (!deleteCompleted) {
    response.status(400).json({ message: "Укажите completed=true для очистки." });
    return;
  }

  const result = db.prepare("DELETE FROM tasks WHERE completed = 1").run();
  response.json({ deletedCount: result.changes });
});

// Возвращаем index.html для главной страницы приложения.
app.get("/", (request, response) => {
  response.sendFile(path.join(ROOT_DIR, "index.html"));
});

app.listen(PORT, HOST, () => {
  console.log(`To-Do сервер запущен: http://${HOST}:${PORT}`);
});

// Приводим записи SQLite к удобному для фронтенда формату.
function mapTaskRow(task) {
  return {
    ...task,
    completed: Boolean(task.completed)
  };
}

// Нормализуем входные данные, чтобы сервер не зависел от формы запроса.
function normalizeTaskPayload(payload = {}, partial = false) {
  const normalizedTitle = typeof payload.title === "string" ? payload.title.trim() : "";
  const normalizedCategory =
    typeof payload.category === "string" ? payload.category.trim() : partial ? undefined : "";
  const normalizedDeadline =
    typeof payload.deadline === "string" ? payload.deadline.trim() : partial ? undefined : "";

  return {
    title: partial ? normalizedTitle || undefined : normalizedTitle,
    category: normalizedCategory,
    priority: normalizePriority(payload.priority, partial),
    deadline: normalizedDeadline,
    completed: typeof payload.completed === "boolean" ? payload.completed : undefined
  };
}

// Ограничиваем приоритет допустимыми значениями.
function normalizePriority(priority, partial = false) {
  if (typeof priority !== "string") {
    return partial ? undefined : "medium";
  }

  const value = priority.trim().toLowerCase();
  return ["low", "medium", "high"].includes(value) ? value : "medium";
}
