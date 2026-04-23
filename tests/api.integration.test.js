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

test("unknown route returns standardized not-found error", async () => {
  const response = await request("/api/does-not-exist");

  assert.equal(response.status, 404);

  const data = await response.json();
  assert.equal(data.code, "NOT_FOUND");
  assert.equal(typeof data.message, "string");
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
