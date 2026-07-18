import { auth, signIn, signOut } from "@/lib/auth";
import Link from "next/link";

// Class colors lifted directly from the original Colab verification tool
// (see the project's early annotation script) — reused here as the
// page's accent palette so the design language is literally drawn from
// the domain it serves, not a generic template choice.
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
            <form
              action={async () => {
                "use server";
                await signOut();
              }}
            >
              <button
                type="submit"
                className="text-xs text-[#6B7280] transition-colors hover:text-[#EDEDED]"
              >
                Sign out
              </button>
            </form>
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
        {/* Viewfinder / detection-box signature element: a bounding box
            with corner brackets, echoing the annotation UI itself,
            "detecting" the headline the way the tool detects objects. */}
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

        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
          className="mt-10"
        >
          <button
            type="submit"
            className="inline-flex items-center gap-3 rounded-md border border-white/15 bg-[#111318] px-5 py-3 text-sm font-medium text-[#EDEDED] transition-colors hover:border-[#FF6B35]/50 hover:bg-[#16181D]"
          >
            <GoogleMark />
            Sign in with Google
          </button>
        </form>

        <p className="mt-4 text-xs text-[#6B7280]">
          No account creation step — signing in creates your workspace.
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

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.59-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}
