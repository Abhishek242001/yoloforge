import { Pool } from "pg";

// Neon requires SSL; the pooled connection string from the Neon dashboard
// already includes `?sslmode=require`, so no extra config needed here.
// A single module-level pool is reused across requests/functions —
// Netlify Functions are stateless per-invocation but this pool survives
// warm starts, which matters since each cold start would otherwise pay
// full TCP+TLS handshake cost against Neon.
declare global {
  // eslint-disable-next-line no-var
  var _pgPool: Pool | undefined;
}

export const pool =
  global._pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5, // Netlify Functions are short-lived; keep the pool small per instance
  });

if (process.env.NODE_ENV !== "production") {
  global._pgPool = pool;
}
