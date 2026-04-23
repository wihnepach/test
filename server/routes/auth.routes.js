const express = require("express");

const env = require("../../config/env");
const authService = require("../services/auth.service");
const { asyncHandler } = require("../utils/async-handler");
const { createRateLimiter } = require("../middleware/rate-limit.middleware");

const router = express.Router();
const authRateLimiter = createRateLimiter({
  windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
  max: env.AUTH_RATE_LIMIT_MAX,
  keyPrefix: "auth",
  message: "Too many auth requests. Please try again later."
});

router.post(
  "/register",
  authRateLimiter,
  asyncHandler(async (request, response) => {
    const result = await authService.registerUser(request.body);
    response.status(result.status).json(result.body);
  })
);

router.post(
  "/verify",
  authRateLimiter,
  asyncHandler(async (request, response) => {
    const result = authService.verifyUser(request.body);

    if (result.userId) {
      authService.createSession(response, result.userId);
    }

    response.status(result.status).json(result.body);
  })
);

router.post(
  "/resend-verification",
  authRateLimiter,
  asyncHandler(async (request, response) => {
    const result = authService.resendVerificationCode(request.body);
    response.status(result.status).json(result.body);
  })
);

router.post(
  "/login",
  authRateLimiter,
  asyncHandler(async (request, response) => {
    const result = await authService.loginUser(request.body);

    if (result.userId) {
      authService.createSession(response, result.userId);
    }

    response.status(result.status).json(result.body);
  })
);

router.get(
  "/session",
  asyncHandler(async (request, response) => {
    const sessionUser = authService.getSessionUser(request);

    if (!sessionUser) {
      response.json({ authenticated: false });
      return;
    }

    response.json({
      authenticated: true,
      user: authService.serializeUser(sessionUser)
    });
  })
);

router.post(
  "/logout",
  asyncHandler(async (request, response) => {
    authService.destroySession(request, response);
    response.json({ message: "Logged out." });
  })
);

module.exports = router;
