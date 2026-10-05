import { json } from '@sveltejs/kit';

/**
 * Shared helpers for the read-only /api/v1 routes. Every route there is GET-only,
 * authenticated by requireApiKey(), and scoped to the key owner's own rows.
 */

/** A route `[id]` as an integer, or null when it isn't one (answered with a 404). */
export function parseId(param) {
  return /^\d+$/.test(param) ? Number(param) : null;
}

/** 404 for missing and unowned alike, so a key can't probe other users' ids. */
export function notFound(what) {
  return json({ error: `${what} not found` }, { status: 404 });
}
