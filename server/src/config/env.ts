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

/** Treats `KEY=` (empty) in .env the same as not setting KEY at all. */
const emptyAsUndefined = (value: unknown) => (value === '' ? undefined : value);

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

    // ─── JWT auth (AUTH_MODE=jwt) ───
    /** Must match the token's "iss" claim exactly. */
    JWT_ISSUER: z.preprocess(emptyAsUndefined, z.string().min(1).optional()),
    /** Must appear in the token's "aud" claim: tokens minted for other apps are rejected. */
    JWT_AUDIENCE: z.string().min(1).default('enterprise-crm-mcp'),
    /** Public keys from a real identity provider (Keycloak, Auth0, Okta...). */
    JWKS_URL: z.preprocess(emptyAsUndefined, z.url().optional()),
    /** Public keys (JWKS JSON) from a local file. */
    JWT_JWKS_FILE: z.preprocess(emptyAsUndefined, z.string().min(1).optional()),
    /** Public keys (JWKS JSON, raw or base64) inline, handy for Docker / VPS env vars. */
    JWT_JWKS: z.preprocess(emptyAsUndefined, z.string().min(1).optional()),
    /** Private signing key (JWK JSON) from a local file. Used for login tokens and PATs. */
    JWT_PRIVATE_KEY_FILE: z.preprocess(
      emptyAsUndefined,
      z.string().min(1).optional(),
    ),
    /** Private signing key (JWK JSON, raw or base64) inline. Keep it secret. */
    JWT_PRIVATE_KEY: z.preprocess(
      emptyAsUndefined,
      z.string().min(1).optional(),
    ),
    /** Claim names differ between providers, so they are configurable. */
    JWT_ROLES_CLAIM: z.string().min(1).default('roles'),
    JWT_TENANT_CLAIM: z.string().min(1).default('tenant_id'),
    JWT_PRIVATE_KEY_FILE: z.preprocess(
      emptyAsUndefined,
      z.string().min(1).optional(),
    ),
    /** How long a login (access) token lives. Users log in again after this. */
    JWT_ACCESS_TTL_MINUTES: z.coerce
      .number()
      .int()
      .min(5)
      .max(24 * 60)
      .default(8 * 60),
    /** Personal access tokens: default and maximum lifetime in days. */
    PAT_DEFAULT_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    PAT_MAX_DAYS: z.coerce.number().int().min(1).max(365).default(90),

    /** Allowed clock difference between servers when checking exp / nbf. */
    JWT_CLOCK_TOLERANCE_SEC: z.coerce
      .number()
      .int()
      .min(0)
      .max(300)
      .default(30),
    /** Public URL of this MCP endpoint, published in OAuth discovery metadata. */
    MCP_RESOURCE_URL: z.url().default('http://localhost:4000/mcp'),

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
  .superRefine((e, issue) => {
    if (e.NODE_ENV === 'production' && e.AUTH_MODE === 'dev') {
      issue.addIssue({
        code: 'custom',
        message: 'AUTH_MODE=dev is not allowed in production',
        path: ['AUTH_MODE'],
      });
    }
    if (e.AUTH_MODE === 'jwt') {
      if (!e.JWT_ISSUER) {
        issue.addIssue({
          code: 'custom',
          message: 'JWT_ISSUER is required when AUTH_MODE=jwt',
          path: ['JWT_ISSUER'],
        });
      }
      const publicSources = [e.JWKS_URL, e.JWT_JWKS_FILE, e.JWT_JWKS].filter(
        Boolean,
      ).length;
      if (publicSources !== 1) {
        issue.addIssue({
          code: 'custom',
          message:
            'Set exactly one of JWKS_URL, JWT_JWKS_FILE or JWT_JWKS when AUTH_MODE=jwt',
          path: ['JWT_JWKS_FILE'],
        });
      }
      const privateSources = [e.JWT_PRIVATE_KEY_FILE, e.JWT_PRIVATE_KEY].filter(
        Boolean,
      ).length;
      if (privateSources > 1) {
        issue.addIssue({
          code: 'custom',
          message: 'Set only one of JWT_PRIVATE_KEY_FILE or JWT_PRIVATE_KEY',
          path: ['JWT_PRIVATE_KEY_FILE'],
        });
      }
      // This server issues its own tokens (login, PATs) unless an external IdP does it.
      if (privateSources === 0 && !e.JWKS_URL) {
        issue.addIssue({
          code: 'custom',
          message:
            'Set JWT_PRIVATE_KEY_FILE or JWT_PRIVATE_KEY so the server can sign tokens',
          path: ['JWT_PRIVATE_KEY_FILE'],
        });
      }
    }
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
