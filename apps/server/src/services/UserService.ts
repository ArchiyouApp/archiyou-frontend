/**
 * UserService — account registration/login over the `users` table.
 *
 * `username` is the lowercase handle used as a script `author` (and as the JWT
 * `sub`), so scripts scope by it. The .env test user is seeded on boot.
 */

import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';

import { uuid4 } from '@archiyou/core/src/utils';
import type { PublicUser } from '@archiyou/types';

import { db } from '../db/client';
import { users, type UserRow } from '../db/schema';
import { config } from '../config';

const BCRYPT_ROUNDS = 10;

export class UserError extends Error {
  constructor(public readonly code: 'email_taken' | 'invalid_credentials', message: string) {
    super(message);
  }
}

/** Client-safe view. `id` is the username handle (== JWT sub == script author). */
export function toPublicUser(u: UserRow): PublicUser {
  return { id: u.username, email: u.email, name: u.name, avatarUrl: null, emailVerified: true };
}

export class UserService {
  findByEmail(email: string): UserRow | undefined {
    return db.select().from(users).where(eq(users.email, email.trim().toLowerCase())).get();
  }

  findByUsername(username: string): UserRow | undefined {
    return db.select().from(users).where(eq(users.username, username.toLowerCase())).get();
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
