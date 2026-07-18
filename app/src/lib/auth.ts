import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { pool } from "@/lib/db";
import { randomUUID } from "crypto";

// Fixed 48-hour session window, per product decision: sessions do NOT
// slide/refresh on activity — a user logged in at time T is logged out
// automatically at T+48h regardless of how active they were, and must
// log in again. This is enforced here (session creation) and re-checked
// on every request in the `session` callback below.
const SESSION_DURATION_MS = 48 * 60 * 60 * 1000;

export const { handlers, auth, signIn, signOut } = NextAuth({
  // No adapter here deliberately: Auth.js's built-in adapters assume an
  // OAuth-shaped flow (auto account linking, auto session creation from
  // a provider callback). Credentials-based login doesn't fit that
  // shape cleanly, so session rows are created/read manually below
  // against the same `sessions` table the schema already defines —
  // same storage, just written to directly instead of through an
  // adapter abstraction that doesn't match this auth model.
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        const { rows } = await pool.query(
          `SELECT id, name, email, role, password_hash FROM users WHERE email = $1`,
          [email.toLowerCase().trim()]
        );
        const user = rows[0];
        if (!user || !user.password_hash) return null;

        const valid = await compare(password, user.password_hash);
        if (!valid) return null;

        return { id: user.id, name: user.name, email: user.email, role: user.role };
      },
    }),
  ],
  session: {
    strategy: "jwt",
    // Auth.js's own JWT maxAge acts as a backstop matching the same
    // 48-hour window; the authoritative check is still the `sessions`
    // table row created at login and verified in the callback below,
    // so the two can't silently drift out of sync in normal operation.
    maxAge: SESSION_DURATION_MS / 1000,
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // Fresh login: create a real row in `sessions` with the fixed
        // 48h expiry, and remember its token in the JWT so subsequent
        // requests can check that row hasn't been revoked/expired.
        const sessionToken = randomUUID();
        const expires = new Date(Date.now() + SESSION_DURATION_MS);
        await pool.query(
          `INSERT INTO sessions ("sessionToken", "userId", expires) VALUES ($1, $2, $3)`,
          [sessionToken, user.id, expires]
        );
        token.sessionToken = sessionToken;
        token.userId = user.id;
        token.role = (user as { role?: string }).role ?? "user";
      }
      return token;
    },
    async session({ session, token }) {
      if (!token.sessionToken) return { ...session, user: undefined as never };

      // Re-check the sessions table on every request — this is what
      // makes the 48h window a hard boundary rather than just a JWT
      // claim the client could theoretically hold onto. An expired or
      // deleted row here means an immediately dead session, even if the
      // JWT cookie itself hasn't expired yet.
      const { rows } = await pool.query(
        `SELECT s.expires, u.id, u.name, u.email, u.role
         FROM sessions s JOIN users u ON u.id = s."userId"
         WHERE s."sessionToken" = $1`,
        [token.sessionToken]
      );
      const row = rows[0];
      if (!row || new Date(row.expires) < new Date()) {
        return { ...session, user: undefined as never };
      }

      session.user.id = row.id;
      session.user.name = row.name;
      session.user.email = row.email;
      session.user.role = row.role;
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
});
