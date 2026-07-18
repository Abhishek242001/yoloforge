# Maintaining YOLOForge as a public repo

This covers how to actually run this as a public GitHub repo day-to-day
without leaking a secret or breaking your deployed instance.

## 1. One-time setup, before your first push

**a) Two separate repos, not one.**
Keep `yoloforge-app` (this repo) and `yoloforge-keyvault` as two
separate GitHub repos. There's no requirement they be one monorepo, and
keeping them separate means someone browsing the main app's code never
even sees the vault's source unless they go looking for it deliberately
— slightly reduces the attack surface an outsider sees at a glance.

**b) Create the repos as public on GitHub**, then locally:
```bash
cd yoloforge-app
git init
git add .
git status   # READ THIS OUTPUT — confirm no .env.local, no .dev.vars, nothing unexpected
git commit -m "Initial commit"
git remote add origin https://github.com/<you>/yoloforge-app.git
git push -u origin main
```
Repeat for `yoloforge-keyvault`.

**c) Turn on branch protection** (GitHub repo -> Settings -> Branches ->
Add rule for `main`):
- Require status checks to pass before merging → select the `secret-scan`
  and `build` (or `typecheck`) jobs once they've run once
- Require pull request review before merging (even solo, this forces a
  PR diff view before merge — a second look at what's changing)

This means even if you personally forget and try to push a secret
directly to `main`, the workflow you're about to see stops it.

## 2. Your day-to-day workflow

**Never commit straight to `main`.** Small habit, big payoff:
```bash
git checkout -b feature/upload-flow
# ... make changes ...
git add .
git status              # look before you commit, every time
git commit -m "Add presigned upload flow"
git push -u origin feature/upload-flow
```
Then open a PR on GitHub. The CI workflow runs `gitleaks` automatically
— if it finds anything that looks like a key, the check fails and you
get a red X before it ever reaches `main`, let alone gets seen publicly
in the default branch.

**If gitleaks flags a false positive** (e.g. a long random-looking test
UUID), add a narrow allowlist entry to `.gitleaks.toml` rather than
disabling the rule — keep the net as tight as possible.

## 3. What NEVER goes in a commit, ever

- Real values for `DATABASE_URL`, `AUTH_SECRET`, `GOOGLE_CLIENT_SECRET`,
  `KEYVAULT_SHARED_TOKEN`, `MASTER_KEY_B64`
- Any user's actual R2 access key or secret key (shouldn't ever be in
  your codebase at all — they live encrypted in Neon, never in files)
- Screenshots of your `.env.local` (easy to forget when sharing a
  screen or writing a bug report — crop or redact first)
- Database exports/dumps with real user rows, even for debugging
  (`user_storage_connections` ciphertext is safe-ish alone, but don't
  make a habit of it)

## 4. If a secret ever DOES leak into git history

Removing it from the latest commit is not enough — it's still in
history, and a public repo's full history is trivially cloneable.
Correct response, in order:

1. **Rotate the secret immediately** at the source (Google Cloud
   Console for OAuth secret, Neon dashboard for a new connection
   string/password, `wrangler secret put` for a new `MASTER_KEY_B64` or
   `SHARED_AUTH_TOKEN`, new R2 API token in Cloudflare). Rotating is
   what actually neutralizes the leak — rewriting history is cleanup
   *after* that, not a substitute for it.
2. Only after rotating: use `git filter-repo` (not the older
   `filter-branch`) to strip the secret from history, then
   force-push. Anyone who already cloned the repo still has the old
   secret in their local history, which is exactly why step 1 must
   happen first regardless of step 2.
3. If it was a user's R2 credential specifically (shouldn't be
   possible given the architecture, but if some bug ever caused it):
   also notify that user to rotate their own R2 API token in
   Cloudflare, since you can't force-rotate a secret that lives in
   their account.

## 5. Dependency hygiene

Public repos get scanned by bots looking for exploitable dependency
versions. GitHub's free **Dependabot** does this automatically for
public repos with zero setup — just confirm it's on: repo Settings ->
Code security -> enable "Dependabot alerts" and "Dependabot security
updates". It'll open PRs for you when a dependency has a known CVE;
those PRs also run through your CI same as any other.

## 6. What's actually safe to be public

Worth saying explicitly, since it's easy to feel like *everything*
needs hiding: the application source code, the database schema, the
Worker's logic, this documentation — all of it is fine to be public and
arguably better for it (people can audit the encryption design
themselves, which is a stronger trust signal than "trust me"). The only
things that must stay secret are the specific runtime values — the
actual keys, tokens, and connection strings — never the code that uses
them.
