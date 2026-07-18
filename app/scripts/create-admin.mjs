/**
 * Creates the first admin account. Run this once, locally, against your
 * real DATABASE_URL, since the app itself has no way to create the very
 * first admin (admins create users, but nobody exists yet to do that).
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." node scripts/create-admin.mjs \
 *     --email you@example.com --password "a-strong-password" --name "Gudsky"
 */
import { Pool } from "pg";
import { hash } from "bcryptjs";

function getArg(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

const email = getArg("--email");
const password = getArg("--password");
const name = getArg("--name") ?? null;

if (!email || !password) {
  console.error("Usage: node scripts/create-admin.mjs --email you@example.com --password yourpassword [--name \"Your Name\"]");
  process.exit(1);
}
if (password.length < 8) {
  console.error("Password must be at least 8 characters.");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL environment variable is required.");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const normalizedEmail = email.toLowerCase().trim();

  const existing = await pool.query("SELECT id FROM users WHERE email = $1", [normalizedEmail]);
  if (existing.rows.length > 0) {
    console.error(`A user with email ${normalizedEmail} already exists.`);
    process.exit(1);
  }

  const passwordHash = await hash(password, 12);

  const { rows } = await pool.query(
    `INSERT INTO users (email, name, role, password_hash)
     VALUES ($1, $2, 'admin', $3)
     RETURNING id, email, name, role, created_at`,
    [normalizedEmail, name, passwordHash]
  );

  console.log("Admin account created:");
  console.log(rows[0]);
  await pool.end();
}

main().catch((err) => {
  console.error("Failed to create admin:", err);
  process.exit(1);
});
