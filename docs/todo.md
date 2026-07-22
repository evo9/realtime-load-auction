# M5-04 — web: дашборд «Мои ставки»

Решение по WS (уточнено с пользователем): без live-обновления через WS в этой задаче — чистый SSR с курсорной пагинацией, как `/lots` (M5-02). DoD "обновляется после новой ставки/закрытия" закрывается свежим SSR-фетчем при каждом заходе/навигации. WS-версия — явный TODO на будущее (мультиплексация `useLotChannel` на несколько лотов одной страницы — отдельная задача, не блокирует M5-04).

## Implement
- [ ] `types/contracts.ts` — `MyBidStatus`, `MyBidDto`, `MyBidsResponse`
- [ ] `lib/api/endpoints.ts` — `getMyBids(query, token)`
- [ ] `components/lot-pagination.tsx` — обобщить `LotPagination` на `basePath`, переиспользовать для `/me/bids` (не дублировать курсорную пагинацию)
- [ ] `components/my-bids/status-badge.tsx` — бейдж статуса (leading/outbid/won/lost)
- [ ] `app/(protected)/me/bids/page.tsx` — SSR-страница, список + пагинация + ссылки на `/lots/:id`
- [ ] `components/nav.tsx` — ссылка "Мои ставки"

## Verify
- [ ] `pnpm -C apps/web lint && build`
- [ ] Ручной прогон в браузере: список ставок carrier, статусы, пагинация, переход на лот, обновление после новой ставки (повторный заход)

## Pipeline
- [ ] `reviewer`
- [ ] `spec-guardian`
- [ ] `security-review`
- [ ] worklog.md + INDEX.md
- [ ] отчёт в чат
