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

  REDIS_HOST: z.string().min(1),
  REDIS_PORT: z.coerce.number(),

  JWT_SECRET: z.string().min(1),
  JWT_EXPIRES_IN: z.string().default('1h'),
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
