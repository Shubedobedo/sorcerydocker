import Database from 'better-sqlite3';
import { existsSync, rmSync } from 'fs';
import { resolve } from 'path';
import { ROOT } from './helpers/env.js';
import { USERS } from './helpers/auth.js';
import { CUBE, AVATARS } from './helpers/fixtures.js';

export const E2E_DB = resolve(ROOT, 'data/e2e.db');
const SOURCE_DB = resolve(ROOT, 'data/sorcery.db');

/**
 * Builds an isolated database for the E2E run.
 *
 * Authenticated tests create and delete real rows, so they must never point at
 * data/sorcery.db. The card catalog is copied from it (the specs assert against
 * real cards), then test users are seeded on top. `data/` is gitignored, so the
 * copy never lands in version control.
 *
 * This runs as a plain script from playwright.config.js's `webServer.command`
 * rather than as `globalSetup`, because Playwright starts the web server BEFORE
 * globalSetup — the dev server would create and lock data/e2e.db first, and the
 * rebuild would fail with EBUSY. Chaining it ahead of `vite dev` in the same
 * command is what guarantees the ordering.
 */
export default function seed() {
  if (!existsSync(SOURCE_DB)) {
    throw new Error(
      `Expected a card catalog at ${SOURCE_DB}. Run the app and sync cards (POST /api/admin/sync) before running E2E tests.`
    );
  }

  // VACUUM INTO writes a clean single-file copy that already accounts for any
  // outstanding WAL contents, unlike copying the .db file on its own. It refuses
  // to overwrite, so the previous run's files have to go first.
  for (const suffix of ['', '-wal', '-shm']) {
    const path = `${E2E_DB}${suffix}`;
    if (!existsSync(path)) continue;
    try {
      rmSync(path);
    } catch (err) {
      // On Windows an aborted run can leave an orphaned `vite dev` child holding
      // the file open, and the raw EBUSY gives no hint about what to do.
      throw new Error(
        `Cannot replace ${path} (${err.code ?? err.message}). A dev server from an ` +
          `earlier run is probably still holding it — stop any stray "vite dev" ` +
          `process and try again.`
      );
    }
  }

  const source = new Database(SOURCE_DB, { readonly: true });
  source.exec(`VACUUM INTO '${E2E_DB.replace(/\\/g, '/').replace(/'/g, "''")}'`);
  source.close();

  const target = new Database(E2E_DB);
  target.pragma('foreign_keys = ON');

  // Start from a clean slate: no real users, decks, collections or trades, so
  // the specs only ever see rows they created themselves.
  for (const table of [
    'deck_cards',
    'decks',
    'collections',
    'cube_cards',
    'cubes',
    'trades',
    'friend_requests',
    'friendships'
  ]) {
    try {
      target.exec(`DELETE FROM ${table}`);
    } catch {
      // table may not exist in an older catalog copy; the app recreates it on boot
    }
  }
  target.exec('DELETE FROM users');

  const insert = target.prepare(
    'INSERT INTO users (id, name, email, image, role, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const now = new Date().toISOString();
  for (const user of Object.values(USERS)) {
    insert.run(user.id, user.name, user.email, null, user.role, now);
  }

  const cards = target.prepare('SELECT COUNT(*) AS c FROM cards').get().c;

  if (cards === 0) {
    target.close();
    throw new Error(
      'The copied database has no cards — sync the catalog before running E2E tests.'
    );
  }

  const owned = seedCollection(target, USERS.member.id);
  seedFriendship(target);
  const pool = seedCube(target, USERS.member.id);

  target.close();
  console.log(
    `[e2e] seeded ${E2E_DB} with ${cards} cards, ${Object.keys(USERS).length} test users ` +
      `${owned} collection rows and a ${pool}-card cube`
  );
}

/**
 * Gives the member user a realistically sized collection (~700 rows, comparable
 * to a real one) so the collection page is exercised with real volume rather
 * than an empty-state shortcut.
 *
 * Caveat, so nobody over-trusts this: it does NOT reproduce the hydration race
 * that `afterNavigate` now guards in collection/+page.svelte. That bug throws
 * reliably against a real database but has never been reproduced against this
 * seed — not with matching row counts, and not under 20x CPU throttling. The
 * remaining difference has not been identified. Treat the console-error
 * assertion on /collection as a guard, not as proof that the race is fixed.
 */
function seedCollection(target, userId) {
  const setNames = new Map(
    target
      .prepare('SELECT id, name FROM sets')
      .all()
      .map((s) => [s.id, s.name])
  );

  const cards = target
    .prepare('SELECT id, set_ids FROM cards WHERE set_ids IS NOT NULL ORDER BY name LIMIT 700')
    .all();

  const insert = target.prepare(
    'INSERT INTO collections (user_id, card_id, set_id, set_name, quantity) VALUES (?, ?, ?, ?, ?)'
  );

  const insertAll = target.transaction((rows) => {
    let count = 0;
    for (const [index, card] of rows.entries()) {
      let setId = null;
      try {
        setId = JSON.parse(card.set_ids)?.[0] ?? null;
      } catch {
        continue; // malformed set_ids in the catalog; skip rather than fail the run
      }
      if (!setId) continue;
      // Deterministic 1-4 spread so quantity rendering and totals are exercised
      // without the suite depending on a random seed.
      insert.run(userId, card.id, setId, setNames.get(setId) ?? setId, (index % 4) + 1);
      count++;
    }
    return count;
  });

  return insertAll(cards);
}

/**
 * Befriends the two test users asymmetrically.
 *
 * Friendship rows are one-directional and carry their own share flags, so the
 * member sharing with the admin says nothing about the reverse. Seeding only one
 * direction is what lets the specs prove a viewer is refused when the *owner*
 * has not shared — the case that would silently pass if both rows were open.
 */
function seedFriendship(target) {
  const insert = target.prepare(
    `INSERT INTO friendships
       (user_id, friend_id, share_decks, share_cubes, share_collection, share_trades, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const now = new Date().toISOString();
  // member -> admin: collection and trades shared.
  insert.run(USERS.member.id, USERS.admin.id, 0, 0, 1, 1, now);
  // admin -> member: friends, but nothing shared back.
  insert.run(USERS.admin.id, USERS.member.id, 0, 0, 0, 0, now);
}

/**
 * Seeds a cube whose pool is shaped for the avatar rules.
 *
 * A cube deck may only use an avatar that is in its cube's pool, with
 * Spellslinger allowed as a standing exception. Proving that needs three
 * distinct cards: one avatar inside the pool, one real avatar outside it, and
 * Spellslinger — which is deliberately kept OUT of the pool, so a spec that
 * accepts it proves the exception fired rather than the pool check passing.
 *
 * The ids are inserted explicitly because no API lists a cube's pool, leaving
 * the specs no other way to know what is in it.
 */
function seedCube(target, userId) {
  const exists = target.prepare('SELECT 1 FROM cards WHERE id = ?');
  for (const id of Object.values(AVATARS)) {
    if (!exists.get(id)) {
      throw new Error(
        `Avatar "${id}" is missing from the card catalog, so the cube fixtures cannot be ` +
          `seeded. Re-sync the catalog, or choose another avatar in tests/helpers/fixtures.js.`
      );
    }
  }

  const now = new Date().toISOString();
  target
    .prepare(
      `INSERT INTO cubes (id, user_id, name, description, visibility, slug, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      CUBE.id,
      userId,
      CUBE.name,
      'Seeded pool for the avatar rules.',
      'private',
      CUBE.slug,
      now,
      now
    );

  // Ordinary cards so the pool is not avatar-only, picked by name order to stay
  // deterministic, then the single avatar the pool is allowed to offer.
  const filler = target
    .prepare("SELECT id FROM cards WHERE type IN ('Site', 'Minion') ORDER BY name LIMIT 12")
    .all()
    .map((c) => c.id);

  const insert = target.prepare(
    'INSERT INTO cube_cards (cube_id, card_id, quantity) VALUES (?, ?, ?)'
  );
  const insertAll = target.transaction((ids) => {
    for (const id of ids) insert.run(CUBE.id, id, 1);
  });
  insertAll([...filler, AVATARS.inPool]);

  return filler.length + 1;
}

// Executed directly by playwright.config.js's webServer command.
seed();
