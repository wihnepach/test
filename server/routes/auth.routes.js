const express = require("express");

const authService = require("../services/auth.service");

const router = express.Router();

router.post("/register", async (request, response) => {
  const result = await authService.registerUser(request.body);
  response.status(result.status).json(result.body);
});

router.post("/verify", (request, response) => {
  const result = authService.verifyUser(request.body);

  if (result.userId) {
    authService.createSession(response, result.userId);
  }

  response.status(result.status).json(result.body);
});

router.post("/resend-verification", (request, response) => {
  const result = authService.resendVerificationCode(request.body);
  response.status(result.status).json(result.body);
});

router.post("/login", async (request, response) => {
  const result = await authService.loginUser(request.body);

  if (result.userId) {
    authService.createSession(response, result.userId);
  }

  response.status(result.status).json(result.body);
});

router.get("/session", (request, response) => {
  const sessionUser = authService.getSessionUser(request);

  if (!sessionUser) {
    response.json({ authenticated: false });
    return;
  }

  response.json({
    authenticated: true,
    user: authService.serializeUser(sessionUser)
  });
});

router.post("/logout", (request, response) => {
  authService.destroySession(request, response);
  response.json({ message: "Вы вышли из системы." });
});

module.exports = router;
