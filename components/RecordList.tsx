"use client";

import { useState } from "react";
import { TaxRecord } from "@/lib/types";
import { ATO_CATEGORIES } from "@/lib/taxonomy";

export default function RecordList({
  records,
  onChanged
}: {
  records: TaxRecord[];
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  async function patch(recordId: string, payload: Record<string, unknown>) {
    setBusy(recordId);
    await fetch("/api/records", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recordId, ...payload })
    });
    setBusy(null);
    onChanged();
  }

  if (records.length === 0) {
    return <p className="text-sm text-ink/60">No records yet — add text or upload a file above.</p>;
  }

  return (
    <ul className="space-y-3">
      {records.map((r) => (
        <li key={r.id} className="hairline pb-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <p className="text-sm text-ink">{r.extracted.description || r.raw_input}</p>
              <p className="text-xs text-ink/50 mt-1 font-mono">
                {r.extracted.amount !== undefined ? `$${r.extracted.amount}` : "no amount"} ·{" "}
                {r.extracted.date ?? "no date"} · {r.status}
              </p>
            </div>
            <select
              value={r.category_code ?? ""}
              onChange={(e) => patch(r.id, { categoryCode: e.target.value })}
              className="text-xs font-mono border border-line px-2 py-1 bg-transparent"
            >
              <option value="">Uncategorised</option>
              {ATO_CATEGORIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code}
                </option>
              ))}
            </select>
          </div>
          {r.status !== "confirmed" && (
            <div className="mt-2 flex gap-2">
              <button
                disabled={busy === r.id || !r.category_code}
                onClick={() => patch(r.id, { status: "confirmed" })}
                className="px-3 py-1 text-xs font-mono uppercase border border-ledger text-ledger hover:bg-ledger hover:text-paper disabled:opacity-40"
              >
                Confirm
              </button>
              <button
                disabled={busy === r.id}
                onClick={() => patch(r.id, { status: "excluded" })}
                className="px-3 py-1 text-xs font-mono uppercase border border-line text-ink/50 hover:border-flag hover:text-flag"
              >
                Exclude
              </button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
