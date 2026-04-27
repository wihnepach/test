# TaskFlow: To-Do приложение на Node.js, Express и SQLite

TaskFlow - учебный full-stack проект списка задач с аккаунтами, подтверждением email-кодом, сессиями, корзиной и расширенным управлением задачами.

## Что уже реализовано

- регистрация пользователя по email или телефону;
- реальная отправка кода подтверждения на email через SMTP;
- вход по email и паролю с дополнительным кодом из письма;
- HTTP-only cookie-сессии;
- восстановление сессии после перезагрузки страницы;
- выход из текущей сессии и выход со всех устройств;
- создание, редактирование, завершение и удаление задач;
- корзина для удалённых задач и восстановление;
- поиск, фильтрация, сортировка и массовые действия;
- русскоязычный интерфейс;
- защита auth-эндпоинтов rate limit;
- задержка и временная блокировка после неудачных входов;
- централизованный JSON-формат ошибок;
- тесты сервисов и API;
- ESLint, Prettier и CI.

## Стек

- Backend: `Node.js`, `Express`, `better-sqlite3`
- Auth/security: `bcryptjs`, `cookie-parser`, `helmet`
- Email: `nodemailer`
- Frontend: обычные `HTML`, `CSS`, `JavaScript`
- Tests/tooling: `node:test`, `ESLint`, `Prettier`, `nodemon`

## Быстрый запуск

```bash
npm install
```

Создать локальный файл настроек:

```powershell
Copy-Item .env.example .env
```

Запустить сервер:

```bash
npm start
```

Для разработки с автоперезапуском:

```bash
npm run dev
```

Открыть приложение:

```text
http://127.0.0.1:3000
```

## Настройка email-кодов

Файл `.env.example` - это пример. Реальные логины, пароли и SMTP-ключи нужно хранить только в `.env`. Файл `.env` не коммитится.

Минимальный блок для отправки писем:

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

Для Mailtrap Sandbox:

- `SMTP_HOST` обычно `sandbox.smtp.mailtrap.io`;
- `SMTP_PORT` удобно ставить `2525` или `587`;
- `SMTP_SECURE=false`;
- `SMTP_USER` и `SMTP_PASS` берутся из Mailtrap SMTP Credentials;
- письма будут видны внутри Mailtrap, а не в реальном Gmail-почтовом ящике получателя.

Для Gmail:

- `SMTP_HOST=smtp.gmail.com`;
- `SMTP_PORT=587`;
- `SMTP_SECURE=false`;
- в `SMTP_PASS` нужен не обычный пароль от почты, а Google App Password.

## Как работает регистрация и вход

Регистрация:

1. Пользователь вводит имя, email и пароль.
2. Сервер создаёт 6-значный код.
3. Код отправляется письмом с темой `Код подтверждения TaskFlow`.
4. Пользователь вводит код в приложении.
5. Аккаунт становится подтверждённым, создаётся сессия.

Вход:

1. Пользователь вводит email и пароль.
2. Сервер проверяет пароль.
3. Если пароль верный, отправляется отдельный код с темой `Код входа TaskFlow`.
4. Пользователь вводит самый свежий код из письма.
5. Сервер создаёт сессию.

Важно: код регистрации и код входа - разные коды. Для входа нужно брать письмо именно с темой `Код входа TaskFlow`.

## Переменные окружения

Основные:

- `HOST` - адрес сервера, обычно `127.0.0.1`;
- `PORT` - порт, обычно `3000`;
- `NODE_ENV` - `development`, `test` или `production`;
- `AUTH_ENCRYPTION_KEY` - секрет для шифрования контактов;
- `SESSION_COOKIE_NAME` - имя cookie;
- `SESSION_TTL_HOURS` - срок жизни сессии;
- `VERIFICATION_CODE_TTL_MINUTES` - срок жизни кода;
- `EMAIL_REQUIRE_DELIVERY` - требовать реальную отправку письма;
- `VERIFICATION_CODE_PREVIEW` - показывать код в ответе API, только для dev/test;
- `EMAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` - SMTP-настройки;
- `CORS_ALLOWED_ORIGINS` - разрешённые origin в production;
- `AUTH_RATE_LIMIT_WINDOW_MS`, `AUTH_RATE_LIMIT_MAX` - лимиты auth-запросов;
- `LOGIN_ATTEMPT_WINDOW_MS`, `LOGIN_MAX_ATTEMPTS`, `LOGIN_BLOCK_MS`, `LOGIN_FAILURE_DELAY_MS` - защита от перебора пароля.

Если поменять `AUTH_ENCRYPTION_KEY`, старые зашифрованные контакты могут не расшифровываться. В проект добавлено восстановление контакта при успешном подтверждении кода, потому что пользователь заново вводит email.

## Команды качества

```bash
npm run lint
npm run format:check
npm test
```

Автоисправление:

```bash
npm run lint:fix
npm run format
```

## API

Base URL:

```text
http://127.0.0.1:3000
```

Auth:

- `POST /api/auth/register` - регистрация;
- `POST /api/auth/verify` - подтверждение регистрации;
- `POST /api/auth/resend-verification` - повторная отправка кода регистрации;
- `POST /api/auth/login` - проверка email/пароля и отправка кода входа;
- `POST /api/auth/login/verify` - подтверждение кода входа;
- `GET /api/auth/session` - текущая сессия;
- `POST /api/auth/logout` - выйти;
- `POST /api/auth/logout-all` - выйти со всех устройств.

Tasks:

- `GET /api/tasks`;
- `POST /api/tasks`;
- `PUT /api/tasks/:id`;
- `DELETE /api/tasks/:id`;
- `DELETE /api/tasks?completed=true`;
- `GET /api/tasks/trash`;
- `POST /api/tasks/:id/restore`;
- `DELETE /api/tasks/:id/permanent`.

Формат ошибок:

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Task payload is invalid.",
  "details": [{ "field": "title", "issue": "required" }]
}
```

## Структура проекта

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
  controllers/
  db/
  dto/
  middleware/
  repositories/
  routes/
  services/
    auth.service.js
    email.service.js
    tasks.service.js
  utils/
tests/
  api.integration.test.js
  auth.service.test.js
  tasks.service.test.js
```

## База данных

SQLite база создаётся автоматически в `data/todo.db`.

Основные таблицы:

- `users` - пользователь, зашифрованный контакт, hash контакта, пароль, коды регистрации и входа;
- `sessions` - активные сессии;
- `tasks` - задачи пользователя.

## Частые проблемы

`EADDRINUSE: address already in use 127.0.0.1:3000`

Порт уже занят другим запущенным сервером. Закрой старый процесс Node или поменяй `PORT` в `.env`.

`Не удалось отправить письмо с кодом`

Проверь `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`. Для Gmail нужен App Password. Для Mailtrap письма появляются внутри Mailtrap Inbox.

Mailtrap пишет `Too many emails per second`

Это ограничение бесплатного sandbox-режима. В проекте есть повторная отправка с паузой, но при частых кликах лучше подождать несколько секунд и попробовать снова.

`Invalid login code`

Код устарел или введён код не из того письма. Для входа бери последнее письмо с темой `Код входа TaskFlow`.

## Проверенный сценарий демо

1. Запустить сервер.
2. Зарегистрировать пользователя по email.
3. Открыть Mailtrap или почтовый ящик и взять код подтверждения.
4. Подтвердить регистрацию.
5. Выйти из аккаунта.
6. Войти по email и паролю.
7. Взять новый код из письма `Код входа TaskFlow`.
8. Подтвердить вход.
9. Создать несколько задач, проверить поиск, фильтры, сортировки, удаление и восстановление.
10. Запустить `npm run lint`, `npm run format:check`, `npm test`.
