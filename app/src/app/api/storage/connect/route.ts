import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { auth } from "@/lib/auth";
import { pool } from "@/lib/db";
import { encryptR2Credentials, maskAccessKeyId } from "@/lib/crypto";
import { logAudit } from "@/lib/audit";

const connectSchema = z.object({
  accountId: z.string().min(1, "Cloudflare Account ID is required"),
  accessKeyId: z.string().min(1, "Access Key ID is required"),
  secretAccessKey: z.string().min(1, "Secret Access Key is required"),
  bucketName: z.string().min(1, "Bucket name is required"),
});

/**
 * Connects a user's own Cloudflare R2 bucket to their YOLOForge account.
 *
 * Security flow:
 *   1. Validate input shape.
 *   2. LIVE TEST the credentials against R2 (PutObject + DeleteObject of a
 *      throwaway probe file) BEFORE persisting anything — bad credentials
 *      are rejected immediately with a clear error, not discovered later
 *      on first real upload.
 *   3. Only on success: envelope-encrypt both the secret and access key,
 *      upsert the connection row, and write an audit log entry.
 *   4. The plaintext secret is never logged and never returned in the
 *      response — only the masked access key ID goes back to the client.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = connectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { accountId, accessKeyId, secretAccessKey, bucketName } = parsed.data;

  // --- Step 1: live probe against the user's actual bucket ---
  const probeClient = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  const probeKey = `_yoloforge_connection_test_${Date.now()}.txt`;
  try {
    await probeClient.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: probeKey,
        Body: "YOLOForge connection test — safe to delete.",
        ContentType: "text/plain",
      })
    );
    await probeClient.send(new DeleteObjectCommand({ Bucket: bucketName, Key: probeKey }));
  } catch (err) {
    await logAudit({
      userId: session.user.id,
      action: "storage.connection_failed",
      resourceType: "user_storage_connections",
      metadata: { reason: "probe_failed", bucketName, error: err instanceof Error ? err.message : "unknown" },
      ipAddress: req.headers.get("x-forwarded-for"),
    });
    return NextResponse.json(
      {
        error:
          "Could not write to that bucket with the provided credentials. Check the Account ID, keys, bucket name, and that the API token has Object Read & Write permission.",
      },
      { status: 422 }
    );
  }

  // --- Step 2: credentials proven valid — now encrypt (via key vault Worker) and persist ---
  const requestId = crypto.randomUUID();
  const { encryptedSecret, encryptedAccessKeyId, encryptedDek, dekIv } = await encryptR2Credentials(
    accessKeyId,
    secretAccessKey,
    requestId
  );

  // 500 MB soft cap per person for this personal-project deployment.
  const QUOTA_BYTES = 524_288_000;

  await pool.query(
    `INSERT INTO user_storage_connections (
       user_id, r2_account_id, r2_bucket_name, access_key_id_masked,
       encrypted_secret, encryption_iv, encryption_auth_tag,
       encrypted_access_key_id, access_key_iv, access_key_auth_tag,
       encrypted_dek, dek_iv, quota_bytes, status, last_verified_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'active',now(),now())
     ON CONFLICT (user_id) DO UPDATE SET
       r2_account_id = EXCLUDED.r2_account_id,
       r2_bucket_name = EXCLUDED.r2_bucket_name,
       access_key_id_masked = EXCLUDED.access_key_id_masked,
       encrypted_secret = EXCLUDED.encrypted_secret,
       encryption_iv = EXCLUDED.encryption_iv,
       encryption_auth_tag = EXCLUDED.encryption_auth_tag,
       encrypted_access_key_id = EXCLUDED.encrypted_access_key_id,
       access_key_iv = EXCLUDED.access_key_iv,
       access_key_auth_tag = EXCLUDED.access_key_auth_tag,
       encrypted_dek = EXCLUDED.encrypted_dek,
       dek_iv = EXCLUDED.dek_iv,
       status = 'active',
       last_verified_at = now(),
       updated_at = now()`,
    [
      session.user.id,
      accountId,
      bucketName,
      maskAccessKeyId(accessKeyId),
      encryptedSecret.ciphertext,
      encryptedSecret.iv,
      encryptedSecret.authTag,
      encryptedAccessKeyId.ciphertext,
      encryptedAccessKeyId.iv,
      encryptedAccessKeyId.authTag,
      encryptedDek,
      dekIv,
      QUOTA_BYTES,
    ]
  );

  await logAudit({
    userId: session.user.id,
    action: "storage.connected",
    resourceType: "user_storage_connections",
    metadata: { bucketName, accountId },
    ipAddress: req.headers.get("x-forwarded-for"),
  });

  return NextResponse.json({
    success: true,
    bucketName,
    accessKeyIdMasked: maskAccessKeyId(accessKeyId),
  });
}
