import { auth, signOut } from "@/lib/auth";
import Link from "next/link";

// Class colors lifted directly from the original Colab verification tool
// — reused here as the page's accent palette so the design language is
// literally drawn from the domain it serves.
const CLASS_SWATCHES = [
  { hex: "#E61945", label: "Bogie" },
  { hex: "#3CB44B", label: "Spring" },
  { hex: "#FFE119", label: "Bearing" },
  { hex: "#0082C8", label: "Bolt" },
  { hex: "#F58230", label: "Handbrake" },
  { hex: "#911EB4", label: "Wheel" },
  { hex: "#46F0F0", label: "Empod" },
  { hex: "#F032E6", label: "Reservoir" },
];

export default async function Home() {
  const session = await auth();

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-white/10 px-6 py-5 sm:px-10">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <span className="font-[family-name:var(--font-display)] text-sm font-semibold tracking-[0.2em] text-[#EDEDED]">
            YOLO<span className="text-[#FF6B35]">FORGE</span>
          </span>
          {session?.user && (
            <div className="flex items-center gap-4">
              {session.user.role === "admin" && (
                <Link
                  href="/admin"
                  className="text-xs text-[#6B7280] transition-colors hover:text-[#EDEDED]"
                >
                  Admin
                </Link>
              )}
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/login" });
                }}
              >
                <button
                  type="submit"
                  className="text-xs text-[#6B7280] transition-colors hover:text-[#EDEDED]"
                >
                  Sign out
                </button>
              </form>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-6 py-20 sm:px-10">
        {session?.user ? (
          <SignedInView name={session.user.name} email={session.user.email} />
        ) : (
          <SignedOutView />
        )}
      </main>

      <footer className="border-t border-white/10 px-6 py-6 text-center sm:px-10">
        <p className="font-[family-name:var(--font-display)] text-[11px] tracking-wide text-[#6B7280]">
          storage lives in your own R2 bucket — nothing is stored on YOLOForge&apos;s servers
        </p>
      </footer>
    </div>
  );
}

function SignedOutView() {
  return (
    <div className="grid items-center gap-16 sm:grid-cols-[1.1fr_0.9fr]">
      <div>
        <div className="group relative inline-block">
          <span className="pointer-events-none absolute -left-3 -top-3 h-5 w-5 border-l-2 border-t-2 border-[#FF6B35] transition-all duration-500 group-hover:-left-4 group-hover:-top-4" />
          <span className="pointer-events-none absolute -right-3 -top-3 h-5 w-5 border-r-2 border-t-2 border-[#FF6B35] transition-all duration-500 group-hover:-right-4 group-hover:-top-4" />
          <span className="pointer-events-none absolute -bottom-3 -left-3 h-5 w-5 border-b-2 border-l-2 border-[#FF6B35] transition-all duration-500 group-hover:-bottom-4 group-hover:-left-4" />
          <span className="pointer-events-none absolute -bottom-3 -right-3 h-5 w-5 border-b-2 border-r-2 border-[#FF6B35] transition-all duration-500 group-hover:-bottom-4 group-hover:-right-4" />
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-bold leading-tight tracking-tight text-[#EDEDED] sm:text-5xl">
            Verify and label
            <br />
            YOLO datasets.
          </h1>
        </div>

        <p className="mt-6 max-w-md text-base leading-7 text-[#9CA3AF]">
          Review bounding-box annotations, correct misclassified objects, or
          draw new labels from scratch — backed entirely by storage you
          control.
        </p>

        <Link
          href="/login"
          className="mt-10 inline-flex items-center gap-2 rounded-md border border-white/15 bg-[#111318] px-5 py-3 text-sm font-medium text-[#EDEDED] transition-colors hover:border-[#FF6B35]/50 hover:bg-[#16181D]"
        >
          Sign in
        </Link>

        <p className="mt-4 text-xs text-[#6B7280]">
          Accounts are created by an administrator.
        </p>
      </div>

      <div className="rounded-lg border border-white/10 bg-[#111318] p-6">
        <p className="font-[family-name:var(--font-display)] text-[11px] uppercase tracking-[0.15em] text-[#6B7280]">
          class legend — reference
        </p>
        <ul className="mt-4 space-y-2.5">
          {CLASS_SWATCHES.map((c, i) => (
            <li key={c.label} className="flex items-center gap-3 text-sm">
              <span className="font-[family-name:var(--font-display)] w-4 text-[11px] text-[#6B7280]">
                {i}
              </span>
              <span
                className="h-3 w-3 shrink-0 rounded-sm"
                style={{ backgroundColor: c.hex }}
              />
              <span className="text-[#D1D5DB]">{c.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function SignedInView({
  name,
  email,
}: {
  name?: string | null;
  email?: string | null;
}) {
  return (
    <div>
      <p className="font-[family-name:var(--font-display)] text-[11px] uppercase tracking-[0.15em] text-[#6B7280]">
        signed in
      </p>
      <h1 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-bold text-[#EDEDED]">
        Welcome back{name ? `, ${name.split(" ")[0]}` : ""}.
      </h1>
      <p className="mt-2 text-sm text-[#6B7280]">{email}</p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <Link
          href="/settings/storage"
          className="rounded-lg border border-white/10 bg-[#111318] p-6 transition-colors hover:border-[#FF6B35]/40"
        >
          <p className="font-[family-name:var(--font-display)] text-xs uppercase tracking-wide text-[#6B7280]">
            step 1
          </p>
          <p className="mt-2 text-base font-medium text-[#EDEDED]">
            Connect storage
          </p>
          <p className="mt-1 text-sm text-[#9CA3AF]">
            Link your own Cloudflare R2 bucket to hold datasets.
          </p>
        </Link>

        <div className="rounded-lg border border-white/5 bg-[#0D0F13] p-6 opacity-50">
          <p className="font-[family-name:var(--font-display)] text-xs uppercase tracking-wide text-[#6B7280]">
            step 2
          </p>
          <p className="mt-2 text-base font-medium text-[#EDEDED]">
            Upload a dataset
          </p>
          <p className="mt-1 text-sm text-[#9CA3AF]">Coming soon.</p>
        </div>
      </div>
    </div>
  );
}
