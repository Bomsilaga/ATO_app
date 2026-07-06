"use client";

import { useState } from "react";
import { TriageNodeState } from "@/lib/types";
import { getCategoryByCode } from "@/lib/taxonomy";

interface Props {
  sessionId: string;
  batch: TriageNodeState[];
  onAnswered: (code: string, applies: boolean) => void;
}

export default function CategoryTriage({ sessionId, batch, onAnswered }: Props) {
  const [submitting, setSubmitting] = useState<string | null>(null);

  async function answer(code: string, applies: boolean) {
    setSubmitting(code);
    const res = await fetch("/api/sessions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, code, applies })
    });
    setSubmitting(null);
    if (res.ok) onAnswered(code, applies);
  }

  if (batch.length === 0) {
    return (
      <p className="text-sm text-ink/60">
        Triage complete — every category has been checked.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {batch.map((node) => {
        const category = getCategoryByCode(node.code);
        if (!category) return null;
        return (
          <div key={node.code} className="hairline pb-4">
            <span className="code-tag">{category.code}</span>
            <p className="mt-2 text-sm text-ink">{category.triage_prompt}</p>
            <div className="mt-3 flex gap-2">
              <button
                disabled={submitting === node.code}
                onClick={() => answer(node.code, true)}
                className="px-4 py-1.5 text-xs font-mono uppercase tracking-wide border border-ledger text-ledger hover:bg-ledger hover:text-paper transition-colors disabled:opacity-50"
              >
                Yes
              </button>
              <button
                disabled={submitting === node.code}
                onClick={() => answer(node.code, false)}
                className="px-4 py-1.5 text-xs font-mono uppercase tracking-wide border border-line text-ink/60 hover:border-ink hover:text-ink transition-colors disabled:opacity-50"
              >
                No
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
