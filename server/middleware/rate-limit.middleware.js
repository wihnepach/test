const { createErrorResult } = require("../utils/errors");

function createRateLimiter(options) {
  const bucket = new Map();
  const windowMs = options.windowMs;
  const max = options.max;
  const keyPrefix = options.keyPrefix || "rate";
  const message = options.message || "Too many requests.";

  return (request, response, next) => {
    const now = Date.now();
    const ip = request.ip || request.socket?.remoteAddress || "unknown";
    const key = `${keyPrefix}:${ip}:${request.path}`;
    const current = bucket.get(key);

    if (!current || now > current.resetAt) {
      bucket.set(key, {
        count: 1,
        resetAt: now + windowMs
      });
      next();
      return;
    }

    current.count += 1;

    if (current.count > max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      response.set("Retry-After", String(retryAfterSeconds));
      const rateLimitError = createErrorResult(429, "RATE_LIMITED", message, {
        retryAfterSeconds
      });
      response.status(rateLimitError.status).json(rateLimitError.body);
      return;
    }

    next();
  };
}

module.exports = {
  createRateLimiter
};
