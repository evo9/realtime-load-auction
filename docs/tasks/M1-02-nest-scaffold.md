# M1-02 — NestJS scaffold: app.module, config, логирование, healthcheck

**Майлстоун:** M1 (каркас)
**Зависимости:** M1-01
**Оценка:** M (0.5–1 день)

## Цель
Запускаемое приложение `apps/api` на Nest 11 с конфигом, структурным логом и healthcheck.

## Объём работ
- Структура `apps/api/src` по §9: `main.ts`, `app.module.ts`, `modules/`, `platform/`.
- `@nestjs/config`: загрузка env + валидация схемы конфига (Joi/zod), типизированный `ConfigService`.
- `tsconfig` с алиасами `@src/*` (`tsconfig-paths`).
- Логирование `nestjs-pino` (+ `pino-http`): корреляция запросов (request-id).
- `helmet` + глобальный `ValidationPipe` (`class-validator`/`class-transformer`).
- `GET /health` — liveness/readiness (проверка коннектов добавится по мере появления).
- ESLint + Prettier конфиги.

## Definition of Done
- `npm run start:dev` поднимает API, `GET /health` → 200.
- Конфиг падает с понятной ошибкой при отсутствии обязательной env.
- Логи структурные (JSON) с request-id.
- Линт проходит.
