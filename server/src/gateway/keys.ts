import { readFileSync } from 'node:fs';
import {
  createLocalJWKSet,
  createRemoteJWKSet,
  importJWK,
  type JSONWebKeySet,
  type JWK,
  type JWTVerifyGetKey,
} from 'jose';
import { env } from '../config/env';

/**
 * Loads the JWT keys once at startup.
 * - Signing key (private): signs login tokens and PATs. Only this server has it.
 * - Verification keys (public JWKS): check every incoming token.
 * Sources: files locally, env vars on a VPS (raw JSON or base64), or a remote
 * JWKS URL if an external identity provider is ever used.
 *
 * Every mistake that would make auth silently wrong fails startup instead.
 */

const ALLOWED_ALGS = ['RS256', 'ES256'] as const;
type Alg = (typeof ALLOWED_ALGS)[number];

export interface SigningKey {
  key: CryptoKey | Uint8Array;
  kid: string;
  alg: Alg;
}

export interface JwtKeys {
  /** Null only when an external IdP issues tokens (JWKS_URL without a private key). */
  signing: SigningKey | null;
  /** Resolves the right public key for a token by its "kid" header. */
  verify: JWTVerifyGetKey;
  algorithms: Alg[];
  /** For startup logs: where the keys came from and which key IDs are trusted. */
  info: {
    publicSource: string;
    privateSource: string | null;
    trustedKids: string[];
  };
}

class KeyConfigError extends Error {
  constructor(message: string) {
    super(`JWT key configuration: ${message}`);
    this.name = 'KeyConfigError';
  }
}

/** Accepts raw JSON or base64-encoded JSON, from a file or an env var. */
function parseJson(raw: string, source: string): unknown {
  const text = raw.trim();
  const json = text.startsWith('{')
    ? text
    : Buffer.from(text, 'base64').toString('utf8');
  try {
    return JSON.parse(json);
  } catch {
    throw new KeyConfigError(`${source} is not valid JSON (raw or base64)`);
  }
}

function readSource(
  file: string | undefined,
  inline: string | undefined,
  label: string,
) {
  if (file) {
    try {
      return {
        value: parseJson(readFileSync(file, 'utf8'), file),
        source: `file ${file}`,
      };
    } catch (error) {
      if (error instanceof KeyConfigError) throw error;
      throw new KeyConfigError(
        `cannot read ${file}. Run "pnpm dev-token --rotate" to create keys.`,
      );
    }
  }
  if (inline)
    return { value: parseJson(inline, label), source: `env ${label}` };
  return null;
}

function assertAlg(alg: unknown, where: string): Alg {
  if (!ALLOWED_ALGS.includes(alg as Alg)) {
    throw new KeyConfigError(
      `${where} must use one of ${ALLOWED_ALGS.join(', ')} (got ${String(alg)})`,
    );
  }
  return alg as Alg;
}

async function load(): Promise<JwtKeys> {
  // ─── Public keys ───
  let verify: JWTVerifyGetKey;
  let publicSource: string;
  let trustedKids: string[] = [];
  let algorithms: Alg[] = [...ALLOWED_ALGS];

  if (env.JWKS_URL) {
    verify = createRemoteJWKSet(new URL(env.JWKS_URL), {
      cacheMaxAge: 10 * 60 * 1000, // re-fetch keys at most every 10 minutes
      cooldownDuration: 30 * 1000, // but allow a refresh 30s after an unknown kid (rotation)
    });
    publicSource = `url ${env.JWKS_URL}`;
  } else {
    const loaded = readSource(env.JWT_JWKS_FILE, env.JWT_JWKS, 'JWT_JWKS');
    if (!loaded) throw new KeyConfigError('no public keys configured');
    const jwks = loaded.value as JSONWebKeySet;
    if (!Array.isArray(jwks?.keys) || jwks.keys.length === 0) {
      throw new KeyConfigError(
        `${loaded.source} must contain {"keys": [...]} with at least one key`,
      );
    }
    for (const key of jwks.keys) {
      if (!key.kid)
        throw new KeyConfigError(
          `every public key needs a "kid" (${loaded.source})`,
        );
      assertAlg(key.alg, `public key ${key.kid}`);
      // A private key published as "public" would let anyone forge tokens.
      if ('d' in key) {
        throw new KeyConfigError(
          `${loaded.source} contains PRIVATE key material (kid ${key.kid})`,
        );
      }
    }
    verify = createLocalJWKSet(jwks);
    publicSource = loaded.source;
    trustedKids = jwks.keys.map((k) => k.kid!);
    algorithms = [...new Set(jwks.keys.map((k) => k.alg as Alg))];
  }

  // ─── Private signing key ───
  let signing: SigningKey | null = null;
  let privateSource: string | null = null;
  const loadedPrivate = readSource(
    env.JWT_PRIVATE_KEY_FILE,
    env.JWT_PRIVATE_KEY,
    'JWT_PRIVATE_KEY',
  );
  if (loadedPrivate) {
    const jwk = loadedPrivate.value as JWK;
    if (!jwk?.d)
      throw new KeyConfigError(
        `${loadedPrivate.source} is not a private key (no "d")`,
      );
    if (!jwk.kid)
      throw new KeyConfigError(`${loadedPrivate.source} needs a "kid"`);
    const alg = assertAlg(jwk.alg, 'private key');
    // Tokens we sign must be verifiable by our own public keys.
    if (trustedKids.length > 0 && !trustedKids.includes(jwk.kid)) {
      throw new KeyConfigError(
        `private key kid ${jwk.kid} is not in the public keys (${trustedKids.join(', ')}). ` +
          'The key files are from different key pairs.',
      );
    }
    signing = { key: await importJWK(jwk, alg), kid: jwk.kid, alg };
    privateSource = loadedPrivate.source;
  }

  return {
    signing,
    verify,
    algorithms,
    info: { publicSource, privateSource, trustedKids },
  };
}

let cached: Promise<JwtKeys> | undefined;

/** Loads keys on first call, then returns the same result. Throws on bad configuration. */
export function getJwtKeys(): Promise<JwtKeys> {
  cached ??= load();
  return cached;
}
