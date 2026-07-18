/**
 * YOLOForge Key Vault — Cloudflare Worker
 * ============================================================
 * PURPOSE: This Worker is the ONLY place the master encryption key ever
 * exists. It is deliberately deployed as a separate service from the
 * Netlify app — so that a compromise of the Netlify app's environment
 * (env var leak, dependency compromise, misconfigured logging) does NOT
 * automatically hand over the key that unwraps every user's stored R2
 * credential.
 *
 * The Netlify app only ever sends this Worker an encrypted DEK (Data
 * Encryption Key — small, per-credential) and gets back the plaintext DEK.
 * It never sends or receives the R2 secret itself here — that decryption
 * happens locally in the Netlify app using the DEK this Worker returns.
 *
 * SECRETS THIS WORKER NEEDS (set via `wrangler secret put`, NEVER in this
 * file or wrangler.jsonc):
 *   MASTER_KEY_B64    — 32-byte AES-256 key, base64-encoded. Generate with:
 *                        openssl rand -base64 32
 *   SHARED_AUTH_TOKEN — long random string, must match what the Netlify
 *                       app sends as a Bearer token. Generate with:
 *                       openssl rand -hex 32
 *
 * This Worker deliberately does ONE thing (wrap/unwrap a DEK) and nothing
 * else. Keeping its surface area minimal is itself a security property —
 * less code here means less that can go wrong in the one place the master
 * key lives.
 */

export interface Env {
  MASTER_KEY_B64: string;
  SHARED_AUTH_TOKEN: string;
  // KV namespace for a lightweight, append-only decrypt audit log.
  // Not as strong a guarantee as AWS CloudTrail (whoever controls this
  // Worker's deploy could in principle stop writing to it), but it is
  // fully separate from the Netlify app's own logging, which is the
  // property we actually need: a Netlify-side compromise can't silently
  // suppress or forge these entries.
  AUDIT_LOG: KVNamespace;
}

function timingSafeEqual(a: string, b: string): boolean {
  // Constant-time comparison to avoid leaking token length/content via
  // response-time side channels on the auth check.
  const enc = new TextEncoder();
  const aBytes = enc.encode(a);
  const bBytes = enc.encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) diff |= aBytes[i] ^ bBytes[i];
  return diff === 0;
}

async function importMasterKey(masterKeyB64: string): Promise<CryptoKey> {
  const raw = Uint8Array.from(atob(masterKeyB64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function logEvent(env: Env, requestId: string, meta: Record<string, unknown>) {
  const entry = { requestId, at: new Date().toISOString(), ...meta };
  await env.AUDIT_LOG.put(`log:${Date.now()}:${requestId}`, JSON.stringify(entry), {
    expirationTtl: 60 * 60 * 24 * 90, // keep 90 days of audit history
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // --- Auth: every request must carry the shared token ---
    const authHeader = request.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!env.SHARED_AUTH_TOKEN || !timingSafeEqual(token, env.SHARED_AUTH_TOKEN)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }

    // --- Route: POST /wrap  { plaintextDekB64 } -> { wrappedDekB64, ivB64 } ---
    // Used once when a user connects (or reconnects) their R2 storage.
    if (url.pathname === "/wrap" && request.method === "POST") {
      try {
        const { plaintextDekB64, requestId } = (await request.json()) as {
          plaintextDekB64: string;
          requestId?: string;
        };
        const key = await importMasterKey(env.MASTER_KEY_B64);
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const dekBytes = Uint8Array.from(atob(plaintextDekB64), (c) => c.charCodeAt(0));
        const wrapped = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, dekBytes);

        await logEvent(env, requestId ?? crypto.randomUUID(), { op: "wrap" });

        return Response.json({
          wrappedDekB64: btoa(String.fromCharCode(...new Uint8Array(wrapped))),
          ivB64: btoa(String.fromCharCode(...iv)),
        });
      } catch {
        return Response.json({ error: "wrap_failed" }, { status: 400 });
      }
    }

    // --- Route: POST /unwrap  { wrappedDekB64, ivB64 } -> { plaintextDekB64 } ---
    // Called once per presigned-URL signing operation. This is the
    // security-critical path: it's the only place plaintext DEK material
    // is ever produced, and it happens inside this isolated Worker.
    if (url.pathname === "/unwrap" && request.method === "POST") {
      try {
        const { wrappedDekB64, ivB64, requestId, userIdHash } = (await request.json()) as {
          wrappedDekB64: string;
          ivB64: string;
          requestId?: string;
          userIdHash?: string; // caller sends a hash, not the raw user id, to keep logs low-sensitivity
        };
        const key = await importMasterKey(env.MASTER_KEY_B64);
        const iv = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0));
        const wrapped = Uint8Array.from(atob(wrappedDekB64), (c) => c.charCodeAt(0));
        const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, wrapped);

        const id = requestId ?? crypto.randomUUID();
        await logEvent(env, id, { op: "unwrap", userIdHash: userIdHash ?? null });

        return Response.json({
          plaintextDekB64: btoa(String.fromCharCode(...new Uint8Array(plaintext))),
        });
      } catch {
        // GCM auth-tag mismatch (tampered ciphertext) or bad input lands here.
        // Deliberately vague error to the caller — no internal detail leakage.
        return Response.json({ error: "unwrap_failed" }, { status: 400 });
      }
    }

    if (url.pathname === "/health") {
      return Response.json({ status: "ok" });
    }

    return new Response("Not found", { status: 404 });
  },
};
