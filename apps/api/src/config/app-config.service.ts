import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvConfig } from './env.schema';

@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  get nodeEnv(): EnvConfig['NODE_ENV'] {
    return this.config.get('NODE_ENV', { infer: true });
  }

  get port(): number {
    return this.config.get('PORT', { infer: true });
  }

  get postgres() {
    return {
      host: this.config.get('POSTGRES_HOST', { infer: true }),
      port: this.config.get('POSTGRES_PORT', { infer: true }),
      user: this.config.get('POSTGRES_USER', { infer: true }),
      password: this.config.get('POSTGRES_PASSWORD', { infer: true }),
      database: this.config.get('POSTGRES_DB', { infer: true }),
    };
  }

  get rabbitmq() {
    return {
      host: this.config.get('RABBITMQ_HOST', { infer: true }),
      port: this.config.get('RABBITMQ_PORT', { infer: true }),
      managementPort: this.config.get('RABBITMQ_MANAGEMENT_PORT', {
        infer: true,
      }),
      user: this.config.get('RABBITMQ_DEFAULT_USER', { infer: true }),
      password: this.config.get('RABBITMQ_DEFAULT_PASS', { infer: true }),
    };
  }

  get messaging() {
    return {
      prefetch: this.config.get('RABBITMQ_PREFETCH', { infer: true }),
      retryLimit: this.config.get('RABBITMQ_RETRY_LIMIT', { infer: true }),
      retryBaseTtlMs: this.config.get('RABBITMQ_RETRY_BASE_TTL_MS', {
        infer: true,
      }),
      retryMultiplier: this.config.get('RABBITMQ_RETRY_MULTIPLIER', {
        infer: true,
      }),
      retryMaxTtlMs: this.config.get('RABBITMQ_RETRY_MAX_TTL_MS', {
        infer: true,
      }),
    };
  }

  get redis() {
    return {
      host: this.config.get('REDIS_HOST', { infer: true }),
      port: this.config.get('REDIS_PORT', { infer: true }),
    };
  }

  get jwt() {
    return {
      secret: this.config.get('JWT_SECRET', { infer: true }),
      expiresIn: this.config.get('JWT_EXPIRES_IN', { infer: true }),
    };
  }
}
