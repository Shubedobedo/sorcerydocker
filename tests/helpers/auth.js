import { encode } from '@auth/core/jwt';
import { readEnv } from './env.js';

// hooks.server.js calls SvelteKitAuth() without a database adapter, so Auth.js
// uses the JWT strategy: the whole session lives in this one encrypted cookie,
// signed with AUTH_SECRET. That means tests can mint a valid session without any
// test-only bypass code in the app itself. Over plain http the cookie is
// unprefixed; a real https deploy would use `__Secure-authjs.session-token`.
const COOKIE_NAME = 'authjs.session-token';

/** Seeded by tests/global-setup.js into the isolated e2e database. */
export const USERS = {
  member: {
    id: 'e2e-member-0000-0000-000000000001',
    email: 'e2e-member@test.local',
    name: 'E2E Member',
    role: 'member'
  },
  admin: {
    id: 'e2e-admin-0000-0000-000000000002',
    email: 'e2e-admin@test.local',
    name: 'E2E Admin',
    role: 'admin'
  }
};

/**
 * Signs a session cookie for one of the seeded users.
 *
 * The `session` callback in hooks.server.js looks the user up by email and
 * attaches `id` and `role` from the database, so the token only needs to carry
 * enough identity for that lookup to succeed.
 */
export async function sessionCookie(who = 'member') {
  const user = USERS[who];
  if (!user) throw new Error(`Unknown test user: ${who}`);

  const value = await encode({
    token: { sub: user.id, name: user.name, email: user.email, picture: null },
    secret: readEnv('AUTH_SECRET'),
    salt: COOKIE_NAME,
    maxAge: 60 * 60
  });

  return {
    name: COOKIE_NAME,
    value,
    domain: 'localhost',
    path: '/',
    httpOnly: true,
    sameSite: 'Lax'
  };
}

/** Signs `context` in as one of the seeded users. */
export async function signIn(context, who = 'member') {
  await context.addCookies([await sessionCookie(who)]);
}
