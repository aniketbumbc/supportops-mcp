import { hash, verify } from '@node-rs/argon2';

/**
 * Password hashing with argon2id (the default algorithm of @node-rs/argon2).
 * Settings follow the OWASP recommendation: 19 MiB memory, 2 passes, 1 thread.
 * Plain passwords are never stored or logged; only these hashes are.
 */
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export const PASSWORD_RULES = { minLength: 10, maxLength: 128 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

/** False for a wrong password or a malformed hash; never throws for bad input. */
export async function verifyPassword(
  passwordHash: string,
  password: string,
): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/**
 * A real hash of a random value. Login verifies against it when the email is
 * unknown, so "no such user" takes as long as "wrong password" and response
 * timing can't reveal which emails exist.
 */
export const DUMMY_PASSWORD_HASH = hashPassword(
  `dummy-${Math.random()}-${Date.now()}`,
);
