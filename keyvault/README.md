# YOLOForge Key Vault

A minimal Cloudflare Worker that holds the master encryption key used to
protect users' R2 credentials in the YOLOForge app — kept as a SEPARATE
service so a leak of the main app's environment doesn't automatically
expose the key that unwraps everyone's stored secrets.

## What it does

Two endpoints, both requiring a shared bearer token:

- `POST /wrap` — takes a plaintext DEK, encrypts it under the master key, returns the wrapped DEK + IV
- `POST /unwrap` — takes a wrapped DEK + IV, returns the plaintext DEK

It never sees the actual R2 secret — only small 32-byte DEKs. The main
app does the real AES encryption/decryption of R2 credentials locally,
using the DEK this Worker hands back.

Every wrap/unwrap call is logged to Workers KV (90-day retention) —
independent of the main app's own logging.

## Deploy

```bash
npm install

# Generate secrets (run once, save both values securely):
openssl rand -base64 32   # -> MASTER_KEY_B64
openssl rand -hex 32      # -> SHARED_AUTH_TOKEN

# Create the KV namespace for audit logging:
npx wrangler kv namespace create AUDIT_LOG
# Copy the returned "id" into wrangler.jsonc's kv_namespaces[0].id

# Set secrets on the deployed Worker (never in wrangler.jsonc or code):
npx wrangler secret put MASTER_KEY_B64
npx wrangler secret put SHARED_AUTH_TOKEN

# Deploy:
npx wrangler deploy
```

After deploying, copy the Worker's URL (shown in the deploy output,
looks like `https://yoloforge-keyvault.<subdomain>.workers.dev`) and the
`SHARED_AUTH_TOKEN` value into the main app's `.env.local` as
`KEYVAULT_URL` and `KEYVAULT_SHARED_TOKEN`.

## Local dev

```bash
npx wrangler dev
```

Wrangler will prompt for local values of the secrets, or you can create
a `.dev.vars` file (gitignored) with:

```
MASTER_KEY_B64=<value>
SHARED_AUTH_TOKEN=<value>
```

## Security notes

- This Worker's ONLY job is wrap/unwrap. Do not add other routes or
  responsibilities to it — minimal surface area is the point.
- If `MASTER_KEY_B64` is ever rotated, all previously wrapped DEKs
  become unreadable. There's no versioning in this minimal build — if
  you need rotation, wrap all existing DEKs under the new key during a
  migration window before deleting the old key from your notes.
- The `SHARED_AUTH_TOKEN` is itself a secret worth protecting — anyone
  with it can call `/unwrap` given a wrapped DEK they've obtained
  elsewhere (e.g. from a Neon leak). Treat it with the same care as a
  database password.
