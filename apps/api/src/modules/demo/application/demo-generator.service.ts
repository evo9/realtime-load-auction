import { randomUUID } from 'node:crypto';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { AppConfigService } from '@src/config/app-config.service';
import { CreateLotHandler } from '@src/modules/auction/application/create-lot.handler';
import { PlaceBidHandler } from '@src/modules/bidding/application/place-bid.handler';
import { ListingLotEntity } from '@src/modules/listing/infrastructure/listing-lot.entity';
import { ListingLotRepository } from '@src/modules/listing/infrastructure/listing-lot.repository';
import { UserRepository } from '@src/modules/identity/infrastructure/user.repository';
import { buildSyntheticLotCommand } from '@src/modules/demo/domain/synthetic-lot';
import { nextBidAmount } from '@src/modules/demo/domain/bot-bid';

@Injectable()
export class DemoGeneratorService implements OnModuleInit {
  private readonly logger = new Logger(DemoGeneratorService.name);
  private shipperIds: string[] = [];
  private carrierIds: string[] = [];
  private actorsResolved = false;
  private creatingLots = false;
  private placingBids = false;

  constructor(
    private readonly config: AppConfigService,
    private readonly scheduler: SchedulerRegistry,
    private readonly createLot: CreateLotHandler,
    private readonly placeBid: PlaceBidHandler,
    private readonly listingLots: ListingLotRepository,
    private readonly users: UserRepository,
  ) {}

  onModuleInit(): void {
    if (!this.config.demo.enabled) return;

    this.scheduler.addInterval(
      'demo:create-lots',
      setInterval(
        () => void this.tickCreateLots(),
        this.config.demo.lotIntervalMs,
      ),
    );
    this.scheduler.addInterval(
      'demo:place-bids',
      setInterval(
        () => void this.tickPlaceBids(),
        this.config.demo.bidIntervalMs,
      ),
    );

    this.logger.log(
      `demo generator enabled (lots every ${this.config.demo.lotIntervalMs}ms, bids every ${this.config.demo.bidIntervalMs}ms)`,
    );
  }

  private async ensureActors(): Promise<void> {
    if (this.actorsResolved) return;
    const [shippers, carriers] = await Promise.all([
      this.users.findByRole('shipper'),
      this.users.findByRole('carrier'),
    ]);
    this.shipperIds = shippers.map((user) => user.id);
    this.carrierIds = carriers.map((user) => user.id);
    this.actorsResolved = true;
    if (this.shipperIds.length === 0 || this.carrierIds.length === 0) {
      this.logger.warn(
        'no shipper/carrier accounts found to act as demo bots — idling',
      );
    }
  }

  private pickRandom<T>(pool: T[]): T {
    return pool[Math.floor(Math.random() * pool.length)];
  }

  private async tickCreateLots(): Promise<void> {
    if (this.creatingLots) return;
    this.creatingLots = true;
    try {
      await this.ensureActors();
      if (this.shipperIds.length === 0) return;

      const open = await this.listingLots.list({
        status: 'open',
        limit: this.config.demo.maxOpenLots,
      });
      if (open.length >= this.config.demo.maxOpenLots) return;

      await this.createLot.execute(
        buildSyntheticLotCommand({
          shipperId: this.pickRandom(this.shipperIds),
          now: Date.now(),
          durationMs: this.config.demo.lotDurationMs,
          antiSnipeWindowSec: this.config.demo.antiSnipeWindowSec,
        }),
      );
    } catch (err) {
      this.logger.error(
        `demo lot creation tick failed: ${(err as Error).message}`,
      );
    } finally {
      this.creatingLots = false;
    }
  }

  private async tickPlaceBids(): Promise<void> {
    if (this.placingBids) return;
    this.placingBids = true;
    try {
      await this.ensureActors();
      if (this.carrierIds.length === 0) return;

      const open = await this.listingLots.list({ status: 'open', limit: 50 });
      for (const lot of open) {
        await this.maybeBid(lot);
      }
    } catch (err) {
      this.logger.error(`demo bid tick failed: ${(err as Error).message}`);
    } finally {
      this.placingBids = false;
    }
  }

  private async maybeBid(lot: ListingLotEntity): Promise<void> {
    const inAntiSnipe =
      lot.closeAt.getTime() - Date.now() <=
      this.config.demo.antiSnipeWindowSec * 1000;
    const probability = inAntiSnipe
      ? this.config.demo.burstProbability
      : this.config.demo.bidProbability;
    if (Math.random() >= probability) return;

    const amount = nextBidAmount({
      currentBest: lot.currentBest,
      reservePrice: lot.reservePrice,
      targetPrice: lot.targetPrice,
    });
    if (amount === null) return;

    const outcome = await this.placeBid.execute({
      lotId: lot.id,
      carrierId: this.pickRandom(this.carrierIds),
      amount,
      idempotencyKey: randomUUID(),
    });
    if (outcome.status !== 'accepted') {
      this.logger.debug(
        `demo bid on ${lot.id} not accepted: ${outcome.status}`,
      );
    }
  }
}
