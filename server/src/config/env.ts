import { config } from 'dotenv';
import { z } from 'zod';

config({ quiet: true });

/**
 * Single source of truth for configuration.
 * The process fails fast at startup if anything required is missing or malformed.
 */
const booleanFromString = z
  .enum(['true', 'false'])
  .default('true')
  .transform((value) => value === 'true');

const EnvSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),

  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required')
    .refine(
      (v) => v.startsWith('postgres://') || v.startsWith('postgresql://'),
      {
        message: 'DATABASE_URL must start with postgres:// or postgresql://',
      },
    ),
  DATABASE_PREPARE: booleanFromString,

  REDIS_URL: z
    .string()
    .min(1, 'REDIS_URL is required')
    .refine((v) => v.startsWith('redis://') || v.startsWith('rediss://'), {
      message: 'REDIS_URL must start with redis:// or rediss://',
    }),

  JWT_ISSUER: z.string().optional(),
  JWT_AUDIENCE: z.string().default('switchboard-mcp'),
  JWKS_URL: z.string().optional(),

  MOCK_SYSTEMS_PORT: z.coerce.number().int().positive().default(4100),
  MOCK_SYSTEMS_API_KEY: z
    .string()
    .min(8, 'MOCK_SYSTEMS_API_KEY must be at least 8 characters'),
});

export type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    console.error(`Invalid environment configuration:\n${problems}`);
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();
