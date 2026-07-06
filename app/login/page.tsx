"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`
      }
    });

    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
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

        {sent ? (
          <div className="hairline pb-4">
            <p className="text-sm text-ink">
              Check <strong>{email}</strong> for a sign-in link.
            </p>
          </div>
        ) : (
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
            {error && <p className="text-sm text-flag">{error}</p>}
            <button
              type="submit"
              className="w-full bg-ledger text-paper py-2.5 text-sm font-medium tracking-wide hover:bg-ledgerLight transition-colors"
            >
              Send sign-in link
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
