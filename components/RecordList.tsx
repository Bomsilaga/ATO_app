"use client";

import { useState } from "react";
import { TaxRecord } from "@/lib/types";
import { ATO_CATEGORIES, getCategoryByCode } from "@/lib/taxonomy";
import Meter from "./Meter";
import StatusBadge from "./StatusBadge";

const SOURCE_LABEL: Record<TaxRecord["source"], string> = {
  text: "Chat",
  file: "File upload",
  csv: "Spreadsheet",
  api: "API",
  manual: "Manual entry"
};

export default function RecordList({
  records,
  onChanged
}: {
  records: TaxRecord[];
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ description: string; amount: string; date: string; taxWithheld: string }>({
    description: "",
    amount: "",
    date: "",
    taxWithheld: ""
  });

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

  function startEdit(r: TaxRecord) {
    setEditingId(r.id);
    setDraft({
      description: r.extracted.description ?? "",
      amount: r.extracted.amount !== undefined ? String(r.extracted.amount) : "",
      date: r.extracted.date ?? "",
      taxWithheld: r.extracted.tax_withheld !== undefined ? String(r.extracted.tax_withheld) : ""
    });
  }

  async function saveEdit(recordId: string) {
    const amount = parseFloat(draft.amount);
    const taxWithheld = parseFloat(draft.taxWithheld);
    await patch(recordId, {
      extracted: {
        description: draft.description,
        amount: isNaN(amount) ? undefined : amount,
        date: draft.date || undefined,
        tax_withheld: isNaN(taxWithheld) ? undefined : taxWithheld
      }
    });
    setEditingId(null);
  }

  if (records.length === 0) {
    return <p className="text-sm text-ink2">No records yet — chat, add manually, or upload a file above.</p>;
  }

  return (
    <ul className="space-y-3">
      {records.map((r) => {
        const category = r.category_code ? getCategoryByCode(r.category_code) : undefined;
        const isOpen = expanded === r.id;

        const isEditing = editingId === r.id;

        return (
          <li key={r.id} className="card p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                {isEditing ? (
                  <div className="space-y-2">
                    <input
                      value={draft.description}
                      onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                      placeholder="Description"
                      className="w-full text-sm border border-line rounded-md px-2 py-1 bg-paper outline-none focus:border-ledger"
                    />
                    <div className="flex gap-2">
                      <input
                        type="number"
                        step="0.01"
                        value={draft.amount}
                        onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))}
                        placeholder="Amount"
                        className="w-28 text-xs font-mono border border-line rounded-md px-2 py-1 bg-paper outline-none focus:border-ledger"
                      />
                      <input
                        type="date"
                        value={draft.date}
                        onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
                        className="text-xs font-mono border border-line rounded-md px-2 py-1 bg-paper outline-none focus:border-ledger"
                      />
                      {r.record_type === "income" && (
                        <input
                          type="number"
                          step="0.01"
                          value={draft.taxWithheld}
                          onChange={(e) => setDraft((d) => ({ ...d, taxWithheld: e.target.value }))}
                          placeholder="Tax withheld"
                          className="w-28 text-xs font-mono border border-line rounded-md px-2 py-1 bg-paper outline-none focus:border-ledger"
                        />
                      )}
                      <button
                        onClick={() => saveEdit(r.id)}
                        disabled={busy === r.id}
                        className="px-3 py-1 text-xs font-mono uppercase border border-ledger text-ledger rounded-md hover:bg-ledger hover:text-paper"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="px-3 py-1 text-xs font-mono uppercase border border-line text-ink2 rounded-md hover:text-ink"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-ink truncate">{r.extracted.description || r.raw_input}</p>
                    <p className="text-xs text-ink2 mt-1 font-mono">
                      {r.extracted.amount !== undefined ? `$${r.extracted.amount.toLocaleString()}` : "no amount"} ·{" "}
                      {r.extracted.date ?? "no date"}
                      {category ? ` · ${category.code}` : ""}
                      {r.record_type === "income" &&
                        (r.extracted.tax_withheld
                          ? ` · $${r.extracted.tax_withheld.toLocaleString()} withheld`
                          : " · no tax withheld recorded")}
                      <button
                        onClick={() => startEdit(r)}
                        className="ml-2 text-ink2 hover:text-ledger underline underline-offset-2"
                      >
                        edit
                      </button>
                    </p>
                  </>
                )}
              </div>
              <StatusBadge status={r.status} />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <select
                value={r.category_code ?? ""}
                onChange={(e) => {
                  const nextCode = e.target.value;
                  const payload: Record<string, unknown> = { categoryCode: nextCode };
                  if (!r.record_type) {
                    const questionType = nextCode ? getCategoryByCode(nextCode)?.question_type : undefined;
                    if (questionType === "income") payload.recordType = "income";
                    if (questionType === "deduction") payload.recordType = "expense";
                  }
                  patch(r.id, payload);
                }}
                className="text-xs font-mono border border-line rounded-md px-2 py-1 bg-surface text-ink"
              >
                <option value="">Uncategorised</option>
                {ATO_CATEGORIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.label}
                  </option>
                ))}
              </select>

              <div className="flex rounded-md border border-line overflow-hidden text-xs font-mono uppercase tracking-wide">
                <button
                  disabled={busy === r.id}
                  onClick={() => patch(r.id, { recordType: "income" })}
                  className={`px-2 py-1 ${
                    r.record_type === "income" ? "bg-good text-paper" : "text-ink2 hover:text-ink"
                  }`}
                >
                  Income
                </button>
                <button
                  disabled={busy === r.id}
                  onClick={() => patch(r.id, { recordType: "expense" })}
                  className={`px-2 py-1 border-l border-line ${
                    r.record_type === "expense" ? "bg-flag text-paper" : "text-ink2 hover:text-ink"
                  }`}
                >
                  Expense
                </button>
              </div>

              <button
                onClick={() => setExpanded(isOpen ? null : r.id)}
                className="text-xs font-mono uppercase tracking-wide text-ink2 hover:text-ink"
              >
                {isOpen ? "Hide details ▲" : "How was this determined? ▼"}
              </button>

              {r.status !== "confirmed" && (
                <div className="flex gap-2 ml-auto">
                  <button
                    disabled={busy === r.id || !r.category_code}
                    onClick={() => patch(r.id, { status: "confirmed" })}
                    className="px-3 py-1 text-xs font-mono uppercase border border-ledger text-ledger rounded-md hover:bg-ledger hover:text-paper disabled:opacity-40"
                  >
                    Confirm
                  </button>
                  <button
                    disabled={busy === r.id}
                    onClick={() => patch(r.id, { status: "excluded" })}
                    className="px-3 py-1 text-xs font-mono uppercase border border-line text-ink2 rounded-md hover:border-flag hover:text-flag"
                  >
                    Exclude
                  </button>
                </div>
              )}
            </div>

            {isOpen && (
              <div className="mt-4 pt-4 hairline space-y-3 text-sm">
                <div>
                  <p className="text-xs font-mono uppercase tracking-wide text-muted mb-1">Confidence</p>
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <Meter value={r.confidence} height={5} />
                    </div>
                    <span className="text-xs font-mono text-ink2 w-10 text-right">
                      {Math.round(r.confidence * 100)}%
                    </span>
                  </div>
                </div>

                {r.extracted.reasoning && (
                  <div>
                    <p className="text-xs font-mono uppercase tracking-wide text-muted mb-1">Why this category</p>
                    <p className="text-ink2">{r.extracted.reasoning}</p>
                  </div>
                )}

                <div>
                  <p className="text-xs font-mono uppercase tracking-wide text-muted mb-1">Source</p>
                  <p className="text-ink2">
                    {SOURCE_LABEL[r.source]}
                    {r.evidence_ref ? ` — ${r.evidence_ref}` : ""}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-mono uppercase tracking-wide text-muted mb-1">Raw input</p>
                  <p className="font-mono text-xs text-ink2 bg-paper rounded-md p-2 break-words">{r.raw_input}</p>
                </div>

                {(r.extracted.asset || r.extracted.quantity !== undefined) && (
                  <div>
                    <p className="text-xs font-mono uppercase tracking-wide text-muted mb-1">Extracted fields</p>
                    <p className="text-ink2 font-mono text-xs">
                      {r.extracted.asset && `asset: ${r.extracted.asset} `}
                      {r.extracted.quantity !== undefined &&
                        `qty: ${r.extracted.quantity}${r.extracted.unit ? ` ${r.extracted.unit}` : ""}`}
                    </p>
                  </div>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
