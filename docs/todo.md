# M6-03 — Диаграммы: C4 + горячий путь + saga

Три Mermaid-диаграммы в `docs/diagrams/`, встроенные в README (заменяют текстовый placeholder про диаграммы, оставленный в M6-02). ADR (M6-04) — не в объёме этой задачи, placeholder про него остаётся.

## Implement
- [x] `docs/diagrams/c4-context-container.md` — C4 контекст+контейнеры (actors → web → api → postgres/rabbitmq/redis)
- [x] `docs/diagrams/hot-path-bid.md` — sequenceDiagram горячего пути ставки (§6, 5 шагов + reconciliation)
- [x] `docs/diagrams/settlement-saga.md` — flowchart саги сеттлмента (§7, 6 шагов + компенсации в обратном порядке)
- [x] README — заменил placeholder на встроенные mermaid-блоки + ссылки на файлы-первоисточники, ADR вынесен в отдельный подраздел

## Verify
- [x] Все три `.mmd` реально отрендерены `@mermaid-js/mermaid-cli` (headless Chromium, тот же движок, что использует GitHub) в SVG/PNG и визуально проверены — не просто «похоже на валидный синтаксис»
- [x] Шаги на диаграммах построчно сверены с `place-bid.handler.ts` / `settlement-step.consumer.ts` / `saga.ts` (включая точный набор компенсаций no-op для winner/notify/settle)
- [x] Placeholder про ADR (M6-04) не тронут — вынесен в свой подраздел «Архитектурные решения (ADR)»
- [x] Найдена и исправлена неоднозначность лейблов компенсаций в saga-диаграмме (три одинаковых «Compensate: — (no-op)» → пронумерованы) — заметно только на реальном рендере, не на исходном тексте

## Pipeline
- [ ] Запись в docs/worklog.md + галочка в docs/tasks/INDEX.md
