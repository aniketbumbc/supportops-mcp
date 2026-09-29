import 'server-only';
import { z } from 'zod';
import { apiFetch } from './http';

/** Roles the server knows. Anything else is ignored. */
export const ROLES = [
  'support_agent',
  'support_lead',
  'finance',
  'admin',
] as const;
export type Role = (typeof ROLES)[number];

const RoleList = z
  .array(z.string())
  .transform((r) =>
    r.filter((x): x is Role => (ROLES as readonly string[]).includes(x)),
  );

// ─── Login / me ──────────────────────────────────────────

const LoginResponse = z
  .object({
    access_token: z.string(),
    expires_at: z.string(),
    user: z.object({
      id: z.string(),
      email: z.string(),
      display_name: z.string(),
      roles: RoleList,
      tenant_id: z.string(),
    }),
  })
  .transform((r) => ({
    accessToken: r.access_token,
    expiresAt: new Date(r.expires_at),
    user: {
      id: r.user.id,
      email: r.user.email,
      displayName: r.user.display_name,
      roles: r.user.roles,
      tenantId: r.user.tenant_id,
    },
  }));
export type LoginResult = z.infer<typeof LoginResponse>;

const MeResponse = z
  .object({
    id: z.string(),
    email: z.string(),
    display_name: z.string(),
    roles: RoleList,
    tenant_id: z.string(),
    token_type: z.enum(['access', 'pat']),
    token_name: z.string().nullable(),
  })
  .transform((m) => ({
    id: m.id,
    email: m.email,
    displayName: m.display_name,
    roles: m.roles,
    tenantId: m.tenant_id,
  }));
export type CurrentUser = z.infer<typeof MeResponse>;

export const login = (email: string, password: string) =>
  apiFetch('/auth/login', {
    method: 'POST',
    body: { email, password },
    schema: LoginResponse,
  });

export const getMe = (token: string) =>
  apiFetch('/auth/me', { token, schema: MeResponse });

// ─── Personal access tokens ──────────────────────────────

const PatJson = z
  .object({
    id: z.string(),
    name: z.string(),
    token_hint: z.string(),
    status: z.enum(['active', 'expired', 'revoked']),
    created_at: z.string(),
    expires_at: z.string(),
    last_used_at: z.string().nullable(),
    revoked_at: z.string().nullable(),
  })
  .transform((p) => ({
    id: p.id,
    name: p.name,
    tokenHint: p.token_hint,
    status: p.status,
    createdAt: p.created_at,
    expiresAt: p.expires_at,
    lastUsedAt: p.last_used_at,
    revokedAt: p.revoked_at,
  }));
export type PersonalAccessToken = z.infer<typeof PatJson>;

const CreatedPatJson = z
  .object({ token: z.string() })
  .passthrough()
  .transform((raw) => ({ token: raw.token, pat: PatJson.parse(raw) }));

export const listTokens = (token: string) =>
  apiFetch('/auth/tokens', {
    token,
    schema: z.object({ tokens: z.array(PatJson) }).transform((r) => r.tokens),
  });

/** Returns the full token exactly once; it is never retrievable again. */
export const createToken = (
  token: string,
  input: { name: string; expiresInDays?: number },
) =>
  apiFetch('/auth/tokens', {
    method: 'POST',
    token,
    body: { name: input.name, expires_in_days: input.expiresInDays },
    schema: CreatedPatJson,
  });

export const revokeToken = (token: string, id: string) =>
  apiFetch(`/auth/tokens/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    token,
    schema: PatJson,
  });
