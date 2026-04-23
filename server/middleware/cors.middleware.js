const env = require("../../config/env");
const { createErrorResult } = require("../utils/errors");

function corsMiddleware(request, response, next) {
  const origin = request.headers.origin;

  if (!origin) {
    next();
    return;
  }

  if (env.NODE_ENV !== "production") {
    applyCorsHeaders(response, origin);
    handleOptions(request, response, next);
    return;
  }

  if (env.CORS_ALLOWED_ORIGINS.includes(origin)) {
    applyCorsHeaders(response, origin);
    handleOptions(request, response, next);
    return;
  }

  const corsError = createErrorResult(403, "CORS_ORIGIN_DENIED", "Origin is not allowed.");
  response.status(corsError.status).json(corsError.body);
}

function applyCorsHeaders(response, origin) {
  response.set("Access-Control-Allow-Origin", origin);
  response.set("Access-Control-Allow-Credentials", "true");
  response.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  response.set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  response.set("Vary", "Origin");
}

function handleOptions(request, response, next) {
  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }

  next();
}

module.exports = {
  corsMiddleware
};
