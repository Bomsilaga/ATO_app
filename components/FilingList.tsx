"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface FilingRow {
  id: string;
  name: string;
  financial_year: string;
  status: string;
}

export default function FilingList({ filings }: { filings: FilingRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function deleteFiling(filing: FilingRow) {
    if (
      !confirm(
        `Delete "${filing.name}" (FY ${filing.financial_year}) and ALL its records, guidance, and reports? This can't be undone.`
      )
    )
      return;
    setBusy(filing.id);
    await fetch(`/api/sessions?id=${filing.id}`, { method: "DELETE" });
    setBusy(null);
    router.refresh();
  }

  if (filings.length === 0) {
    return (
      <p className="text-sm text-ink2">
        No filings started yet. Name one and pick a financial year to begin.
      </p>
    );
  }

  return (
    <ul className="space-y-1">
      {filings.map((s) => (
        <li key={s.id} className="flex items-center gap-2 hairline -mx-2 px-2 rounded-md hover:bg-paper transition-colors">
          <Link href={`/session/${s.id}`} className="flex-1 min-w-0 py-3">
            <p className="text-sm text-ink truncate">{s.name}</p>
            <p className="text-xs text-ink2 font-mono">
              FY {s.financial_year} · <span className="capitalize">{s.status.replace(/_/g, " ")}</span>
            </p>
          </Link>
          <Link
            href={`/session/${s.id}`}
            className="text-xs font-mono uppercase tracking-wide text-ledger shrink-0"
          >
            Open →
          </Link>
          <button
            onClick={() => deleteFiling(s)}
            disabled={busy === s.id}
            title="Delete this filing and everything in it"
            className="text-xs font-mono uppercase tracking-wide text-ink2 hover:text-flag shrink-0 px-1 disabled:opacity-40"
          >
            ✕
          </button>
        </li>
      ))}
    </ul>
  );
}
