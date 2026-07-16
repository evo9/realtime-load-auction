import { envSchema } from './env.schema';

const validEnv = {
  POSTGRES_HOST: 'localhost',
  POSTGRES_PORT: '5432',
  POSTGRES_USER: 'auction',
  POSTGRES_PASSWORD: 'auction',
  POSTGRES_DB: 'auction',
  RABBITMQ_HOST: 'localhost',
  RABBITMQ_PORT: '5672',
  RABBITMQ_MANAGEMENT_PORT: '15672',
  RABBITMQ_DEFAULT_USER: 'auction',
  RABBITMQ_DEFAULT_PASS: 'auction',
  REDIS_HOST: 'localhost',
  REDIS_PORT: '6379',
};

describe('envSchema', () => {
  it('parses a complete valid env and coerces ports to numbers', () => {
    const parsed = envSchema.parse(validEnv);

    expect(parsed.POSTGRES_PORT).toBe(5432);
    expect(parsed.RABBITMQ_MANAGEMENT_PORT).toBe(15672);
    expect(parsed.REDIS_PORT).toBe(6379);
  });

  it('defaults NODE_ENV to development and PORT to 3000', () => {
    const parsed = envSchema.parse(validEnv);

    expect(parsed.NODE_ENV).toBe('development');
    expect(parsed.PORT).toBe(3000);
  });

  it('throws with a readable message when a required variable is missing', () => {
    const incomplete: Record<string, string> = { ...validEnv };
    delete incomplete.POSTGRES_HOST;

    expect(() => envSchema.parse(incomplete)).toThrow(/POSTGRES_HOST/);
  });

  it('rejects an unknown NODE_ENV value', () => {
    expect(() =>
      envSchema.parse({ ...validEnv, NODE_ENV: 'staging' }),
    ).toThrow();
  });
});
