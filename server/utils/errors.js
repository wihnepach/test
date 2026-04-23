class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function buildErrorBody(code, message, details) {
  const body = {
    code,
    message
  };

  if (details !== undefined) {
    body.details = details;
  }

  return body;
}

function createErrorResult(status, code, message, details) {
  return {
    status,
    body: buildErrorBody(code, message, details)
  };
}

function toHttpErrorPayload(error) {
  if (error instanceof AppError) {
    return {
      status: error.status,
      body: buildErrorBody(error.code, error.message, error.details)
    };
  }

  return {
    status: 500,
    body: buildErrorBody("INTERNAL_ERROR", "Internal server error.")
  };
}

function createValidationError(details, message = "Validation failed.") {
  return createErrorResult(400, "VALIDATION_ERROR", message, details);
}

module.exports = {
  AppError,
  createErrorResult,
  createValidationError,
  toHttpErrorPayload
};
