# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Keeping this file current

Whenever you discover something during a task that a future instance would benefit from
knowing — a non-obvious convention, a gotcha, a build/deploy quirk, an architectural
decision, or a correction the user makes — ask the user whether to record it here, and
add it on their go-ahead. Prefer updating this file over letting hard-won context be lost.

## Overview

`sorcery-tcg` is a SvelteKit web app for the trading card game _Sorcery: Contested Realm_.
It provides a card database, deck builder, collection manager, trade binder, cube
(draft pool) builder/randomizer, and a friends/sharing system. It is a single-server
app backed by a local SQLite file, designed to be self-hosted via Docker.

## Commands

```sh
npm run dev            # Vite dev server (SvelteKit)
npm run build          # production build -> ./build (adapter-node)
npm run preview        # preview the production build
npm run format         # prettier --write .
npm run format:check   # prettier --check . (verify, don't write)
npm run db:generate    # drizzle-kit: generate a migration from schema.js
npm run db:migrate     # drizzle-kit: apply migrations in ./drizzle
npm run db:studio      # drizzle-kit studio (browse the DB)
npm test               # playwright test (browser E2E; boots the dev server itself)
npm run test:ui        # playwright test --ui (interactive runner)
npm run dev:login      # mint an Auth.js session cookie to skip the Google login
```

- **Signing in locally without Google**: `npm run dev:login` prints a `document.cookie`
  line to paste into DevTools (and a `Cookie:` header for curl). Auth.js runs
  adapter-less on the JWT strategy, so `AUTH_SECRET` alone can sign a valid session —
  the script only reads users that already exist, so it cannot invent an admin. Pass an
  email to pick a user, or `--db data/e2e.db` to target the test database. **Never add a
  test-only auth bypass to `hooks.server.js`**; minting a real cookie is the supported path.

- **Verifying a change**: there is no type checking. `npm run build` is the only check
  that a change compiles — run it after editing `.svelte` or `.js` files — and
  `npm test` covers the `/cards` browser flows. Beyond that, verification means
  running the app.
- Prettier is configured (`.prettierrc`: 2-space, single quotes, no trailing commas,
  100 cols). `.gitattributes` forces LF line endings — the repo is developed on Windows
  with `core.autocrlf=true`, and without it every checkout would leave `prettier --check`
  flagging the whole codebase.
- No linter is configured. The only tests are Playwright E2E specs in `./tests`
  (`playwright.config.js`). They drive a real browser on **port 5199** against an
  **isolated `data/e2e.db`**, so they never touch `data/sorcery.db` and a dev server
  you already have open on 5173 is left alone. Assertions use relative counts and read
  the "N cards found" label rather than hardcoding a catalog size, so re-syncing cards
  won't break them.
  - `tests/seed-e2e-db.js` rebuilds `data/e2e.db` before every run: `VACUUM INTO` copies
    the card catalog from `data/sorcery.db` (so that file **must exist** — sync cards
    first), then wipes users/decks/collections/cubes/trades, seeds the two test users
    from `tests/helpers/auth.js`, and gives the member user ~700 collection rows so
    pages are exercised with realistic volume. It is chained into `webServer.command`
    rather than used as `globalSetup` because **Playwright starts `webServer` before
    `globalSetup`** — as a globalSetup the dev server would already hold the file open
    and the rebuild would fail with `EBUSY`.
  - **Known blind spot**: some bugs reproduce only against the real database. The
    `replaceState`-before-router-init throw on `/collection` fires every time against
    `data/sorcery.db` but has never been reproduced against the seed — not at matching
    row counts, not under 20x CPU throttling. When chasing a hydration-timing bug,
    verify against a real-data dev server (`npm run dev:login` + port 5173), not just
    the suite.
  - **Auth**: `hooks.server.js` calls `SvelteKitAuth()` with no database adapter, so
    Auth.js uses the JWT strategy and the whole session is one cookie encrypted with
    `AUTH_SECRET` (the `sessions`/`accounts` tables are unused). `tests/helpers/auth.js`
    mints that cookie with `encode()` from `@auth/core/jwt`, so **there is no test-only
    auth bypass in application code** — keep it that way. Requires a real `AUTH_SECRET`
    in `.env`; `webServer` also sets `TCGAPI_KEY=''` so `priceScheduler.js` skips the
    live price sync instead of burning the daily quota.
  - Use **`page.request`**, not the standalone `request` fixture, for authenticated API
    calls — the latter has its own cookie jar and will get a 401.
  - **Gotcha**: the filter controls are plain inputs with `on*` handlers — no `<form>`,
    no `action` — so they do nothing until hydration, and `bind:value` re-applies the
    server value over anything typed before then. The `search()` helper in
    `tests/cards.spec.js` retries fill-and-submit for exactly this reason; follow that
    pattern for any new test that types into a filter.
  - On Windows an aborted run can orphan a `vite dev` child that keeps holding
    `data/e2e.db`; the next run then fails on `EBUSY`. Kill the stray process.
- Node with `engine-strict=true` (`.npmrc`); `better-sqlite3` is a native module, so
  installs need build tools (`python3 make g++` on Alpine — see `Dockerfile`).
- Docker: `docker compose up --build` runs the app on port 3000 with a persistent
  `sorcery-data` volume. CI (`.github/workflows/docker-publish.yml`) builds and pushes
  a `ghcr.io` image on every push to `master`.

## MCP

`.mcp.json` registers the official Svelte MCP server (`https://mcp.svelte.dev/mcp`,
HTTP transport). Use its tools for authoritative, up-to-date Svelte 5 / SvelteKit
guidance — especially runes, the current component API, and migration questions —
rather than relying on older training knowledge. On first use Claude Code will prompt
to approve the project-scoped server.

The Playwright MCP server is also available (installed as a user-scope plugin, not via
`.mcp.json`). Since there are no tests, driving the dev server in a real browser is the
main way to verify UI behaviour beyond `npm run build` — `/cards` is a good target
because its `load` calls `locals.auth()` but never redirects, so it renders fine while
signed out. Its tool calls are executed live against a browser session and are **not
saved as replayable scripts**; each run has to be re-driven by hand.

- **Write every Playwright artifact under `.playwright-mcp/`** — pass an explicit
  `filename` like `.playwright-mcp/foo.png` for screenshots rather than a bare name,
  which lands in the repo root. `.claude/settings.json` allows `rm -r .playwright-mcp`
  (and paths beneath it) precisely so this junk can be cleaned up without a prompt;
  nothing outside that directory can be deleted, and the blanket `Bash(rm -rf:*)` deny
  still blocks any `-rf` delete everywhere, including inside it. Use `rm -r`, not `rm -rf`.

## Environment

Copy `.env.example` to `.env`. Variables:

- `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` — Auth.js / Google OAuth.
- `ORIGIN` — required by adapter-node in production for CSRF/redirects.
- `TCGAPI_KEY` — key for `api.tcgapi.dev` (pricing). If unset, price sync is skipped
  silently rather than erroring.
- `DB_PATH` — SQLite file location (defaults to `./data/sorcery.db`; `/app/data/...` in Docker).

## Architecture

Standard SvelteKit file-based routing under `src/routes`. Svelte 5 (runes: `$props`,
`$state`). Pages that need data have `+page.server.js` (`load`); mutations go through
JSON endpoints under `src/routes/api/**/+server.js`. Global styles and design tokens
(dark theme) live in `src/app.css`; there is no CSS framework.

### Auth

- `src/hooks.server.js` configures `@auth/sveltekit` with the Google provider and
  exports `handle`. It also calls `startPriceScheduler()` at module load (server boot).
- The `signIn` callback provisions a row in `users` on first login; **the very first
  user to sign in becomes `role: 'admin'`**, everyone else is `member`.
- The `session` callback augments `session.user` with `id` and `role` from the DB.
- In server code, get the user with `const session = await locals.auth();` then check
  `session?.user?.id` / `session.user.role === 'admin'`. There is no route-group guard —
  every `load`/endpoint does its own auth and ownership checks.

### Database (SQLite + Drizzle)

- `src/lib/db/schema.js` — Drizzle table definitions, the source of truth for
  `drizzle-kit`. Used for all queries via `db` (drizzle better-sqlite3, `{ schema }`
  passed so `db.query.*` relational helpers work).
- `src/lib/db/index.js` — opens the DB, sets `journal_mode=WAL` and `foreign_keys=ON`,
  and **also contains a full set of inline `CREATE TABLE IF NOT EXISTS` statements plus
  ad-hoc `ALTER TABLE ... ADD COLUMN` blocks** that run on every import. This is the
  mechanism that actually keeps a deployed DB in sync — the `./drizzle` migration folder
  exists but `db:migrate` is not wired into build/startup.
  - **When changing the schema, update BOTH `schema.js` AND the raw SQL in `index.js`**
    (add a `CREATE TABLE`/`ALTER TABLE` there), or deployed databases will not get the change.
  - **Back up the database before any schema edit**: `cp data/sorcery.db data/sorcery.db.bak`.
    Because that SQL runs on import, a schema change is applied to the real
    `data/sorcery.db` the moment the dev server restarts — there is no staging step and
    no review point. SQLite cannot drop or retype a column in place, so a mistake here is
    tedious to unwind. The `.bak` file is gitignored by the `data/` rule.
- All timestamps are ISO strings in `TEXT` columns. Prices are stored as `TEXT` to
  preserve decimal precision. JSON-array fields (`cards.elements`, `cards.set_ids`,
  `cubes.settings`, `decks.tags`) are stringified JSON — `JSON.parse` on read.
- Key domain tables: `cards` / `card_images` / `card_prices` / `sets` (shared catalog),
  `users` / `accounts` / `sessions`, `decks` + `deck_cards` (`zone` is `atlas` or
  `spellbook`), `collections`, `cubes` + `cube_cards`, `trades`, `friend_requests` /
  `friendships` (friendship rows are one-directional and store per-category share flags:
  `share_decks`, `share_cubes`, `share_collection`, `share_trades`).

### Card & price data sync (admin only)

- `POST /api/admin/sync` — pulls the full card list from `api.sorcerytcg.com/api/cards`,
  upserts `cards`, rebuilds `card_images` (wiped and re-inserted), and upserts `sets`.
  Card `id` and `slug` are derived by slugifying the card name (`nameToCardId` /
  slugify logic is duplicated in several files — keep them consistent).
- `POST /api/admin/sync-prices` and `src/lib/server/priceSync.js` — pages through
  `api.tcgapi.dev` per set, matches cards by slugified name, and replaces `card_prices`.
  Stops early when the API's daily quota is nearly exhausted (and then skips the
  full-table clear to avoid wiping data on a partial run).
- `src/lib/server/priceScheduler.js` — in-process `setTimeout`/`setInterval` scheduler
  started from `hooks.server.js`. Re-checks every 6h and runs a full sync if prices are
  older than 3 days. No external cron; lives and dies with the server process.
- `loadPriceResolver()` in `priceSync.js` returns `{ resolve, setsForCard }` helpers
  used by pages to attach prices to cards; it has a hardcoded `SET_ORDER` release list.

### Collection / deck CSV format

Import/export (`/api/collection/import|export`, `/api/decks/[id]/import|export`) use the
Curiosa CSV format: `card name,set,finish,product,quantity,notes`. Import also accepts a
legacy `card_id` column. `quantity <= 0` on import deletes the matching collection row;
copies from different sets are tracked as separate rows (matched on `card_id` + `set_id`).

### Sharing / visibility model

`decks`, `cubes`, and collections have a `visibility` of `private` / `public` /
`shared`/`friends`. Server `load` functions gate access by checking ownership, then
`visibility`, then (for friends-visibility) a `friendships` row between the owner and
viewer. Trade binders and collections of friends are exposed on `/collection/[userId]`
and `/friends/[id]` subject to the friendship share flags.
