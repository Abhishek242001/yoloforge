"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");

    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (res?.error) {
      setStatus("error");
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-16">
      <span className="font-[family-name:var(--font-display)] text-sm font-semibold tracking-[0.2em] text-[#EDEDED]">
        YOLO<span className="text-[#FF6B35]">FORGE</span>
      </span>

      <h1 className="mt-8 font-[family-name:var(--font-display)] text-xl font-bold text-[#EDEDED]">
        Sign in
      </h1>
      <p className="mt-1 text-sm text-[#6B7280]">
        Accounts are created by an administrator.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-[#EDEDED]">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1.5 block w-full rounded-md border border-white/10 bg-[#111318] px-3.5 py-2.5 text-sm text-[#EDEDED] focus:border-[#FF6B35]/50 focus:outline-none focus:ring-1 focus:ring-[#FF6B35]/30"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-[#EDEDED]">Password</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1.5 block w-full rounded-md border border-white/10 bg-[#111318] px-3.5 py-2.5 text-sm text-[#EDEDED] focus:border-[#FF6B35]/50 focus:outline-none focus:ring-1 focus:ring-[#FF6B35]/30"
          />
        </label>

        {status === "error" && (
          <p className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            Incorrect email or password.
          </p>
        )}

        <button
          type="submit"
          disabled={status === "submitting"}
          className="w-full rounded-md bg-[#FF6B35] px-5 py-3 text-sm font-semibold text-[#0A0B0D] transition-colors hover:bg-[#FF8055] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === "submitting" ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="mt-6 text-xs text-[#6B7280]">
        Sessions last 48 hours, then you&apos;ll need to sign in again.
      </p>
    </div>
  );
}
