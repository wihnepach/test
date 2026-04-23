window.appState = window.appState || {
  tasks: [],
  currentUser: null
};

window.appShellReady = mountAppShell();

async function mountAppShell() {
  const mountNode = document.getElementById("appMount");

  if (!mountNode) {
    throw new Error("Контейнер appMount не найден.");
  }

  const response = await fetch("components/app-shell.html");

  if (!response.ok) {
    throw new Error("Не удалось загрузить app-shell.html.");
  }

  mountNode.innerHTML = await response.text();
}
