const nodemailer = require("nodemailer");

const env = require("../../config/env");
const { AUTH_CONTACT_TYPE } = require("../constants/auth.constants");
const { createErrorResult } = require("../utils/errors");

let transporter;

function isSmtpConfigured() {
  return Boolean(env.SMTP_HOST);
}

function wait(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function isRateLimitError(error) {
  const message = `${error?.response || ""} ${error?.message || ""}`.toLowerCase();

  return error?.responseCode === 550 && message.includes("too many emails per second");
}

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
      auth:
        env.SMTP_USER && env.SMTP_PASS
          ? {
              user: env.SMTP_USER,
              pass: env.SMTP_PASS
            }
          : undefined
    });
  }

  return transporter;
}

async function sendMailWithRetry(message) {
  const retryDelays = [0, 5000, 10000];
  let lastError;

  for (const delay of retryDelays) {
    if (delay > 0) {
      await wait(delay);
    }

    try {
      return await getTransporter().sendMail(message);
    } catch (error) {
      lastError = error;

      if (!isRateLimitError(error)) {
        throw error;
      }
    }
  }

  throw lastError;
}

async function sendVerificationCode(contactType, contact, code, purpose = "verification") {
  if (contactType !== AUTH_CONTACT_TYPE.EMAIL) {
    return { sent: false, skipped: "UNSUPPORTED_CONTACT_TYPE" };
  }

  if (!isSmtpConfigured()) {
    if (env.EMAIL_REQUIRE_DELIVERY) {
      return createErrorResult(
        503,
        "EMAIL_NOT_CONFIGURED",
        "Отправка email не настроена. Укажите SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS и EMAIL_FROM."
      );
    }

    return { sent: false, skipped: "SMTP_NOT_CONFIGURED" };
  }

  const isLoginCode = purpose === "login";
  const title = isLoginCode ? "Код входа TaskFlow" : "Код подтверждения TaskFlow";
  const instruction = isLoginCode
    ? "Введите этот код, чтобы войти в аккаунт:"
    : "Введите этот код, чтобы подтвердить аккаунт:";
  const fallback = isLoginCode
    ? "Если вы не входили в аккаунт, просто проигнорируйте это письмо."
    : "Если вы не создавали аккаунт, просто проигнорируйте это письмо.";

  try {
    await sendMailWithRetry({
      from: env.EMAIL_FROM,
      to: contact,
      subject: title,
      text: [
        title,
        "",
        instruction,
        "",
        code,
        "",
        `Код действует ${env.VERIFICATION_CODE_TTL_MINUTES} минут.`,
        fallback
      ].join("\n"),
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #1f1914;">
          <h2>${title}</h2>
          <p>${instruction}</p>
          <p style="font-size: 28px; font-weight: 700; letter-spacing: 6px;">${code}</p>
          <p>Код действует ${env.VERIFICATION_CODE_TTL_MINUTES} минут.</p>
          <p>${fallback}</p>
        </div>
      `
    });

    return { sent: true };
  } catch {
    return createErrorResult(
      502,
      "EMAIL_DELIVERY_FAILED",
      "Не удалось отправить письмо с кодом. Проверьте SMTP-настройки и попробуйте снова."
    );
  }
}

function __resetEmailTransportForTests() {
  transporter = undefined;
}

module.exports = {
  sendVerificationCode,
  __resetEmailTransportForTests
};
