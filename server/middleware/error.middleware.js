const { toHttpErrorPayload } = require("../utils/errors");

function notFoundHandler(request, response) {
  response.status(404).json({
    code: "NOT_FOUND",
    message: `Route not found: ${request.method} ${request.originalUrl}`
  });
}

function errorHandler(error, request, response, next) {
  const payload = toHttpErrorPayload(error);
  response.status(payload.status).json(payload.body);
}

module.exports = {
  notFoundHandler,
  errorHandler
};
