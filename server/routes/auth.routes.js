const express = require("express");

const env = require("../../config/env");
const authController = require("../controllers/auth.controller");
const { asyncHandler } = require("../utils/async-handler");
const { createRateLimiter } = require("../middleware/rate-limit.middleware");

const router = express.Router();
const authRateLimiter = createRateLimiter({
  windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
  max: env.AUTH_RATE_LIMIT_MAX,
  keyPrefix: "auth",
  message: "Too many auth requests. Please try again later."
});

router.post("/register", authRateLimiter, asyncHandler(authController.register));

router.post("/verify", authRateLimiter, asyncHandler(authController.verify));

router.post(
  "/resend-verification",
  authRateLimiter,
  asyncHandler(authController.resendVerification)
);

router.post("/login", authRateLimiter, asyncHandler(authController.login));

router.get("/session", asyncHandler(authController.session));

router.post("/logout", asyncHandler(authController.logout));

module.exports = router;
