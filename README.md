# YOLOForge

A personal YOLO-format dataset verification and labeling tool. Users
sign in with Google and connect their own Cloudflare R2 bucket (500MB
soft cap each) — this project never pays for or owns uploaded data, and
never sees R2 credentials in plaintext.

## Repo layout

This is a monorepo with two independently deployed pieces:

```
yoloforge/
├── app/        Next.js app — auth, storage connect, annotation UI.
│               Deploys to Netlify.
├── keyvault/   Cloudflare Worker holding the master encryption key
│               used to protect users' R2 credentials. Deploys
│               separately via wrangler. See keyvault/README.md.
└── MAINTAINING.md   How to run this safely as a public repo.
```

They're in one repo for convenience (one clone, one CI config), but
deploy to **different platforms with different secrets** — that
separation is what keeps a leak of the app's Netlify environment from
also exposing the master key. See `app/src/lib/crypto.ts` and
`keyvault/src/index.ts` for the full design rationale.

## Quick start

**1. Deploy the key vault first** (see `keyvault/README.md`):
```bash
cd keyvault
npm install
openssl rand -base64 32   # -> MASTER_KEY_B64
openssl rand -hex 32      # -> SHARED_AUTH_TOKEN
npx wrangler kv namespace create AUDIT_LOG   # copy id into wrangler.jsonc
npx wrangler secret put MASTER_KEY_B64
npx wrangler secret put SHARED_AUTH_TOKEN
npx wrangler deploy
```
Note the deployed URL — you'll need it next.

**2. Set up the app:**
```bash
cd app
cp .env.example .env.local
# fill in: DATABASE_URL (Neon), GOOGLE_CLIENT_ID/SECRET,
# KEYVAULT_URL + KEYVAULT_SHARED_TOKEN from step 1
psql "$DATABASE_URL" -f db/schema.sql
npm install
npm run dev
```

## Security model, in brief

R2 credentials are envelope-encrypted: a random per-credential key
(DEK) encrypts the secret locally, and the DEK itself is wrapped by the
key vault Worker's master key — which never leaves that Worker's
environment. A full database dump decrypts nothing without a live call
to the vault. Full details in `app/src/lib/crypto.ts`.

## File type enforcement

Three layers: client-side extension pre-check, server-side magic-byte
inspection (`app/src/lib/file-validation.ts` — PDF/MP4/ZIP explicitly
detected and rejected regardless of claimed type), and a DB-level CHECK
constraint. Allowed: JPEG, PNG, BMP, TIFF, and YOLO-format TXT labels.

## Status

Foundation stage: auth, schema, storage-connect flow, and encryption
are built and CI-verified. Not yet built: file manager UI, presigned
upload flow, ZIP parsing, and the annotation canvas (verification +
makesense.ai-style labeling modes).

See `MAINTAINING.md` before pushing anything to this public repo.
