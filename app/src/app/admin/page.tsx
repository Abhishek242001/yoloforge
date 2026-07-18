"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: "admin" | "user";
  created_at: string;
}

export default function AdminPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "user">("user");
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createdCreds, setCreatedCreds] = useState<{ email: string; password: string } | null>(null);

  async function loadUsers() {
    setLoading(true);
    const res = await fetch("/api/admin/users");
    if (res.ok) {
      const data = await res.json();
      setUsers(data.users);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setErrorMessage(null);

    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name: name || undefined, role }),
    });
    const data = await res.json();

    if (!res.ok) {
      setStatus("error");
      setErrorMessage(data.error ?? "Failed to create user.");
      return;
    }

    setCreatedCreds({ email, password });
    setEmail("");
    setName("");
    setPassword("");
    setRole("user");
    setStatus("idle");
    loadUsers();
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-16 sm:px-10">
      <Link href="/" className="text-xs text-[#6B7280] transition-colors hover:text-[#EDEDED]">
        ← back
      </Link>

      <h1 className="mt-6 font-[family-name:var(--font-display)] text-2xl font-bold text-[#EDEDED]">
        Admin
      </h1>
      <p className="mt-2 text-sm text-[#9CA3AF]">Create and manage user accounts.</p>

      {createdCreds && (
        <div className="mt-8 rounded-lg border border-[#22D3EE]/30 bg-[#0D1B1D] p-5">
          <p className="font-[family-name:var(--font-display)] text-xs uppercase tracking-wide text-[#22D3EE]">
            user created — share these credentials now
          </p>
          <p className="mt-2 text-sm text-[#D1D5DB]">
            This password won&apos;t be shown again after you leave this page.
          </p>
          <div className="mt-3 space-y-1 font-mono text-sm text-[#EDEDED]">
            <p>Email: {createdCreds.email}</p>
            <p>Password: {createdCreds.password}</p>
          </div>
          <button
            onClick={() => setCreatedCreds(null)}
            className="mt-3 text-xs text-[#6B7280] hover:text-[#EDEDED]"
          >
            Dismiss
          </button>
        </div>
      )}

      <form onSubmit={handleCreate} className="mt-8 space-y-4 rounded-lg border border-white/10 bg-[#111318] p-6">
        <p className="font-[family-name:var(--font-display)] text-xs uppercase tracking-wide text-[#6B7280]">
          create a user
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-[#EDEDED]">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5 block w-full rounded-md border border-white/10 bg-[#0A0B0D] px-3.5 py-2.5 text-sm text-[#EDEDED] focus:border-[#FF6B35]/50 focus:outline-none focus:ring-1 focus:ring-[#FF6B35]/30"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-[#EDEDED]">Name (optional)</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1.5 block w-full rounded-md border border-white/10 bg-[#0A0B0D] px-3.5 py-2.5 text-sm text-[#EDEDED] focus:border-[#FF6B35]/50 focus:outline-none focus:ring-1 focus:ring-[#FF6B35]/30"
            />
          </label>
        </div>

        <label className="block">
          <span className="text-sm font-medium text-[#EDEDED]">Password</span>
          <input
            type="text"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            className="mt-1.5 block w-full rounded-md border border-white/10 bg-[#0A0B0D] px-3.5 py-2.5 font-mono text-sm text-[#EDEDED] placeholder:text-[#4B5563] focus:border-[#FF6B35]/50 focus:outline-none focus:ring-1 focus:ring-[#FF6B35]/30"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-[#EDEDED]">Role</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "admin" | "user")}
            className="mt-1.5 block w-full rounded-md border border-white/10 bg-[#0A0B0D] px-3.5 py-2.5 text-sm text-[#EDEDED] focus:border-[#FF6B35]/50 focus:outline-none focus:ring-1 focus:ring-[#FF6B35]/30"
          >
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </label>

        {status === "error" && errorMessage && (
          <p className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {errorMessage}
          </p>
        )}

        <button
          type="submit"
          disabled={status === "submitting"}
          className="rounded-md bg-[#FF6B35] px-5 py-2.5 text-sm font-semibold text-[#0A0B0D] transition-colors hover:bg-[#FF8055] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === "submitting" ? "Creating…" : "Create user"}
        </button>
      </form>

      <div className="mt-10">
        <p className="font-[family-name:var(--font-display)] text-xs uppercase tracking-wide text-[#6B7280]">
          existing users
        </p>
        {loading ? (
          <p className="mt-4 text-sm text-[#6B7280]">Loading…</p>
        ) : (
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-[#6B7280]">
                <th className="pb-2 font-normal">Email</th>
                <th className="pb-2 font-normal">Name</th>
                <th className="pb-2 font-normal">Role</th>
                <th className="pb-2 font-normal">Created</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-white/5">
                  <td className="py-2.5 font-mono text-[#EDEDED]">{u.email}</td>
                  <td className="py-2.5 text-[#9CA3AF]">{u.name ?? "—"}</td>
                  <td className="py-2.5">
                    <span
                      className={`rounded px-2 py-0.5 text-xs ${
                        u.role === "admin"
                          ? "bg-[#FF6B35]/15 text-[#FF6B35]"
                          : "bg-white/5 text-[#9CA3AF]"
                      }`}
                    >
                      {u.role}
                    </span>
                  </td>
                  <td className="py-2.5 text-[#6B7280]">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
