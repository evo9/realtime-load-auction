import { BadRequestException } from '@nestjs/common';
import {
  decodeCursor,
  encodeCursor,
} from '@src/modules/listing/application/cursor';
import { ListLotsHandler } from '@src/modules/listing/application/list-lots.handler';
import type { ListingLotEntity } from '@src/modules/listing/infrastructure/listing-lot.entity';

function makeRow(overrides: Partial<ListingLotEntity> = {}): ListingLotEntity {
  return {
    id: 'lot-1',
    shipperId: 'shipper-1',
    origin: 'Chicago, IL',
    destination: 'Dallas, TX',
    equipmentType: 'van',
    weightKg: 12000,
    reservePrice: 150000,
    targetPrice: null,
    status: 'open',
    openAt: new Date('2026-07-17T00:00:00Z'),
    closeAt: new Date('2026-07-17T01:00:00Z'),
    currentBest: null,
    updatedAt: new Date('2026-07-17T00:00:00Z'),
    ...overrides,
  };
}

describe('ListLotsHandler', () => {
  let repository: { list: jest.Mock };
  let handler: ListLotsHandler;

  beforeEach(() => {
    repository = { list: jest.fn() };
    handler = new ListLotsHandler(repository as never);
  });

  it('passes filters through to repository.list as-is', async () => {
    repository.list.mockResolvedValue([]);

    await handler.execute({
      status: 'open',
      equipmentType: 'reefer',
      origin: 'Chicago, IL',
      destination: 'Dallas, TX',
      limit: 5,
    });

    expect(repository.list).toHaveBeenCalledWith({
      status: 'open',
      equipmentType: 'reefer',
      origin: 'Chicago, IL',
      destination: 'Dallas, TX',
      cursor: undefined,
      limit: 5,
    });
  });

  it('applies the default limit of 20 when none is given', async () => {
    repository.list.mockResolvedValue([]);

    await handler.execute({});

    expect(repository.list).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 20 }),
    );
  });

  it('sets nextCursor and drops the extra row when repository returns limit+1 rows', async () => {
    const rows = [
      makeRow({ id: 'lot-1', closeAt: new Date('2026-07-17T01:00:00Z') }),
      makeRow({ id: 'lot-2', closeAt: new Date('2026-07-17T02:00:00Z') }),
      makeRow({ id: 'lot-3', closeAt: new Date('2026-07-17T03:00:00Z') }),
    ];
    repository.list.mockResolvedValue(rows);

    const result = await handler.execute({ limit: 2 });

    expect(result.items).toHaveLength(2);
    expect(result.items.map((i) => i.id)).toEqual(['lot-1', 'lot-2']);
    expect(result.nextCursor).toBeDefined();
    expect(decodeCursor(result.nextCursor as string)).toEqual({
      closeAt: rows[1].closeAt,
      id: rows[1].id,
    });
  });

  it('leaves nextCursor unset when repository returns exactly limit rows', async () => {
    const rows = [makeRow({ id: 'lot-1' }), makeRow({ id: 'lot-2' })];
    repository.list.mockResolvedValue(rows);

    const result = await handler.execute({ limit: 2 });

    expect(result.items).toHaveLength(2);
    expect(result.nextCursor).toBeUndefined();
  });

  it('throws BadRequestException when decodeCursor receives an invalid string', () => {
    expect(() => decodeCursor('not-a-valid-cursor!!!')).toThrow(
      BadRequestException,
    );
  });

  it('throws BadRequestException when decodeCursor receives well-formed JSON of the wrong shape', () => {
    const wrongShape = Buffer.from(JSON.stringify({})).toString('base64url');
    expect(() => decodeCursor(wrongShape)).toThrow(BadRequestException);

    const nonStringId = Buffer.from(
      JSON.stringify({ c: '2026-08-01T12:34:56.000Z', i: 42 }),
    ).toString('base64url');
    expect(() => decodeCursor(nonStringId)).toThrow(BadRequestException);
  });

  it('throws BadRequestException when decodeCursor receives an unparsable date', () => {
    const badDate = Buffer.from(
      JSON.stringify({ c: 'not-a-date', i: 'lot-42' }),
    ).toString('base64url');
    expect(() => decodeCursor(badDate)).toThrow(BadRequestException);
  });

  it('round-trips encodeCursor/decodeCursor', () => {
    const closeAt = new Date('2026-08-01T12:34:56.000Z');
    const encoded = encodeCursor(closeAt, 'lot-42');

    expect(decodeCursor(encoded)).toEqual({ closeAt, id: 'lot-42' });
  });
});
