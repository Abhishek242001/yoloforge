import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import PostgresAdapter from "@auth/pg-adapter";
import { pool } from "@/lib/db";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PostgresAdapter(pool),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  session: {
    strategy: "database", // sessions table in Neon, not JWT — lets us revoke/inspect server-side
  },
  callbacks: {
    // Attach our GRF-specific fields (role, quota) onto the session object
    // so pages/components don't need a second DB round-trip just to know
    // a user's quota tier or role.
    async session({ session, user }) {
      const { rows } = await pool.query(
        `SELECT role, quota_tier_id, storage_used_bytes, quota_extra_bytes
         FROM users WHERE id = $1`,
        [user.id]
      );
      if (rows[0]) {
        session.user.id = user.id;
        session.user.role = rows[0].role;
        session.user.quotaTierId = rows[0].quota_tier_id;
        session.user.storageUsedBytes = Number(rows[0].storage_used_bytes);
        session.user.quotaExtraBytes = Number(rows[0].quota_extra_bytes);
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
});
