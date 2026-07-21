import { BadRequestException } from '@nestjs/common';

export interface BidCursor {
  value: string;
  id: string;
}

export function encodeCursor(value: string, id: string): string {
  return Buffer.from(JSON.stringify({ v: value, i: id })).toString('base64url');
}

export function decodeCursor(raw: string): BidCursor {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(raw, 'base64url').toString('utf8'),
    );
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as { v?: unknown }).v !== 'string' ||
      typeof (parsed as { i?: unknown }).i !== 'string'
    ) {
      throw new Error('malformed cursor shape');
    }
    const { v, i } = parsed as { v: string; i: string };
    return { value: v, id: i };
  } catch {
    throw new BadRequestException('Invalid cursor');
  }
}
