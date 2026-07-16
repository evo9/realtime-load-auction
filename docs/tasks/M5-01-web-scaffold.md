# M5-01 — web: scaffold Next.js, auth, react-query, WS-клиент

**Майлстоун:** M5 (фронт)
**Зависимости:** M1-05, M3-05
**Оценка:** M (1 день)

## Цель
Каркас `apps/web` (§11, §13): Next.js + аутентификация carrier, серверное состояние через react-query, клиент socket.io.

## Объём работ
- Next.js проект, tailwind, базовый layout/навигация.
- Auth: вход как `carrier` (`POST /auth/login`), хранение/прокидывание JWT, защита страниц.
- `@tanstack/react-query`: провайдер, базовый API-клиент (с JWT), инвалидация.
- `socket.io-client`: обёртка подключения к `WS /realtime` (JWT), хук подписки на канал лота.
- Конфиг API URL через env.

## Definition of Done
- Логин carrier работает, токен прокидывается в запросы.
- react-query настроен; WS-хук подключается и логирует события.
- Сборка/линт фронта проходят.
