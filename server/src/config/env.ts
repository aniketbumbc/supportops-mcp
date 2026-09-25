import { config } from 'dotenv';
import { z } from 'zod';
import { ROLES } from '../policy/roles';

config({ quiet: true });

/**
 * Single source of truth for configuration.
 * The process fails fast at startup if anything required is missing or malformed.
 */
const booleanFromString = z
  .enum(['true', 'false'])
  .default('true')
  .transform((value) => value === 'true');

const EnvSchema = z
  .object({
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
    // ─── Adapters: how the MCP server reaches the systems of record ───
    MOCK_SYSTEMS_BASE_URL: z.url().default('http://localhost:4100'),
    UPSTREAM_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(500)
      .max(30_000)
      .default(5000),

    // ─── Temporary identity until JWT auth (Phase 4) ───
    AUTH_MODE: z.enum(['dev', 'jwt']).default('dev'),
    DEV_USER_ID: z.string().min(1).default('dev-user'),
    DEV_TENANT_ID: z.string().min(1).default('default'),
    DEV_ROLES: z
      .string()
      .default('support_lead')
      .transform((v) =>
        v
          .split(',')
          .map((r) => r.trim())
          .filter(Boolean),
      )
      .pipe(z.array(z.enum(ROLES)).min(1, 'DEV_ROLES needs at least one role')),
  })
  .refine((e) => !(e.NODE_ENV === 'production' && e.AUTH_MODE === 'dev'), {
    message: 'AUTH_MODE=dev is not allowed in production',
    path: ['AUTH_MODE'],
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
