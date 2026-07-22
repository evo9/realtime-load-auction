# M5-02 — web: список лотов (SSR + фильтры)

План: /Users/evo/.claude/plans/playful-imagining-stardust.md

## Implement
- [ ] `lib/auth/token-storage.ts` — localStorage → cookie
- [ ] `lib/api/client.ts` — `RequestOptions.token?`
- [ ] `types/contracts.ts` — `EquipmentType`, `LotStatus`, `ListingLotDto`, `ListLotsQuery/Response`
- [ ] `lib/api/endpoints.ts` — `listLots(query, token?)`
- [ ] `components/lots/countdown.tsx`
- [ ] `components/lots/lot-card.tsx`
- [ ] `components/lots/lot-filters.tsx`
- [ ] `components/lots/lot-pagination.tsx`
- [ ] `app/(protected)/lots/page.tsx` — RSC
- [ ] `app/(protected)/lots/[id]/page.tsx` — плейсхолдер

## Verify
- [ ] `pnpm -C apps/web lint`
- [ ] `pnpm -C apps/web build`
- [ ] Ручной прогон в браузере: SSR-рендер, фильтры, пагинация, переход на /lots/:id

## Pipeline
- [ ] `reviewer`
- [ ] `spec-guardian`
- [ ] `security-review`
- [ ] worklog.md + INDEX.md
- [ ] отчёт в чат
