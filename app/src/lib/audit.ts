import { pool } from "@/lib/db";

interface AuditEntry {
  userId: string | null;
  actor?: "user" | "system" | "admin";
  action: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}

/**
 * Writes one audit_log row. Call this synchronously (awaited) around every
 * credential decrypt and every destructive operation (delete image, delete
 * dataset, disconnect storage) — NOT fire-and-forget, so a failure to audit
 * is visible rather than silently dropped.
 *
 * NEVER pass secret material (keys, tokens) in `metadata` — it is stored
 * as plain JSONB, unencrypted, by design (it needs to be queryable).
 */
export async function logAudit(entry: AuditEntry): Promise<void> {
  await pool.query(
    `INSERT INTO audit_log (user_id, actor, action, resource_type, resource_id, metadata, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      entry.userId,
      entry.actor ?? "user",
      entry.action,
      entry.resourceType ?? null,
      entry.resourceId ?? null,
      JSON.stringify(entry.metadata ?? {}),
      entry.ipAddress ?? null,
    ]
  );
}
