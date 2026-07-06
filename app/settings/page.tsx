"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SettingsPage() {
  const [currentPin, setCurrentPin] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPin !== confirmPin) {
      setError("New PIN and confirmation don't match.");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/auth/credentials", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPin, newEmail, newPin })
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    setSuccess(true);
    setCurrentPin("");
    setNewPin("");
    setConfirmPin("");
  }

  return (
    <main className="min-h-screen px-6 py-12 max-w-md mx-auto">
      <button
        onClick={() => router.push("/dashboard")}
        className="text-xs font-mono uppercase tracking-wide text-ink/50 hover:text-ink mb-8"
      >
        ← Back to dashboard
      </button>

      <h1 className="ledger-heading text-2xl font-semibold mb-6">Change login</h1>

      <form onSubmit={handleSubmit} className="space-y-4 border border-line p-6 bg-white/40">
        <div>
          <label className="text-xs font-mono uppercase tracking-wide text-ink/60">
            Current PIN
          </label>
          <input
            type="password"
            inputMode="numeric"
            required
            value={currentPin}
            onChange={(e) => setCurrentPin(e.target.value)}
            className="mt-1 w-full bg-transparent border-b border-line py-2 outline-none focus:border-ledger"
          />
        </div>
        <div>
          <label className="text-xs font-mono uppercase tracking-wide text-ink/60">
            New email
          </label>
          <input
            type="email"
            required
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            className="mt-1 w-full bg-transparent border-b border-line py-2 outline-none focus:border-ledger"
          />
        </div>
        <div>
          <label className="text-xs font-mono uppercase tracking-wide text-ink/60">
            New PIN (4-8 digits)
          </label>
          <input
            type="password"
            inputMode="numeric"
            required
            minLength={4}
            maxLength={8}
            value={newPin}
            onChange={(e) => setNewPin(e.target.value)}
            className="mt-1 w-full bg-transparent border-b border-line py-2 outline-none focus:border-ledger"
          />
        </div>
        <div>
          <label className="text-xs font-mono uppercase tracking-wide text-ink/60">
            Confirm new PIN
          </label>
          <input
            type="password"
            inputMode="numeric"
            required
            minLength={4}
            maxLength={8}
            value={confirmPin}
            onChange={(e) => setConfirmPin(e.target.value)}
            className="mt-1 w-full bg-transparent border-b border-line py-2 outline-none focus:border-ledger"
          />
        </div>

        {error && <p className="text-sm text-flag">{error}</p>}
        {success && <p className="text-sm text-ledger">Login updated — use the new email/PIN next time you sign in.</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-ledger text-paper py-2.5 text-sm font-medium tracking-wide hover:bg-ledgerLight transition-colors disabled:opacity-50"
        >
          {loading ? "Saving…" : "Save"}
        </button>
      </form>
    </main>
  );
}
