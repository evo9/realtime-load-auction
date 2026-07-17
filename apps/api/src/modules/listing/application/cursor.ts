import { BadRequestException } from '@nestjs/common';

export interface ListLotsCursor {
  closeAt: Date;
  id: string;
}

export function encodeCursor(closeAt: Date, id: string): string {
  return Buffer.from(
    JSON.stringify({ c: closeAt.toISOString(), i: id }),
  ).toString('base64url');
}

export function decodeCursor(raw: string): ListLotsCursor {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(raw, 'base64url').toString('utf8'),
    );
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as { c?: unknown }).c !== 'string' ||
      typeof (parsed as { i?: unknown }).i !== 'string'
    ) {
      throw new Error('malformed cursor shape');
    }
    const { c, i } = parsed as { c: string; i: string };
    const closeAt = new Date(c);
    if (Number.isNaN(closeAt.getTime())) {
      throw new Error('malformed cursor date');
    }
    return { closeAt, id: i };
  } catch {
    throw new BadRequestException('Invalid cursor');
  }
}
