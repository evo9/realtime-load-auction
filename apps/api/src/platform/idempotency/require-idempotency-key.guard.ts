import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class RequireIdempotencyKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers['idempotency-key'];
    const value = Array.isArray(header) ? header[0] : header;

    if (!value || value.trim().length === 0) {
      throw new BadRequestException('Missing Idempotency-Key header');
    }

    return true;
  }
}
