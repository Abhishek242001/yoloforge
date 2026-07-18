import { randomBytes, createCipheriv, createDecipheriv, createHash } from "crypto";

/**
 * ENVELOPE ENCRYPTION for user-supplied R2 credentials — Key Vault edition.
 *
 * Same envelope-encryption shape as a managed KMS, but the master key is
 * held by a small, separate Cloudflare Worker (see /yoloforge-keyvault)
 * instead of AWS/GCP KMS. This was chosen to keep the whole stack free —
 * no billing account required — while still ensuring the master key does
 * NOT live in the same environment as this Next.js app.
 *
 *   1. Generate a random 256-bit DEK locally, in this app.
 *   2. Use the DEK to AES-256-GCM encrypt the R2 secret (local, fast).
 *   3. Send the DEK to the Worker's /wrap endpoint — it encrypts the DEK
 *      under its master key (which never leaves the Worker) and returns
 *      the wrapped DEK.
 *   4. Discard the plaintext DEK. Neon stores only: secret ciphertext +
 *      wrapped DEK. Neither the Netlify app's environment nor a Neon dump
 *      alone contains the master key.
 *
 * To decrypt later: send the wrapped DEK to the Worker's /unwrap endpoint,
 * get back the plaintext DEK, use it locally to decrypt the secret, then
 * let the DEK go out of scope immediately.
 *
 * Honest limitation vs. AWS/GCP KMS (documented so this tradeoff is never
 * forgotten): no HSM-backed key isolation, and the audit trail lives in
 * Worker KV rather than a third-party-audited log — see keyvault's
 * src/index.ts header comment for the full comparison.
 */

const KEYVAULT_URL = process.env.KEYVAULT_URL!; // e.g. https://yoloforge-keyvault.<subdomain>.workers.dev
const KEYVAULT_TOKEN = process.env.KEYVAULT_SHARED_TOKEN!; // must match the Worker's SHARED_AUTH_TOKEN secret

interface EncryptedField {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
}

interface EnvelopeEncryptResult {
  encryptedSecret: EncryptedField;
  encryptedAccessKeyId: EncryptedField;
  encryptedDek: Buffer; // wrapped DEK ciphertext, as returned by the Worker
  dekIv: Buffer; // IV the Worker used to wrap the DEK — needed to unwrap later
}

function aesEncrypt(plaintext: string, dek: Buffer): EncryptedField {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", dek, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { ciphertext, iv, authTag };
}

function aesDecrypt(field: EncryptedField, dek: Buffer): string {
  const decipher = createDecipheriv("aes-256-gcm", dek, field.iv);
  decipher.setAuthTag(field.authTag);
  const plaintext = Buffer.concat([decipher.update(field.ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}

/** Calls the key vault Worker to wrap a freshly generated plaintext DEK. */
async function wrapDek(plaintextDek: Buffer, requestId: string): Promise<{ wrapped: Buffer; iv: Buffer }> {
  const res = await fetch(`${KEYVAULT_URL}/wrap`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${KEYVAULT_TOKEN}` },
    body: JSON.stringify({ plaintextDekB64: plaintextDek.toString("base64"), requestId }),
  });
  if (!res.ok) throw new Error(`Key vault wrap failed: ${res.status}`);
  const { wrappedDekB64, ivB64 } = (await res.json()) as { wrappedDekB64: string; ivB64: string };
  return { wrapped: Buffer.from(wrappedDekB64, "base64"), iv: Buffer.from(ivB64, "base64") };
}

/** Calls the key vault Worker to unwrap a stored DEK back to plaintext. */
async function unwrapDek(wrappedDek: Buffer, dekIv: Buffer, requestId: string, userIdHash: string): Promise<Buffer> {
  const res = await fetch(`${KEYVAULT_URL}/unwrap`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${KEYVAULT_TOKEN}` },
    body: JSON.stringify({
      wrappedDekB64: wrappedDek.toString("base64"),
      ivB64: dekIv.toString("base64"),
      requestId,
      userIdHash,
    }),
  });
  if (!res.ok) throw new Error(`Key vault unwrap failed: ${res.status}`);
  const { plaintextDekB64 } = (await res.json()) as { plaintextDekB64: string };
  return Buffer.from(plaintextDekB64, "base64");
}

/**
 * Encrypts a user's R2 access key + secret key for storage.
 * Call this ONCE when a user connects (or reconnects) their storage.
 */
export async function encryptR2Credentials(
  accessKeyId: string,
  secretAccessKey: string,
  requestId: string
): Promise<EnvelopeEncryptResult> {
  const dek = randomBytes(32); // AES-256 key, generated locally

  const encryptedSecret = aesEncrypt(secretAccessKey, dek);
  const encryptedAccessKeyId = aesEncrypt(accessKeyId, dek);
  const { wrapped, iv: dekIv } = await wrapDek(dek, requestId);

  // dek goes out of scope here — not referenced again after this point.

  return { encryptedSecret, encryptedAccessKeyId, encryptedDek: wrapped, dekIv };
}

/**
 * Decrypts a user's R2 credentials for use in ONE presigned-URL signing
 * operation. Caller must NOT log, cache, or persist the returned values
 * beyond the immediate signing call. Every call should be paired with an
 * audit_log row (action: 'storage.credential_decrypted') in Neon, in
 * addition to the Worker's own independent KV log.
 */
export async function decryptR2Credentials(
  row: {
    encrypted_secret: Buffer;
    encryption_iv: Buffer;
    encryption_auth_tag: Buffer;
    encrypted_access_key_id: Buffer;
    access_key_iv: Buffer;
    access_key_auth_tag: Buffer;
    encrypted_dek: Buffer;
    dek_iv: Buffer;
  },
  userId: string,
  requestId: string
): Promise<{ accessKeyId: string; secretAccessKey: string }> {
  // Hash the user id before it leaves this app — the Worker's log should
  // never contain a directly identifying value, only a fingerprint an
  // operator with DB access could correlate if truly needed.
  const userIdHash = createHash("sha256").update(userId).digest("hex").slice(0, 16);

  const dek = await unwrapDek(row.encrypted_dek, row.dek_iv, requestId, userIdHash);

  const secretAccessKey = aesDecrypt(
    { ciphertext: row.encrypted_secret, iv: row.encryption_iv, authTag: row.encryption_auth_tag },
    dek
  );
  const accessKeyId = aesDecrypt(
    { ciphertext: row.encrypted_access_key_id, iv: row.access_key_iv, authTag: row.access_key_auth_tag },
    dek
  );

  return { accessKeyId, secretAccessKey };
}

/** Masks an access key for safe display: first/last 4 chars only. */
export function maskAccessKeyId(accessKeyId: string): string {
  if (accessKeyId.length <= 8) return "****";
  return `${accessKeyId.slice(0, 4)}${"*".repeat(accessKeyId.length - 8)}${accessKeyId.slice(-4)}`;
}
