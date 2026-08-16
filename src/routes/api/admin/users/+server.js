import { json } from '@sveltejs/kit';
import { db } from '$lib/db/index.js';
import { users } from '$lib/db/schema.js';
import { eq } from 'drizzle-orm';

/** @type {import('./$types').RequestHandler} */
export async function PATCH({ locals, request }) {
  const session = await locals.auth();

  if (!session?.user || session.user.role !== 'admin') {
    return json({ error: 'Unauthorized' }, { status: 403 });
  }

  const { userId, role } = await request.json();

  if (!userId || !['admin', 'member'].includes(role)) {
    return json({ error: 'Invalid request' }, { status: 400 });
  }

  // Prevent demoting yourself
  if (userId === session.user.id && role === 'member') {
    return json({ error: 'Cannot demote yourself' }, { status: 400 });
  }

  // Prevent demoting the last admin
  if (role === 'member') {
    const allUsers = await db.select().from(users);
    const adminCount = allUsers.filter((u) => u.role === 'admin').length;
    if (adminCount <= 1) {
      return json({ error: 'At least one admin is required' }, { status: 400 });
    }
  }

  await db.update(users).set({ role }).where(eq(users.id, userId));

  return json({ success: true });
}
