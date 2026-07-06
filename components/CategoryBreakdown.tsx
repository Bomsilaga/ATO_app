"use client";

import { TaxRecord } from "@/lib/types";
import { getCategoryByCode } from "@/lib/taxonomy";

// Part-to-whole by category, ranked by magnitude — a single accent hue with
// length carrying the value, rather than a categorical palette per slice
// (the categories aren't the subject here, their relative size is).
export default function CategoryBreakdown({ records }: { records: TaxRecord[] }) {
  const totals = new Map<string, number>();
  for (const r of records) {
    if (r.status !== "confirmed" || !r.category_code) continue;
    const amount = Math.abs(r.extracted.amount ?? 0);
    if (amount === 0) continue;
    totals.set(r.category_code, (totals.get(r.category_code) ?? 0) + amount);
  }

  const rows = Array.from(totals.entries())
    .map(([code, amount]) => ({ code, amount, label: getCategoryByCode(code)?.label ?? code }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 8);

  if (rows.length === 0) {
    return <p className="text-xs text-ink2">No confirmed amounts yet.</p>;
  }

  const max = rows[0].amount;

  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.code}>
          <div className="flex items-baseline justify-between gap-2 mb-1">
            <span className="text-xs text-ink truncate">
              {row.code} · {row.label}
            </span>
            <span className="text-xs font-mono text-ink2 shrink-0">
              ${row.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          </div>
          <div className="meter-track h-1.5 w-full">
            <div
              className="meter-fill h-full"
              style={{ width: `${Math.max(4, (row.amount / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
