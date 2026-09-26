/**
 * Dev token issuer: a tiny stand-in for Keycloak / Auth0 during development.
 *
 * First run creates an RS256 key pair:
 *   .keys/private.jwk.json  PRIVATE signing key (git-ignored, never share)
 *   .keys/jwks.json         PUBLIC keys, read by the MCP server (JWT_JWKS_FILE)
 * Then signs a JWT for any user and roles. The MCP server verifies these exactly
 * like tokens from a real identity provider, so no server code changes later.
 *
 * Usage:
 *   pnpm dev-token --user priya --roles support_agent
 *   pnpm dev-token --user amit --roles support_lead,finance --ttl 8h
 *   pnpm dev-token --user x --roles admin --expired        (for testing rejection)
 *   pnpm dev-token --rotate                                 (new key pair)
 *
 * The token is printed alone on stdout, so it can be captured:
 *   TOKEN=$(pnpm dev-token --user priya --roles support_agent)
 */
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { exportJWK, generateKeyPair, importJWK, SignJWT, type JWK } from 'jose';
import { env } from '../src/config/env.js';
import { ROLES, type Role } from '../src/policy/roles.js';

const ALG = 'RS256';

function fail(message: string): never {
  console.error(`dev-token: ${message}`);
  process.exit(1);
}

if (env.NODE_ENV === 'production') fail('refusing to run in production.');
if (!env.JWT_ISSUER) fail('set JWT_ISSUER in .env first.');
if (!env.JWT_JWKS_FILE)
  fail('set JWT_JWKS_FILE in .env first (e.g. .keys/jwks.json).');

const { values: args } = parseArgs({
  options: {
    user: { type: 'string', default: 'dev-user' },
    roles: { type: 'string', default: 'support_agent' },
    tenant: { type: 'string', default: 'default' },
    name: { type: 'string' },
    ttl: { type: 'string', default: '1h' },
    expired: { type: 'boolean', default: false },
    aud: { type: 'string' },
    iss: { type: 'string' },
    rotate: { type: 'boolean', default: false },
  },
});

const jwksPath = env.JWT_JWKS_FILE;
const privatePath =
  env.JWT_PRIVATE_KEY_FILE ?? join(dirname(jwksPath), 'private.jwk.json');

/** Creates the key pair on first use (or on --rotate). */
async function loadOrCreateKeys(): Promise<JWK> {
  if (!args.rotate && existsSync(privatePath) && existsSync(jwksPath)) {
    return JSON.parse(readFileSync(privatePath, 'utf8')) as JWK;
  }
  const { publicKey, privateKey } = await generateKeyPair(ALG, {
    extractable: true,
  });
  const kid = `dev-${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}`;
  const privateJwk = {
    ...(await exportJWK(privateKey)),
    kid,
    alg: ALG,
    use: 'sig',
  };
  const publicJwk = {
    ...(await exportJWK(publicKey)),
    kid,
    alg: ALG,
    use: 'sig',
  };

  mkdirSync(dirname(jwksPath), { recursive: true });
  writeFileSync(privatePath, JSON.stringify(privateJwk, null, 2), {
    mode: 0o600,
  });
  writeFileSync(jwksPath, JSON.stringify({ keys: [publicJwk] }, null, 2));
  console.error(`dev-token: created key pair ${kid} in ${dirname(jwksPath)}/`);
  return privateJwk;
}

function parseRoles(input: string): Role[] {
  const roles = input
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);
  const unknown = roles.filter(
    (r) => !(ROLES as readonly string[]).includes(r),
  );
  if (roles.length === 0) fail('--roles needs at least one role.');
  if (unknown.length > 0)
    fail(`unknown role(s): ${unknown.join(', ')}. Known: ${ROLES.join(', ')}`);
  return roles as Role[];
}

async function main() {
  const privateJwk = await loadOrCreateKeys();
  if (args.rotate && process.argv.length === 3) {
    console.error(
      'dev-token: keys rotated. Restart the MCP server if it cached the old keys.',
    );
    return;
  }

  const roles = parseRoles(args.roles);
  const key = await importJWK(privateJwk, ALG);
  const now = Math.floor(Date.now() / 1000);

  const jwt = new SignJWT({
    [env.JWT_ROLES_CLAIM]: roles,
    [env.JWT_TENANT_CLAIM]: args.tenant,
    ...(args.name && { name: args.name }),
  })
    .setProtectedHeader({ alg: ALG, kid: privateJwk.kid, typ: 'JWT' })
    .setSubject(args.user)
    .setIssuer(args.iss ?? env.JWT_ISSUER!)
    .setAudience(args.aud ?? env.JWT_AUDIENCE)
    .setJti(randomUUID());

  if (args.expired) {
    // Issued 2 hours ago, expired 1 hour ago: well past the clock tolerance.
    jwt.setIssuedAt(now - 7200).setExpirationTime(now - 3600);
  } else {
    jwt.setIssuedAt(now).setExpirationTime(args.ttl);
  }

  const token = await jwt.sign(key);

  console.error(
    `dev-token: sub=${args.user} roles=${roles.join(',')} tenant=${args.tenant} ` +
      `${args.expired ? 'EXPIRED' : `ttl=${args.ttl}`}` +
      `${args.aud ? ` aud=${args.aud}` : ''}${args.iss ? ` iss=${args.iss}` : ''}`,
  );
  console.log(token);
}

main().catch((error) => fail((error as Error).message));
