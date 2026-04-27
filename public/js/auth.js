const AUTH_API = "/api/auth";

window.appState = window.appState || {
  tasks: [],
  trash: [],
  security: null,
  currentUser: null
};

window.request = request;
window.showBanner = showBanner;
window.hideBanner = hideBanner;

initializeAuthModule();

async function initializeAuthModule() {
  if (window.appShellReady) {
    await window.appShellReady;
  }

  await mountAuthMarkup();
  initializeAuth();
}

async function mountAuthMarkup() {
  const mountNode = document.getElementById("authMount");

  if (!mountNode) {
    throw new Error("Контейнер authMount не найден.");
  }

  const response = await fetch("components/auth.html");

  if (!response.ok) {
    throw new Error("Не удалось загрузить auth.html.");
  }

  mountNode.innerHTML = await response.text();
}

async function initializeAuth() {
  const accountPanel = document.getElementById("accountPanel");
  const todoPanel = document.getElementById("todoPanel");
  const accountTitle = document.getElementById("accountTitle");
  const accountSubtitle = document.getElementById("accountSubtitle");
  const authStatusBanner = document.getElementById("authStatusBanner");
  const taskStatusBanner = document.getElementById("taskStatusBanner");
  const tabButtons = document.querySelectorAll(".tab-button");
  const verifyTabButton = document.querySelector('[data-tab="verify"]');
  const authForms = document.querySelectorAll(".auth-form");
  const authModal = document.getElementById("authModal");
  const authModalBackdrop = document.getElementById("authModalBackdrop");
  const openAuthModalBtn = document.getElementById("openAuthModalBtn");
  const closeAuthModalBtn = document.getElementById("closeAuthModalBtn");
  const registerForm = document.getElementById("registerForm");
  const registerName = document.getElementById("registerName");
  const registerContactType = document.getElementById("registerContactType");
  const registerContact = document.getElementById("registerContact");
  const registerPassword = document.getElementById("registerPassword");
  const loginForm = document.getElementById("loginForm");
  const loginContactType = document.getElementById("loginContactType");
  const loginContact = document.getElementById("loginContact");
  const loginPassword = document.getElementById("loginPassword");
  const verifyForm = document.getElementById("verifyForm");
  const verifyContactType = document.getElementById("verifyContactType");
  const verifyContact = document.getElementById("verifyContact");
  const verifyCode = document.getElementById("verifyCode");
  const resendVerificationBtn = document.getElementById("resendVerificationBtn");
  const logoutBtn = document.getElementById("logoutBtn");

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => switchAuthTab(button.dataset.tab));
  });

  openAuthModalBtn.addEventListener("click", handleAuthButtonClick);
  closeAuthModalBtn.addEventListener("click", closeAuthModal);
  authModalBackdrop.addEventListener("click", closeAuthModal);
  document.addEventListener("keydown", handleEscapeClose);

  registerForm.addEventListener("submit", handleRegister);
  loginForm.addEventListener("submit", handleLogin);
  verifyForm.addEventListener("submit", handleVerification);
  resendVerificationBtn.addEventListener("click", handleResendVerification);
  logoutBtn.addEventListener("click", handleLogout);

  closeAuthModal();
  hideVerificationStep();
  showBanner(authStatusBanner, "Проверяем сессию...", "info");

  try {
    const session = await request(`${AUTH_API}/session`);

    if (session.authenticated) {
      window.appState.currentUser = session.user;
      window.appState.security = session.security || null;
      updateAuthView();

      if (typeof window.loadTasks === "function") {
        await window.loadTasks();
      }

      hideBanner(authStatusBanner);
    } else {
      window.appState.currentUser = null;
      window.appState.security = null;
      updateAuthView();
      hideBanner(authStatusBanner);
    }
  } catch (error) {
    showBanner(authStatusBanner, `Не удалось проверить сессию. ${error.message}`, "error");
  }

  async function handleRegister(event) {
    event.preventDefault();

    try {
      const result = await request(`${AUTH_API}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: registerName.value.trim(),
          contactType: registerContactType.value,
          contact: registerContact.value.trim(),
          password: registerPassword.value
        })
      });

      switchAuthTab("verify");
      verifyForm.dataset.mode = "register";
      showVerificationStep();
      verifyContactType.value = result.contactType;
      verifyContact.value = result.pendingContact;
      showBanner(
        authStatusBanner,
        composeVerificationMessage(result.message, result.verificationPreview),
        "success"
      );
      registerForm.reset();
    } catch (error) {
      showBanner(authStatusBanner, `Не удалось зарегистрироваться. ${error.message}`, "error");
    }
  }

  async function handleLogin(event) {
    event.preventDefault();

    try {
      const result = await request(`${AUTH_API}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactType: loginContactType.value,
          contact: loginContact.value.trim(),
          password: loginPassword.value
        })
      });

      if (result.requiresLoginCode) {
        switchAuthTab("verify");
        verifyForm.dataset.mode = "login";
        showVerificationStep();
        verifyContactType.value = result.contactType;
        verifyContact.value = result.pendingContact;
        verifyCode.value = "";
        showBanner(
          authStatusBanner,
          composeVerificationMessage(result.message, result.verificationPreview),
          "success"
        );
        loginForm.reset();
        return;
      }

      window.appState.currentUser = result.user;
      window.appState.security = null;
      updateAuthView();
      closeAuthModal();

      if (typeof window.loadTasks === "function") {
        await window.loadTasks();
      }

      hideBanner(authStatusBanner);
      loginForm.reset();
    } catch (error) {
      showBanner(authStatusBanner, `Не удалось войти. ${error.message}`, "error");
    }
  }

  async function handleVerification(event) {
    event.preventDefault();

    try {
      const isLoginVerification = verifyForm.dataset.mode === "login";
      const result = await request(
        `${AUTH_API}/${isLoginVerification ? "login/verify" : "verify"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contactType: verifyContactType.value,
            contact: verifyContact.value.trim(),
            code: verifyCode.value.trim()
          })
        }
      );

      window.appState.currentUser = result.user;
      window.appState.security = null;
      updateAuthView();
      closeAuthModal();

      if (typeof window.loadTasks === "function") {
        await window.loadTasks();
      }

      showBanner(taskStatusBanner, result.message, "success");
      hideBanner(authStatusBanner);
      verifyForm.reset();
      verifyForm.dataset.mode = "register";
      hideVerificationStep();
    } catch (error) {
      showBanner(authStatusBanner, `Не удалось подтвердить контакт. ${error.message}`, "error");
    }
  }

  async function handleResendVerification() {
    if (verifyForm.dataset.mode === "login") {
      showBanner(
        authStatusBanner,
        "Чтобы получить новый код входа, повторите вход с email и паролем.",
        "info"
      );
      return;
    }

    try {
      const result = await request(`${AUTH_API}/resend-verification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactType: verifyContactType.value,
          contact: verifyContact.value.trim()
        })
      });

      showBanner(
        authStatusBanner,
        composeVerificationMessage(result.message, result.verificationPreview),
        "success"
      );
    } catch (error) {
      showBanner(authStatusBanner, `Не удалось отправить код повторно. ${error.message}`, "error");
    }
  }

  async function handleLogout() {
    try {
      await request(`${AUTH_API}/logout`, { method: "POST" });
      window.appState.currentUser = null;
      window.appState.tasks = [];
      window.appState.trash = [];
      window.appState.security = null;
      updateAuthView();

      if (typeof window.renderTasks === "function") {
        window.renderTasks();
      }

      switchAuthTab("login");
      closeAuthModal();
      showBanner(authStatusBanner, "Вы вышли из системы.", "success");
    } catch (error) {
      showBanner(authStatusBanner, `Не удалось выйти. ${error.message}`, "error");
    }
  }

  function updateAuthView() {
    const isAuthenticated = Boolean(window.appState.currentUser);

    accountPanel.hidden = !isAuthenticated;
    todoPanel.hidden = !isAuthenticated;

    if (isAuthenticated) {
      accountTitle.textContent = `Здравствуйте, ${window.appState.currentUser.name}`;
      accountSubtitle.textContent = `Контакт подтверждён: ${window.appState.currentUser.contactMasked}. Ваши задачи доступны только в вашем аккаунте.`;
      openAuthModalBtn.textContent = window.appState.currentUser.name;
      closeAuthModal();
    } else {
      accountTitle.textContent = "Добро пожаловать";
      accountSubtitle.textContent = "Авторизуйтесь, чтобы увидеть задачи.";
      openAuthModalBtn.textContent = "Войти";
    }
  }

  function switchAuthTab(tabName) {
    if (tabName !== "verify") {
      verifyForm.dataset.mode = "register";
      hideVerificationStep();
    }

    tabButtons.forEach((button) => {
      button.classList.toggle("tab-button--active", button.dataset.tab === tabName);
    });

    authForms.forEach((formElement) => {
      formElement.classList.toggle("auth-form--active", formElement.dataset.form === tabName);
    });
  }

  function handleAuthButtonClick() {
    if (window.appState.currentUser) {
      const securityButton = document.querySelector('[data-view="settings"]');
      if (securityButton) {
        securityButton.click();
      }
      return;
    }

    openAuthModal();
  }

  function openAuthModal() {
    authModal.hidden = false;
    document.body.classList.add("modal-open");
  }

  function closeAuthModal() {
    authModal.hidden = true;
    document.body.classList.remove("modal-open");
  }

  function handleEscapeClose(event) {
    if (event.key === "Escape" && !authModal.hidden) {
      closeAuthModal();
    }
  }

  function showVerificationStep() {
    verifyTabButton.hidden = false;
  }

  function hideVerificationStep() {
    verifyTabButton.hidden = true;
  }

  window.updateAuthView = updateAuthView;
}

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message =
      typeof data === "object" && data !== null && "message" in data
        ? data.message
        : "Ошибка запроса.";
    throw new Error(message);
  }

  return data;
}

function showBanner(element, message, type = "info") {
  element.hidden = false;
  element.textContent = message;
  element.dataset.type = type;
}

function hideBanner(element) {
  element.hidden = true;
  element.textContent = "";
  element.dataset.type = "info";
}

function composeVerificationMessage(message, code) {
  return code ? `${message} Тестовый код для разработки: ${code}` : message;
}
