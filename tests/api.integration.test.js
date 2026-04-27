const assert = require("node:assert/strict");
const test = require("node:test");

const { initTestEnvironment, resetDatabase } = require("./helpers/test-env");

initTestEnvironment("api-integration");

const db = require("../server/db/database");
const app = require("../server/app");

let server;
let baseUrl;

test.before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

test.after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  db.close();
});

test.beforeEach(() => {
  resetDatabase(db);
});

async function request(pathname, options = {}) {
  const headers = { ...(options.headers || {}) };
  let body;

  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  return fetch(`${baseUrl}${pathname}`, {
    method: options.method || "GET",
    headers,
    body
  });
}

async function registerAndVerifyEmail(contact = "alex@test.dev") {
  const registerResponse = await request("/api/auth/register", {
    method: "POST",
    body: {
      name: "Alex",
      contactType: "email",
      contact,
      password: "password123"
    }
  });
  const registerData = await registerResponse.json();

  const verifyResponse = await request("/api/auth/verify", {
    method: "POST",
    body: {
      contactType: "email",
      contact,
      code: registerData.verificationPreview
    }
  });
  const sessionCookie = verifyResponse.headers.get("set-cookie").split(";")[0];

  return {
    contact,
    sessionCookie,
    registerData
  };
}

test("register -> verify -> create task -> list tasks", async () => {
  const registerResponse = await request("/api/auth/register", {
    method: "POST",
    body: {
      name: "Alex",
      contactType: "email",
      contact: "alex@test.dev",
      password: "password123"
    }
  });
  assert.equal(registerResponse.status, 201);
  const registerData = await registerResponse.json();
  assert.ok(registerData.verificationPreview);

  const verifyResponse = await request("/api/auth/verify", {
    method: "POST",
    body: {
      contactType: "email",
      contact: "alex@test.dev",
      code: registerData.verificationPreview
    }
  });
  assert.equal(verifyResponse.status, 200);

  const rawCookie = verifyResponse.headers.get("set-cookie");
  assert.ok(rawCookie);
  const sessionCookie = rawCookie.split(";")[0];

  const createTaskResponse = await request("/api/tasks", {
    method: "POST",
    headers: {
      cookie: sessionCookie
    },
    body: {
      title: "Read docs"
    }
  });
  assert.equal(createTaskResponse.status, 201);

  const listTasksResponse = await request("/api/tasks", {
    headers: {
      cookie: sessionCookie
    }
  });
  assert.equal(listTasksResponse.status, 200);

  const tasks = await listTasksResponse.json();
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].title, "Read docs");
});

test("tasks endpoint requires auth session", async () => {
  const response = await request("/api/tasks");
  assert.equal(response.status, 401);
  const data = await response.json();
  assert.equal(data.code, "AUTH_REQUIRED");
  assert.equal(typeof data.message, "string");
});

test("login fails with wrong password", async () => {
  const registerResponse = await request("/api/auth/register", {
    method: "POST",
    body: {
      name: "Alex",
      contactType: "phone",
      contact: "+79991234567",
      password: "password123"
    }
  });
  const registerData = await registerResponse.json();

  const verifyResponse = await request("/api/auth/verify", {
    method: "POST",
    body: {
      contactType: "phone",
      contact: "+79991234567",
      code: registerData.verificationPreview
    }
  });
  assert.equal(verifyResponse.status, 200);

  const loginResponse = await request("/api/auth/login", {
    method: "POST",
    body: {
      contactType: "phone",
      contact: "+79991234567",
      password: "wrong-password"
    }
  });
  assert.equal(loginResponse.status, 401);
  const loginData = await loginResponse.json();
  assert.equal(loginData.code, "INVALID_CREDENTIALS");
});

test("email login requires code and login verification creates session", async () => {
  await registerAndVerifyEmail("login@test.dev");

  const loginResponse = await request("/api/auth/login", {
    method: "POST",
    body: {
      contactType: "email",
      contact: "login@test.dev",
      password: "password123"
    }
  });
  assert.equal(loginResponse.status, 200);
  const loginData = await loginResponse.json();
  assert.equal(loginData.requiresLoginCode, true);
  assert.ok(loginData.verificationPreview);

  const verifyLoginResponse = await request("/api/auth/login/verify", {
    method: "POST",
    body: {
      contactType: "email",
      contact: "login@test.dev",
      code: loginData.verificationPreview
    }
  });
  assert.equal(verifyLoginResponse.status, 200);
  assert.ok(verifyLoginResponse.headers.get("set-cookie"));
  const verifyLoginData = await verifyLoginResponse.json();
  assert.equal(verifyLoginData.user.isVerified, true);
});

test("logout and logout-all clear active sessions", async () => {
  const { sessionCookie } = await registerAndVerifyEmail("logout@test.dev");

  const sessionBeforeLogout = await request("/api/auth/session", {
    headers: {
      cookie: sessionCookie
    }
  });
  assert.equal((await sessionBeforeLogout.json()).authenticated, true);

  const logoutResponse = await request("/api/auth/logout", {
    method: "POST",
    headers: {
      cookie: sessionCookie
    }
  });
  assert.equal(logoutResponse.status, 200);

  const sessionAfterLogout = await request("/api/auth/session", {
    headers: {
      cookie: sessionCookie
    }
  });
  assert.equal((await sessionAfterLogout.json()).authenticated, false);

  const secondSession = await registerAndVerifyEmail("logout-all@test.dev");
  const logoutAllResponse = await request("/api/auth/logout-all", {
    method: "POST",
    headers: {
      cookie: secondSession.sessionCookie
    }
  });
  assert.equal(logoutAllResponse.status, 200);
});

test("unknown route returns standardized not-found error", async () => {
  const response = await request("/api/does-not-exist");

  assert.equal(response.status, 404);

  const data = await response.json();
  assert.equal(data.code, "NOT_FOUND");
  assert.equal(typeof data.message, "string");
});

test("invalid JSON returns standardized invalid-json error", async () => {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: "{"
  });

  assert.equal(response.status, 400);
  const data = await response.json();
  assert.equal(data.code, "INVALID_JSON");
});

test("cors middleware sets headers for allowed origin in development", async () => {
  const response = await request("/api/auth/session", {
    headers: {
      origin: "http://localhost:5173"
    }
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), "http://localhost:5173");
  assert.equal(response.headers.get("access-control-allow-credentials"), "true");
});

test("task trash, restore, permanent delete, bulk, export, and import endpoints work", async () => {
  const { sessionCookie } = await registerAndVerifyEmail("tasks@test.dev");

  const createResponse = await request("/api/tasks", {
    method: "POST",
    headers: {
      cookie: sessionCookie
    },
    body: {
      title: "Archive me"
    }
  });
  const task = await createResponse.json();

  const bulkResponse = await request("/api/tasks/bulk", {
    method: "PUT",
    headers: {
      cookie: sessionCookie
    },
    body: {
      ids: [task.id],
      changes: {
        completed: true,
        priority: "high"
      }
    }
  });
  assert.equal(bulkResponse.status, 200);
  assert.equal((await bulkResponse.json()).updatedCount, 1);

  const exportResponse = await request("/api/tasks/export", {
    headers: {
      cookie: sessionCookie
    }
  });
  assert.equal(exportResponse.status, 200);
  assert.equal((await exportResponse.json()).tasks.length, 1);

  const importResponse = await request("/api/tasks/import", {
    method: "POST",
    headers: {
      cookie: sessionCookie
    },
    body: {
      tasks: [{ title: "Imported task", priority: "low" }]
    }
  });
  assert.equal(importResponse.status, 201);
  assert.equal((await importResponse.json()).importedCount, 1);

  const deleteResponse = await request(`/api/tasks/${task.id}`, {
    method: "DELETE",
    headers: {
      cookie: sessionCookie
    }
  });
  assert.equal(deleteResponse.status, 204);

  const trashResponse = await request("/api/tasks/trash", {
    headers: {
      cookie: sessionCookie
    }
  });
  const trash = await trashResponse.json();
  assert.equal(trash.length, 1);
  assert.equal(trash[0].id, task.id);

  const restoreResponse = await request(`/api/tasks/${task.id}/restore`, {
    method: "POST",
    headers: {
      cookie: sessionCookie
    }
  });
  assert.equal(restoreResponse.status, 200);

  await request(`/api/tasks/${task.id}`, {
    method: "DELETE",
    headers: {
      cookie: sessionCookie
    }
  });

  const permanentDeleteResponse = await request(`/api/tasks/${task.id}/permanent`, {
    method: "DELETE",
    headers: {
      cookie: sessionCookie
    }
  });
  assert.equal(permanentDeleteResponse.status, 204);

  const clearTrashResponse = await request("/api/tasks/trash/clear", {
    method: "DELETE",
    headers: {
      cookie: sessionCookie
    }
  });
  assert.equal(clearTrashResponse.status, 200);
});

test("auth endpoints are protected by rate limiter", async () => {
  let lastStatus = 0;
  let lastPayload = null;

  for (let index = 0; index < 21; index += 1) {
    const response = await request("/api/auth/register", {
      method: "POST",
      body: {
        name: "",
        contactType: "email",
        contact: "invalid",
        password: "short"
      }
    });
    lastStatus = response.status;
    lastPayload = await response.json();
  }

  assert.equal(lastStatus, 429);
  assert.equal(lastPayload.code, "RATE_LIMITED");
});
