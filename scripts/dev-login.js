#!/usr/bin/env node
/**
 * Mints an Auth.js session cookie for local development, so you can open the app
 * already signed in instead of going through the Google OAuth round trip.
 *
 *   node scripts/dev-login.js                      # first admin in the database
 *   node scripts/dev-login.js you@example.com      # a specific user
 *   node scripts/dev-login.js --db data/e2e.db     # against the test database
 *
 * This grants nothing that `.env` doesn't already grant: AUTH_SECRET *is* the
 * ability to sign sessions, because hooks.server.js runs Auth.js with no database
 * adapter (JWT strategy). Keep AUTH_SECRET secret and this script is no weaker
 * than the app itself. It only ever reads users that already exist — it cannot
 * create one, so it can't be used to invent an admin.
 */
import Database from 'better-sqlite3';
import { encode } from '@auth/core/jwt';
import { resolve } from 'path';
// Shared with the E2E helpers so there is exactly one .env parser in the repo.
import { readEnv, ROOT } from '../tests/helpers/env.js';

const COOKIE_NAME = 'authjs.session-token';

const args = process.argv.slice(2);
const dbFlag = args.indexOf('--db');
const dbPath = dbFlag === -1 ? process.env.DB_PATH || 'data/sorcery.db' : args[dbFlag + 1];
const email = args.find((a) => a.includes('@'));

const db = new Database(resolve(ROOT, dbPath), { readonly: true });
const user = email
  ? db.prepare('SELECT * FROM users WHERE email = ?').get(email)
  : db.prepare("SELECT * FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1").get();
db.close();

if (!user) {
  console.error(
    email
      ? `No user with email ${email} in ${dbPath}.`
      : `No admin user in ${dbPath}. Sign in through Google once, or pass an email.`
  );
  process.exit(1);
}

const value = await encode({
  token: { sub: user.id, name: user.name, email: user.email, picture: user.image ?? null },
  secret: readEnv('AUTH_SECRET'),
  salt: COOKIE_NAME,
  maxAge: 24 * 60 * 60
});

console.log(`\nSigned in as ${user.name || user.email} (${user.role}) from ${dbPath}\n`);
console.log('Paste into the DevTools console on the site, then reload:\n');
console.log(`document.cookie = '${COOKIE_NAME}=${value}; path=/; max-age=86400';\n`);
console.log('Or, for a script/curl:\n');
console.log(`Cookie: ${COOKIE_NAME}=${value}\n`);
