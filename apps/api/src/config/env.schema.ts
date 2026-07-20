import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().default(3000),

  POSTGRES_HOST: z.string().min(1),
  POSTGRES_PORT: z.coerce.number(),
  POSTGRES_USER: z.string().min(1),
  POSTGRES_PASSWORD: z.string().min(1),
  POSTGRES_DB: z.string().min(1),

  RABBITMQ_HOST: z.string().min(1),
  RABBITMQ_PORT: z.coerce.number(),
  RABBITMQ_MANAGEMENT_PORT: z.coerce.number(),
  RABBITMQ_DEFAULT_USER: z.string().min(1),
  RABBITMQ_DEFAULT_PASS: z.string().min(1),
  RABBITMQ_PREFETCH: z.coerce.number().int().min(1).default(10),
  RABBITMQ_RETRY_LIMIT: z.coerce.number().default(3),
  RABBITMQ_RETRY_BASE_TTL_MS: z.coerce.number().default(5000),
  RABBITMQ_RETRY_MULTIPLIER: z.coerce.number().default(3),
  RABBITMQ_RETRY_MAX_TTL_MS: z.coerce.number().default(60000),

  REDIS_HOST: z.string().min(1),
  REDIS_PORT: z.coerce.number(),

  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('1h'),

  OUTBOX_POLL_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(50)
    .max(60_000)
    .default(500),
  OUTBOX_BATCH_SIZE: z.coerce.number().int().min(1).max(1000).default(100),

  SCHEDULER_TICK_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(50)
    .max(60_000)
    .default(500),
  SCHEDULER_BATCH_SIZE: z.coerce.number().int().min(1).max(1000).default(100),
  SCHEDULER_RETRY_DELAY_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(300_000)
    .default(5000),

  IDEMPOTENCY_INPROGRESS_TTL_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(300_000)
    .default(30000),
  IDEMPOTENCY_DONE_TTL_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(3_600_000)
    .default(600000),
  MSG_DEDUP_TTL_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(86_400_000)
    .default(900000),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(config);
  if (result.success) {
    return result.data;
  }

  const details = result.error.issues
    .map((issue) => {
      const name = issue.path.join('.');
      const reason =
        issue.code === 'invalid_type' && config[name] === undefined
          ? 'is missing'
          : issue.message;
      return `  - ${name}: ${reason}`;
    })
    .join('\n');

  throw new Error(`Invalid environment variables:\n${details}`);
}
