# M2-04 — platform/scheduler: разбор по косточкам

> Учебный конспект по задаче M2-04 (ZSET-планировщик отложенных команд open/close лота).
> Цель — чтобы к коду можно было вернуться в любой момент и освежить суть.
> Идёт от фундамента (как из Redis сделать таймер) к каждому компоненту.
> Пара к [m2-01-redis-explained.md](m2-01-redis-explained.md): там ZSET хранил *лидерборд ставок*;
> здесь тот же ZSET становится **очередью «сделать в момент T»**. Один и тот же примитив — две роли.
> Родственник [m2-03-outbox-explained.md](m2-03-outbox-explained.md): оба — фоновые тикеры с
> реентерабельностью и at-least-once, только outbox тикает Postgres, а scheduler — Redis.

---

## 0. Пять фактов, без которых планировщик — «магический таймер»

1. **Задача: «открой лот в 12:00, закрой в 12:10» — но `setTimeout` тут не годится.** Наивное
   решение — `setTimeout(open, closeAt - now)` прямо в памяти процесса. Три причины, почему нет:
   - **рестарт убивает таймер.** Передеплой в 11:59 — и лот, который должен открыться в 12:00,
     не откроется никогда. Таймер жил только в оперативке.
   - **несколько инстансов.** Три копии API → три `setTimeout` → лот откроется три раза.
   - **анти-снайп (продление).** Ставка за 5 секунд до конца должна *отодвинуть* закрытие. Живой
     `setTimeout` так просто не переставить, а если наставить новых — старые всё равно выстрелят.

   Значит очередь отложенного должна жить **вне процесса, в общем хранилище, переживающем
   рестарт**. Это Redis.

2. **ZSET — это идеальная «шкала времени».** Напомню из M2-01: sorted set хранит пары
   `(member, score)`, автоматически держит их **отсортированными по score**. Гениальный трюк
   планировщика: **score = момент срабатывания в миллисекундах** (Unix-время), member = что сделать
   (`lotId`). Тогда «какие задачи пора выполнять сейчас?» = «дай все члены со `score ≤ now`» —
   это `ZRANGEBYSCORE key -inf now`. ZSET уже отсортирован, поэтому такой запрос дешёвый.

   ```
   auction:schedule:close   (score = когда закрыть, ms)
   ┌───────────────┬──────────────────┐
   │ member (lotId)│ score (closeAt)  │
   ├───────────────┼──────────────────┤
   │ L-42          │ 1784_300_600_000 │  ← ближе всех к «сейчас», выйдет первым
   │ L-07          │ 1784_300_930_000 │
   │ L-99          │ 1784_301_500_000 │
   └───────────────┴──────────────────┘
                     ▲ ZSET держит их отсортированными по этому столбцу
   ```

3. **«Таймер» = периодический опрос (polling), а не событие.** У Redis нет «разбуди меня в
   12:00». Поэтому отдельный тикер каждые N мс спрашивает «что уже пора?» и выполняет. Это тот же
   poll-loop, что у `OutboxRelay`. Задержка ограничена интервалом тика (по умолчанию 500 мс) —
   для открытия/закрытия лота такой точности с запасом хватает.

4. **Главная опасность — «сделать дважды».** Два инстанса (или два наложившихся тика) могут
   увидеть один и тот же due-элемент и оба его выполнить → лот закроется дважды. Классическое
   решение «прочитал → выполнил → удалил» дырявое: между «прочитал» и «удалил» есть окно, в
   которое влезает конкурент. Лечится **атомарным claim'ом**: «прочитать и удалить одним
   неделимым действием». В Redis это делает **Lua-скрипт** (§1) — Redis выполняет его целиком, не
   вклиниваясь другими командами.

5. **Гарантия — снова at-least-once.** Элемент сначала *изымается* из ZSET (claim), потом
   *диспатчится*. Если диспатч упал — элемент **возвращается** в ZSET с задержкой и будет
   доставлен позже. То есть «хотя бы раз». А «не дважды» на уровне бизнес-эффекта обеспечит
   идемпотентность команды `OpenLot`/`CloseLot` (state-machine лота из M2-05: повторный
   `open→open` запрещён). Та же связка, что в outbox: **планировщик гарантирует доставку,
   идемпотентность получателя гасит повтор.**

---

## 1. Атомарный claim: Lua-скрипт `SCHEDULER_CLAIM_DUE` (`scheduler.lua.ts`)

Сердце всей защиты от двойного дёргания — четыре строчки на Lua:

```lua
-- KEYS[1]=zset  ARGV[1]=now(ms)  ARGV[2]=batchSize
local due = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', ARGV[1], 'LIMIT', 0, tonumber(ARGV[2]))
if #due > 0 then
  redis.call('ZREM', KEYS[1], unpack(due))   -- изымаем в том же атомарном шаге
end
return due
```

Что происходит и почему именно так:
- **`ZRANGEBYSCORE key -inf now LIMIT 0 batchSize`** — «дай все члены со score от минус
  бесконечности до `now`, но не больше `batchSize` штук». То есть «всё, что уже пора, порцией».
- **`ZREM key <те же члены>`** — тут же их удаляет. `unpack(due)` разворачивает список в
  аргументы (`ZREM key L-42 L-07 ...`).
- **`return due`** — отдаёт claim'нутые члены наружу, диспатчить их будет уже TypeScript.

**Ключевая мысль — почему Lua, а не две отдельные команды.** Redis исполняет скрипт **атомарно**:
пока `SCHEDULER_CLAIM_DUE` бежит, никакая другая команда (от другого инстанса) между
`ZRANGEBYSCORE` и `ZREM` **не вклинится**. Значит два параллельных тика физически не могут
получить один и тот же член: кто первым забрал — тот и удалил, второму этот член уже не виден.
Это и есть отклонение от буквального скелета ТЗ (§9.7), где было три раздельных шага
`zrangebyscore → dispatch → zrem` с гоночным окном.

> Тонкость: `dispatch()` **не** внутри Lua. Скрипт только *изымает* (claim), а долгий вызов
> команды (`OpenLot`) идёт уже снаружи, в TypeScript. Держать бизнес-вызов внутри Lua нельзя —
> Redis на время скрипта однопоточно заблокирован, длинный скрипт заморозил бы весь Redis.

---

## 2. Примитив `ZSetScheduler` (`zset-scheduler.ts`)

Обёртка над Redis с двумя публичными методами. При старте регистрирует Lua как именованную
команду ioredis (`defineCommand('schedulerClaimDue', ...)`) — дальше её можно звать как
`client.schedulerClaimDue(...)`, ioredis сам кэширует скрипт в Redis по SHA.

### `schedule(setKey, dueAtMs, payload)` — поставить задачу
```ts
async schedule(setKey, dueAtMs, payload) {
  await this.client.zadd(setKey, dueAtMs, payload);   // score = когда, member = что
}
```
Просто `ZADD`. И вот тут — **важнейший инвариант**, вынесенный в JSDoc:

> `payload` обязан быть **стабильным идентификатором** пары (лот, действие) — например, просто
> `lotId`. Повторный `schedule` того же payload **обновляет score существующего члена**, а не
> добавляет второй.

Почему это критично: в ZSET member уникален. `ZADD close 12:10 L-42`, потом `ZADD close 12:15
L-42` — это **не** два элемента, а один L-42 с обновлённым score `12:15`. Именно так работает
**анти-снайп**: пришла ставка в последний момент — просто заново `schedule(L-42, closeAt+30s)`,
и старый дедлайн умирает сам собой, элемент один. **Но** если сунуть в payload timestamp или
случайный суффикс (`L-42:12:10`), уникальность сломается: получишь два члена, лот закроется
дважды. Отсюда правило: **payload = только стабильный ключ, без временных меток.**

### `tick(setKey, dispatch, opts)` — выполнить, что пора
```ts
async tick(setKey, dispatch, opts) {
  const now = Date.now();
  const claimed = await this.commands.schedulerClaimDue(setKey, String(now), String(batchSize));

  let dispatched = 0, requeued = 0;
  for (const payload of claimed) {
    try {
      await dispatch(payload);            // вызвать OpenLot/CloseLot
      dispatched++;
    } catch {
      await this.client.zadd(setKey, 'GT', now + retryDelayMs, payload);   // вернуть с задержкой
      requeued++;
    }
  }
  return { claimed: claimed.length, dispatched, requeued };
}
```

Три момента:
- **claim через Lua (§1)** → на руках порция изъятых из ZSET членов. Их в ZSET уже нет — конкурент
  их не увидит.
- **`dispatch(payload)` построчно.** Диспатч — это колбэк, сам scheduler не знает про лоты (см. §3).
- **retry через `ZADD GT` — самая тонкая деталь.** Если `dispatch` упал (команда временно
  недоступна), изъятый элемент **нельзя потерять** — возвращаем его в ZSET с новым score
  `now + retryDelayMs` (перепланировали на «через 5 сек»). Флаг **`GT`** = «обнови score, только
  если новый **больше** (Greater Than) текущего». Зачем: пока мы возимся с retry, конкурентный
  `schedule()` мог уже поставить элемент на *более поздний* срок (продление). `GT` не даст нашему
  retry **откатить** это продление на более раннее время. Без `GT` retry мог бы затереть свежий
  анти-снайп и закрыть лот раньше времени.

`TickResult` (`claimed/dispatched/requeued`) — не для логики, а для наблюдаемости и тестов
(«claim'нули 50, доставили 50, вернули 0»).

---

## 3. `SchedulerTicker` — фоновый мотор (`scheduler.ticker.ts`)

`ZSetScheduler` — пассивный примитив (умеет «поставить» и «тикнуть»), но сам себя не заводит.
Заводит его `SchedulerTicker` — по образцу `OutboxRelay`:

```ts
onModuleInit() {
  this.intervalHandle = setInterval(() => {
    this.tick().catch((err) => this.logger.error('scheduler tick failed', err));
  }, this.config.scheduler.tickIntervalMs);
}
onModuleDestroy() { if (this.intervalHandle) clearInterval(this.intervalHandle); }
```

На каждом цикле тикает **оба** ключа расписания:
```ts
async tick() {
  if (this.ticking) return;              // реентерабельность (как в outbox)
  this.ticking = true;
  try {
    const openResult  = await this.scheduler.tick(RedisKeys.scheduleOpen(),  (id) => this.port.dispatchOpen(id),  opts);
    const closeResult = await this.scheduler.tick(RedisKeys.scheduleClose(), (id) => this.port.dispatchClose(id), opts);
    if (openResult.claimed > 0 || closeResult.claimed > 0) this.logger.log(...);
  } finally { this.ticking = false; }
}
```

- **Два ключа:** `auction:schedule:open` (score = когда открыть) и `auction:schedule:close`
  (score = когда закрыть) — раздельные очереди, один тикер обслуживает обе.
- **Флаг `ticking`** — та же защита от наложения тиков в одном процессе, что в `OutboxRelay`:
  `setInterval` не ждёт завершения предыдущего тика, флаг заставляет наложившийся вызов выйти.
- **Грабли из ревью (записаны в worklog).** На первом проходе было `void this.tick()` без
  `.catch()`. Транзиентная ошибка Redis → unhandled promise rejection → по дефолту Node **роняет
  процесс**. Тот же класс бага, что чинили в `BaseConsumer` (M2-02). Исправлено на `.catch()` с
  логированием. Правило на будущее: **любой `setInterval(() => asyncFn())` обязан ловить reject.**

---

## 4. Развязка через порт: `SchedulerDispatchPort` (`scheduler-dispatch.port.ts`)

Тикер зовёт `this.port.dispatchOpen(lotId)` — но что это за порт? Тот же приём развязки, что
`OUTBOX_PORT` (M1-03) и `DEDUP_PORT` (M2-02): планировщик **не знает про auction-модуль**, он
знает только интерфейс.

```ts
interface SchedulerDispatchPort {
  dispatchOpen(lotId: string): Promise<void>;
  dispatchClose(lotId: string): Promise<void>;
}
export const SCHEDULER_DISPATCH_PORT = Symbol('SCHEDULER_DISPATCH_PORT');

class NullSchedulerDispatchPort implements SchedulerDispatchPort {
  dispatchOpen()  { throw new Error('Scheduler dispatch is not configured yet — ...'); }
  dispatchClose() { throw new Error('Scheduler dispatch is not configured yet — ...'); }
}
```

Реальная реализация (вызов команд `OpenLot`/`CloseLot`) появится при проводке auction (M2-06+).
Пока — throwing-заглушка: контракт есть, тела нет.

**Отличие от других портов — осознанное (тоже записано в worklog).** Фолбэк
`NullSchedulerDispatchPort` создаётся **внутри конструктора** тикера через `@Optional()`:

```ts
constructor(..., @Optional() @Inject(SCHEDULER_DISPATCH_PORT) port?: SchedulerDispatchPort) {
  this.port = port ?? new NullSchedulerDispatchPort();
}
```

а **не** регистрируется как провайдер модуля (как сделан `DEDUP_PORT`). Причина: throwing-порт
**не должен молча переопределяться**. Если будущий auction-модуль предоставит `SCHEDULER_DISPATCH_PORT`
— он подменит фолбэк без конфликта DI-токена. Ревью зафиксировало это как сознательную
несогласованность стиля между модулями, не как ошибку.

---

## 5. Полная прогонка: жизнь лота L-42

`tickIntervalMs = 500`, `retryDelayMs = 5000`. Лот открывается в 12:00:00, закрывается в 12:10:00.

**T−∞ — планирование (при создании лота, будущий M2-06):**
```
ZADD auction:schedule:open  1784300400000 "L-42"   (12:00:00)
ZADD auction:schedule:close 1784301000000 "L-42"   (12:10:00)
```
Обе задачи в Redis. Передеплой API их не тронет — переживут рестарт.

**12:00:00.3 — тик видит, что пора открывать:**
```
schedulerClaimDue(open, now=12:00:00.3, batch=100)
   Lua: ZRANGEBYSCORE open -inf 12:00:00.3 → ["L-42"];  ZREM open "L-42";  return ["L-42"]
   dispatch: port.dispatchOpen("L-42") → OpenLot → лот open ✅   (claimed:1, dispatched:1)
```
`L-42` изъят из `open`-ключа, больше не всплывёт. `close`-ключ пока пуст по времени — тик его
проверяет, `ZRANGEBYSCORE close -inf now` → `[]`, ничего.

**12:09:55 — анти-снайп: ставка за 5 секунд до конца.** Обработчик ставки (M3) продлевает:
```
ZADD auction:schedule:close 1784301030000 "L-42"   (12:10:30 — отодвинули на 30с)
```
В ZSET по-прежнему **один** член `L-42`, просто score теперь `12:10:30`. Старый дедлайн `12:10:00`
мёртв — он был лишь значением score, которое мы перезаписали. Никаких дублей.

**12:10:30.2 — тик закрывает:**
```
schedulerClaimDue(close, now=12:10:30.2, batch=100) → ["L-42"];  ZREM;  dispatch → CloseLot ✅
```
Закрылся ровно один раз, по продлённому сроку.

**Ветка сбоя — `CloseLot` упал (БД моргнула):**
```
claim: ["L-42"] (уже изъят из ZSET!)
dispatch("L-42") → throw
  catch: ZADD close GT (now+5000) "L-42"   → вернули на 12:10:35
```
Элемент **не потерян** — вернулся в ZSET с задержкой 5с. Следующий тик после 12:10:35 заберёт
его снова и доставит. At-least-once в действии. А `GT` гарантирует: если бы за эти 5 секунд
пришла ещё ставка и продлила до 12:11:00, наш retry (`12:10:35`) **не** откатил бы срок назад —
`GT` обновляет, только если новое значение больше.

---

## 6. Конфиг

Три `SCHEDULER_*` env → секция `AppConfigService.scheduler`:

| Поле | env | Диапазон / дефолт | Роль |
|---|---|---|---|
| `tickIntervalMs` | `SCHEDULER_TICK_INTERVAL_MS` | `50…60_000`, деф. `500` | как часто опрашивать Redis (латентность vs нагрузка) |
| `batchSize` | `SCHEDULER_BATCH_SIZE` | `1…1000`, деф. `100` | сколько due-задач за тик (`LIMIT` в Lua) |
| `retryDelayMs` | `SCHEDULER_RETRY_DELAY_MS` | `100…300_000`, деф. `5000` | на сколько отложить упавший dispatch |

**Урок из M2-03 применён сразу.** В outbox на первом проходе забыли **верхнюю** границу env
(ловил security-review). Здесь у всех трёх параметров сразу и `.min()`, и `.max()` — опечатка
`TICK_INTERVAL_MS=0` (busy-loop) или гигантский батч отсекаются на старте валидацией. Это прямой
перенос грабель предыдущей задачи — ровно то, ради чего ведётся worklog.

---

## 7. Что осознанно отложено (заглушки и грабли)

- **`SchedulerDispatchPort` — throwing-заглушка.** Реальный диспатч в `OpenLot`/`CloseLot` — при
  проводке auction (M2-06+). Позвать `dispatchOpen` сейчас = понятная ошибка, а не тихий no-op.
- **Нет unit-теста на `SchedulerTicker`.** Признано non-blocking: сам примитив `ZSetScheduler`
  полностью покрыт интеграционными тестами на **реальном** Redis (testcontainers) — там проверять
  логику осмысленнее, чем на моках. Тикер же — тонкая обёртка `setInterval` + два вызова.
- **DI-стиль порта отличается от `DEDUP_PORT`** (конструкторный фолбэк vs провайдер модуля) —
  сознательно (throwing-порт не переопределяем молча), но зафиксировано как несогласованность.
- **Идемпотентность — не здесь.** Планировщик даёт «≥1 раз». «Ровно раз» по бизнес-эффекту
  обеспечит state-machine лота (M2-05): повторный `open→open`/`close→close` запрещён переходом.

---

## Карта в голове

| Компонент | Задача | Механика |
|---|---|---|
| ZSET `schedule:open/close` | очередь «сделать в момент T» | score = дедлайн (ms), member = `lotId`; переживает рестарт |
| `SCHEDULER_CLAIM_DUE` (Lua, §1) | атомарно изъять то, что пора | `ZRANGEBYSCORE -inf now` + `ZREM` в одном шаге → нет двойного claim |
| `ZSetScheduler.schedule` (§2) | поставить/продлить | `ZADD`; тот же payload = обновление score (анти-снайп), не дубль |
| `ZSetScheduler.tick` (§2) | claim → dispatch → retry | построчный диспатч; сбой → `ZADD GT now+delay` (не теряем, не откатываем продление) |
| `SchedulerTicker` (§3) | завести мотор | `setInterval` + `ticking`-флаг + `.catch()`; тикает оба ключа |
| `SchedulerDispatchPort` (§4) | развязать от auction | порт + throwing-фолбэк в конструкторе; реализация в M2-06+ |

**Три идеи, которые держат весь M2-04:**
1. **ZSET с score=временем — это персистентный таймер.** «Что пора?» = `ZRANGEBYSCORE -inf now`.
   В отличие от `setTimeout`, переживает рестарт и общий для всех инстансов.
2. **Атомарность против двойного дёргания.** claim (`ZRANGEBYSCORE`+`ZREM`) слит в один Lua-шаг —
   два тика физически не заберут один член. Долгий `dispatch` — снаружи, чтобы не морозить Redis.
3. **Стабильный payload = анти-снайп бесплатно.** Уникальность member в ZSET превращает
   «повторный `schedule`» в «продление срока» без дублей. Ценой того, что в payload нельзя совать
   ничего изменчивого.

---

> **Где это «оживёт».** Сейчас `dispatchOpen`/`dispatchClose` ещё звать некому — команды
> `OpenLot`/`CloseLot` появятся в M2-06, а `schedule(...)` при создании лота — там же. Тогда
> тикер начнёт реально открывать и закрывать лоты по расписанию, а анти-снайп из bidding (M3)
> начнёт продлевать `close`-дедлайны. Пока же scheduler — готовый, протестированный на реальном
> Redis примитив, ждущий первой запланированной задачи.
