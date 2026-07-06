"use client";

import { PrefillLabel } from "@/lib/types";

export default function PrefillReport({
  labels,
  summary,
  agentFlags,
  disclaimer
}: {
  labels: PrefillLabel[];
  summary: string;
  agentFlags: string[];
  disclaimer: string;
}) {
  return (
    <div className="border border-line p-6 bg-white/40 space-y-6">
      <div>
        <span className="code-tag">PRE-FILL OUTPUT</span>
        <h3 className="ledger-heading text-lg font-semibold mt-2">Label-mapped summary</h3>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="hairline text-left text-xs font-mono uppercase text-ink/50">
            <th className="pb-2">Label</th>
            <th className="pb-2">Description</th>
            <th className="pb-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {labels.map((l) => (
            <tr key={l.question_code} className="hairline">
              <td className="py-2 font-mono">
                {l.question_code}
                {l.agent_review_recommended && (
                  <span className="ml-2 text-flag text-xs">⚑ agent review</span>
                )}
              </td>
              <td className="py-2">{l.label}</td>
              <td className="py-2 text-right font-mono">
                ${l.amount.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {agentFlags.length > 0 && (
        <div>
          <p className="text-xs font-mono uppercase tracking-wide text-flag mb-2">
            Flagged for review
          </p>
          <ul className="text-sm space-y-1 list-disc list-inside text-ink/80">
            {agentFlags.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-ink/50 border-t border-line pt-4">{disclaimer}</p>
    </div>
  );
}
