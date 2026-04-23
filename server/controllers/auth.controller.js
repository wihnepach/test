const authService = require("../services/auth.service");

async function register(request, response) {
  const result = await authService.registerUser(request.body);
  response.status(result.status).json(result.body);
}

async function verify(request, response) {
  const result = authService.verifyUser(request.body);

  if (result.userId) {
    authService.createSession(response, result.userId);
  }

  response.status(result.status).json(result.body);
}

async function resendVerification(request, response) {
  const result = authService.resendVerificationCode(request.body);
  response.status(result.status).json(result.body);
}

async function login(request, response) {
  const result = await authService.loginUser(request.body);

  if (result.userId) {
    authService.createSession(response, result.userId);
  }

  response.status(result.status).json(result.body);
}

async function session(request, response) {
  const sessionUser = authService.getSessionUser(request);

  if (!sessionUser) {
    response.json({ authenticated: false });
    return;
  }

  response.json({
    authenticated: true,
    user: authService.serializeUser(sessionUser)
  });
}

async function logout(request, response) {
  authService.destroySession(request, response);
  response.json({ message: "Logged out." });
}

module.exports = {
  register,
  verify,
  resendVerification,
  login,
  session,
  logout
};
