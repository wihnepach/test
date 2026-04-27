# Методичка по проекту TaskFlow

Эта методичка - учебное пособие по проекту TaskFlow. README в этом проекте остаётся презентацией: что умеет приложение, как его запустить и показать. Этот файл нужен для другого: понять теорию, архитектуру, процессы и функции кода.

## 1. Назначение проекта

TaskFlow - это full-stack To-Do приложение. Оно показывает, как строится небольшой, но уже похожий на реальный продукт:

- пользователь регистрируется;
- подтверждает email кодом;
- входит по паролю и дополнительному коду;
- получает защищённую сессию;
- создаёт, редактирует, удаляет и восстанавливает задачи;
- работает с поиском, фильтрами, сортировками, массовыми действиями, импортом и экспортом;
- сервер хранит данные в SQLite;
- код проверяется тестами, линтером и форматтером.

Главная учебная ценность проекта: здесь есть не только интерфейс, но и backend-архитектура, безопасность, работа с базой данных, валидация, тестирование и реальная отправка email-кодов.

## 2. Основные понятия

### Frontend

Frontend - часть приложения, которую видит пользователь в браузере. В проекте это папка `public/`: HTML, CSS и JavaScript.

Frontend отвечает за:

- показ страниц и модальных окон;
- обработку кликов и ввода;
- отправку HTTP-запросов на backend;
- отображение задач, ошибок и успешных действий.

### Backend

Backend - серверная часть приложения. В проекте это папка `server/`.

Backend отвечает за:

- обработку API-запросов;
- регистрацию и вход;
- проверку кодов;
- создание сессий;
- работу с задачами;
- чтение и запись в SQLite;
- безопасность и валидацию.

### API

API - набор HTTP-адресов, через которые frontend общается с backend.

Пример:

```text
POST /api/auth/register
GET /api/tasks
PUT /api/tasks/:id
```

### HTTP-запрос

HTTP-запрос - сообщение от клиента к серверу. В нём есть:

- метод: `GET`, `POST`, `PUT`, `DELETE`;
- адрес;
- заголовки;
- тело запроса, часто JSON.

### JSON

JSON - формат передачи данных. Например:

```json
{
  "title": "Read docs",
  "priority": "high"
}
```

### Cookie

Cookie - маленькое значение, которое сервер сохраняет в браузере. В TaskFlow cookie хранит session token. Сам token в базе не хранится в открытом виде: в базе лежит только hash.

### Сессия

Сессия - состояние входа пользователя. Если сессия активна, сервер понимает: этот запрос пришёл от авторизованного пользователя.

### Hash

Hash - одностороннее преобразование данных. Hash можно посчитать, но нельзя нормально восстановить исходное значение.

В проекте hash используется для:

- поиска пользователя по контакту;
- хранения session token;
- хранения кодов подтверждения;
- сравнения кодов без хранения самих кодов.

### Шифрование

Шифрование - обратимое преобразование данных. В проекте email/телефон шифруется в поле `encryptedContact`, чтобы контакт не лежал в базе открытым текстом.

### Middleware

Middleware - промежуточная функция Express. Она выполняется между входящим запросом и контроллером.

Примеры:

- `corsMiddleware` проверяет origin;
- `requireAuth` проверяет сессию;
- `errorHandler` форматирует ошибки;
- rate limiter ограничивает частые auth-запросы.

### Controller

Controller - слой, который принимает HTTP-запрос и вызывает нужный service. Controller не должен содержать много бизнес-логики.

### Service

Service - слой бизнес-логики. Он решает, что именно нужно сделать: проверить пароль, создать код, обновить задачу, отправить письмо.

### Repository

Repository - слой работы с базой данных. Он содержит SQL-запросы и не должен знать про HTTP.

### DTO

DTO - Data Transfer Object. Это функция или объект, который приводит данные к формату ответа API.

Например, `toUserDto` убирает лишние поля и возвращает безопасный объект пользователя.

## 3. Общая архитектура

Проект построен слоями:

```text
Browser
  -> public/js
  -> HTTP API
  -> routes
  -> middleware
  -> controllers
  -> services
  -> repositories
  -> SQLite
```

Такой подход нужен, чтобы:

- код было проще читать;
- функции имели понятную ответственность;
- тесты можно было писать по слоям;
- бизнес-логику можно было менять без переписывания HTTP-слоя;
- SQL был изолирован в одном месте.

## 4. Жизненные процессы приложения

### 4.1 Запуск сервера

Процесс:

1. `server.js` импортирует настройки из `config/env.js`.
2. `server.js` импортирует Express-приложение из `server/app.js`.
3. `app.listen(...)` запускает HTTP-сервер.
4. `server/app.js` подключает middleware, static files и API routes.
5. `server/db/database.js` создаёт базу и таблицы, если их ещё нет.

### 4.2 Регистрация

Процесс:

1. Frontend отправляет `POST /api/auth/register`.
2. `auth.routes.js` передаёт запрос в `authController.register`.
3. Controller вызывает `authService.registerUser`.
4. Service валидирует данные.
5. Service нормализует email/телефон.
6. Service проверяет, нет ли уже такого контакта.
7. Service генерирует 6-значный код.
8. Email service отправляет код.
9. Repository создаёт пользователя в SQLite.
10. API возвращает данные для перехода на форму кода.

### 4.3 Подтверждение регистрации

Процесс:

1. Пользователь вводит код.
2. Frontend отправляет `POST /api/auth/verify`.
3. Service ищет пользователя по hash контакта.
4. Service проверяет срок действия кода.
5. Service сравнивает hash введённого кода с hash в базе.
6. Repository помечает пользователя как verified.
7. Service создаёт ответ с пользователем.
8. Controller создаёт session cookie.

### 4.4 Вход

Процесс:

1. Пользователь вводит email/телефон и пароль.
2. Frontend отправляет `POST /api/auth/login`.
3. Service проверяет формат данных.
4. Service проверяет brute-force блокировку.
5. Service ищет пользователя.
6. Service проверяет, подтверждён ли контакт.
7. Service сравнивает пароль через `bcrypt.compare`.
8. Если вход по email, отправляет отдельный код входа.
9. Если вход по телефону, создаёт сессию сразу.
10. Для email пользователь вводит код из письма.
11. Frontend отправляет `POST /api/auth/login/verify`.
12. Service проверяет login code и создаёт сессию.

### 4.5 Работа с задачами

Процесс:

1. Frontend делает запрос к `/api/tasks`.
2. Middleware `requireAuth` проверяет сессию.
3. Controller вызывает tasks service.
4. Service валидирует и нормализует данные.
5. Repository выполняет SQL.
6. DTO приводит данные к безопасному виду.
7. Frontend обновляет интерфейс.

### 4.6 Удаление и корзина

В TaskFlow удаление мягкое: задача не удаляется сразу из базы. Вместо этого заполняется поле `deletedAt`.

Преимущество:

- задачу можно восстановить;
- пользователь защищён от случайного удаления.

Permanent delete удаляет задачу из базы окончательно.

## 5. Программы и библиотеки

### Node.js

Среда выполнения JavaScript на сервере. Позволяет запускать backend без браузера.

### Express

Web framework для Node.js. Используется для маршрутов, middleware и обработки HTTP.

### better-sqlite3

Библиотека для работы с SQLite. В проекте используется синхронный API, поэтому SQL-запросы выглядят просто и предсказуемо.

### bcryptjs

Библиотека для безопасного хранения паролей. Пароль не хранится в открытом виде, вместо него хранится bcrypt hash.

### cookie-parser

Middleware для чтения cookie из HTTP-запроса.

### helmet

Middleware для установки защитных HTTP-заголовков.

### morgan

Логирование HTTP-запросов в консоль.

### nodemailer

Библиотека для отправки email через SMTP.

### uuid

Генерация уникальных id.

### dotenv

Загрузка переменных окружения из `.env`.

### ESLint

Проверяет качество JavaScript-кода и ловит типовые ошибки.

### Prettier

Форматирует код в едином стиле.

### node:test

Встроенный test runner Node.js.

## 6. NPM-команды

### `npm start`

Запускает сервер обычным способом:

```bash
node server.js
```

### `npm run dev`

Запускает сервер через `nodemon`. При изменении файлов сервер перезапускается автоматически.

### `npm test`

Запускает все тесты из папки `tests`.

### `npm run lint`

Запускает ESLint. Проверяет код на ошибки стиля и потенциальные проблемы.

### `npm run lint:fix`

Пытается автоматически исправить часть ESLint-проблем.

### `npm run format`

Форматирует файлы через Prettier.

### `npm run format:check`

Проверяет форматирование, но не исправляет файлы.

## 7. Настройки окружения: `config/env.js`

`config/env.js` собирает все настройки проекта в один объект.

### `ROOT_DIR`

Корневая папка проекта. Нужна, чтобы строить абсолютные пути.

### `PUBLIC_DIR`

Папка со статическим frontend-кодом.

### `DATA_DIR`

Папка для данных, например SQLite базы.

### `DATABASE_PATH`

Путь к текущей SQLite базе.

### `LEGACY_DATABASE_PATH`

Путь к старому варианту базы. Используется для совместимости.

### `ENCRYPTION_SECRET`

Секретная строка для шифрования контактов. Из неё создаётся 32-byte ключ.

### `CORS_ALLOWED_ORIGINS`

Список origin, которым разрешено обращаться к API в production.

### `SMTP_PORT`

Порт SMTP-сервера.

### `VERIFICATION_CODE_PREVIEW`

Флаг, который в dev/test может показывать код в API-ответе. В реальном production так делать нельзя.

### `module.exports`

Экспортирует объект настроек, чтобы другие файлы могли использовать единый источник конфигурации.

## 8. Сервер и приложение

### `server.js`

Точка входа приложения.

Назначение:

- импортировать `env`;
- импортировать `app`;
- запустить `app.listen`.

### `server/app.js`

Создаёт Express-приложение.

Использует:

- `helmet` для защитных заголовков;
- `morgan` для логов;
- `corsMiddleware` для CORS;
- `express.json()` для JSON body;
- `cookieParser()` для cookie;
- `express.static()` для frontend-файлов;
- routes для auth и tasks;
- not found и error middleware.

## 9. База данных: `server/db/database.js`

Этот файл создаёт подключение к SQLite и выполняет настройку таблиц.

### `setupDatabase()`

Создаёт таблицы и индексы, если их ещё нет.

Таблицы:

- `users`;
- `sessions`;
- `tasks`.

Также добавляет новые колонки при миграции:

- `deletedAt`;
- `notes`;
- `loginCodeHash`;
- `loginCodeExpiresAt`.

Теория: такой подход называется idempotent migration. Повторный запуск не должен ломать базу.

## 10. Constants

### `server/constants/auth.constants.js`

#### `AUTH_CONTACT_TYPE`

Объект с допустимыми типами контакта:

- `email`;
- `phone`.

#### `AUTH_CONTACT_TYPE_VALUES`

Массив допустимых значений. Нужен для валидации и переиспользования.

### `server/constants/task.constants.js`

#### `TASK_PRIORITY`

Объект допустимых приоритетов:

- `low`;
- `medium`;
- `high`.

#### `TASK_COMPLETION`

Числовое представление boolean-состояния в SQLite.

#### `TASK_PRIORITY_VALUES`

Массив допустимых приоритетов.

## 11. Auth DTO: `server/dto/auth.dto.js`

### `toUserDto(user, decryptValue, maskContact)`

Преобразует запись пользователя из базы в безопасный объект для API.

Зачем:

- не отдавать `passwordHash`;
- не отдавать коды;
- не отдавать encrypted contact;
- показать только masked contact.

### `toRegisterResponse(contactType, pendingContact, verificationPreview)`

Формирует ответ после регистрации.

Возвращает:

- сообщение;
- контакт, который нужно подтвердить;
- тип контакта;
- preview-код, если он разрешён в dev/test.

### `toVerificationSuccessResponse(userDto)`

Формирует ответ после успешного подтверждения регистрации.

### `toLoginSuccessResponse(userDto)`

Формирует ответ после успешного входа.

## 12. Task DTO: `server/dto/task.dto.js`

### `toTaskDto(task)`

Приводит задачу к frontend-формату.

Делает:

- `completed` превращает в boolean;
- `notes` гарантирует строку;
- `deletedAt` гарантирует `null`, если значения нет.

### `toTaskListDto(tasks)`

Применяет `toTaskDto` ко всем задачам в массиве.

## 13. Crypto utils: `server/utils/crypto.js`

### `hashValue(value)`

Создаёт SHA-256 hash строки.

Используется для:

- contact hash;
- session token hash;
- verification code hash;
- login code hash.

### `encryptValue(value)`

Шифрует строку через AES-256-GCM.

Теория:

- AES - алгоритм симметричного шифрования;
- GCM даёт не только шифрование, но и проверку целостности;
- IV должен быть случайным для каждого шифрования;
- auth tag нужен для проверки, что данные не подменили.

### `decryptValue(payload)`

Расшифровывает значение, созданное `encryptValue`.

Если ключ неправильный или данные повреждены, Node выбросит ошибку.

### `generateVerificationCode()`

Создаёт 6-значный код.

Используется для:

- регистрации;
- входа по email.

### `maskContact(contactType, contact)`

Маскирует контакт для отображения пользователю.

Пример:

```text
alex@example.com -> al***@example.com
```

## 14. Validators: `server/utils/validators.js`

### `normalizeContactType(contactType)`

Приводит тип контакта к допустимому значению.

Если пришло не `phone`, используется `email`.

### `normalizeContact(contactType, contact)`

Приводит контакт к единому формату:

- email переводится в lowercase;
- телефон очищается от пробелов, скобок и дефисов.

### `isValidContact(contactType, contact)`

Проверяет, похож ли контакт на email или телефон.

### `normalizePriority(priority, partial)`

Приводит приоритет к `low`, `medium`, `high`.

Если `partial=true`, отсутствующий priority возвращает `undefined`, чтобы не перезаписывать старое значение.

### `normalizeRegistrationPayload(payload)`

Нормализует данные регистрации.

### `normalizeLoginPayload(payload)`

Нормализует данные входа.

### `normalizeVerificationPayload(payload)`

Нормализует данные подтверждения кода.

### `normalizeTaskPayload(payload, partial)`

Нормализует данные задачи.

`partial=true` используется при редактировании, когда можно передать только часть полей.

### `validateRegistrationPayload(payload)`

Проверяет регистрацию:

- имя обязательно;
- контакт обязателен и должен быть правильного формата;
- пароль должен быть от 8 до 72 символов.

### `validateLoginPayload(payload)`

Проверяет вход:

- контакт;
- пароль;
- максимальную длину пароля.

### `validateVerificationPayload(payload)`

Проверяет подтверждение кода:

- контакт;
- код;
- код должен быть 6 цифр.

### `validateTaskPayload(payload, partial)`

Проверяет задачу:

- title обязателен при создании;
- category должен быть строкой;
- notes должен быть строкой;
- priority должен быть `low`, `medium`, `high`;
- deadline должен быть валидной датой;
- completed должен быть boolean.

### `buildContactKey(contactType, contact)`

Создаёт строку вида:

```text
email:alex@example.com
```

Эта строка потом хешируется и используется для поиска пользователя.

## 15. Error utils: `server/utils/errors.js`

### `AppError`

Класс ошибки приложения.

Хранит:

- HTTP status;
- code;
- message;
- details.

### `buildErrorBody(code, message, details)`

Создаёт единый JSON-формат ошибки.

### `createErrorResult(status, code, message, details)`

Возвращает объект:

```js
{
  (status, body);
}
```

Так service может вернуть ошибку controller'у без привязки к Express.

### `toHttpErrorPayload(error)`

Преобразует исключение в HTTP-ответ.

Отдельно обрабатывает:

- `AppError`;
- ошибку битого JSON;
- неизвестные ошибки.

### `createValidationError(details, message)`

Создаёт стандартную ошибку валидации.

## 16. Async handler: `server/utils/async-handler.js`

### `asyncHandler(handler)`

Оборачивает async controller и передаёт ошибки в Express `next`.

Зачем:

- не писать `try/catch` в каждом route;
- централизованно отправлять ошибки через `errorHandler`.

## 17. Middleware

### `requireAuth(request, response, next)`

Файл: `server/middleware/auth.middleware.js`.

Проверяет, есть ли активная сессия.

Если сессии нет:

- возвращает `401 AUTH_REQUIRED`.

Если сессия есть:

- кладёт пользователя в `request.user`;
- вызывает `next()`.

### `corsMiddleware(request, response, next)`

Файл: `server/middleware/cors.middleware.js`.

Контролирует, каким сайтам можно делать запросы к API.

В development разрешает origin для удобства. В production проверяет `CORS_ALLOWED_ORIGINS`.

### `applyCorsHeaders(response, origin)`

Устанавливает CORS-заголовки.

### `handleOptions(request, response, next)`

Обрабатывает preflight-запросы `OPTIONS`.

### `createRateLimiter(options)`

Файл: `server/middleware/rate-limit.middleware.js`.

Создаёт middleware, которое ограничивает количество запросов.

Используется для auth-эндпоинтов, чтобы снизить риск brute force и abuse.

### `notFoundHandler(request, response)`

Файл: `server/middleware/error.middleware.js`.

Возвращает `404`, если route не найден.

### `errorHandler(error, request, response, next)`

Формирует единый JSON-ответ для ошибок.

## 18. Auth repository: `server/repositories/auth.repository.js`

Repository - это слой SQL.

### `findUserByContactHash(contactHash)`

Ищет пользователя по hash контакта.

### `findUserIdentityByContactHash(contactHash)`

Возвращает только `id` и `isVerified`. Используется при регистрации, чтобы проверить дубликат без загрузки всего пользователя.

### `createUser(user)`

Создаёт пользователя в таблице `users`.

### `verifyUserById(userId)`

Помечает пользователя как подтверждённого.

Также очищает verification code.

### `updateVerificationCode(userId, verificationCodeHash, verificationExpiresAt)`

Обновляет код регистрации/подтверждения.

### `updateLoginCode(userId, loginCodeHash, loginCodeExpiresAt)`

Сохраняет hash login code и срок действия.

### `updateEncryptedContact(userId, encryptedContact)`

Обновляет зашифрованный контакт.

Нужно для восстановления старых контактов после смены `AUTH_ENCRYPTION_KEY`.

### `clearLoginCode(userId)`

Очищает login code после успешного входа.

### `findUserById(userId)`

Ищет пользователя по id.

### `deleteExpiredSessions(currentTimestamp)`

Удаляет сессии, срок действия которых истёк.

### `findSessionUserByTokenHash(tokenHash, currentTimestamp)`

Ищет активную сессию по hash token.

### `deleteSessionsByUserId(userId)`

Удаляет все сессии пользователя.

Используется:

- перед созданием новой сессии;
- при logout-all.

### `countSessionsByUserId(userId)`

Считает активные сессии пользователя.

### `createSession(session)`

Создаёт сессию в базе.

### `deleteSessionByTokenHash(tokenHash)`

Удаляет конкретную сессию.

## 19. Tasks repository: `server/repositories/tasks.repository.js`

### `listTasksByUserId(userId)`

Возвращает активные задачи пользователя.

Активные - это задачи, у которых `deletedAt IS NULL`.

### `listDeletedTasksByUserId(userId)`

Возвращает задачи из корзины.

### `createTask(task)`

Создаёт задачу в SQLite.

### `findTaskByIdAndUserId(taskId, userId)`

Ищет задачу конкретного пользователя.

Важно: userId нужен, чтобы пользователь не мог получить чужую задачу.

### `updateTask(task)`

Обновляет задачу, если она не удалена.

### `deleteTaskByIdAndUserId(taskId, userId)`

Выполняет soft delete: записывает `deletedAt`.

### `restoreTaskByIdAndUserId(taskId, userId)`

Восстанавливает задачу из корзины.

### `permanentlyDeleteTaskByIdAndUserId(taskId, userId)`

Удаляет задачу окончательно, но только если она уже в корзине.

### `clearCompletedTasksByUserId(userId)`

Перемещает завершённые задачи в корзину.

### `clearTrashByUserId(userId)`

Удаляет все задачи пользователя из корзины.

## 20. Email service: `server/services/email.service.js`

### `isSmtpConfigured()`

Проверяет, указан ли `SMTP_HOST`.

### `wait(milliseconds)`

Возвращает Promise, который завершится через указанное время.

Используется для retry при rate limit Mailtrap.

### `isRateLimitError(error)`

Проверяет, является ли SMTP-ошибка ограничением Mailtrap `Too many emails per second`.

### `getTransporter()`

Создаёт и переиспользует Nodemailer transporter.

Transporter - объект, который умеет отправлять письма через SMTP.

### `sendMailWithRetry(message)`

Отправляет письмо. Если Mailtrap отвечает rate limit, ждёт и пробует снова.

### `sendVerificationCode(contactType, contact, code, purpose)`

Главная функция отправки кода.

Если `purpose="verification"`, письмо будет про подтверждение аккаунта.

Если `purpose="login"`, письмо будет про вход.

### `__resetEmailTransportForTests()`

Сбрасывает transporter в тестах.

## 21. Auth service: `server/services/auth.service.js`

Auth service - самый важный слой бизнес-логики авторизации.

### `registerUser(payload)`

Регистрирует пользователя.

Делает:

1. валидирует payload;
2. нормализует контакт;
3. проверяет дубликат;
4. генерирует код;
5. отправляет письмо;
6. хеширует пароль;
7. шифрует контакт;
8. создаёт пользователя.

### `verifyUser(payload)`

Подтверждает регистрацию.

Проверяет:

- есть ли пользователь;
- не подтверждён ли уже;
- не истёк ли код;
- совпадает ли hash кода.

### `resendVerificationCode(payload)`

Создаёт новый код подтверждения и отправляет его повторно.

### `loginUser(payload)`

Обрабатывает вход.

Проверяет:

- формат данных;
- brute-force блокировку;
- существование пользователя;
- подтверждение контакта;
- пароль.

Для email создаёт login code. Для phone возвращает успешный вход сразу.

### `verifyLoginCode(payload)`

Подтверждает код входа.

После успешной проверки:

- очищает login code;
- возвращает user;
- controller создаёт cookie-сессию.

### `getSessionUser(request)`

Берёт token из cookie, хеширует его и ищет активную сессию.

### `createSession(response, userId)`

Создаёт session token, сохраняет hash в базе и отправляет cookie в браузер.

### `destroySession(request, response)`

Удаляет текущую сессию.

### `destroyAllSessions(request, response)`

Удаляет все сессии пользователя.

### `getSessionSummary(user)`

Возвращает информацию о сессиях:

- количество активных сессий;
- время создания текущей;
- время истечения текущей.

### `serializeUser(user)`

Преобразует пользователя через `toUserDto`.

### `ensureContactCanBeDecrypted(userId, contact)`

Проверяет, можно ли расшифровать контакт. Если нельзя, заново шифрует контакт, который пользователь ввёл при подтверждении.

### `getBlockedLoginState(contactHash)`

Проверяет, заблокирован ли вход для контакта после неудачных попыток.

### `markFailedLoginAttempt(contactHash)`

Увеличивает счётчик неудачных попыток входа.

### `clearLoginAttemptState(contactHash)`

Сбрасывает счётчик после успешного ввода пароля.

### `delayFailureResponse()`

Добавляет задержку при неудачном входе.

Зачем:

- усложнить brute force;
- сделать массовый перебор паролей медленнее.

### `__resetLoginSecurityStateForTests()`

Сбрасывает состояние блокировок между тестами.

### `getVerificationPreview(verificationCode, deliveryResult)`

Возвращает код в API-ответ только если включён dev/test preview.

## 22. Tasks service: `server/services/tasks.service.js`

### `listTasks(userId)`

Получает активные задачи пользователя и приводит их к DTO.

### `listDeletedTasks(userId)`

Получает задачи из корзины.

### `createTask(userId, payload)`

Создаёт задачу.

Проверяет payload, нормализует данные и вызывает repository.

### `updateTask(userId, taskId, payload)`

Обновляет задачу.

Сначала проверяет, существует ли задача у пользователя, затем валидирует изменения.

### `deleteTask(userId, taskId)`

Перемещает задачу в корзину.

### `restoreTask(userId, taskId)`

Восстанавливает задачу из корзины.

### `permanentlyDeleteTask(userId, taskId)`

Удаляет задачу окончательно.

### `clearCompletedTasks(userId, shouldDeleteCompleted)`

Перемещает завершённые задачи в корзину.

Требует, чтобы query был `completed=true`.

### `clearTrash(userId)`

Очищает корзину.

### `bulkUpdateTasks(userId, payload)`

Массово обновляет задачи по массиву id.

### `exportTasks(userId)`

Возвращает задачи пользователя в формате JSON export.

### `importTasks(userId, payload)`

Импортирует задачи из массива.

Ограничивает импорт первыми 250 задачами.

## 23. Auth controller: `server/controllers/auth.controller.js`

Controller переводит HTTP в service calls.

### `register(request, response)`

Вызывает `authService.registerUser`.

### `verify(request, response)`

Вызывает `authService.verifyUser`. Если всё успешно, создаёт сессию.

### `resendVerification(request, response)`

Вызывает повторную отправку кода.

### `login(request, response)`

Вызывает `authService.loginUser`. Если service вернул `userId`, создаёт cookie.

### `verifyLogin(request, response)`

Подтверждает login code и создаёт cookie.

### `session(request, response)`

Возвращает текущего пользователя или `authenticated: false`.

### `logout(request, response)`

Удаляет текущую сессию.

### `logoutAll(request, response)`

Удаляет все сессии пользователя.

## 24. Tasks controller: `server/controllers/tasks.controller.js`

### `list(request, response)`

Возвращает активные задачи.

### `listTrash(request, response)`

Возвращает корзину.

### `create(request, response)`

Создаёт задачу.

### `update(request, response)`

Редактирует задачу.

### `remove(request, response)`

Мягко удаляет задачу.

### `restore(request, response)`

Восстанавливает задачу.

### `permanentlyRemove(request, response)`

Удаляет задачу окончательно.

### `clearCompleted(request, response)`

Перемещает завершённые задачи в корзину.

### `clearTrash(request, response)`

Очищает корзину.

### `bulkUpdate(request, response)`

Массово обновляет задачи.

### `exportTasks(request, response)`

Экспортирует задачи.

### `importTasks(request, response)`

Импортирует задачи.

## 25. Routes

### `server/routes/auth.routes.js`

Связывает URL с auth controller.

Routes:

- `POST /register`;
- `POST /verify`;
- `POST /resend-verification`;
- `POST /login`;
- `POST /login/verify`;
- `GET /session`;
- `POST /logout`;
- `POST /logout-all`.

### `server/routes/tasks.routes.js`

Связывает URL с tasks controller.

Routes:

- `GET /`;
- `GET /trash`;
- `GET /export`;
- `POST /import`;
- `PUT /bulk`;
- `POST /`;
- `PUT /:id`;
- `POST /:id/restore`;
- `DELETE /:id`;
- `DELETE /:id/permanent`;
- `DELETE /`;
- `DELETE /trash/clear`.

## 26. Frontend: app shell

Файл: `public/js/app-shell.js`.

### `mountAppShell()`

Загружает `components/app-shell.html` и вставляет его в `#appMount`.

Зачем:

- держать большой HTML компонента отдельно;
- монтировать оболочку приложения динамически;
- дать другим модулям Promise `window.appShellReady`.

## 27. Frontend: auth module

Файл: `public/js/auth.js`.

### `initializeAuthModule()`

Ждёт загрузки app shell, монтирует auth HTML и запускает auth-логику.

### `mountAuthMarkup()`

Загружает `components/auth.html` в `#authMount`.

### `initializeAuth()`

Находит DOM-элементы, привязывает события, проверяет текущую сессию.

Внутри этой функции объявлены обработчики auth UI.

### `handleRegister(event)`

Отправляет регистрацию на backend и переключает UI на форму кода.

### `handleLogin(event)`

Отправляет email/телефон и пароль.

Если backend требует login code, переключает UI на вкладку кода.

### `handleVerification(event)`

Подтверждает либо регистрацию, либо вход.

Выбор endpoint зависит от `verifyForm.dataset.mode`.

### `handleResendVerification()`

Повторно отправляет код регистрации.

Для login code показывает подсказку: нужно повторить вход email+password.

### `handleLogout()`

Выходит из аккаунта и очищает frontend state.

### `updateAuthView()`

Переключает интерфейс между состояниями:

- пользователь вошёл;
- пользователь не вошёл.

### `switchAuthTab(tabName)`

Переключает вкладки auth modal.

### `handleAuthButtonClick()`

Если пользователь вошёл, открывает настройки. Если нет, открывает auth modal.

### `openAuthModal()`

Открывает модальное окно авторизации.

### `closeAuthModal()`

Закрывает модальное окно авторизации.

### `handleEscapeClose(event)`

Закрывает modal по клавише `Escape`.

### `showVerificationStep()`

Показывает вкладку ввода кода.

### `hideVerificationStep()`

Скрывает вкладку ввода кода.

### `request(url, options)`

Обёртка над `fetch`.

Делает:

- отправляет HTTP-запрос;
- парсит JSON или text;
- если ответ не `ok`, выбрасывает Error.

### `showBanner(element, message, type)`

Показывает информационный banner.

### `hideBanner(element)`

Скрывает banner.

### `composeVerificationMessage(message, code)`

Добавляет preview-код к сообщению, если backend вернул его в dev/test.

## 28. Frontend: task manager

Файл: `public/js/task-manager.js`.

### `initializeTaskManager()`

Главная функция задач.

Делает:

- ждёт app shell;
- создаёт `uiState`;
- собирает DOM-элементы;
- привязывает события;
- подключает глобальные `loadTasks` и `renderTasks`;
- применяет preferences;
- рендерит интерфейс.

### `loadTasks()`

Загружает:

- активные задачи;
- корзину;
- session summary.

### `bindEvents()`

Назначает обработчики событий на кнопки, формы и модальные окна.

### `handleTaskSubmit(event)`

Обрабатывает быструю форму создания задачи.

### `createTask(payload)`

Создаёт задачу через API и добавляет её в frontend state.

### `renderTasks()`

Перерисовывает все task-разделы:

- список;
- dashboard;
- timeline;
- trash;
- analytics;
- settings;
- counters.

### `renderTaskList()`

Рисует основной список задач с учётом фильтра, поиска, сортировки и лимита.

### `createTaskNode(task, canDrag)`

Создаёт DOM-узел одной задачи.

### `getPreparedTasks()`

Готовит список задач:

- применяет поиск;
- применяет фильтр;
- применяет сортировку.

### `toggleTaskStatus(taskId)`

Переключает completed state задачи.

### `updateTask(taskId, changes)`

Отправляет изменения задачи на API и обновляет frontend state.

### `openQuickTaskModal()`

Открывает modal для новой задачи.

### `openTaskModal(taskId)`

Открывает modal редактирования существующей задачи или создания новой.

### `saveTaskFromModal(event)`

Сохраняет задачу из modal.

### `duplicateTask(taskId)`

Создаёт копию задачи.

### `snoozeTask(taskId)`

Сдвигает deadline на 1 день вперёд.

### `deleteTask(taskId)`

Перемещает задачу в корзину после подтверждения.

### `clearCompletedTasks()`

Перемещает завершённые задачи в корзину.

### `toggleTaskSelection(taskId, isSelected)`

Добавляет или удаляет задачу из выбранных.

### `toggleSelectVisible()`

Выбирает или снимает выбор со всех видимых задач.

### `completeSelectedTasks()`

Отмечает выбранные задачи завершёнными.

### `openBulkEditModal()`

Открывает modal массового редактирования.

### `applyBulkEdit(event)`

Собирает изменения из bulk modal и применяет их.

### `runBulkUpdate(changes)`

Отправляет bulk update на API.

### `deleteSelectedTasks()`

Удаляет выбранные задачи.

### `exportSelectedTasks()`

Экспортирует выбранные задачи в JSON.

### `exportAllTasks()`

Экспортирует все задачи через API.

### `openExportModal(data)`

Открывает modal с JSON export.

### `openImportModal()`

Открывает modal импорта.

### `importTasks()`

Импортирует задачи из JSON.

### `renderDashboard()`

Рисует dashboard-блоки.

### `dashboardCard(title, tasks)`

Создаёт HTML карточки dashboard.

### `renderTimeline()`

Рисует задачи по дедлайнам.

### `renderTrash()`

Рисует корзину.

### `restoreTask(taskId)`

Восстанавливает задачу из корзины.

### `permanentlyDeleteTask(taskId)`

Удаляет задачу окончательно.

### `clearTrash()`

Очищает корзину.

### `renderAnalytics()`

Рисует статистику задач.

### `statRow(label, count, total)`

Создаёт строку статистики.

### `renderSettings()`

Рисует настройки аккаунта и интерфейса.

### `logoutAllSessions()`

Вызывает API выхода со всех устройств.

### `switchView(viewName)`

Переключает разделы интерфейса.

### `handleDragStart(taskId, node)`

Запоминает задачу, которую пользователь начал перетаскивать.

### `handleDragOver(event, node)`

Обрабатывает наведение при drag-and-drop.

### `handleDrop(targetTaskId)`

Меняет ручной порядок задач.

### `canUseManualOrder()`

Проверяет, можно ли сейчас использовать drag-and-drop.

### `handleQueryChange()`

Сбрасывает visible limit и перерисовывает список при поиске/фильтрах/сортировке.

### `loadMoreTasks()`

Увеличивает количество видимых задач.

### `updateLoadMore(totalPreparedCount, visibleCount)`

Показывает или скрывает кнопку `Load more`.

### `updateBulkControls(visibleTasks)`

Обновляет доступность кнопок массовых действий.

### `replaceTask(updatedTask)`

Заменяет задачу в frontend state.

### `updateCounters()`

Обновляет числовые счётчики.

### `updateSummary(visibleCount)`

Обновляет summary по видимым и выбранным задачам.

### `pruneSelectedIds()`

Удаляет из выбранных id задач, которых больше нет.

### `syncManualOrderWithTasks(prependNewest)`

Синхронизирует ручной порядок с актуальным списком задач.

### `hydrateManualOrder()`

Загружает ручной порядок из localStorage.

### `persistManualOrder()`

Сохраняет ручной порядок в localStorage.

### `manualOrderStorageKey()`

Создаёт ключ localStorage для конкретного пользователя.

### `selectedIds()`

Возвращает массив выбранных id.

### `findTask(taskId)`

Ищет задачу во frontend state.

### `openModal(modal)`

Открывает modal.

### `closeModals()`

Закрывает все modal-окна.

### `confirmAction(title, message)`

Показывает confirm modal и возвращает Promise с решением пользователя.

### `handleEscapeKey(event)`

Закрывает modal по `Escape`.

### `applyPreferences()`

Применяет пользовательские настройки интерфейса.

### `showError(message)`

Показывает ошибку в task banner.

### `showInfo(message)`

Показывает информационное сообщение в task banner.

### `collectElements()`

Собирает DOM-элементы в один объект.

### `formatDate(value)`

Форматирует дату для UI.

### `toDateTimeLocal(value)`

Преобразует дату к формату input `datetime-local`.

### `sortByDeadline(firstTask, secondTask)`

Сортирует задачи по deadline.

### `priorityWeight(priority)`

Возвращает числовой вес priority.

### `priorityLabel(priority)`

Возвращает человекочитаемое название priority.

### `isOverdue(task)`

Проверяет, просрочена ли задача.

### `startOfDay(date)`

Возвращает начало дня.

### `countBy(values)`

Считает количество повторений значений.

### `escapeHtml(value)`

Экранирует HTML-символы.

Нужно, чтобы импортированные или пользовательские данные не превращались в HTML-код.

### `loadPreferences()`

Загружает настройки UI из localStorage.

### `savePreferences(preferences)`

Сохраняет настройки UI в localStorage.

## 29. Тесты

Тесты лежат в `tests/`.

### `api.integration.test.js`

Проверяет реальные HTTP-процессы:

- регистрация;
- подтверждение;
- вход через email code;
- logout;
- задачи;
- корзина;
- import/export;
- invalid JSON;
- rate limit.

### `auth.service.test.js`

Проверяет бизнес-логику авторизации.

### `tasks.service.test.js`

Проверяет бизнес-логику задач.

### `email.service.test.js`

Проверяет email service без реальной отправки писем.

### `repositories.test.js`

Проверяет SQL-слой.

### `utils.test.js`

Проверяет crypto, errors и async handler.

### `validators.test.js`

Проверяет нормализацию и валидацию.

### `tests/helpers/test-env.js`

Подготавливает изолированное окружение для тестов.

#### `initTestEnvironment(suiteName)`

Создаёт временную базу и задаёт env-переменные.

#### `purgeModuleCache()`

Очищает require cache, чтобы каждый test suite получил свежие настройки.

#### `resetDatabase(db)`

Очищает таблицы между тестами.

## 30. Почему код разделён именно так

Если бы весь код был в одном файле, проект быстро стал бы сложным:

- тяжело тестировать;
- тяжело искать ошибки;
- легко сломать чужую часть;
- сложно развивать.

Разделение на слои даёт порядок:

- routes знают только URL;
- controllers знают HTTP;
- services знают бизнес-логику;
- repositories знают SQL;
- utils знают общие маленькие операции;
- DTO знают формат ответа.

## 31. Что важно понимать при защите проекта

Если нужно объяснить проект преподавателю или интервьюеру, говори так:

1. Это не просто список задач, а full-stack приложение.
2. Backend построен слоями.
3. Пользовательские контакты шифруются.
4. Пароли хранятся как bcrypt hash.
5. Коды и session token тоже хранятся как hash.
6. Email-коды отправляются через SMTP.
7. Есть защита от частых auth-запросов.
8. Есть soft delete и корзина.
9. API возвращает единый формат ошибок.
10. Проект покрыт unit и integration тестами.

## 32. Мини-глоссарий

- Auth - авторизация и аутентификация.
- Authentication - проверка личности пользователя.
- Authorization - проверка прав доступа.
- Hash - односторонний отпечаток значения.
- Encryption - обратимое шифрование.
- Session - состояние входа.
- Cookie - значение, сохранённое браузером.
- Middleware - промежуточный обработчик запроса.
- Controller - HTTP-слой.
- Service - бизнес-логика.
- Repository - SQL-слой.
- DTO - форматирование данных для ответа.
- Validation - проверка входных данных.
- Normalization - приведение данных к единому виду.
- Soft delete - удаление через пометку, а не физическое удаление.
- SMTP - протокол отправки email.
- CORS - политика доступа между сайтами.
- Rate limit - ограничение частоты запросов.

## 33. Рекомендуемый порядок изучения кода

1. `README.md` - понять продукт.
2. `server.js` и `server/app.js` - понять запуск.
3. `config/env.js` - понять настройки.
4. `server/db/database.js` - понять таблицы.
5. `server/routes/*.js` - понять API.
6. `server/controllers/*.js` - понять HTTP-слой.
7. `server/services/*.js` - понять бизнес-логику.
8. `server/repositories/*.js` - понять SQL.
9. `server/utils/*.js` - понять общие функции.
10. `public/js/*.js` - понять frontend.
11. `tests/*.test.js` - понять, как проверяется поведение.

## 34. Итог

TaskFlow показывает путь от простой идеи “список задач” до полноценного учебного full-stack проекта. В нём есть пользовательские аккаунты, безопасность, email-подтверждение, работа с базой, frontend-интерфейс, API, тесты и инструменты качества. Методичка нужна, чтобы можно было не только запустить проект, но и объяснить каждую важную часть кода: что она делает, зачем нужна и на какой теории основана.
