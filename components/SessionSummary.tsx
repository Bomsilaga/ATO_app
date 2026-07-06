"use client";

import { useState } from "react";
import { TaxSession, TaxRecord, RecordStatus } from "@/lib/types";
import { getCategoryByCode } from "@/lib/taxonomy";
import Meter from "./Meter";
import CategoryBreakdown from "./CategoryBreakdown";
import StatTile from "./StatTile";

function currency(n: number) {
  return n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
}

export default function SessionSummary({
  session,
  records,
  onSessionChanged
}: {
  session: TaxSession;
  records: TaxRecord[];
  onSessionChanged?: () => void;
}) {
  const [editingOccupation, setEditingOccupation] = useState(false);
  const [occupationDraft, setOccupationDraft] = useState(session.occupation ?? "");
  const [savingOccupation, setSavingOccupation] = useState(false);

  async function saveOccupation() {
    setSavingOccupation(true);
    await fetch("/api/sessions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: session.id, occupation: occupationDraft })
    });
    setSavingOccupation(false);
    setEditingOccupation(false);
    onSessionChanged?.();
  }

  const triageTotal = session.triage_state.length;
  const triageAnswered = session.triage_state.filter((n) => n.state === "asked_and_answered").length;
  const triageFraction = triageTotal > 0 ? triageAnswered / triageTotal : 0;

  let income = 0;
  let deductions = 0;
  const statusCounts: Record<RecordStatus, number> = {
    confirmed: 0,
    candidate: 0,
    unknown: 0,
    excluded: 0
  };

  for (const r of records) {
    statusCounts[r.status] += 1;
    if (r.status !== "confirmed") continue;
    const category = r.category_code ? getCategoryByCode(r.category_code) : undefined;
    const recordType = r.record_type ?? (category?.question_type === "income" ? "income" : category?.question_type === "deduction" ? "expense" : null);
    const amount = Math.abs(r.extracted.amount ?? 0);
    if (recordType === "income") income += amount;
    if (recordType === "expense") deductions += amount;
  }

  return (
    <aside className="space-y-5 lg:sticky lg:top-8 h-fit">
      <div className="card p-5">
        <div className="flex items-center justify-between">
          <span className="code-tag">FY {session.financial_year}</span>
          <span className="text-xs font-mono uppercase tracking-wide text-ink2 capitalize">
            {session.status.replace(/_/g, " ")}
          </span>
        </div>
        <h2 className="ledger-heading text-lg font-semibold mt-3">{session.name}</h2>

        <div className="mt-2">
          {editingOccupation ? (
            <div className="flex gap-2">
              <input
                value={occupationDraft}
                onChange={(e) => setOccupationDraft(e.target.value)}
                placeholder="Occupation"
                className="flex-1 text-xs border border-line rounded-md px-2 py-1 bg-paper outline-none focus:border-ledger"
              />
              <button
                onClick={saveOccupation}
                disabled={savingOccupation}
                className="text-xs font-mono uppercase text-ledger hover:underline"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setEditingOccupation(false);
                  setOccupationDraft(session.occupation ?? "");
                }}
                className="text-xs font-mono uppercase text-ink2 hover:underline"
              >
                Cancel
              </button>
            </div>
          ) : (
            <p className="text-xs text-ink2">
              {session.occupation || "No occupation set"}
              <button
                onClick={() => setEditingOccupation(true)}
                className="ml-2 text-ink2 hover:text-ledger underline underline-offset-2"
              >
                edit
              </button>
            </p>
          )}
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-ink2 mb-1.5">
            <span>Triage progress</span>
            <span className="font-mono">
              {triageAnswered}/{triageTotal}
            </span>
          </div>
          <Meter value={triageFraction} height={6} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatTile label="Income (confirmed)" value={currency(income)} />
        <StatTile label="Deductions (confirmed)" value={currency(deductions)} />
      </div>

      <div className="card p-5">
        <h3 className="text-xs font-mono uppercase tracking-wide text-ink2 mb-3">Records by status</h3>
        <ul className="space-y-2 text-sm">
          <li className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-good" />
              Confirmed
            </span>
            <span className="font-mono text-ink2">{statusCounts.confirmed}</span>
          </li>
          <li className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-warn" />
              Needs review
            </span>
            <span className="font-mono text-ink2">{statusCounts.candidate}</span>
          </li>
          <li className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-serious" />
              Uncategorised
            </span>
            <span className="font-mono text-ink2">{statusCounts.unknown}</span>
          </li>
          <li className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-muted" />
              Excluded
            </span>
            <span className="font-mono text-ink2">{statusCounts.excluded}</span>
          </li>
        </ul>
      </div>

      <div className="card p-5">
        <h3 className="text-xs font-mono uppercase tracking-wide text-ink2 mb-3">Top categories (confirmed)</h3>
        <CategoryBreakdown records={records} />
      </div>
    </aside>
  );
}
