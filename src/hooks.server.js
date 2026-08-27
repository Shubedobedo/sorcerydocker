import { SvelteKitAuth } from '@auth/sveltekit';
import Google from '@auth/sveltekit/providers/google';
import { env } from '$env/dynamic/private';
import { db } from '$lib/db/index.js';
import { users, accounts, sessions } from '$lib/db/schema.js';
import { eq } from 'drizzle-orm';
import { startPriceScheduler } from '$lib/server/priceScheduler.js';

// Kick off the background price sync scheduler once on server boot
startPriceScheduler();

export const { handle, signIn, signOut } = SvelteKitAuth({
  providers: [
    Google({
      clientId: env.AUTH_GOOGLE_ID,
      clientSecret: env.AUTH_GOOGLE_SECRET
    })
  ],
  pages: {
    signIn: '/login'
  },
  callbacks: {
    async redirect({ url, baseUrl }) {
      // After sign in/out, go home instead of back to signin page
      if (url.includes('/login')) return baseUrl;
      if (url.startsWith(baseUrl)) return url;
      if (url.startsWith('/')) return `${baseUrl}${url}`;
      return baseUrl;
    },
    async signIn({ user, account }) {
      try {
        if (!user.email) return false;

        // Check if user exists
        const existingUser = await db.query.users.findFirst({
          where: eq(users.email, user.email)
        });

        if (!existingUser) {
          // Check if this is the first user (make them admin)
          const allUsers = await db.select().from(users);
          const role = allUsers.length === 0 ? 'admin' : 'member';

          // Create new user
          await db.insert(users).values({
            id: user.id || crypto.randomUUID(),
            name: user.name,
            email: user.email,
            image: user.image,
            role
          });
        }

        return true;
      } catch (err) {
        console.error('Auth signIn callback error:', err);
        return true; // Still allow sign-in even if DB write fails
      }
    },
    async session({ session }) {
      if (session?.user?.email) {
        const dbUser = await db.query.users.findFirst({
          where: eq(users.email, session.user.email)
        });
        if (dbUser) {
          session.user.id = dbUser.id;
          session.user.role = dbUser.role;
          session.user.name = dbUser.name;
          session.user.image = dbUser.image;
        }
      }
      return session;
    }
  },
  trustHost: true
});
