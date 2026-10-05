# Read-only API keys — design

## Goal

Let a signed-in user generate API keys so their own scripts and bots (e.g. a Discord bot)
can read **that user's own** collection, decks, cubes and trade binder over HTTP.

- Consumers: the key owner's own tools. No third-party apps, no OAuth.
- Scope: the owner's own data only. Data friends have shared with the owner is **out of
  scope**.
- Read-only: a key can never create, change or delete anything, including other keys.

## Approach

A dedicated, versioned namespace `/api/v1/*` of `GET`-only endpoints that accept **only**
`Authorization: Bearer <key>`. Keys are not accepted anywhere else, and the existing
session-cookie auth in `hooks.server.js` is untouched. Read-only is structural: these
routes export no `POST`/`PATCH`/`PUT`/`DELETE` handlers, so SvelteKit answers those with 405.

Rejected alternatives:

- Accepting keys in `hooks.server.js` so `locals.auth()` returns the key's user on `GET`
  requests. This needs less code, but it alters the one auth path every endpoint trusts,
  makes "read-only" depend on a method check, and ties bots to internal endpoints that
  change with the UI.
- Per-key scopes (collection-only, decks-only, …). YAGNI with a single consumer.

## Data model

New table `api_keys`, added to **both** `src/lib/db/schema.js` and the raw
`CREATE TABLE IF NOT EXISTS` SQL in `src/lib/db/index.js`. Back up `data/sorcery.db`
before the dev server first runs the change.

| column         | type    | notes                                                |
| -------------- | ------- | ---------------------------------------------------- |
| `id`           | INTEGER | primary key, autoincrement                           |
| `user_id`      | TEXT    | NOT NULL, FK → `users.id`, `ON DELETE CASCADE`       |
| `name`         | TEXT    | NOT NULL, user-chosen label, trimmed, 1–50 chars     |
| `key_hash`     | TEXT    | NOT NULL, `UNIQUE`; SHA-256 hex of the full key      |
| `prefix`       | TEXT    | NOT NULL; first 8 characters of the key, for display |
| `created_at`   | TEXT    | NOT NULL, ISO timestamp                              |
| `last_used_at` | TEXT    | nullable ISO timestamp                               |

`seed-e2e-db.js` adds `api_keys` to the tables it wipes.

## Key format and lifecycle

- Key: `sk_` + 32 random bytes (`crypto.randomBytes`), base64url-encoded.
- On creation the full key is returned **once**. Only `key_hash` and `prefix` are stored.
  A lost key cannot be recovered; the user revokes it and creates a new one.
- SHA-256 (not bcrypt) is deliberate: the key has 256 bits of entropy, so a slow hash
  adds nothing, and a plain hash allows an indexed equality lookup.
- Revoking deletes the row; the key stops working on the next request.
- Limit: 10 keys per user. Creating an 11th returns 400.
- `last_used_at` is updated on successful authentication, but at most once per minute per
  key, so a chatty bot does not cause a write on every request.

## Server module: `src/lib/server/apiKeys.js`

- `createApiKey(userId, name)` → `{ key, id, name, prefix, created_at }`; throws on a
  bad name or when over the limit.
- `listApiKeys(userId)` → `[{ id, name, prefix, created_at, last_used_at }]`. Never
  returns `key_hash`.
- `revokeApiKey(userId, id)` → `true` if a row owned by `userId` was deleted, else `false`.
- `requireApiKey(request)` → the owner's `userId`, or `null`. Reads the `Authorization`
  header and expects `Bearer sk_…`, hashes the key and looks it up by `key_hash`. Returns
  `null` when the header is missing or malformed or the key is unknown. It does not throw
  SvelteKit's `error()`, because that would produce a `{ message }` body instead of the
  app's `{ error }` convention.

## Key management endpoints (session cookie only)

These use `locals.auth()` like the rest of the app and **never** accept an API key, so a
key cannot mint or revoke keys.

| route                   | behaviour                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------- |
| `GET /api/keys`         | 401 without a session; else `{ keys: listApiKeys(...) }`                              |
| `POST /api/keys`        | body `{ name }`; 400 on a bad name or over the limit; else 200 with the full key once |
| `DELETE /api/keys/[id]` | 404 if the key does not exist or belongs to someone else                              |

## Read-only API: `/api/v1/*`

Every handler starts with `const userId = await requireApiKey(request);` and returns
`json({ error: 'Invalid or missing API key' }, { status: 401 })` when it is `null`. Session
cookies are ignored. Errors are `{ error: '...' }` JSON: 401 for a missing or invalid key, 404 for a
missing or unowned record. Every card reference carries both `card_id` and `name`.

**Prices.** Every card entry has `market_price`: a number in USD, or `null` when there is no
price data. It comes from `resolve()` in `loadPriceResolver()` (`src/lib/server/priceSync.js`), the
same resolver the trades and friends pages use, so the API and the UI agree:

- collection rows: `resolve(card_id, set_name)`
- trades: `resolve(card_id, set_name, foil ? 'foil' : 'normal')`
- deck and cube cards, which have no set: `resolve(card_id, null)`, i.e. the cheapest
  non-foil printing

The resolver is loaded once per request, not once per card. The avatar entry carries
`market_price` too. No totals: a client can sum them.

| route                    | response                                                                                                                                                  |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/me`         | `{ id, name }` (no email)                                                                                                                                 |
| `GET /api/v1/collection` | `{ cards: [{ card_id, name, set_id, set_name, quantity, market_price }] }`                                                                                |
| `GET /api/v1/decks`      | `{ decks: [{ id, name, format, visibility, tags, cube_id, card_count, updated_at }] }`                                                                    |
| `GET /api/v1/decks/[id]` | deck fields above plus `avatar` (`{ card_id, name, market_price }` or `null`), `atlas`, `spellbook` (each `[{ card_id, name, quantity, market_price }]`)  |
| `GET /api/v1/cubes`      | `{ cubes: [{ id, name, visibility, card_count, updated_at }] }`                                                                                           |
| `GET /api/v1/cubes/[id]` | cube fields above plus `cards: [{ card_id, name, quantity, market_price }]`                                                                               |
| `GET /api/v1/trades`     | `{ trades: [{ id, card_id, name, set_name, quantity, foil, location, expected_value, list_quantity, market_price }] }` — `status = 'available'` rows only |

Rules:

- Every query filters on `user_id = userId`. `/decks/[id]` and `/cubes/[id]` match on **both**
  `id` and `user_id`, so another user's record is a 404 **regardless of its visibility**.
- `tags` is parsed from its stored JSON string into an array.
- `card_count` excludes the avatar for decks (matching the 30/60 counts).
- A non-numeric `[id]` is a 404.
- Out of scope: totals, card images, pagination, rate limiting, friends' data.

## UI: `/profile`

A new "API keys" section on the existing owner-only profile page.

- `src/routes/profile/+page.server.js` also returns `apiKeys: listApiKeys(userId)`.
- A list of keys: name, `sk_xxxxx…` prefix, created date, last used (or "Never"), and a
  **Revoke** button behind a `confirm()`.
- A name input and **Create key** button that `POST` to `/api/keys`. The returned key is
  shown once in a panel with a **Copy** button and the note "Copy this key now — you won't
  be able to see it again." The panel is held in component state only and is gone on reload.
- A usage hint: `curl -H "Authorization: Bearer sk_…" <origin>/api/v1/collection`.
- JS-driven controls with no `<form>`, matching the rest of the app.

## Testing: `tests/api-keys.spec.js`

Uses existing helpers (`gotoHydrated`, `page.request`); no auth bypass.

- **UI**: the member creates a key on `/profile`, sees the full key once, sees it in the
  list, and revokes it; the list updates.
- **Auth**: on `/api/v1/me`, no header → 401, garbage key → 401, revoked key → 401, a
  signed-in session with no key → 401.
- **Data**: each `/api/v1/*` route returns the member's data in the documented shape,
  with `market_price` present (a number or `null`) on every card entry.
- **Ownership**: with the member's key, the admin's deck and cube by id → 404.
- **Read-only**: `POST` and `DELETE` to `/api/v1/decks/[id]` with a valid key → 405.
- **Management isolation**: `POST /api/keys` with only a Bearer key → 401; the member
  revoking the admin's key → 404.
- **Trades**: create two trades via the existing API, mark one traded; `/api/v1/trades`
  returns only the available one.
- `npm run build` passes, and its Svelte warnings have been read.

## Docs

Add an "API keys" section to `CLAUDE.md`: where the logic lives, that only hashes are
stored, that `/api/v1` accepts keys only and the rest of the app accepts sessions only,
and that keys are owner-scoped.
