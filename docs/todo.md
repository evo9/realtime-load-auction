# M5-01 — web scaffold: Next.js, auth, react-query, WS-клиент

Дизайн подтверждён `architect`. План — реализация.

## apps/api — точечный фикс CORS (нужен, чтобы фронт вообще мог достучаться до HTTP API из браузера; WS уже permissive с M3-05)
- [ ] `env.schema.ts`: добавить `CORS_ORIGINS` (строка через запятую, default `http://localhost:3001`)
- [ ] `app-config.service.ts`: геттер `cors.origins: string[]`
- [ ] `main.ts`: `app.enableCors({ origin: config.cors.origins, methods: [...], allowedHeaders: ['Content-Type','Authorization','Idempotency-Key'] })`
- [ ] `.env.example`: добавить `CORS_ORIGINS=http://localhost:3001`

## apps/web — новые зависимости
- [ ] `@tanstack/react-query`, `socket.io-client`

## apps/web/src — файлы
- [ ] `lib/config.ts` — `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL` из env
- [ ] `types/contracts.ts` — `Role`, `User`/`JwtPayload`, `RealtimeEnvelope`, имена WS-событий
- [ ] `lib/auth/token-storage.ts` — get/set/clear токена в localStorage
- [ ] `lib/api/client.ts` — fetch-обёртка: baseURL, `Authorization: Bearer`, `ApiError`, колбэк на 401 (регистрируется `AuthProvider`)
- [ ] `lib/api/endpoints.ts` — `login(email,password)`, `getMe()` (остальные эндпоинты — по мере надобности в M5-02+, здесь не нужны сверх auth)
- [ ] `lib/auth/auth-context.tsx` — `AuthProvider` + `useAuth()`: token/user/login/logout, гидратация из localStorage
- [ ] `lib/ws/socket.ts` — фабрика `socket.io-client` на `/realtime`, `auth:{token}`, `autoConnect:false`
- [ ] `lib/ws/use-lot-channel.ts` — `useLotChannel(lotId)`: connect → `subscribe{lotId}` → логирует все события конверта → `unsubscribe` + disconnect при unmount
- [ ] `providers/query-provider.tsx` — `QueryClient` + `QueryClientProvider` (без devtools)
- [ ] `providers/providers.tsx` — композиция `AuthProvider` + `QueryProvider`, `"use client"`
- [ ] `app/layout.tsx` — правка: обернуть в `<Providers>`, актуализировать метаданные/название
- [ ] `app/page.tsx` — редирект на `/lots` либо `/auth/login` в зависимости от токена
- [ ] `app/auth/login/page.tsx` — публичная форма логина carrier
- [ ] `app/(protected)/layout.tsx` — клиентский guard (нет токена → redirect на login) + nav
- [ ] `app/(protected)/lots/page.tsx` — заглушка (наполнится в M5-02)
- [ ] `components/nav.tsx` — навигация + logout

## Проверка
- [ ] `pnpm -C apps/web lint`
- [ ] `pnpm -C apps/web build`
- [ ] `pnpm -C apps/api lint && build && test` (не сломать бэк правкой CORS)
- [ ] Ручная проверка: `make up` (если не поднято) → api dev + web dev → логин carrier из seed → редирект → WS-хук логирует событие при коннекте
- [ ] `reviewer` (load-auction-reviewer) → PASS
- [ ] `spec-guardian` — эндпоинты/контракт совпадают с §10/§11
- [ ] `security-review` — токен/CORS/логин без утечек
- [ ] Записать в `docs/worklog.md` + галочка в `docs/tasks/INDEX.md`

## Не в объёме этой задачи
- Полноценные страницы списка лотов/живого лота/моих ставок (M5-02..M5-04)
- react-query инвалидация по WS-событиям (M5-02/M5-03)
- RTL/Playwright — тестовая инфра фронта заводится в следующей задаче, где появится что содержательно тестировать
