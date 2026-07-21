import { RoutingKeys } from '@src/platform/messaging/messaging.constants';
import type { RmqMessage } from '@src/platform/messaging/base.consumer';
import type {
  BidPlacedPayload,
  LotClosedPayload,
  LotOpenedPayload,
} from '@src/modules/listing/domain/listing-lot';
import type { RecordNotificationInput } from '@src/modules/notification/infrastructure/notification-log.repository';
import { NotificationConsumer } from './notification.consumer';

function makeMsg<T>(
  routingKey: string,
  payload: T,
  messageId = 'msg-1',
): RmqMessage<T> {
  return {
    messageId,
    routingKey,
    payload,
    headers: {},
    attempt: 0,
    raw: {} as never,
  };
}

describe('NotificationConsumer', () => {
  let pubSub: { publish: jest.Mock };
  let log: { record: jest.Mock<Promise<void>, [RecordNotificationInput]> };
  let lots: { findById: jest.Mock };
  let bids: { findPreviousBest: jest.Mock };
  let consumer: NotificationConsumer;

  beforeEach(() => {
    pubSub = { publish: jest.fn(() => Promise.resolve(1)) };
    log = { record: jest.fn(() => Promise.resolve()) };
    lots = { findById: jest.fn() };
    bids = { findPreviousBest: jest.fn() };

    consumer = new NotificationConsumer(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      pubSub as never,
      log as never,
      lots as never,
      bids as never,
    );
  });

  function process<T>(msg: RmqMessage<T>): Promise<void> {
    return (
      consumer as unknown as { process(msg: RmqMessage<T>): Promise<void> }
    ).process(msg);
  }

  it('lot.opened delivers exactly one notification to the shipper', async () => {
    const payload: LotOpenedPayload = {
      lotId: 'lot-1',
      shipperId: 'shipper-1',
      origin: 'Chicago, IL',
      destination: 'Dallas, TX',
      equipmentType: 'van',
      weightKg: 12000,
      reservePrice: 150000,
      targetPrice: null,
      openAt: new Date().toISOString(),
      closeAt: new Date().toISOString(),
    };

    await process(makeMsg(RoutingKeys.lotOpened, payload));

    expect(log.record).toHaveBeenCalledTimes(1);
    expect(pubSub.publish).toHaveBeenCalledTimes(1);
    expect(log.record.mock.calls[0][0]).toMatchObject({
      recipientId: 'shipper-1',
      type: 'lot_opened',
      lotId: 'lot-1',
    });
  });

  it('bid.placed with a different previous leader delivers new_bid to the shipper and outbid to the previous leader', async () => {
    const payload: BidPlacedPayload = {
      lotId: 'lot-1',
      bidId: 'bid-2',
      carrierId: 'carrier-b',
      amount: 90000,
      createdAt: new Date().toISOString(),
    };
    lots.findById.mockResolvedValue({ id: 'lot-1', shipperId: 'shipper-1' });
    bids.findPreviousBest.mockResolvedValue({
      amount: 100000,
      carrierId: 'carrier-a',
      bidId: 'bid-1',
    });

    await process(makeMsg(RoutingKeys.bidPlaced, payload));

    expect(log.record).toHaveBeenCalledTimes(2);
    expect(pubSub.publish).toHaveBeenCalledTimes(2);
    expect(log.record.mock.calls[0][0]).toMatchObject({
      recipientId: 'shipper-1',
      type: 'new_bid',
      lotId: 'lot-1',
    });
    expect(log.record.mock.calls[1][0]).toMatchObject({
      recipientId: 'carrier-a',
      type: 'outbid',
      lotId: 'lot-1',
    });
  });

  it('bid.placed with no previous bid only delivers new_bid', async () => {
    const payload: BidPlacedPayload = {
      lotId: 'lot-1',
      bidId: 'bid-1',
      carrierId: 'carrier-a',
      amount: 100000,
      createdAt: new Date().toISOString(),
    };
    lots.findById.mockResolvedValue({ id: 'lot-1', shipperId: 'shipper-1' });
    bids.findPreviousBest.mockResolvedValue(null);

    await process(makeMsg(RoutingKeys.bidPlaced, payload));

    expect(log.record).toHaveBeenCalledTimes(1);
    expect(pubSub.publish).toHaveBeenCalledTimes(1);
    expect(log.record.mock.calls[0][0]).toMatchObject({ type: 'new_bid' });
  });

  it('bid.placed where the previous leader is the same carrier (self-outbid) only delivers new_bid', async () => {
    const payload: BidPlacedPayload = {
      lotId: 'lot-1',
      bidId: 'bid-2',
      carrierId: 'carrier-a',
      amount: 90000,
      createdAt: new Date().toISOString(),
    };
    lots.findById.mockResolvedValue({ id: 'lot-1', shipperId: 'shipper-1' });
    bids.findPreviousBest.mockResolvedValue({
      amount: 100000,
      carrierId: 'carrier-a',
      bidId: 'bid-1',
    });

    await process(makeMsg(RoutingKeys.bidPlaced, payload));

    expect(log.record).toHaveBeenCalledTimes(1);
    expect(pubSub.publish).toHaveBeenCalledTimes(1);
    expect(log.record.mock.calls[0][0]).toMatchObject({ type: 'new_bid' });
  });

  it('bid.placed for an unknown lot delivers nothing and does not throw', async () => {
    const payload: BidPlacedPayload = {
      lotId: 'lot-missing',
      bidId: 'bid-1',
      carrierId: 'carrier-a',
      amount: 100000,
      createdAt: new Date().toISOString(),
    };
    lots.findById.mockResolvedValue(null);

    await expect(
      process(makeMsg(RoutingKeys.bidPlaced, payload)),
    ).resolves.toBeUndefined();

    expect(log.record).not.toHaveBeenCalled();
    expect(pubSub.publish).not.toHaveBeenCalled();
    expect(bids.findPreviousBest).not.toHaveBeenCalled();
  });

  it('lot.closed for an unknown lot delivers nothing and does not throw', async () => {
    const payload: LotClosedPayload = {
      lotId: 'lot-missing',
      closeAt: new Date().toISOString(),
    };
    lots.findById.mockResolvedValue(null);

    await expect(
      process(makeMsg(RoutingKeys.lotClosed, payload)),
    ).resolves.toBeUndefined();

    expect(log.record).not.toHaveBeenCalled();
    expect(pubSub.publish).not.toHaveBeenCalled();
  });

  it('lot.closed delivers exactly one notification to the shipper', async () => {
    const payload: LotClosedPayload = {
      lotId: 'lot-1',
      closeAt: new Date().toISOString(),
    };
    lots.findById.mockResolvedValue({ id: 'lot-1', shipperId: 'shipper-1' });

    await process(makeMsg(RoutingKeys.lotClosed, payload));

    expect(log.record).toHaveBeenCalledTimes(1);
    expect(pubSub.publish).toHaveBeenCalledTimes(1);
    expect(log.record.mock.calls[0][0]).toMatchObject({
      recipientId: 'shipper-1',
      type: 'lot_closed',
      lotId: 'lot-1',
    });
  });
});
