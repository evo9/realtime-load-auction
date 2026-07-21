# M2-02 — platform/messaging: разбор по косточкам

> Учебный конспект по задаче M2-02 (топология RabbitMQ, Publisher, BaseConsumer, QoS, retry/DLX).
> Цель — чтобы к коду можно было вернуться в любой момент и освежить суть.
> Идёт от фундамента (что такое AMQP с нуля) к каждому компоненту.
> Пара: [m2-01-redis-explained.md](m2-01-redis-explained.md). Там Redis хранил *состояние*; здесь RabbitMQ передаёт *события*.

---

## 0. Четыре факта про RabbitMQ, без которых остальное — магия

1. **RabbitMQ — это почта, а не словарь.** Redis отвечал на вопрос «кто сейчас лидирует»
   (состояние). RabbitMQ отвечает на другой: «произошла ставка — сообщи всем, кому это
   интересно» (доставка событий). Ключевое слово — **развязка (decoupling)**: тот, кто
   отправил событие, **не знает**, кто его получит; получатель не знает, кто отправил.
   Между ними — брокер. Аукцион кинул `bid.placed` в брокер и забыл; кто на это подпишется
   (уведомления, read-model листинга) — забота брокера, не аукциона.

2. **Три сущности: exchange → binding → queue.** Producer публикует **не в очередь**, а в
   **exchange** (обменник, коммутатор) и вешает на сообщение **routing key** (метку-адрес).
   Exchange по своим правилам-**binding**'ам решает, в какие **queue** (очереди) положить
   копию. Consumer читает из очереди.

   ```
   producer ──publish(exchange, routingKey)──▶ [EXCHANGE] ──по bindings──▶ [QUEUE] ──▶ consumer
   ```

   Почтовая метафора целиком: бросаешь письмо на сортировочный узел (**exchange**) с индексом
   (**routing key**); почта по таблице маршрутизации (**bindings**) раскладывает копии по
   ящикам (**queues**); получатель забирает из своего ящика. Одно письмо → может лечь в
   несколько ящиков сразу. Producer видит только узел, не ящики.

3. **Тип exchange = правило раскладки.** В проекте три вида:
   - **`topic`** — маршрутизация по шаблону routing key (с точками-сегментами и `*`/`#`).
     Одно событие может уйти в несколько очередей — это **fan-out по интересам**.
     Шина доменных событий `auction.events` — topic.
   - **`direct`** — точное совпадение routing key. Адресная доставка. Команды саге
     `settlement.commands` — direct.
   - **default exchange** (пустая строка `''`) — особый встроенный direct, где routing key
     трактуется **как имя очереди напрямую**. «Доставить ровно в эту очередь по имени».
     Ниже (§5) увидим, зачем он в retry.

4. **`ack` — расписка, и в ней вся драма.** Consumer, обработав сообщение, шлёт **ack**
   (acknowledge) = «готово, можешь удалять». Пока ack нет (`noAck: false`), брокер держит
   сообщение как «выдано, но не подтверждено» (in-flight) и, если consumer умрёт, **отдаст
   его заново** другому (redelivery). Это и есть гарантия «не потеряем».

   Обратная сторона монеты: если обработчик **всегда падает** до ack, сообщение будет
   возвращаться **вечно** — «отравленное сообщение» (poison message), бесконечный busy-loop.
   Вот почему полработы M2-02 — не про «как отправить», а про **что делать с сообщением,
   которое не обработалось**. Ответ — retry/DLX (§5).

   Ещё две «прочности», не путать: **durable** — переживает рестарт *брокера* сама структура
   (exchange/queue); **persistent** — тело *сообщения* сброшено на диск. Нужны оба, иначе при
   перезапуске RabbitMQ событие испарится. В коде: `durable: true` у всех exchange/queue,
   `persistent: true` по умолчанию у Publisher.

**Почему пишем руками, без `@nestjs/microservices`.** Задача (§13 ТЗ) — «демонстрируемое
ядро». `@nestjs/microservices` спрятал бы топологию, ack, prefetch и retry за магией
декораторов — а именно их надо *показать*. Поэтому тонкая ручная обёртка над `amqplib` +
`amqp-connection-manager`. Второй пакет добавляет авто-реконнект (§2).

---

## 1. Топология (§8.1) — вся «почта», которую объявляем при старте

Прежде чем кто-то что-то отправит, надо объявить сортировочные узлы и ящики. Это делает
`declareTopology(channel)` — одна функция, которую вызывают все каналы (см. §2, почему все).

**Что объявляется (`messaging.constants.ts` + `topology.ts`):**

Четыре exchange:

| Exchange | Тип | Роль |
|---|---|---|
| `auction.events` | topic | шина доменных событий (`bid.placed`, `lot.opened`, `lot.closed`…) |
| `settlement.commands` | direct | команды саге сеттлмента (`settlement.step`) |
| `auction.retry` | topic | карантин: сюда кладут сообщение «поспать» перед повтором |
| `auction.dlx` | topic | морг (Dead Letter eXchange): сюда уходит то, что не переварили |

Четыре «рабочих» очереди и их подписки (bindings):

```
auction.events (topic)
   ├── bid.placed  ──▶ notification.q
   ├── lot.opened  ──▶ notification.q , listing.q
   └── lot.closed  ──▶ notification.q , settlement.q , listing.q     ← fan-out в ТРИ очереди

settlement.commands (direct)
   └── settlement.step ──▶ settlement.steps.q
```

Вот он, fan-out «по интересам»: одно событие `lot.closed` брокер копирует в три ящика —
уведомить участников (`notification.q`), запустить расчёт (`settlement.q`), обновить витрину
(`listing.q`). Аукцион при этом опубликовал **одно** сообщение и ничего про этих троих не знает.

И для **каждой** рабочей очереди — ещё два служебных ящика (строятся по имени, `messaging.constants.ts`):

```
notification.q     → notification.retry.q   (карантин повторов)
                   → notification.dlq        (морг)
settlement.q       → settlement.retry.q  / settlement.dlq
listing.q          → listing.retry.q     / listing.dlq
settlement.steps.q → settlement.steps.retry.q / settlement.steps.dlq
```

`.retry.q` привязан к `auction.retry`, `.dlq` — к `auction.dlx`, у обоих routing key = имя
исходной очереди. Как это крутится — §5.

**Идемпотентность декларации (DoD «повторный старт не падает»).** Всё объявляется через
`assertExchange` / `assertQueue`. `assert` = «убедись, что есть; нет — создай; **есть с теми
же параметрами — ничего не делай**». Поэтому топологию можно объявлять хоть сто раз подряд —
второй старт (и каждый реконнект) просто подтверждает уже существующее. Упало бы только на
попытке пересоздать очередь с *другими* параметрами — но параметры зашиты в константах, так
что расхождения быть не может.

---

## 2. Соединение, авто-реконнект и «самолечение» топологии

**Один пакет поверх другого.** `amqplib` — сырой драйвер AMQP. `amqp-connection-manager` —
обёртка, которая переживает обрыв TCP: молча переподключается и **заново прогоняет `setup`
каждого канала**. Это прямой аналог того, как в M2-01 ioredis сам подгружал Lua-скрипт после
`NOSCRIPT`, — «упало → само починилось».

```ts
// messaging.module.ts
amqp.connect(
  [`amqp://${user}:${password}@${host}:${port}`],
  { heartbeatIntervalInSeconds: 15, reconnectTimeInSeconds: 5 },
)
```
- `heartbeat 15s` — брокер и клиент раз в 15с пингуют друг друга; молчит дольше → соединение
  считается мёртвым (быстро замечаем обрыв, а не висим).
- `reconnectTimeInSeconds 5` — после обрыва пробуем переподключиться каждые 5с.

**Connection vs Channel — важное различие.** Одно TCP-**соединение** (connection) на весь
процесс, а внутри него много лёгких виртуальных труб — **каналов** (channel). Каждый занятый
делом объект берёт свой канал: `TopologyService` — свой, `Publisher` — свой, каждый
`BaseConsumer` — свой. Каналы дёшевы, а разделение нужно, чтобы prefetch/QoS одного consumer'а
и confirm-семантика publisher'а не мешали друг другу.

> Аналогия с M2-01, но по другой причине: там pub/sub требовал **двух соединений**, потому что
> подписанный коннект Redis не может слать команды. Здесь всё в одном соединении, а каналы
> разделяют — ради изоляции QoS и подтверждений, а не из-за запрета.

**`setup` = «объяви топологию на этом канале, прежде чем им пользоваться».** Заметь: и
`TopologyService`, и `Publisher`, и `BaseConsumer` передают `declareTopology` как `setup`:

```ts
this.channel = connection.createChannel({ json: false, setup: declareTopology });
```
Зачем каждому? Потому что `setup` вызывается **при первом коннекте и заново при каждом
реконнекте**. Так любой канал сам гарантирует, что нужная ему «почта» существует — и после
разрыва восстанавливает её, не дожидаясь, кто там `TopologyService`. Именно потому, что
`declareTopology` идемпотентна (§1), три канала могут объявлять одно и то же без конфликта.

- `json: false` — «не сериализуй за меня, я сам гоняю Buffer'ы» (Publisher делает
  `JSON.stringify` руками — так контролируем `contentType` и формат).

**Токен и жизненный цикл.**
- `AMQP_CONNECTION = Symbol(...)` — та же идея «уникального штрих-кода», что `REDIS_CLIENT`
  в M2-01: одно соединение под биркой, все получают его через `@Inject`.
- `AmqpLifecycle.onModuleDestroy → connection.close()` — аккуратно закрываем при остановке
  (аналог `client.quit()` у Redis).
- `@Global()` — модуль виден всему приложению без повторного импорта.

---

## 3. Publisher — надёжная отправка

```ts
// publisher.ts
async publish(exchange, routingKey, payload, opts = {}) {
  await this.channel.publish(
    exchange, routingKey,
    Buffer.from(JSON.stringify(payload)),            // RabbitMQ гоняет байты, как Redis — строки
    {
      persistent: opts.persistent ?? true,           // по умолчанию — на диск
      messageId: opts.messageId,                      // ключ дедупа для консьюмера (M3-01)
      contentType: 'application/json',
      headers: opts.headers,
      expiration: opts.expiration,                    // per-message TTL — движок retry (§5)
    },
  );
}
```

Три вещи, ради которых это отдельный класс, а не голый `channel.publish`:

1. **confirm-channel.** Канал создан как confirm-канал, и `channel.publish` здесь возвращает
   промис, который резолвится **только когда брокер подтвердил приём** сообщения. Это «ack, но
   для отправки»: не «выстрелил и забыл», а «дождался расписки, что письмо принято на почту».
   Упадёт приём — промис отклонится, вызывающий узнает.

2. **`messageId`.** Уникальный идентификатор сообщения. Сам publisher его не использует — он
   нужен **консьюмеру** для дедупа (обработать одно и то же событие один раз). Порт под это уже
   заложен (§6), реальная проверка — в M3-01.

3. **`persistent: true` + `contentType`.** Тело на диск (переживёт рестарт брокера), метка
   формата — чтобы получатель знал, что там JSON.

`expiration` — строковый per-message TTL в мс. В обычной публикации не задаётся; это рычаг,
которым consumer управляет задержкой повтора (§5).

---

## 4. BaseConsumer — обработать строго по шаблону

Абстрактный класс: наследник обязан задать `queue` (из какой очереди читать), `prefetch`
(сколько держать в работе одновременно) и `process(msg)` (что делать с сообщением).

### Подписка и QoS/prefetch

```ts
// base.consumer.ts — onModuleInit
setup: async (ch) => {
  await declareTopology(ch);         // топология на месте (см. §2)
  await ch.prefetch(this.prefetch);  // QoS: не давать мне больше N необработанных за раз
  await ch.consume(this.queue, (raw) => { void this.handle(raw, ch); }, { noAck: false });
}
```

**`prefetch(N)` = QoS = backpressure.** Брокер не вывалит на consumer больше `N` сообщений,
пока тот не подтвердит (ack) уже выданные. `prefetch=1` → строго по одному: пока не обработал
и не ack'нул текущее — следующего не дадут. Это ограничивает *in-flight* и не даёт одному
воркеру нахватать работы, с которой он не справляется. DoD «QoS реально ограничивает» доказан
тестом: на 5 параллельно опубликованных сообщениях при `prefetch=1` максимум одновременно
обрабатываемых — ровно 1 (`observedMax === 1`).

**`noAck: false`** — «я подтверждаю руками» (см. §0, факт 4). Без этого брокер счёл бы
сообщение доставленным сразу и потерял бы его при падении обработчика.

**`void this.handle(...)` — важная тонкость (и источник того самого CRITICAL, §5.1).**
Callback в `consume` не ожидается брокером — обработка запускается «выстрелил и пусть бежит»
(fire-and-forget). Поэтому если внутри `handle` вылетит **необработанное** исключение из
промиса — это unhandled rejection, который может **уронить процесс**. Отсюда железное правило:
внутри `handle` всё, что может бросить, обёрнуто в try/catch.

### Шаблон обработки одного сообщения

```ts
private async handle(raw, channel) {
  if (!raw) return;

  let msg;
  try { msg = this.parse(raw); }                       // (1) распарсить
  catch (err) { await this.deadLetterUnparsable(raw, channel, err); return; }  // битый JSON → сразу в морг

  if (await this.dedup.seen(msg.messageId)) {           // (2) уже видели? → тихо ack и выход
    channel.ack(raw); return;
  }

  try {
    await this.process(msg);                            // (3) бизнес-обработка (наследник)
    await this.dedup.mark(msg.messageId);               //     запомнить, что обработали
    channel.ack(raw);                                   //     расписка: удаляй
  } catch (err) {
    await this.retryOrDlq(msg, raw, channel, err);      // (4) упало → в retry или в DLQ
  }
}
```

Четыре шага, каждый — со своей защитой:
1. **parse** в try/catch — невалидное тело не роняет процесс, уходит в морг (§5.1).
2. **dedup** — идемпотентность потребителя: то же `messageId` обрабатываем один раз.
   Сейчас заглушка всегда говорит «не видел» (§6).
3. **process → mark → ack** — успешный путь: сделал работу, отметил, подтвердил.
4. **retryOrDlq** — единственная реакция на ошибку бизнес-логики (§5).

`parse` заодно достаёт номер попытки: `attempt = Number(headers['x-attempt'] ?? 0)` — почему
свой заголовок, а не встроенный `x-death`, объяснено в §5.

---

## 5. Retry/DLX — сердце задачи (и самое неочевидное)

**Проблема.** `process()` бросил ошибку. Терять сообщение нельзя (может, БД моргнула — надо
повторить). Но и мгновенно возвращать в очередь нельзя: обработчик снова упадёт мгновенно →
busy-loop на 100% CPU. Нужно: **подождать → повторить, до N раз → сдаться (в DLQ)**.

**Как в RabbitMQ сделать «подождать».** Нативной задержки нет. Трюк на TTL + dead-letter:
кладём сообщение в очередь **без потребителя** и с TTL; когда TTL истекает, брокер
**dead-letter'ит** его — перекладывает в заранее указанное место. То есть сообщение «спит»
ровно TTL, потом «просыпается» там, куда мы настроили дедлеттер. Наш «сон» — это `.retry.q`.

### Механика по шагам

При ошибке `retryOrDlq` **публикует** сообщение заново (через `Publisher`):

```ts
// не превысили лимит → в карантин, поспать backoff(attempt) мс
await publisher.publish(Exchanges.retry, this.queue, msg.payload, {
  messageId: msg.messageId,
  headers: { ...msg.headers, 'x-attempt': nextAttempt },
  expiration: String(this.backoff(nextAttempt)),   // ← per-message TTL
});
channel.ack(raw);                                   // старую копию убираем: новая уже в брокере
```

Маршрут одной попытки (для `notification.q`):

```
process() бросил
  │
  ▼ publish → auction.retry, rk="notification.q", expiration=TTL
[auction.retry] ──binding──▶ [notification.retry.q]   (потребителя нет — сообщение просто лежит)
                                    │  спит expiration мс
                                    ▼  TTL истёк → dead-letter
                             default exchange '' , rk="notification.q"
                                    │
                                    ▼
                             [notification.q]   ← снова у consumer'а, попытка +1
```

`.retry.q` объявлена так (`topology.ts`):

```ts
await channel.assertQueue(retryQ, {
  durable: true,
  arguments: {
    'x-dead-letter-exchange': '',                 // default exchange
    'x-dead-letter-routing-key': q.name,          // ← ровно в исходную очередь по имени
  },
});
```

Теперь четыре неочевидных решения, каждое из которых легко сделать неправильно:

**(A) Почему задержка — per-message `expiration`, а НЕ `x-message-ttl` на очереди.**
Нужен **экспоненциальный** backoff: 150 → 300 → 600 мс. Если TTL зашить в саму retry-очередь
(`x-message-ttl`), все повторы спали бы *одинаково*, и под каждый уровень задержки пришлось бы
плодить отдельную очередь. Per-message `expiration` позволяет **одной** `.retry.q` обслуживать
все попытки с разной задержкой — её ставит consumer на каждую публикацию.

> Честная «грабля» на будущее: per-message TTL в RabbitMQ срабатывает только когда сообщение
> дошло до **головы** очереди (она FIFO). Если впереди лежит сообщение с бóльшим TTL, то
> сообщение за ним с меньшим TTL не «проснётся» раньше — head-of-line blocking. Для нашего
> редкого retry-трафика это приемлемо, но знать полезно.

**(B) Почему дедлеттер назад идёт через default exchange, а НЕ через `auction.events`.**
Это главный подвох. Представь, что `.retry.q` возвращала бы сообщение в `auction.events` с его
исходным routing key `lot.closed`. Тогда повтор из `settlement.q` **зафанаутился бы снова** в
`notification.q` и `listing.q` (они тоже подписаны на `lot.closed`) — те получили бы дубликат
на каждой ретрай-итерации соседа. Через **default exchange** с routing key = имя конкретной
очереди сообщение ложится **ровно в одну** нужную очередь. Точечная доставка вместо повторного
веерного разлёта.

**(C) Почему счётчик попыток — свой `x-attempt`, а НЕ встроенный `x-death`.**
RabbitMQ при каждом дедлеттере сам дописывает заголовок `x-death`. Но он копит записи по паре
(очередь, причина), а наше сообщение прыгает `q → retry.q → q → retry.q…` — `x-death`
становится неоднозначным для «сколько всего было попыток». Поэтому consumer ведёт **явный**
счётчик `x-attempt` и сам его инкрементирует. Однозначно и под нашим контролем.

**(D) Backoff и уход в морг.**
```ts
private backoff(attempt) {
  const ttl = base * Math.pow(multiplier, attempt - 1);
  return Math.min(ttl, maxTtl);                    // экспонента с потолком
}
```
Когда попыток исчерпано:
```ts
if (nextAttempt > this.config.retryLimit) {
  await publisher.publish(Exchanges.dlx, this.queue, msg.payload, {
    messageId: msg.messageId,
    headers: { ...msg.headers, 'x-attempt': nextAttempt, 'x-last-error': String(err) },
  });
}
```
→ `auction.dlx` → `notification.dlq`. Конечная. Тело и `x-last-error` сохранены для разбора.

### Пошаговая прогонка (retryLimit=2, base=150, multiplier=2)

```
попытка 0  приходит в notification.q      → process() бросил
           nextAttempt=1, 1≤2 → retry, expiration=150 (150·2⁰)   спит 150мс → назад в очередь
попытка 1  приходит снова                 → бросил
           nextAttempt=2, 2≤2 → retry, expiration=300 (150·2¹)   спит 300мс → назад
попытка 2  приходит снова                 → бросил
           nextAttempt=3, 3>2 → в auction.dlx → notification.dlq,  x-attempt=3
```

Итого сообщение прожевали **3 раза** (исходная + 2 повтора) прежде чем сдаться. DoD «после N
ошибок — в `<name>.dlq`» доказан: в DLQ `x-attempt = retryLimit + 1 = 3`, то есть оно прошло
**весь** цикл, а не свалилось сразу. Успешное же — `ack` без единого повтора, DLQ пуст.

**Почему после публикации в retry/dlx старую копию `ack`'аем.** Новая копия уже принята
брокером (confirm-канал!) — значит оригинал можно убирать. «Переложить» = опубликовать новое +
подтвердить старое. Если бы публикация упала, `ack` не выполнился бы и оригинал вернулся бы сам
— ничего не потеряли.

### 5.1. Битое тело → сразу в морг (найденный CRITICAL)

`parse` делает `JSON.parse(raw.content)`. Если тело — не JSON (повреждено, или кто-то
опубликовал сырьё), `JSON.parse` бросает. Изначально это было **вне** try/catch, а `handle`
запускается через `void` (fire-and-forget, §4) → получался **unhandled promise rejection**,
который мог уронить процесс. А так как сообщение не было ack'нуто — брокер возвращал его снова →
падение в цикле, **в обход** retry/DLQ.

Фикс — отдельный путь:
```ts
private async deadLetterUnparsable(raw, channel, err) {
  await this.publisher.publish(Exchanges.dlx, this.queue, raw.content.toString('utf8'), {
    messageId,
    headers: { 'x-attempt': 1, 'x-last-error': String(err) },
  });
  channel.ack(raw);
}
```
Логика: невалидный JSON **не станет** валидным при повторе → ретрай-цикл бессмысленен → сразу
в DLQ, `x-attempt: 1`, минуя `auction.retry`. Сырое тело кладём как есть — чтобы можно было
глазами посмотреть, что пришло. Регресс-тест публикует не-JSON `Buffer` **напрямую в exchange**
(в обход `Publisher`) и проверяет: без фикса тест виснет (сообщение крутится в redelivery), с
фиксом — оно оказывается в DLQ с `x-attempt: 1`.

> Заодно закрыли WARNING того же прохода: `RABBITMQ_PREFETCH` получил `.int().min(1)`. По
> семантике AMQP `prefetch = 0` означает «безлимит» — тихо отключило бы backpressure, тогда как
> человек, ставя 0, скорее ждёт «ничего не выдавать». Валидацией запретили.

---

## 6. DedupPort — шов под идемпотентность (пока заглушка)

```ts
// dedup.port.ts
export interface DedupPort {
  seen(messageId: string): Promise<boolean>;   // уже обрабатывали это сообщение?
  mark(messageId: string): Promise<void>;       // запомнить, что обработали
}
export const DEDUP_PORT = Symbol('DEDUP_PORT');

@Injectable()
export class NullDedupPort implements DedupPort {
  seen() { return Promise.resolve(false); }     // всегда «не видел»
  mark() { return Promise.resolve(); }          // ничего не помнит
}
```

**Зачем.** У доставки RabbitMQ семантика **at-least-once** (§0: без ack — redeliver). Значит
один и тот же `messageId` может прийти дважды (реконнект, повтор). Чтобы бизнес-эффект случился
один раз, нужен дедуп-хук в шаблоне `handle` (§4, шаг 2). Но настоящая проверка требует общего
на все инстансы хранилища (Redis-`SETNX` по `messageId`) — а это объём **M3-01**.

Поэтому здесь только **порт** (интерфейс + токен) и **пустая реализация** `NullDedupPort`: шов
на месте, `handle` уже дёргает `seen`/`mark`, но пока они — no-op. Это ровно тот приём, что
`OUTBOX_PORT` в M1-03: объявляем контракт сейчас, подставляем реализацию потом, не переписывая
consumer. В M2-02 подключён `NullDedupPort`; в M3-01 `MessagingModule` подменит его на
Redis-версию — и `handle` заработает без единой правки.

> Заметка ревьюера (отложено, не блокирует): сам вызов `dedup.seen` пока **вне** try/catch —
> станет актуально, когда появится реальный Redis-порт, способный бросить при недоступности.

---

## 7. Конфиг

Пять `RABBITMQ_*` env → секция `AppConfigService.messaging` → в consumer через `MESSAGING_CONFIG`:

| Поле | Что | Роль |
|---|---|---|
| `prefetch` | сколько держать in-flight | QoS/backpressure (§4) |
| `retryLimit` | сколько повторов до DLQ | граница цикла (§5) |
| `retryBaseTtlMs` | базовая задержка | 1-й повтор (§5, backoff) |
| `retryMultiplier` | множитель экспоненты | 150→300→600… |
| `retryMaxTtlMs` | потолок задержки | `Math.min(ttl, max)` |

Никаких магических чисел в коде — вся политика повторов управляется из окружения.

---

## Карта в голове

| Компонент | Задача | Механика |
|---|---|---|
| Топология (§1) | объявить «почту» | 4 exchange + очереди + `.retry.q`/`.dlq`; `assert*` идемпотентно |
| Connection (§2) | пережить обрыв | `amqp-connection-manager`, `setup` перезапускает `declareTopology` на реконнекте |
| Publisher (§3) | надёжно отправить | confirm-channel + `persistent` + `messageId` |
| BaseConsumer (§4) | обработать по шаблону | prefetch/QoS, `parse → dedup → process → ack`, ручной `ack` |
| retryOrDlq (§5) | пережить временный сбой | TTL-сон в `.retry.q` → назад; N раз → DLQ. default-exchange + `x-attempt` |
| DedupPort (§6) | не обработать дважды | порт + `NullDedupPort`; Redis-реализация — M3-01 |

**Три идеи, которые держат всё M2-02:**
1. **Развязка через exchange.** Отправитель знает узел, не адресатов. Fan-out `lot.closed` в три
   очереди — «бесплатно» и без ведома аукциона.
2. **`ack` = контроль над потерей и повтором.** Ручной ack даёт «не потеряем», но рождает
   «отравленные сообщения» → нужен retry/DLX.
3. **Задержку делаем чужими руками.** У RabbitMQ нет «подожди N мс» — эмулируем через
   TTL-очередь + dead-letter, а тонкости (per-message TTL, возврат через default exchange,
   свой `x-attempt`) — чтобы экспонента работала и повтор не разлетался лишним веером.

---

> **Почему это ядро сейчас «молчит».** Ни одна очередь пока не имеет живого потребителя —
> `BaseConsumer` наследуют только тесты. Настоящие консьюмеры появятся в M3 (bidding,
> notification) и M4 (сага сеттлмента), и вот тогда fan-out, prefetch и retry перестанут быть
> абстракцией. Ты прав: когда очереди начнут *использоваться*, эта картинка сама встанет на место.
