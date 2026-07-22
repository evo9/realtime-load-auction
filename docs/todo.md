# M5-03 — web: страница живого лота (WS, отсчёт, форма ставки)

План: /Users/evo/.claude/plans/playful-imagining-stardust.md

## A. Backend anti-snipe fix
- [ ] `modules/auction/domain/lot.ts` — +lastBidAt
- [ ] `modules/auction/infrastructure/lot.entity.ts` — +last_bid_at column
- [ ] `modules/auction/infrastructure/lot.mapper.ts` — +lastBidAt
- [ ] `modules/auction/infrastructure/lot.repository.ts` — +touchLastBidAt
- [ ] `platform/persistence/migrations/<ts>-AddLotLastBidAt.ts`
- [ ] `platform/messaging/messaging.constants.ts` — +RoutingKeys.lotExtended, +realtime binding
- [ ] `modules/auction/application/close-lot.handler.ts` — drop CloseLotOptions, read lastBidAt, emit lot.extended
- [ ] `modules/bidding/application/place-bid.handler.ts` — touchLastBidAt in TX
- [ ] rewrite `close-lot.anti-snipe.integration-spec.ts`
- [ ] update any other CloseLotHandler call-site/spec using opts

## B. Frontend live-lot page
- [ ] `types/contracts.ts` — LotResponseDto, BidHistoryItemDto/Response, BidView, reason-union, lot.extended
- [ ] `lib/api/endpoints.ts` — getLot, getLotBids, placeBid
- [ ] `lib/ws/use-lot-channel.ts` — generalize to handler map
- [ ] `components/lots/best-bid.tsx`
- [ ] `components/lots/bid-history.tsx`
- [ ] `components/lots/bid-form.tsx`
- [ ] `components/lots/live-lot.tsx`
- [ ] `app/(protected)/lots/[id]/page.tsx` — SSR shell

## Verify
- [ ] `pnpm -C apps/api lint && build && test && test:integration`
- [ ] `pnpm -C apps/web lint && build`
- [ ] Two-tab manual demo: live bid, 409s, idempotent replay, anti-snipe extension (DB + WS)

## Pipeline
- [ ] `reviewer`
- [ ] `spec-guardian`
- [ ] `security-review`
- [ ] `pattern-verifier` (anti-snipe integration test)
- [ ] worklog.md + INDEX.md
- [ ] отчёт в чат
