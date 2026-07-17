"use client";

import { useState } from "react";
import { ATO_CATEGORIES } from "@/lib/taxonomy";
import { RecordType } from "@/lib/types";

// myDeductions-style structured entry: type, amount, date, what it was —
// one tap-through form instead of composing a chat sentence. Category is
// optional; left blank, the AI picks it from the description (the typed
// amount/date/description always win over anything it extracts).
export default function QuickAdd({
  sessionId,
  onAdded
}: {
  sessionId: string;
  onAdded: (message: string) => void;
}) {
  const [recordType, setRecordType] = useState<RecordType>("expense");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [categoryCode, setCategoryCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categories = ATO_CATEGORIES.filter((c) =>
    recordType === "expense" ? c.question_type === "deduction" : c.question_type === "income"
  );

  async function save() {
    const parsedAmount = parseFloat(amount);
    if (!description.trim() || isNaN(parsedAmount) || parsedAmount <= 0) {
      setError("A description and a positive amount are required.");
      return;
    }
    setSaving(true);
    setError(null);

    const res = await fetch("/api/records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        rawText: `${recordType === "expense" ? "Expense" : "Income"}: ${description.trim()} — $${parsedAmount} on ${date}`,
        categoryCode: categoryCode || undefined,
        fields: { amount: parsedAmount, date, description: description.trim(), recordType }
      })
    });
    const data = await res.json();
    setSaving(false);

    if (!res.ok) {
      setError(data.error ?? "Couldn't save that.");
      return;
    }

    setAmount("");
    setDescription("");
    setCategoryCode("");

    const categoryNote = data.category_code ? ` under ${data.category_code}` : "";
    const warning = data.date_warning ? ` ⚠ ${data.date_warning}` : "";
    onAdded(`Added ${recordType} $${parsedAmount.toLocaleString()}${categoryNote}.${warning}`);
  }

  return (
    <div className="space-y-3">
      <div className="flex rounded-md border border-line overflow-hidden text-xs font-mono uppercase tracking-wide w-fit">
        <button
          onClick={() => {
            setRecordType("expense");
            setCategoryCode("");
          }}
          className={`px-4 py-1.5 ${recordType === "expense" ? "bg-flag text-paper" : "text-ink2 hover:text-ink"}`}
        >
          Deduction
        </button>
        <button
          onClick={() => {
            setRecordType("income");
            setCategoryCode("");
          }}
          className={`px-4 py-1.5 border-l border-line ${
            recordType === "income" ? "bg-good text-paper" : "text-ink2 hover:text-ink"
          }`}
        >
          Income
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[110px_150px_1fr] gap-2">
        <input
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="$ Amount"
          className="text-sm font-mono border border-line rounded-md px-3 py-2 bg-paper outline-none focus:border-ledger"
        />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="text-sm font-mono border border-line rounded-md px-3 py-2 bg-paper outline-none focus:border-ledger"
        />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              save();
            }
          }}
          placeholder={recordType === "expense" ? "What was it for? e.g. steel-cap boots" : "Where from? e.g. shift pay"}
          className="text-sm border border-line rounded-md px-3 py-2 bg-paper outline-none focus:border-ledger"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={categoryCode}
          onChange={(e) => setCategoryCode(e.target.value)}
          className="text-xs font-mono border border-line rounded-md px-2 py-1.5 bg-surface text-ink max-w-full"
        >
          <option value="">Category: let AI decide</option>
          {categories.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} — {c.label}
            </option>
          ))}
        </select>

        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-1.5 text-xs font-mono uppercase tracking-wide bg-ledger text-paper rounded-md hover:bg-ledgerLight disabled:opacity-50"
        >
          {saving ? "Adding…" : "+ Add"}
        </button>
      </div>

      {error && <p className="text-xs text-flag">{error}</p>}
    </div>
  );
}
