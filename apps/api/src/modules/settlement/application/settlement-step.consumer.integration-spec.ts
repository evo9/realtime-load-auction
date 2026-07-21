import { randomUUID } from 'node:crypto';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import {
  RabbitMQContainer,
  StartedRabbitMQContainer,
} from '@testcontainers/rabbitmq';
import * as amqp from 'amqp-connection-manager';
import { DataSource } from 'typeorm';
import { Redis } from 'ioredis';
import { Publisher } from '@src/platform/messaging/publisher';
import { NullDedupPort } from '@src/platform/messaging/dedup.port';
import { MessagingConfig } from '@src/platform/messaging/messaging.config.token';
import { UnitOfWork } from '@src/platform/persistence/unit-of-work';
import { TransactionContext } from '@src/platform/persistence/transaction-context';
import { OutboxEntity } from '@src/platform/outbox/outbox.entity';
import { OutboxService } from '@src/platform/outbox/outbox.service';
import { LockService } from '@src/platform/redis/lock.service';
import { PubSub } from '@src/platform/redis/pub-sub';
import { RedisKeys } from '@src/platform/redis/redis-keys';
import { LotEntity } from '@src/modules/auction/infrastructure/lot.entity';
import { LotRepository } from '@src/modules/auction/infrastructure/lot.repository';
import { BidEntity } from '@src/modules/bidding/infrastructure/bid.entity';
import { BidRepository } from '@src/modules/bidding/infrastructure/bid.repository';
import { NotificationEntity } from '@src/modules/notification/infrastructure/notification.entity';
import { NotificationLogRepository } from '@src/modules/notification/infrastructure/notification-log.repository';
import { SagaInstanceEntity } from '@src/modules/settlement/infrastructure/saga-instance.entity';
import { SagaRepository } from '@src/modules/settlement/infrastructure/saga.repository';
import { FundReservationEntity } from '@src/modules/settlement/infrastructure/fund-reservation.entity';
import { ReservationRepository } from '@src/modules/settlement/infrastructure/reservation.repository';
import { ReservationService } from '@src/modules/settlement/infrastructure/reservation.service';
import { InvoiceEntity } from '@src/modules/settlement/infrastructure/invoice.entity';
import {
  CreateInvoiceInput,
  InvoiceRepository,
} from '@src/modules/settlement/infrastructure/invoice.repository';
import { InvoiceService } from '@src/modules/settlement/infrastructure/invoice.service';
import { SettlementNotifier } from '@src/modules/settlement/infrastructure/settlement-notifier';
import { StepCommandPublisher } from '@src/modules/settlement/infrastructure/step-command.publisher';
import { SettlementStepConsumer } from '@src/modules/settlement/application/settlement-step.consumer';
import { SagaStatus, SagaStep } from '@src/modules/settlement/domain/saga';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs: number,
  intervalMs = 50,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return;
    await sleep(intervalMs);
  }
  throw new Error('timed out waiting for condition');
}

const fastConfig: MessagingConfig = {
  prefetch: 10,
  retryLimit: 2,
  retryBaseTtlMs: 100,
  retryMultiplier: 1,
  retryMaxTtlMs: 500,
};

// Fault injection for the compensation scenario: real InvoiceService with a
// switch that makes create() fail deterministically, so the invoice step's
// retries exhaust and the consumer drives the saga into compensation.
class ToggleableInvoiceService extends InvoiceService {
  shouldFail = false;

  create(tx: TransactionContext, input: CreateInvoiceInput): Promise<void> {
    if (this.shouldFail) {
      return Promise.reject(new Error('injected invoice failure'));
    }
    return super.create(tx, input);
  }
}

function makeLotRow(overrides: Partial<LotEntity> = {}): Partial<LotEntity> {
  return {
    id: randomUUID(),
    shipperId: randomUUID(),
    origin: 'Chicago, IL',
    destination: 'Dallas, TX',
    equipmentType: 'van',
    weightKg: 12000,
    pickupFrom: new Date(Date.now() + 3_600_000),
    pickupTo: new Date(Date.now() + 7_200_000),
    reservePrice: 150000,
    targetPrice: null,
    openAt: new Date(Date.now() - 3_600_000),
    closeAt: new Date(Date.now() - 60_000),
    antiSnipeWindowSec: 0,
    status: 'closing',
    winningBidId: null,
    winningAmount: null,
    ...overrides,
  };
}

function makeBidRow(overrides: Partial<BidEntity> = {}): Partial<BidEntity> {
  return {
    id: randomUUID(),
    lotId: randomUUID(),
    carrierId: randomUUID(),
    amount: 100000,
    idempotencyKey: randomUUID(),
    createdAt: new Date(),
    ...overrides,
  };
}

describe('SettlementStepConsumer (integration)', () => {
  let pg: StartedPostgreSqlContainer;
  let rmq: StartedRabbitMQContainer;
  let redisContainer: StartedRedisContainer;
  let dataSource: DataSource;
  let redisClient: Redis;
  let connection: amqp.AmqpConnectionManager;
  let publisher: Publisher;
  let uow: UnitOfWork;
  let lots: LotRepository;
  let bids: BidRepository;
  let sagas: SagaRepository;
  let reservationRepo: ReservationRepository;
  let invoiceRepo: InvoiceRepository;
  let invoices: ToggleableInvoiceService;
  let stepPublisher: StepCommandPublisher;
  let lock: LockService;
  let pubSub: PubSub;
  let consumer: SettlementStepConsumer;

  beforeAll(async () => {
    [pg, rmq, redisContainer] = await Promise.all([
      new PostgreSqlContainer('postgres:16-alpine').start(),
      new RabbitMQContainer('rabbitmq:3.13-management-alpine').start(),
      new RedisContainer('redis:7-alpine').start(),
    ]);

    dataSource = new DataSource({
      type: 'postgres',
      host: pg.getHost(),
      port: pg.getMappedPort(5432),
      username: pg.getUsername(),
      password: pg.getPassword(),
      database: pg.getDatabase(),
      entities: [
        LotEntity,
        BidEntity,
        SagaInstanceEntity,
        FundReservationEntity,
        InvoiceEntity,
        NotificationEntity,
        OutboxEntity,
      ],
      synchronize: true,
    });
    await dataSource.initialize();

    redisClient = new Redis({
      host: redisContainer.getHost(),
      port: redisContainer.getMappedPort(6379),
    });

    connection = amqp.connect([rmq.getAmqpUrl()]);
    await connection.connect();
    publisher = new Publisher(connection);

    uow = new UnitOfWork(dataSource, new OutboxService());
    lots = new LotRepository(dataSource);
    bids = new BidRepository(dataSource);
    sagas = new SagaRepository(dataSource);
    reservationRepo = new ReservationRepository(dataSource);
    invoiceRepo = new InvoiceRepository(dataSource);
    invoices = new ToggleableInvoiceService(invoiceRepo);
    stepPublisher = new StepCommandPublisher(publisher);
    lock = new LockService(redisClient);

    const reservations = new ReservationService(reservationRepo);
    const notificationLog = new NotificationLogRepository(dataSource);
    pubSub = new PubSub(redisClient);
    const notifier = new SettlementNotifier(notificationLog, pubSub);

    consumer = new SettlementStepConsumer(
      connection,
      publisher,
      fastConfig,
      new NullDedupPort(),
      uow,
      sagas,
      lots,
      bids,
      reservations,
      invoices,
      notifier,
      lock,
      stepPublisher,
    );
    await consumer.onModuleInit();
  }, 180_000);

  afterAll(async () => {
    await pubSub.onModuleDestroy();
    await redisClient.quit();
    await connection.close();
    await dataSource.destroy();
    await Promise.all([pg.stop(), rmq.stop(), redisContainer.stop()]);
  });

  async function seedLotAndBid(amount = 100000) {
    const lotRow = makeLotRow();
    await dataSource.getRepository(LotEntity).insert(lotRow);
    const bidRow = makeBidRow({ lotId: lotRow.id as string, amount });
    await dataSource.getRepository(BidEntity).insert(bidRow);
    return { lotRow, bidRow };
  }

  async function startSaga(lotId: string): Promise<string> {
    const saga = await uow.transaction((tx) =>
      sagas.create(tx, {
        lotId,
        payload: { closeAt: new Date().toISOString(), lockToken: randomUUID() },
      }),
    );
    await stepPublisher.publishStep({
      sagaId: saga.id,
      lotId,
      step: SagaStep.Lock,
      direction: 'forward',
    });
    return saga.id;
  }

  it('settles a lot with one bid: winner recorded, funds reserved, invoice issued, both parties notified', async () => {
    const { lotRow, bidRow } = await seedLotAndBid(120000);
    const sagaId = await startSaga(lotRow.id as string);

    await waitFor(async () => {
      const saga = await sagas.findById(sagaId);
      return saga?.status === SagaStatus.Completed;
    }, 15_000);

    const lot = await lots.findById(lotRow.id as string);
    expect(lot?.status).toBe('settled');
    expect(lot?.winningBidId).toBe(bidRow.id);
    expect(lot?.winningAmount).toBe(120000);

    const reservation = await reservationRepo.findByLotId(lotRow.id as string);
    expect(reservation?.status).toBe('reserved');
    expect(reservation?.amount).toBe(120000);

    const invoice = await invoiceRepo.findByLotId(lotRow.id as string);
    expect(invoice?.status).toBe('issued');
    expect(invoice?.carrierId).toBe(bidRow.carrierId);
    expect(invoice?.amount).toBe(120000);

    const notifications = await dataSource
      .getRepository(NotificationEntity)
      .findBy({ lotId: lotRow.id as string });
    const types = notifications.map((n) => n.type).sort();
    expect(types).toEqual(['lot_settled', 'lot_won']);
    const won = notifications.find((n) => n.type === 'lot_won');
    expect(won?.recipientId).toBe(bidRow.carrierId);
    const settled = notifications.find((n) => n.type === 'lot_settled');
    expect(settled?.recipientId).toBe(lotRow.shipperId);

    const outboxRows = await dataSource
      .getRepository(OutboxEntity)
      .findBy({ routingKey: 'settlement.completed' });
    const ourRow = outboxRows.find(
      (r) => (r.payload as { lotId: string }).lotId === lotRow.id,
    );
    expect(ourRow).toBeDefined();

    await expect(
      redisClient.get(RedisKeys.lotLock(lotRow.id as string)),
    ).resolves.toBeNull();
  }, 30_000);

  it('cancels a lot with no bids without reserving funds or issuing an invoice', async () => {
    const lotRow = makeLotRow();
    await dataSource.getRepository(LotEntity).insert(lotRow);
    const sagaId = await startSaga(lotRow.id as string);

    await waitFor(async () => {
      const saga = await sagas.findById(sagaId);
      return saga?.status === SagaStatus.Failed;
    }, 15_000);

    const lot = await lots.findById(lotRow.id as string);
    expect(lot?.status).toBe('cancelled');

    await expect(
      reservationRepo.findByLotId(lotRow.id as string),
    ).resolves.toBeNull();
    await expect(
      invoiceRepo.findByLotId(lotRow.id as string),
    ).resolves.toBeNull();

    const saga = await sagas.findById(sagaId);
    expect(saga?.payload.failureReason).toBe('no_valid_bids');

    const outboxRows = await dataSource
      .getRepository(OutboxEntity)
      .findBy({ routingKey: 'settlement.failed' });
    const ourRow = outboxRows.find(
      (r) => (r.payload as { lotId: string }).lotId === lotRow.id,
    );
    expect((ourRow?.payload as { reason: string }).reason).toBe(
      'no_valid_bids',
    );

    await expect(
      redisClient.get(RedisKeys.lotLock(lotRow.id as string)),
    ).resolves.toBeNull();
  }, 30_000);

  it('compensates in reverse order when the invoice step keeps failing', async () => {
    invoices.shouldFail = true;
    try {
      const { lotRow } = await seedLotAndBid(90000);
      const sagaId = await startSaga(lotRow.id as string);

      await waitFor(async () => {
        const saga = await sagas.findById(sagaId);
        return saga?.status === SagaStatus.Failed;
      }, 20_000);

      const lot = await lots.findById(lotRow.id as string);
      expect(lot?.status).toBe('cancelled');

      const reservation = await reservationRepo.findByLotId(
        lotRow.id as string,
      );
      expect(reservation?.status).toBe('released');

      const invoiceRows = await dataSource
        .getRepository(InvoiceEntity)
        .findBy({ lotId: lotRow.id as string });
      expect(invoiceRows).toHaveLength(0);

      const saga = await sagas.findById(sagaId);
      expect(saga?.payload.failureReason).toBe('step_failed:invoice');

      const outboxRows = await dataSource
        .getRepository(OutboxEntity)
        .findBy({ routingKey: 'settlement.failed' });
      const ourRow = outboxRows.find(
        (r) => (r.payload as { lotId: string }).lotId === lotRow.id,
      );
      expect((ourRow?.payload as { reason: string }).reason).toBe(
        'step_failed:invoice',
      );

      await expect(
        redisClient.get(RedisKeys.lotLock(lotRow.id as string)),
      ).resolves.toBeNull();
    } finally {
      invoices.shouldFail = false;
    }
  }, 30_000);

  it('settles a lot exactly once even if a settle kick is redelivered after completion', async () => {
    const { lotRow } = await seedLotAndBid(75000);
    const sagaId = await startSaga(lotRow.id as string);

    await waitFor(async () => {
      const saga = await sagas.findById(sagaId);
      return saga?.status === SagaStatus.Completed;
    }, 15_000);

    const settledLot = await lots.findById(lotRow.id as string);
    expect(settledLot?.status).toBe('settled');

    await stepPublisher.publishStep({
      sagaId,
      lotId: lotRow.id as string,
      step: SagaStep.Settle,
      direction: 'forward',
    });
    await sleep(1_500);

    const outboxRows = await dataSource
      .getRepository(OutboxEntity)
      .findBy({ routingKey: 'settlement.completed' });
    const ourRows = outboxRows.filter(
      (r) => (r.payload as { lotId: string }).lotId === lotRow.id,
    );
    expect(ourRows).toHaveLength(1);

    const lotAfter = await lots.findById(lotRow.id as string);
    expect(lotAfter?.status).toBe('settled');
    expect(lotAfter?.winningAmount).toBe(75000);
  }, 30_000);
});
