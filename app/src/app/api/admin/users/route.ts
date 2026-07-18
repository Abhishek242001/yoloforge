import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hash } from "bcryptjs";
import { auth } from "@/lib/auth";
import { pool } from "@/lib/db";
import { logAudit } from "@/lib/audit";

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1).optional(),
  role: z.enum(["admin", "user"]).default("user"),
});

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authenticated", status: 401 as const };
  if (session.user.role !== "admin") return { error: "Admin access required", status: 403 as const };
  return { session };
}

export async function GET() {
  const check = await requireAdmin();
  if ("error" in check) return NextResponse.json({ error: check.error }, { status: check.status });

  const { rows } = await pool.query(
    `SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC`
  );
  return NextResponse.json({ users: rows });
}

export async function POST(req: NextRequest) {
  const check = await requireAdmin();
  if ("error" in check) return NextResponse.json({ error: check.error }, { status: check.status });

  const body = await req.json();
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { email, password, name, role } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();

  const existing = await pool.query(`SELECT id FROM users WHERE email = $1`, [normalizedEmail]);
  if (existing.rows.length > 0) {
    return NextResponse.json({ error: "A user with that email already exists" }, { status: 409 });
  }

  const passwordHash = await hash(password, 12);

  const { rows } = await pool.query(
    `INSERT INTO users (email, name, role, password_hash, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, email, name, role, created_at`,
    [normalizedEmail, name ?? null, role, passwordHash, check.session.user.id]
  );

  await logAudit({
    userId: check.session.user.id,
    actor: "admin",
    action: "user.created",
    resourceType: "users",
    resourceId: rows[0].id,
    metadata: { email: normalizedEmail, role },
    ipAddress: req.headers.get("x-forwarded-for"),
  });

  return NextResponse.json({ user: rows[0] }, { status: 201 });
}
