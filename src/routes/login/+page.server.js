import { redirect } from '@sveltejs/kit';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals }) {
  const session = await locals.auth();

  // If already signed in, redirect home
  if (session?.user) {
    throw redirect(303, '/');
  }

  return {};
}
