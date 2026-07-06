"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { TaxSession, PrefillLabel, TaxEstimate } from "@/lib/types";

interface PrefillOutputRow {
  id: string;
  session_id: string;
  generated_at: string;
  labels: PrefillLabel[];
  plain_english_summary: string;
  agent_review_flags: string[];
  disclaimer: string;
  tax_estimate: TaxEstimate | null;
}

function currency(n: number) {
  return n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
}

export default function ReportPage() {
  const params = useParams();
  const id = params.id as string;

  const [session, setSession] = useState<TaxSession | null>(null);
  const [report, setReport] = useState<PrefillOutputRow | null>(null);
  const [labels, setLabels] = useState<PrefillLabel[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    const [sessionRes, reportRes] = await Promise.all([
      fetch(`/api/sessions?id=${id}`),
      fetch(`/api/prefill?sessionId=${id}`)
    ]);
    if (sessionRes.ok) setSession(await sessionRes.json());
    if (reportRes.ok) {
      const data = await reportRes.json();
      setReport(data);
      setLabels(data?.labels ?? []);
    }
  }, [id]);

  useEffect(() => {
    loadAll().finally(() => setLoading(false));
  }, [loadAll]);

  async function generateReport() {
    setGenerating(true);
    setError(null);
    const res = await fetch("/api/prefill", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: id })
    });
    const data = await res.json();
    setGenerating(false);
    if (!res.ok) {
      setError(data.error);
      return;
    }
    setReport(data);
    setLabels(data.labels ?? []);
    setDirty(false);
  }

  function updateAmount(code: string, value: string) {
    const amount = parseFloat(value);
    setLabels((prev) => prev.map((l) => (l.question_code === code ? { ...l, amount: isNaN(amount) ? 0 : amount } : l)));
    setDirty(true);
  }

  async function saveChanges() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/prefill", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: id, labels })
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error);
      return;
    }
    setReport(data);
    setLabels(data.labels ?? []);
    setDirty(false);
  }

  async function exportReport(format: "pdf" | "xlsx" | "docx") {
    setExporting(format);
    setError(null);
    const res = await fetch(`/api/prefill/export?sessionId=${id}&format=${format}`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: "Export failed" }));
      setError(data.error);
      setExporting(null);
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tax-report-${session?.financial_year ?? id}.${format}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setExporting(null);
  }

  if (loading) return <main className="p-12 text-sm text-ink2">Loading…</main>;
  if (!session) return <main className="p-12 text-sm text-flag">Filing not found.</main>;

  const estimate = report?.tax_estimate ?? null;

  return (
    <main className="min-h-screen px-6 py-10 max-w-4xl mx-auto space-y-8">
      <Link
        href={`/session/${id}`}
        className="text-xs font-mono uppercase tracking-wide text-ink2 hover:text-ink"
      >
        ← Back to filing
      </Link>

      <div>
        <span className="code-tag">TAX REPORT</span>
        <h1 className="ledger-heading text-2xl font-semibold mt-2">{session.name}</h1>
        <p className="text-sm text-ink2 mt-1">
          FY {session.financial_year}
          {report && ` — generated ${new Date(report.generated_at).toLocaleString("en-AU")}`}
        </p>
      </div>

      {error && <p className="text-sm text-flag">{error}</p>}

      {!report && (
        <div className="card p-6 space-y-4">
          <p className="text-sm text-ink2">
            No report generated yet. Fetch guidance on the filing page first, then generate the
            report here.
          </p>
          <button
            onClick={generateReport}
            disabled={generating}
            className="px-4 py-2 text-xs font-mono uppercase tracking-wide border border-ledger text-ledger rounded-md hover:bg-ledger hover:text-paper disabled:opacity-50"
          >
            {generating ? "Generating…" : "Generate report"}
          </button>
        </div>
      )}

      {report && (
        <>
          {estimate && (
            <div className="card p-6 space-y-4">
              <span className="code-tag">{estimate.is_refund ? "ESTIMATED REFUND" : "ESTIMATED AMOUNT OWING"}</span>
              <p className={`text-3xl font-semibold ledger-heading ${estimate.is_refund ? "text-ledger" : "text-flag"}`}>
                {currency(Math.abs(estimate.net_result))}
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm pt-2">
                <div>
                  <p className="text-xs font-mono uppercase text-muted">Total income</p>
                  <p className="font-mono">{currency(estimate.total_income)}</p>
                </div>
                <div>
                  <p className="text-xs font-mono uppercase text-muted">Total deductions</p>
                  <p className="font-mono">{currency(estimate.total_deductions)}</p>
                </div>
                <div>
                  <p className="text-xs font-mono uppercase text-muted">Taxable income</p>
                  <p className="font-mono">{currency(estimate.taxable_income)}</p>
                </div>
                <div>
                  <p className="text-xs font-mono uppercase text-muted">Tax on taxable income</p>
                  <p className="font-mono">{currency(estimate.tax_on_taxable_income)}</p>
                </div>
                <div>
                  <p className="text-xs font-mono uppercase text-muted">LITO offset</p>
                  <p className="font-mono">-{currency(estimate.lito_offset)}</p>
                </div>
                <div>
                  <p className="text-xs font-mono uppercase text-muted">Medicare levy</p>
                  <p className="font-mono">+{currency(estimate.medicare_levy)}</p>
                </div>
                <div>
                  <p className="text-xs font-mono uppercase text-muted">Total tax payable</p>
                  <p className="font-mono">{currency(estimate.total_tax_payable)}</p>
                </div>
                <div>
                  <p className="text-xs font-mono uppercase text-muted">Tax withheld</p>
                  <p className="font-mono">{currency(estimate.total_tax_withheld)}</p>
                </div>
              </div>

              <p className="text-xs text-muted border-t border-line pt-3">{estimate.notes}</p>
            </div>
          )}

          <div className="card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="ledger-heading text-lg font-semibold">Label-mapped amounts</h2>
              <button
                onClick={saveChanges}
                disabled={!dirty || saving}
                className="px-3 py-1.5 text-xs font-mono uppercase tracking-wide border border-ledger text-ledger rounded-md hover:bg-ledger hover:text-paper disabled:opacity-40"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
            <p className="text-xs text-ink2">
              Adjust any amount before finalizing — saving recalculates the estimate above.
            </p>

            <table className="w-full text-sm">
              <thead>
                <tr className="hairline text-left text-xs font-mono uppercase text-muted">
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
                      {l.agent_review_recommended && <span className="ml-2 badge badge-warn">⚑ agent review</span>}
                    </td>
                    <td className="py-2">{l.label}</td>
                    <td className="py-2 text-right">
                      <input
                        type="number"
                        step="0.01"
                        value={l.amount}
                        onChange={(e) => updateAmount(l.question_code, e.target.value)}
                        className="w-28 text-right font-mono border border-line rounded-md px-2 py-1 bg-paper outline-none focus:border-ledger"
                      />
                    </td>
                  </tr>
                ))}
                {labels.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-4 text-ink2 text-center">
                      No confirmed records yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {report.agent_review_flags.length > 0 && (
            <div className="card p-6">
              <p className="text-xs font-mono uppercase tracking-wide text-flag mb-2">Flagged for review</p>
              <ul className="text-sm space-y-1 list-disc list-inside text-ink2">
                {report.agent_review_flags.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="card p-6 space-y-3">
            <h2 className="ledger-heading text-lg font-semibold">Export</h2>
            <div className="flex flex-wrap gap-3">
              {(["pdf", "xlsx", "docx"] as const).map((format) => (
                <button
                  key={format}
                  onClick={() => exportReport(format)}
                  disabled={exporting !== null || dirty}
                  className="px-4 py-2 text-xs font-mono uppercase tracking-wide border border-line text-ink2 rounded-md hover:border-ink hover:text-ink disabled:opacity-40"
                >
                  {exporting === format ? "Exporting…" : `Download .${format}`}
                </button>
              ))}
            </div>
            {dirty && <p className="text-xs text-warn">Save your changes before exporting.</p>}
          </div>

          <p className="text-xs text-muted border-t border-line pt-4">{report.disclaimer}</p>
        </>
      )}
    </main>
  );
}
