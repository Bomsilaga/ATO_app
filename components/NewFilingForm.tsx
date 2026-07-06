"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { initTriageState } from "@/lib/triage-engine";

function currentAuFinancialYear(): string {
  const now = new Date();
  const year = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1; // FY starts July
  return `${year}-${String((year + 1) % 100).padStart(2, "0")}`;
}

function recentFinancialYears(count = 8): string[] {
  const [startYear] = currentAuFinancialYear().split("-");
  const start = parseInt(startYear, 10);
  return Array.from({ length: count }, (_, i) => {
    const y = start - i;
    return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
  });
}

export default function NewFilingForm({ userId }: { userId: string }) {
  const [name, setName] = useState("");
  const [financialYear, setFinancialYear] = useState(currentAuFinancialYear());
  const [occupation, setOccupation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  async function startFiling() {
    if (!name.trim()) {
      setError("Give this filing a name.");
      return;
    }
    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from("tax_sessions")
      .insert({
        user_id: userId,
        name: name.trim(),
        financial_year: financialYear,
        occupation: occupation || null,
        triage_state: initTriageState(),
        status: "in_progress"
      })
      .select()
      .single();

    setLoading(false);
    if (error) {
      setError(
        error.code === "23505" ? "You already have a filing with that name." : error.message
      );
      return;
    }
    router.push(`/session/${data.id}`);
  }

  return (
    <div className="card p-6">
      <h2 className="ledger-heading text-xl font-semibold mb-4">Start a new filing</h2>

      <label className="text-xs font-mono uppercase tracking-wide text-ink2">
        Filing name
      </label>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Sole trader return, Rental property amendment"
        className="mt-1 mb-4 w-full bg-transparent border-b border-line py-2 outline-none focus:border-ledger"
      />

      <label className="text-xs font-mono uppercase tracking-wide text-ink2">
        Financial year
      </label>
      <select
        value={financialYear}
        onChange={(e) => setFinancialYear(e.target.value)}
        className="mt-1 mb-4 w-full bg-transparent border-b border-line py-2 outline-none focus:border-ledger"
      >
        {recentFinancialYears().map((fy) => (
          <option key={fy} value={fy}>
            {fy}
          </option>
        ))}
      </select>

      <label className="text-xs font-mono uppercase tracking-wide text-ink2">
        Occupation (used to prompt occupation-specific deductions)
      </label>
      <input
        type="text"
        value={occupation}
        onChange={(e) => setOccupation(e.target.value)}
        placeholder="e.g. Civil Project Manager"
        className="mt-1 mb-6 w-full bg-transparent border-b border-line py-2 outline-none focus:border-ledger"
      />

      {error && <p className="mb-4 text-xs text-flag">{error}</p>}

      <button
        onClick={startFiling}
        disabled={loading}
        className="w-full bg-ledger text-paper py-2.5 rounded-md text-sm font-medium tracking-wide hover:bg-ledgerLight transition-colors disabled:opacity-50"
      >
        {loading ? "Starting…" : "Begin triage"}
      </button>
    </div>
  );
}
