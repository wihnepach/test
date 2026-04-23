const path = require("path");
const express = require("express");
const helmet = require("helmet");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");

const env = require("../config/env");
require("./db/database");

const authRoutes = require("./routes/auth.routes");
const tasksRoutes = require("./routes/tasks.routes");
const { notFoundHandler, errorHandler } = require("./middleware/error.middleware");

const app = express();

app.use(
  helmet({
    contentSecurityPolicy: false
  })
);
app.use(morgan("dev"));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(env.PUBLIC_DIR));

app.use("/api/auth", authRoutes);
app.use("/api/tasks", tasksRoutes);

app.get("/", (request, response) => {
  response.sendFile(path.join(env.PUBLIC_DIR, "index.html"));
});

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
