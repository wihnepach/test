# TaskFlow Portfolio: Full-Stack To-Do Application (Node.js + Express + SQLite)

## 1. Project Snapshot

TaskFlow is a production-style To-Do web application with:

- account system (email/phone + verification + session auth)
- real email delivery for verification and login codes via SMTP
- full task lifecycle (CRUD, filtering, search, sorting, bulk actions)
- persistent storage in SQLite
- security hardening (CORS policy, auth rate limit, brute-force protection)
- layered backend architecture (routes -> controllers -> services -> repositories)
- automated quality pipeline (ESLint + Prettier + GitHub Actions)
- automated unit + integration tests

This repository demonstrates not just "a working to-do list", but a complete engineering workflow: feature design, architecture evolution, security, testing, and CI.

---

## 2. Feature Matrix (What Works)

### 2.1 Authentication and Account Flow

- Register with `name + contact (email or phone) + password`
- Contact verification with 6-digit email code
- Resend verification code
- Login only after verification
- Email login confirmation with a separate one-time code
- Session-based auth via secure HTTP-only cookie
- Session restore endpoint (`/api/auth/session`)
- Logout endpoint (`/api/auth/logout`)
- Logout from all sessions endpoint (`/api/auth/logout-all`)

### 2.2 Task Management

- Create task
- Edit task (title/category/priority/deadline/completed)
- Delete task
- Toggle completed/incomplete
- Clear all completed tasks
- Search tasks
- Filter tasks by status (`all`, `active`, `completed`)
- Sort tasks by:
  - manual order (drag-and-drop)
  - newest
  - oldest
  - deadline
  - priority

### 2.3 Advanced UX Features

- Drag-and-drop manual ordering with per-user persistence in `localStorage`
- Bulk operations:
  - select visible
  - complete selected
  - delete selected
- Progressive rendering with `Load more` behavior
- Counters and summary:
  - total
  - completed
  - active
  - visible / selected statistics

### 2.4 Security

- Helmet headers enabled (`contentSecurityPolicy` in production)
- CORS middleware with production allow-list (`CORS_ALLOWED_ORIGINS`)
- Auth route rate limiting
- Login brute-force mitigation:
  - failure delay
  - temporary block after repeated failures
- Structured API errors (`code`, `message`, `details`)

### 2.5 Quality and Reliability

- Unit tests for `auth.service` and `tasks.service`
- Integration tests for auth/task APIs
- Linting via ESLint
- Formatting via Prettier
- CI workflow on push/PR:
  - install
  - lint
  - format check
  - tests

---

## 3. Tech Stack

### Backend

- `Node.js`
- `Express`
- `better-sqlite3`
- `cookie-parser`
- `helmet`
- `morgan`
- `bcryptjs`
- `nodemailer`
- `uuid`
- `dotenv`

### Frontend

- Vanilla HTML/CSS/JS (no framework)
- Component mount via static HTML fragments
- Browser `fetch` API + local state

### Tooling / Dev Experience

- `ESLint`
- `Prettier`
- `nodemon`
- native `node:test`
- `GitHub Actions`

---

## 4. Architecture (Layered)

### 4.1 Request Flow

1. `routes` define HTTP endpoints and middleware chain
2. `controllers` map HTTP requests to business operations
3. `services` implement business rules and orchestration
4. `repositories` encapsulate SQL access
5. `dto` shapes response models
6. `utils/constants/middleware` provide shared infrastructure

### 4.2 Directory Layout

```text
config/
  env.js
public/
  components/
  css/
  js/
server/
  app.js
  constants/
    auth.constants.js
    task.constants.js
  controllers/
    auth.controller.js
    tasks.controller.js
  db/
    database.js
  dto/
    auth.dto.js
    task.dto.js
  middleware/
    auth.middleware.js
    cors.middleware.js
    error.middleware.js
    rate-limit.middleware.js
  repositories/
    auth.repository.js
    tasks.repository.js
  routes/
    auth.routes.js
    tasks.routes.js
  services/
    auth.service.js
    email.service.js
    tasks.service.js
  utils/
    async-handler.js
    crypto.js
    errors.js
    validators.js
tests/
  api.integration.test.js
  auth.service.test.js
  tasks.service.test.js
  helpers/test-env.js
```

### 4.3 Why this architecture matters

- easier testing (service/repository boundaries)
- easier refactor (controllers stay thin)
- explicit domain vocabulary (constants + DTO)
- lower coupling between HTTP layer and DB layer
- clear extension path for scaling features

---

## 5. Data Model

SQLite DB is created automatically in `data/todo.db`.

### users

- `id`
- `name`
- `contactType`
- `encryptedContact`
- `contactHash` (unique)
- `passwordHash`
- `isVerified`
- `verificationCodeHash`
- `verificationExpiresAt`
- `loginCodeHash`
- `loginCodeExpiresAt`
- `createdAt`

### sessions

- `id`
- `userId`
- `tokenHash` (unique)
- `expiresAt`
- `createdAt`

### tasks

- `id`
- `userId`
- `title`
- `category`
- `priority`
- `deadline`
- `completed`
- `createdAt`

---

## 6. API Overview

Base URL: `http://127.0.0.1:3000`

### 6.1 Auth Endpoints

- `POST /api/auth/register`
- `POST /api/auth/verify`
- `POST /api/auth/resend-verification`
- `POST /api/auth/login`
- `POST /api/auth/login/verify`
- `GET /api/auth/session`
- `POST /api/auth/logout`
- `POST /api/auth/logout-all`

### 6.2 Task Endpoints (auth required)

- `GET /api/tasks`
- `POST /api/tasks`
- `PUT /api/tasks/:id`
- `DELETE /api/tasks/:id`
- `DELETE /api/tasks?completed=true`

### 6.3 Error Contract

All API errors follow this shape:

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Task payload is invalid.",
  "details": [{ "field": "title", "issue": "required" }]
}
```

---

## 7. Security Controls (Implemented)

### 7.1 CORS

- In development, request origin is reflected for convenience
- In production, origin must exist in `CORS_ALLOWED_ORIGINS`

### 7.2 Auth Rate Limit

- Applied to auth-sensitive endpoints
- Tunable via:
  - `AUTH_RATE_LIMIT_WINDOW_MS`
  - `AUTH_RATE_LIMIT_MAX`

### 7.3 Brute-Force Login Protection

- Failed login attempts are tracked per contact hash
- Temporary block after threshold
- Configurable via:
  - `LOGIN_ATTEMPT_WINDOW_MS`
  - `LOGIN_MAX_ATTEMPTS`
  - `LOGIN_BLOCK_MS`
  - `LOGIN_FAILURE_DELAY_MS`

### 7.4 Session Security

- HTTP-only cookie
- `sameSite=lax`
- `secure` in production
- session TTL cleanup logic

### 7.5 Email Code Delivery

- Registration sends a 6-digit code with the subject `Код подтверждения TaskFlow`
- Email login sends a separate 6-digit code with the subject `Код входа TaskFlow`
- Codes are stored as hashes and expire after `VERIFICATION_CODE_TTL_MINUTES`
- SMTP delivery is handled through `nodemailer`
- Mailtrap rate-limit responses are retried with a short delay
- If `AUTH_ENCRYPTION_KEY` changes, a verified contact can be re-encrypted after successful code confirmation

---

## 8. Testing Strategy

### 8.1 Unit Tests

- `tests/auth.service.test.js`
- `tests/tasks.service.test.js`

Coverage examples:

- validation failures
- duplicate contacts
- blocked login state
- CRUD task edge cases

### 8.2 Integration Tests

- `tests/api.integration.test.js`

Checks end-to-end flows:

- register -> verify -> create task -> list tasks
- unauthorized access behavior
- invalid credentials
- 404 error format
- CORS headers
- auth rate limiting

### 8.3 Isolated Test Environment

`tests/helpers/test-env.js` dynamically configures per-suite temp DB and resets module cache to avoid cross-test state leakage.

---

## 9. CI Pipeline

Workflow: `.github/workflows/ci.yml`

Runs on push to `main` and on every pull request:

1. `npm ci`
2. `npm run lint`
3. `npm run format:check`
4. `npm test`

Result: every commit/PR is automatically verified for style, quality, and runtime behavior.

---

## 10. Setup and Run

### 10.1 Install

```bash
npm install
```

### 10.2 Configure env

```bash
copy .env.example .env
```

PowerShell alternative:

```powershell
Copy-Item .env.example .env
```

### 10.3 Run app

```bash
npm run dev
```

or

```bash
npm start
```

Open:

- `http://127.0.0.1:3000`

### 10.4 Quality checks

```bash
npm run lint
npm run format:check
npm test
```

### 10.5 SMTP setup for real email codes

Copy `.env.example` to `.env` and fill the SMTP block with real credentials:

```env
EMAIL_REQUIRE_DELIVERY=true
VERIFICATION_CODE_PREVIEW=false
EMAIL_FROM="TaskFlow <your-email@example.com>"
SMTP_HOST=sandbox.smtp.mailtrap.io
SMTP_PORT=2525
SMTP_SECURE=false
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-password
```

For Mailtrap Sandbox, emails appear inside Mailtrap Inbox. For Gmail, use `smtp.gmail.com`, port `587`, `SMTP_SECURE=false`, and a Google App Password instead of the normal mailbox password.

---

## 11. Environment Variables

From `.env.example`:

- `HOST`
- `PORT`
- `NODE_ENV`
- `AUTH_ENCRYPTION_KEY`
- `SESSION_COOKIE_NAME`
- `SESSION_TTL_HOURS`
- `VERIFICATION_CODE_TTL_MINUTES`
- `EMAIL_REQUIRE_DELIVERY`
- `VERIFICATION_CODE_PREVIEW`
- `EMAIL_FROM`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `CORS_ALLOWED_ORIGINS`
- `AUTH_RATE_LIMIT_WINDOW_MS`
- `AUTH_RATE_LIMIT_MAX`
- `LOGIN_ATTEMPT_WINDOW_MS`
- `LOGIN_MAX_ATTEMPTS`
- `LOGIN_BLOCK_MS`
- `LOGIN_FAILURE_DELAY_MS`

---

## 12. Full Demonstration Script (Portfolio Walkthrough)

Use this exact script to demonstrate all major capabilities in one session.

### Step A. Launch and prepare

1. Start server (`npm run dev`)
2. Open app in browser
3. Open devtools network tab for API visibility

### Step B. Authentication

1. Register with email
2. Open mailbox/Mailtrap and copy the code from `Код подтверждения TaskFlow`
3. Verify contact
4. Refresh page to show session restore
5. Logout and login again
6. Copy the new login code from `Код входа TaskFlow`
7. Confirm login with that code

### Step C. Task CRUD

1. Add 5-10 tasks with different priorities/categories/deadlines
2. Edit 2 tasks
3. Toggle completion on several tasks
4. Delete one task

### Step D. UX and productivity features

1. Search by title and category
2. Filter active/completed/all
3. Sort by newest/oldest/deadline/priority
4. Switch to manual sort and drag tasks
5. Select visible -> complete selected
6. Select visible -> delete selected
7. Use `Load more` when list is long
8. Clear completed

### Step E. Security demonstration

1. Try `GET /api/tasks` without session -> expect `AUTH_REQUIRED`
2. Trigger repeated invalid auth requests -> expect `RATE_LIMITED`
3. Trigger repeated wrong logins for same contact -> expect `LOGIN_BLOCKED`
4. Request unknown API route -> expect `NOT_FOUND` format

### Step F. Engineering quality

1. Run `npm run lint`
2. Run `npm run format:check`
3. Run `npm test`
4. Show GitHub Actions workflow file and explain quality gate

---

## 12.1 Troubleshooting Email Auth

`EADDRINUSE: address already in use 127.0.0.1:3000`

The server is already running on port `3000`. Stop the old Node process or change `PORT` in `.env`.

`EMAIL_DELIVERY_FAILED`

Check `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `EMAIL_FROM`. Mailtrap Sandbox shows messages inside Mailtrap, not in the real recipient mailbox.

`Too many emails per second`

Mailtrap Sandbox can throttle fast repeated emails. The app retries this specific error, but during manual testing it is still better to wait a few seconds between registration/login attempts.

`INVALID_LOGIN_CODE`

Registration and login use different emails and different codes. For login, use the latest email with the subject `Код входа TaskFlow`.

---

## 13. Methodical Deep-Dive: What Is Used and Why

### 13.1 Backend core

- Express app (`server/app.js`) composes all middlewares and routes.
- Database bootstraps on startup (`server/db/database.js`) and creates tables/indexes idempotently.

### 13.2 Domain constants

- `server/constants/*` removes magic strings and centralizes allowed values.
- This reduces drift between validation, service logic, and persistence.

### 13.3 Validation and error design

- `server/utils/validators.js` normalizes and validates all input contracts.
- `server/utils/errors.js` guarantees one error shape across application.
- Benefit: frontend can rely on stable error parsing logic.

### 13.4 Security mechanics

- Contacts are encrypted at rest (`encryptedContact`) and also hashed (`contactHash`) for lookup uniqueness.
- Passwords are stored as bcrypt hashes.
- Session token itself is random; DB stores only hashed token.
- Auth anti-abuse is done in two layers:
  - route-level traffic throttling
  - credential-level login block strategy

### 13.5 Service orchestration

- Services own business logic and cross-cutting policies.
- Repositories own SQL only.
- Controllers own HTTP translation only.
- DTOs own outbound response shape.

### 13.6 Frontend architecture

- No framework dependency: easier portability and transparent logic.
- State is in `window.appState` + module state in task manager.
- Components are mounted dynamically from HTML fragments.
- UX layer includes bulk operations, drag sort, progressive rendering, and live summaries.

### 13.7 Test engineering

- Unit tests validate service correctness in isolation.
- Integration tests validate actual HTTP contract and middleware chain.
- Test helper ensures isolated temp DB and fresh module graph.
- This prevents hidden state and flaky behavior.

### 13.8 CI/CD quality gate

- CI enforces style + behavior before merge/deploy.
- Any lint failure, formatting drift, or regression test fails pipeline.
- This is foundational for team-scale maintainability.

---

## 14. What This Project Demonstrates (Portfolio Value)

This project demonstrates practical capability in:

- full-stack JavaScript engineering
- API and session auth design
- secure data handling
- architectural refactoring into clean layers
- frontend UX implementation without framework shortcuts
- testing strategy and quality automation
- production-oriented delivery discipline
