"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { pinToPassword } from "@/lib/auth-credentials";

export default function LoginPage() {
  const [email, setEmail] = useState("ipaliboboma@gmail.com");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: pinToPassword(pin)
    });

    setLoading(false);
    if (error) {
      setError("Incorrect email or PIN.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <span className="code-tag">Q1–Q24 · D1–D15 · T1–T9</span>
          <h1 className="ledger-heading text-3xl mt-3 font-semibold text-ink">
            ATO Triage
          </h1>
          <p className="text-sm text-ink/60 mt-1">
            Every label, checked. Nothing assumed.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-mono uppercase tracking-wide text-ink/60">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full bg-transparent border-b border-line py-2 text-ink focus:border-ledger outline-none"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="text-xs font-mono uppercase tracking-wide text-ink/60">
              PIN
            </label>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              required
              minLength={4}
              maxLength={8}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="mt-1 w-full bg-transparent border-b border-line py-2 text-ink focus:border-ledger outline-none tracking-widest"
              placeholder="••••"
            />
          </div>
          {error && <p className="text-sm text-flag">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-ledger text-paper py-2.5 text-sm font-medium tracking-wide hover:bg-ledgerLight transition-colors disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}
