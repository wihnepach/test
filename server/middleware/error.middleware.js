const { toHttpErrorPayload } = require("../utils/errors");

function notFoundHandler(request, response) {
  response.status(404).json({
    code: "NOT_FOUND",
    message: `Route not found: ${request.method} ${request.originalUrl}`
  });
}

function errorHandler(error, request, response, _next) {
  if (process.env.NODE_ENV !== "test" && error?.type !== "entity.parse.failed") {
    console.error(error);
  }

  const payload = toHttpErrorPayload(error);
  response.status(payload.status).json(payload.body);
}

module.exports = {
  notFoundHandler,
  errorHandler
};
