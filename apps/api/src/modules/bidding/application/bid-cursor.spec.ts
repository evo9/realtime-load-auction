import { BadRequestException } from '@nestjs/common';
import { decodeCursor, encodeCursor } from './bid-cursor';

describe('bid-cursor', () => {
  it('round-trips encodeCursor/decodeCursor', () => {
    const encoded = encodeCursor('90000', 'bid-42');

    expect(decodeCursor(encoded)).toEqual({ value: '90000', id: 'bid-42' });
  });

  it('throws BadRequestException for a non-base64url string', () => {
    expect(() => decodeCursor('not-a-valid-cursor!!!')).toThrow(
      BadRequestException,
    );
  });

  it('throws BadRequestException for base64url content that is not JSON', () => {
    const notJson = Buffer.from('plainly not json').toString('base64url');
    expect(() => decodeCursor(notJson)).toThrow(BadRequestException);
  });

  it('throws BadRequestException when the object is missing v/i', () => {
    const wrongShape = Buffer.from(JSON.stringify({})).toString('base64url');
    expect(() => decodeCursor(wrongShape)).toThrow(BadRequestException);
  });

  it('throws BadRequestException when v or i are not strings', () => {
    const nonStringId = Buffer.from(
      JSON.stringify({ v: '90000', i: 42 }),
    ).toString('base64url');
    expect(() => decodeCursor(nonStringId)).toThrow(BadRequestException);

    const nonStringValue = Buffer.from(
      JSON.stringify({ v: 90000, i: 'bid-42' }),
    ).toString('base64url');
    expect(() => decodeCursor(nonStringValue)).toThrow(BadRequestException);
  });
});
