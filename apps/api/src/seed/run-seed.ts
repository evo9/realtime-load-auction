import { randomUUID } from 'node:crypto';
import { DataSource, In } from 'typeorm';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '@src/app.module';
import { UnitOfWork } from '@src/platform/persistence/unit-of-work';
import { UserRepository } from '@src/modules/identity/infrastructure/user.repository';
import { PasswordHasher } from '@src/modules/identity/infrastructure/password-hasher';
import { User } from '@src/modules/identity/domain/user';
import { LotEntity } from '@src/modules/auction/infrastructure/lot.entity';
import { CreateLotHandler } from '@src/modules/auction/application/create-lot.handler';
import { OpenLotHandler } from '@src/modules/auction/application/open-lot.handler';
import { ListingLotEntity } from '@src/modules/listing/infrastructure/listing-lot.entity';
import { SEED_PASSWORD, SEED_USERS, SEED_LOTS } from '@src/seed/seed-data';

async function seedUsers(
  uow: UnitOfWork,
  userRepo: UserRepository,
  hasher: PasswordHasher,
): Promise<{ ids: Map<string, string>; created: number; skipped: number }> {
  const ids = new Map<string, string>();
  let created = 0;
  let skipped = 0;

  for (const spec of SEED_USERS) {
    const existing = await userRepo.findByEmail(spec.email);
    if (existing) {
      ids.set(spec.email, existing.id);
      skipped += 1;
      continue;
    }
    const user: User = {
      id: randomUUID(),
      email: spec.email,
      passwordHash: await hasher.hash(SEED_PASSWORD),
      role: spec.role,
      createdAt: new Date(),
    };
    await uow.transaction((tx) => userRepo.insert(tx, user));
    ids.set(spec.email, user.id);
    created += 1;
  }

  return { ids, created, skipped };
}

async function seedLots(
  dataSource: DataSource,
  createLot: CreateLotHandler,
  openLot: OpenLotHandler,
  userIds: Map<string, string>,
): Promise<{ openedLotIds: string[]; created: number; skipped: number }> {
  const openedLotIds: string[] = [];
  let created = 0;
  let skipped = 0;
  const lotRepo = dataSource.getRepository(LotEntity);

  for (const spec of SEED_LOTS) {
    const shipperId = userIds.get(spec.shipperEmail);
    if (!shipperId) {
      throw new Error(
        `Seed lot references unknown shipper email: ${spec.shipperEmail}`,
      );
    }

    const existing = await lotRepo.findOne({
      where: {
        shipperId,
        origin: spec.origin,
        destination: spec.destination,
        equipmentType: spec.equipmentType,
        status: In(['scheduled', 'open', 'closing']),
      },
    });

    if (existing) {
      if (spec.openImmediately) openedLotIds.push(existing.id);
      skipped += 1;
      continue;
    }

    const now = Date.now();
    const openAt = new Date(now + spec.openOffsetMs);
    const closeAt = new Date(openAt.getTime() + spec.durationMs);

    const lot = await createLot.execute({
      shipperId,
      origin: spec.origin,
      destination: spec.destination,
      equipmentType: spec.equipmentType,
      weightKg: spec.weightKg,
      pickupWindow: {
        from: new Date(now + spec.pickupFromOffsetMs),
        to: new Date(now + spec.pickupToOffsetMs),
      },
      reservePrice: spec.reservePrice,
      targetPrice: spec.targetPrice,
      openAt,
      closeAt,
      antiSnipeWindowSec: spec.antiSnipeWindowSec,
    });

    if (spec.openImmediately) {
      await openLot.execute(lot.id);
      openedLotIds.push(lot.id);
    }

    created += 1;
  }

  return { openedLotIds, created, skipped };
}

async function waitForProjection(
  dataSource: DataSource,
  lotIds: string[],
  timeoutMs: number,
  intervalMs: number,
): Promise<void> {
  if (lotIds.length === 0) return;
  const listingRepo = dataSource.getRepository(ListingLotEntity);
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const rows = await listingRepo.findBy({ id: In(lotIds) });
    if (rows.length === lotIds.length) return;
    if (Date.now() > deadline) {
      const missing = lotIds.filter((id) => !rows.some((r) => r.id === id));
      throw new Error(
        `Timed out waiting for listing projection of lots: ${missing.join(', ')}. ` +
          'Check that OutboxRelay and ListingProjectionConsumer are running.',
      );
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    bufferLogs: false,
  });

  try {
    const dataSource = app.get(DataSource);
    const uow = app.get(UnitOfWork);
    const userRepo = app.get(UserRepository);
    const hasher = app.get(PasswordHasher);
    const createLot = app.get(CreateLotHandler);
    const openLot = app.get(OpenLotHandler);

    const users = await seedUsers(uow, userRepo, hasher);
    console.log(`Users: ${users.created} created, ${users.skipped} skipped`);

    const lots = await seedLots(dataSource, createLot, openLot, users.ids);
    console.log(`Lots: ${lots.created} created, ${lots.skipped} skipped`);

    console.log('Waiting for outbox -> listing projection...');
    await waitForProjection(dataSource, lots.openedLotIds, 30_000, 250);
    console.log('Seed complete.');
  } finally {
    await app.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error('Seed failed:', err);
    console.error('Is `make up` running (Postgres/Redis/RabbitMQ)?');
    process.exit(1);
  });
