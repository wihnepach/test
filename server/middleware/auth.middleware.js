const authService = require("../services/auth.service");

function requireAuth(request, response, next) {
  const sessionUser = authService.getSessionUser(request);

  if (!sessionUser) {
    response.status(401).json({ message: "Сначала войдите в аккаунт." });
    return;
  }

  request.user = sessionUser;
  next();
}

module.exports = {
  requireAuth
};
