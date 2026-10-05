import { createHash, randomBytes } from 'node:crypto';
import { json } from '@sveltejs/kit';
import { and, count, desc, eq } from 'drizzle-orm';
import { db } from '$lib/db/index.js';
import { apiKeys } from '$lib/db/schema.js';

export const MAX_KEYS_PER_USER = 10;
export const MAX_NAME_LENGTH = 50;

// Writing last_used_at on every request would turn a chatty bot's reads into
// writes; once a minute is precise enough to answer "is this key still in use?".
const TOUCH_INTERVAL_MS = 60_000;

/** A validation failure whose message is safe to show the user. */
export class ApiKeyError extends Error {}

// Plain SHA-256 rather than bcrypt: a key is 256 random bits, not a guessable
// password, so a slow hash buys nothing and an equality lookup stays indexable.
const hashKey = (key) => createHash('sha256').update(key).digest('hex');

export async function createApiKey(userId, name) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed || trimmed.length > MAX_NAME_LENGTH) {
    throw new ApiKeyError(`Key name must be 1–${MAX_NAME_LENGTH} characters`);
  }

  const [{ n }] = await db.select({ n: count() }).from(apiKeys).where(eq(apiKeys.user_id, userId));
  if (n >= MAX_KEYS_PER_USER) {
    throw new ApiKeyError(`You can have at most ${MAX_KEYS_PER_USER} API keys`);
  }

  const key = 'sk_' + randomBytes(32).toString('base64url');
  const [row] = await db
    .insert(apiKeys)
    .values({ user_id: userId, name: trimmed, key_hash: hashKey(key), prefix: key.slice(0, 8) })
    .returning();

  return { key, id: row.id, name: row.name, prefix: row.prefix, created_at: row.created_at };
}

export async function listApiKeys(userId) {
  return db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      created_at: apiKeys.created_at,
      last_used_at: apiKeys.last_used_at
    })
    .from(apiKeys)
    .where(eq(apiKeys.user_id, userId))
    .orderBy(desc(apiKeys.created_at), desc(apiKeys.id));
}

export async function revokeApiKey(userId, id) {
  if (!Number.isInteger(id)) return false;
  const deleted = await db
    .delete(apiKeys)
    .where(and(eq(apiKeys.id, id), eq(apiKeys.user_id, userId)))
    .returning({ id: apiKeys.id });
  return deleted.length > 0;
}

/**
 * Resolves `Authorization: Bearer sk_…` to the key owner's user id, or null.
 *
 * Returns null rather than throwing SvelteKit's error(): that would answer with
 * `{ message }`, and every API route in this app answers with `{ error }`.
 */
export async function requireApiKey(request) {
  const header = (request.headers.get('authorization') ?? '').trim();
  const match = /^bearer\s+(sk_[A-Za-z0-9_-]+)$/i.exec(header);
  if (!match) return null;

  const row = await db.query.apiKeys.findFirst({
    where: eq(apiKeys.key_hash, hashKey(match[1]))
  });
  if (!row) return null;

  const now = Date.now();
  if (!row.last_used_at || now - Date.parse(row.last_used_at) >= TOUCH_INTERVAL_MS) {
    await db
      .update(apiKeys)
      .set({ last_used_at: new Date(now).toISOString() })
      .where(eq(apiKeys.id, row.id));
  }

  return row.user_id;
}

export function invalidApiKey() {
  return json({ error: 'Invalid or missing API key' }, { status: 401 });
}
