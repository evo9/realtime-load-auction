# M1-05 — Модуль identity: пользователи, роли, JWT, login

**Майлстоун:** M1 (каркас)
**Зависимости:** M1-03
**Оценка:** M (1 день)

## Цель
Тонкий модуль аутентификации: пользователи с ролями `shipper`/`carrier`, JWT-логин, гард ролей. Без passport (см. §13).

## Объём работ
- Сущность `User` (id, email, passwordHash, role) + миграция.
- `POST /auth/login` → проверка пароля (bcrypt/argon2) → выдача JWT (`@nestjs/jwt`).
- `JwtAuthGuard` на `@nestjs/jwt` (без `@nestjs/passport`).
- `@Roles()` декоратор + `RolesGuard` (`shipper` / `carrier`).
- `GET /me` (текущий пользователь) для проверки гарда.
- Seed-хук для пары тестовых пользователей (наполнится в M2-08).

## Definition of Done
- Логин валидного юзера возвращает JWT; невалидный → 401.
- Защищённый эндпоинт без токена → 401, с чужой ролью → 403.
- Покрыто unit-тестами (guard + login handler).
