import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { pool } from "@/lib/db";
import { logAudit } from "@/lib/audit";

/**
 * Disconnects a user's R2 storage. This is a HARD DELETE of the
 * credential row — not a status flag — because leaving encrypted
 * credentials sitting around after a user asks to disconnect is a
 * needless retained liability. The user's actual files in their R2
 * bucket are untouched (it's their bucket); we just forget how to
 * reach it. Note-worthy in the confirmation UI: without valid
 * credentials, YOLOForge can no longer manage those files at all.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { rowCount } = await pool.query(
    `DELETE FROM user_storage_connections WHERE user_id = $1`,
    [session.user.id]
  );

  if (rowCount === 0) {
    return NextResponse.json({ error: "No connected storage found" }, { status: 404 });
  }

  await logAudit({
    userId: session.user.id,
    action: "storage.disconnected",
    resourceType: "user_storage_connections",
    ipAddress: req.headers.get("x-forwarded-for"),
  });

  return NextResponse.json({ success: true });
}
