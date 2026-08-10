/**
 * UserService — account registration/login over the `users` table.
 *
 * `username` is the lowercase handle used as a script `author` (and as the JWT
 * `sub`), so scripts scope by it. The .env test user is seeded on boot.
 */

import bcrypt from 'bcryptjs';
import { and, eq, like, ne, or, sql } from 'drizzle-orm';

import { uuid4 } from '@archiyou/core/src/utils';
import type { PublicUser } from '@archiyou/types';

import { db } from '../db/client';
import { users, type UserRow } from '../db/schema';
import { config } from '../config';

const BCRYPT_ROUNDS = 10;

export class UserError extends Error {
  constructor(
    public readonly code: 'email_taken' | 'invalid_credentials' | 'invalid_token',
    message: string,
  ) {
    super(message);
  }
}

/** Client-safe view. `id` is the username handle (== JWT sub == script author). */
export function toPublicUser(u: UserRow): PublicUser {
  return {
    id: u.username,
    email: u.email,
    name: u.name,
    avatarUrl: null,
    // Was hardcoded `true` before verification existed, so the client could never
    // tell. Now reflects the column, which the editor uses to show its banner.
    emailVerified: u.emailVerifiedAt !== null,
    // Which gated script modules this account may use. The editor needs it to
    // mark modules locked/unlocked; it is NOT the authority — every bundle fetch
    // and server-module call is re-checked against the database.
    modules: normalizeModuleIds(u.modules),
  };
}

/** Tolerate a legacy or hand-edited row: the column is JSON, so it can hold
 *  anything if someone writes it directly. Anything that is not a list of
 *  non-empty strings degrades to "no modules" rather than crashing a login. */
export function normalizeModuleIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((m): m is string => typeof m === 'string' && m.length > 0);
}

export class UserService {
  findByEmail(email: string): UserRow | undefined {
    return db.select().from(users).where(eq(users.email, email.trim().toLowerCase())).get();
  }

  findByUsername(username: string): UserRow | undefined {
    return db.select().from(users).where(eq(users.username, username.toLowerCase())).get();
  }

  findById(id: string): UserRow | undefined {
    return db.select().from(users).where(eq(users.id, id)).get();
  }

  /** Search accounts by handle / email / name (case-insensitive substring),
   *  excluding `excludeUsername` (the caller). Returns client-safe views. */
  search(query: string, excludeUsername: string, limit = 10): PublicUser[] {
    const q = `%${query.trim().toLowerCase()}%`;
    if (query.trim().length === 0) return [];
    const rows = db
      .select()
      .from(users)
      .where(
        and(
          ne(users.username, excludeUsername.toLowerCase()),
          or(
            like(users.username, q),
            like(sql`lower(${users.email})`, q),
            like(sql`lower(${users.name})`, q),
          ),
        ),
      )
      .limit(limit)
      .all();
    return rows.map(toPublicUser);
  }

  /** Turn an email/name into a unique lowercase handle. */
  private deriveUsername(email: string, name?: string): string {
    const base =
      (name || email.split('@')[0] || 'user')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '')
        .slice(0, 20) || 'user';
    if (!this.findByUsername(base)) return base;
    let i = 2;
    while (this.findByUsername(`${base}${i}`)) i++;
    return `${base}${i}`;
  }

  /** Register a new account. Throws UserError('email_taken') on conflict. */
  async register(email: string, password: string, name?: string): Promise<UserRow> {
    const normalized = email.trim().toLowerCase();
    if (this.findByEmail(normalized)) {
      throw new UserError('email_taken', 'An account with this email already exists');
    }
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const row: UserRow = {
      id: uuid4(),
      username: this.deriveUsername(normalized, name),
      email: normalized,
      passwordHash,
      name: name ?? null,
      createdAt: new Date(),
      // Unverified until the emailed link is followed. The account is usable
      // immediately — only publishing and sharing require verification.
      emailVerifiedAt: null,
      // New accounts have no gated modules; grants are made with `pnpm admin:modules`.
      modules: [],
    };
    db.insert(users).values(row).run();
    return row;
  }

  /** Verify credentials, resolving the identifier as an email OR a username
   *  handle (mirrors the legacy backend's email-or-username login). Throws
   *  UserError('invalid_credentials') on failure. */
  async login(identifier: string, password: string): Promise<UserRow> {
    const id = identifier.trim();
    const user = this.findByEmail(id) ?? this.findByUsername(id);
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UserError('invalid_credentials', 'Invalid email or password');
    }
    return user;
  }

  /** Set (overwrite) a user's password. Used by the password-reset flow. Changing
   *  the hash also invalidates any outstanding reset links (see routes/auth.ts). */
  async setPassword(userId: string, newPassword: string): Promise<void> {
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    db.update(users).set({ passwordHash }).where(eq(users.id, userId)).run();
  }

  /** Mark an address confirmed. Idempotent: following a verification link twice
   *  is harmless, and the first timestamp is kept. */
  markEmailVerified(userId: string): void {
    db.update(users)
      .set({ emailVerifiedAt: new Date() })
      .where(and(eq(users.id, userId), sql`${users.emailVerifiedAt} IS NULL`))
      .run();
  }

  /** Module ids this account may use. Returns [] for an unknown handle, so a
   *  stale token can never widen access. */
  getModules(username: string): string[] {
    const user = this.findByUsername(username);
    return user ? normalizeModuleIds(user.modules) : [];
  }

  /** Is this account entitled to one specific module? The single question every
   *  gated route asks. */
  hasModule(username: string | null | undefined, moduleId: string): boolean {
    if (!username) return false;
    return this.getModules(username).includes(moduleId);
  }

  /** Replace the entitlement list. Deduplicated and sorted so the stored value is
   *  stable and diffable. Returns the stored list, or null for an unknown handle. */
  setModules(username: string, moduleIds: string[]): string[] | null {
    const user = this.findByUsername(username);
    if (!user) return null;
    const next = [...new Set(normalizeModuleIds(moduleIds))].sort();
    db.update(users).set({ modules: next }).where(eq(users.id, user.id)).run();
    return next;
  }

  /** Grant modules, keeping existing ones. Returns the new list, or null for an
   *  unknown handle. */
  grantModules(username: string, moduleIds: string[]): string[] | null {
    const current = this.findByUsername(username);
    if (!current) return null;
    return this.setModules(username, [...normalizeModuleIds(current.modules), ...moduleIds]);
  }

  /** Revoke modules. Returns the new list, or null for an unknown handle. */
  revokeModules(username: string, moduleIds: string[]): string[] | null {
    const current = this.findByUsername(username);
    if (!current) return null;
    const drop = new Set(moduleIds);
    return this.setModules(username, normalizeModuleIds(current.modules).filter((m) => !drop.has(m)));
  }

  /** Ensure the .env test user exists (idempotent — runs on boot). */
  async seedTestUser(): Promise<void> {
    const t = config.testUser;
    if (this.findByEmail(t.email) || this.findByUsername(t.username)) return;
    const passwordHash = await bcrypt.hash(t.password, BCRYPT_ROUNDS);
    db.insert(users)
      .values({
        id: uuid4(),
        username: t.username,
        email: t.email.toLowerCase(),
        passwordHash,
        name: t.name,
        createdAt: new Date(),
      })
      .run();
    console.log(`👤 Seeded test user "${t.email}" (handle: ${t.username})`);
  }
}

export const userService = new UserService();
