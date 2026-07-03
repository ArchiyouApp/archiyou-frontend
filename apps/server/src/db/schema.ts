/**
 * db/schema.ts — a single table that IS the core `ScriptData` model.
 *
 * One row per saved script version (Script.id), grouped into files by fileId
 * (Script.fileId) and owned by `author` (the user's handle). Columns mirror
 * ScriptData one-to-one; the complex fields (tags/params/presets/published) are
 * JSON. `published` null = the version is not published. `shared` is the one
 * addition beyond ScriptData — an indexed flag for cheap "shared scripts"
 * queries. There is no users table: auth is a single .env test user (see
 * config.ts), so `author` fully identifies ownership.
 */

import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

/**
 * Accounts. Kept minimal — the script model stays in the single script_versions
 * table below. `username` is the lowercase handle used as a script `author`, so
 * ownership on scripts joins to it. The .env test user is seeded into this table
 * on boot (see UserService.seedTestUser).
 */
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),               // uuid
  username: text('username').notNull(),      // author handle (lowercase, unique)
  email: text('email').notNull(),            // unique
  passwordHash: text('password_hash').notNull(),
  name: text('name'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch() * 1000)`),
}, (t) => ({
  usernameUnique: uniqueIndex('users_username_unique').on(t.username),
  emailUnique: uniqueIndex('users_email_unique').on(t.email),
}));

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;

export const scriptVersions = sqliteTable('script_versions', {
  // ── ScriptData fields ──
  id: text('id').primaryKey(),                 // Script.id (version id)
  fileId: text('file_id').notNull(),           // Script.fileId (groups versions)
  author: text('author'),                      // owner handle (lowercase)
  name: text('name'),
  description: text('description'),
  details: text('details'),
  tags: text('tags', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
  code: text('code').notNull(),
  params: text('params', { mode: 'json' }).$type<Record<string, unknown>>(),
  presets: text('presets', { mode: 'json' }).$type<Record<string, unknown>>(),
  // JSON blob; null ⇒ this version is not published.
  published: text('published', { mode: 'json' }).$type<Record<string, unknown> | null>(),
  created: integer('created', { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch() * 1000)`),
  updated: integer('updated', { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch() * 1000)`),

  // ── Addition beyond ScriptData ──
  shared: integer('shared', { mode: 'boolean' }).notNull().default(false),
}, (t) => ({
  byFile: index('sv_by_file').on(t.fileId),
  byAuthor: index('sv_by_author').on(t.author, t.updated),
  byShared: index('sv_by_shared').on(t.shared),
}));

export type ScriptVersionRow = typeof scriptVersions.$inferSelect;
export type NewScriptVersionRow = typeof scriptVersions.$inferInsert;
