import { and, count, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { db } from '../db/client';
import { personalAccessTokens, users } from '../db/schema/index';
import { Errors } from '../errors/index';
import {
  AuthError,
  forgetPat,
  type VerifiedIdentity,
} from '../gateway/auth.js';
import {
  DUMMY_PASSWORD_HASH,
  PASSWORD_RULES,
  verifyPassword,
} from '../gateway/passwords.js';
import {
  issueAccessToken,
  issuePersonalAccessToken,
  tokenHint,
} from '../gateway/token';
import { ROLES, type Role } from '../policy/roles';

/**
 * Login and personal access tokens. HTTP-free: routes (Step 9) call this.
 * The users and tokens tables belong to this server, so it uses the database
 * directly rather than an adapter.
 */

export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  roles: Role[];
  tenantId: string;
}

export interface LoginResult {
  accessToken: string;
  expiresAt: Date;
  user: PublicUser;
}

export type PatStatus = 'active' | 'expired' | 'revoked';

export interface PatSummary {
  id: string;
  name: string;
  tokenHint: string;
  status: PatStatus;
  createdAt: Date;
  expiresAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}

export interface CreatedPat extends PatSummary {
  /** The full token. Returned exactly once, at creation, and never stored. */
  token: string;
}

/** Most active tokens one user may hold. */
export const MAX_ACTIVE_PATS = 10;

const toKnownRoles = (roles: string[]): Role[] =>
  roles.filter((r): r is Role => (ROLES as readonly string[]).includes(r));

function patStatus(row: {
  revokedAt: Date | null;
  expiresAt: Date;
}): PatStatus {
  if (row.revokedAt) return 'revoked';
  if (row.expiresAt.getTime() <= Date.now()) return 'expired';
  return 'active';
}

const patColumns = {
  id: personalAccessTokens.id,
  name: personalAccessTokens.name,
  tokenHint: personalAccessTokens.tokenHint,
  createdAt: personalAccessTokens.createdAt,
  expiresAt: personalAccessTokens.expiresAt,
  lastUsedAt: personalAccessTokens.lastUsedAt,
  revokedAt: personalAccessTokens.revokedAt,
};

export class AuthService {
  private readonly log = logger.child({ component: 'auth' });

  /**
   * Email + password → access token.
   * Wrong email, wrong password and disabled account all fail the same way and
   * take the same time, so the response never reveals which emails exist.
   */
  async login(input: {
    email: string;
    password: string;
  }): Promise<LoginResult> {
    const email = input.email.trim().toLowerCase();
    const password = input.password;

    const [user] =
      email.length > 0 && email.length <= 254
        ? await db
            .select()
            .from(users)
            .where(eq(sql`lower(${users.email})`, email))
        : [];

    // Always run one argon2 check, against the dummy hash when there is no user.
    const passwordOk =
      password.length > 0 && password.length <= PASSWORD_RULES.maxLength
        ? await verifyPassword(
            user?.passwordHash ?? (await DUMMY_PASSWORD_HASH),
            password,
          )
        : false;

    if (!user || !passwordOk || !user.isActive) {
      const reason = !user
        ? 'unknown_email'
        : !passwordOk
          ? 'wrong_password'
          : 'user_inactive';
      this.log.warn(
        { reason, emailDomain: email.split('@')[1] ?? null },
        'Login failed',
      );
      throw new AuthError('invalid_credentials');
    }

    await db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, user.id));

    const publicUser: PublicUser = {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      roles: toKnownRoles(user.roles),
      tenantId: user.tenantId,
    };
    const issued = await issueAccessToken(publicUser);
    this.log.info(
      { userId: user.id, roles: publicUser.roles },
      'Login succeeded',
    );

    return {
      accessToken: issued.token,
      expiresAt: issued.expiresAt,
      user: publicUser,
    };
  }

  /** The current user, read fresh from the database (current roles, still active). */
  async me(identity: VerifiedIdentity): Promise<
    PublicUser & {
      tokenType: VerifiedIdentity['tokenType'];
      tokenName: string | null;
    }
  > {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, identity.userId));
    if (!user || !user.isActive) throw new AuthError('user_inactive');
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      roles: toKnownRoles(user.roles),
      tenantId: user.tenantId,
      tokenType: identity.tokenType,
      tokenName: identity.tokenName,
    };
  }

  /**
   * Creates a personal access token for MCP clients. Requires a login token:
   * a PAT cannot mint more PATs, so a leaked PAT can't be used to create
   * fresh long-lived credentials.
   */
  async createPat(
    identity: VerifiedIdentity,
    input: { name: string; expiresInDays?: number },
  ): Promise<CreatedPat> {
    if (identity.tokenType !== 'access') {
      throw Errors.permissionDenied(
        'Personal access tokens can only be created after logging in, not with another token.',
      );
    }
    const name = input.name.trim();
    if (name.length < 1 || name.length > 100) {
      throw Errors.validation('name must be 1 to 100 characters', {
        field: 'name',
      });
    }
    const days = input.expiresInDays ?? env.PAT_DEFAULT_DAYS;
    if (!Number.isInteger(days) || days < 1 || days > env.PAT_MAX_DAYS) {
      throw Errors.validation(
        `expires_in_days must be a whole number from 1 to ${env.PAT_MAX_DAYS}`,
        { field: 'expires_in_days' },
      );
    }

    const created = await db.transaction(async (tx) => {
      const [user] = await tx
        .select()
        .from(users)
        .where(eq(users.id, identity.userId))
        .for('update');
      if (!user || !user.isActive) throw new AuthError('user_inactive');

      const [{ active } = { active: 0 }] = await tx
        .select({ active: count() })
        .from(personalAccessTokens)
        .where(
          and(
            eq(personalAccessTokens.userId, identity.userId),
            isNull(personalAccessTokens.revokedAt),
            gt(personalAccessTokens.expiresAt, new Date()),
          ),
        );
      if (active >= MAX_ACTIVE_PATS) {
        throw Errors.conflict(
          `You already have ${MAX_ACTIVE_PATS} active tokens. Revoke one before creating another.`,
        );
      }

      // Row first: its id becomes the token's "jti", which is how revocation works.
      const [row] = await tx
        .insert(personalAccessTokens)
        .values({
          userId: identity.userId,
          name,
          tokenHint: 'pending',
          expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
        })
        .returning();
      const issued = await issuePersonalAccessToken({
        userId: identity.userId,
        tokenId: row!.id,
        expiresAt: row!.expiresAt,
      });
      const [final] = await tx
        .update(personalAccessTokens)
        .set({ tokenHint: tokenHint(issued.token) })
        .where(eq(personalAccessTokens.id, row!.id))
        .returning(patColumns);
      return { ...final!, token: issued.token };
    });

    this.log.info(
      { userId: identity.userId, patId: created.id, days },
      'PAT created',
    );
    return { ...created, status: patStatus(created) };
  }

  /** The caller's tokens, newest first. Never includes the token values. */
  async listPats(identity: VerifiedIdentity): Promise<PatSummary[]> {
    const rows = await db
      .select(patColumns)
      .from(personalAccessTokens)
      .where(eq(personalAccessTokens.userId, identity.userId))
      .orderBy(desc(personalAccessTokens.createdAt));
    return rows.map((r) => ({ ...r, status: patStatus(r) }));
  }

  /** Revokes one of the caller's own tokens. Safe to repeat. Takes effect immediately. */
  async revokePat(
    identity: VerifiedIdentity,
    patId: string,
  ): Promise<PatSummary> {
    const isUuid = /^[0-9a-f-]{36}$/i.test(patId);
    const [row] = isUuid
      ? await db
          .select(patColumns)
          .from(personalAccessTokens)
          .where(
            and(
              eq(personalAccessTokens.id, patId),
              eq(personalAccessTokens.userId, identity.userId),
            ),
          )
      : [];
    // Someone else's token looks exactly like a missing one.
    if (!row) throw Errors.notFound('Token', patId);

    if (row.revokedAt) return { ...row, status: 'revoked' };

    const [updated] = await db
      .update(personalAccessTokens)
      .set({ revokedAt: new Date() })
      .where(eq(personalAccessTokens.id, patId))
      .returning(patColumns);
    forgetPat(patId);
    this.log.info({ userId: identity.userId, patId }, 'PAT revoked');
    return { ...updated!, status: 'revoked' };
  }
}
