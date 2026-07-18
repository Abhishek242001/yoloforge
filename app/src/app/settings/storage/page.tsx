"use client";

import { useState } from "react";
import Link from "next/link";

type ConnectResult = { success: true; bucketName: string; accessKeyIdMasked: string } | null;

export default function StorageSettingsPage() {
  const [accountId, setAccountId] = useState("");
  const [accessKeyId, setAccessKeyId] = useState("");
  const [secretAccessKey, setSecretAccessKey] = useState("");
  const [bucketName, setBucketName] = useState("");

  const [status, setStatus] = useState<"idle" | "testing" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<ConnectResult>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("testing");
    setErrorMessage(null);

    try {
      const res = await fetch("/api/storage/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, accessKeyId, secretAccessKey, bucketName }),
      });
      const data = await res.json();

      if (!res.ok) {
        setStatus("error");
        setErrorMessage(data.error ?? "Something went wrong. Please check your credentials and try again.");
        return;
      }

      setResult(data);
      setStatus("idle");
      // Clear the secret from the form the moment it's no longer needed —
      // it already left the browser once, no reason to keep it in state.
      setSecretAccessKey("");
    } catch {
      setStatus("error");
      setErrorMessage("Couldn't reach the server. Check your connection and try again.");
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-16 sm:px-10">
      <Link href="/" className="text-xs text-[#6B7280] transition-colors hover:text-[#EDEDED]">
        ← back
      </Link>

      <h1 className="mt-6 font-[family-name:var(--font-display)] text-2xl font-bold text-[#EDEDED]">
        Connect storage
      </h1>
      <p className="mt-2 max-w-lg text-sm leading-6 text-[#9CA3AF]">
        Link your own Cloudflare R2 bucket. Your access key is tested against
        the bucket immediately, then encrypted before it's stored — YOLOForge
        never keeps it in plain text, and it's never sent back to your
        browser after this step.
      </p>

      {result ? (
        <div className="mt-10 rounded-lg border border-[#22D3EE]/30 bg-[#0D1B1D] p-6">
          <p className="font-[family-name:var(--font-display)] text-xs uppercase tracking-wide text-[#22D3EE]">
            connected
          </p>
          <p className="mt-2 text-sm text-[#D1D5DB]">
            Bucket <span className="font-mono text-[#EDEDED]">{result.bucketName}</span> is
            linked, using key{" "}
            <span className="font-mono text-[#EDEDED]">{result.accessKeyIdMasked}</span>.
          </p>
          <Link
            href="/"
            className="mt-4 inline-block text-sm text-[#FF6B35] hover:underline"
          >
            Back to dashboard →
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-10 space-y-5">
          <Field
            label="Account ID"
            hint="Cloudflare dashboard → R2 → Overview, right-hand side"
            value={accountId}
            onChange={setAccountId}
            placeholder="a1b2c3d4e5f6..."
          />
          <Field
            label="Bucket name"
            hint="The bucket you created for this dataset storage"
            value={bucketName}
            onChange={setBucketName}
            placeholder="my-yoloforge-bucket"
          />
          <Field
            label="Access Key ID"
            hint="From an R2 API token with Object Read & Write"
            value={accessKeyId}
            onChange={setAccessKeyId}
            placeholder="a1b2c3d4e5f6g7h8"
          />
          <Field
            label="Secret Access Key"
            hint="Shown once when the token is created — copy it now"
            value={secretAccessKey}
            onChange={setSecretAccessKey}
            placeholder="••••••••••••••••••••••••••••"
            type="password"
          />

          {status === "error" && errorMessage && (
            <p className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {errorMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={status === "testing"}
            className="w-full rounded-md bg-[#FF6B35] px-5 py-3 text-sm font-semibold text-[#0A0B0D] transition-colors hover:bg-[#FF8055] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === "testing" ? "Testing connection…" : "Test and connect"}
          </button>
        </form>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-[#EDEDED]">{label}</span>
      <input
        type={type}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1.5 block w-full rounded-md border border-white/10 bg-[#111318] px-3.5 py-2.5 font-mono text-sm text-[#EDEDED] placeholder:text-[#4B5563] focus:border-[#FF6B35]/50 focus:outline-none focus:ring-1 focus:ring-[#FF6B35]/30"
      />
      <span className="mt-1 block text-xs text-[#6B7280]">{hint}</span>
    </label>
  );
}
