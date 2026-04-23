const authService = require("../services/auth.service");
const { createErrorResult } = require("../utils/errors");

function requireAuth(request, response, next) {
  const sessionUser = authService.getSessionUser(request);

  if (!sessionUser) {
    const authError = createErrorResult(401, "AUTH_REQUIRED", "Authentication required.");
    response.status(authError.status).json(authError.body);
    return;
  }

  request.user = sessionUser;
  next();
}

module.exports = {
  requireAuth
};
