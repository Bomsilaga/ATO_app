"use client";

import { useEffect, useState, useCallback } from "react";
import { PrefillLabel, TaxEstimate } from "@/lib/types";

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

export default function ReportPanel({ sessionId, financialYear }: { sessionId: string; financialYear: string }) {
  const [report, setReport] = useState<PrefillOutputRow | null>(null);
  const [labels, setLabels] = useState<PrefillLabel[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  const loadReport = useCallback(async () => {
    const [reportRes, recordsRes] = await Promise.all([
      fetch(`/api/prefill?sessionId=${sessionId}`),
      fetch(`/api/records?sessionId=${sessionId}`)
    ]);

    let reportData: PrefillOutputRow | null = null;
    if (reportRes.ok) {
      reportData = await reportRes.json();
      setReport(reportData);
      setLabels(reportData?.labels ?? []);
    }

    if (recordsRes.ok && reportData) {
      const records: { updated_at: string }[] = await recordsRes.json();
      const latestChange = records.reduce(
        (max, r) => (r.updated_at > max ? r.updated_at : max),
        "1970-01-01T00:00:00Z"
      );
      setStale(latestChange > reportData.generated_at);
    } else {
      setStale(false);
    }
  }, [sessionId]);

  useEffect(() => {
    loadReport().finally(() => setLoading(false));
  }, [loadReport]);

  // Generating a report needs guidance fetched first — rather than surface
  // that as an error and make the user go click a separate button, fetch it
  // automatically here and retry once.
  async function generateReport() {
    setGenerating(true);
    setError(null);

    let res = await fetch("/api/prefill", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId })
    });
    let data = await res.json();

    if (!res.ok && /guidance/i.test(data.error ?? "")) {
      const guidanceRes = await fetch("/api/guidance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId })
      });
      if (!guidanceRes.ok) {
        const guidanceData = await guidanceRes.json();
        setGenerating(false);
        setError(guidanceData.error);
        return;
      }
      res = await fetch("/api/prefill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId })
      });
      data = await res.json();
    }

    setGenerating(false);
    if (!res.ok) {
      setError(data.error);
      return;
    }
    setReport(data);
    setLabels(data.labels ?? []);
    setDirty(false);
    setStale(false);
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
      body: JSON.stringify({ sessionId, labels })
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
    const res = await fetch(`/api/prefill/export?sessionId=${sessionId}&format=${format}`);
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
    a.download = `tax-report-${financialYear}.${format}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setExporting(null);
  }

  if (loading) return <p className="text-sm text-ink2">Loading…</p>;

  const estimate = report?.tax_estimate ?? null;

  return (
    <div className="space-y-8">
      {error && <p className="text-sm text-flag">{error}</p>}

      {!report && (
        <div className="card p-6 space-y-4">
          <p className="text-sm text-ink2">
            No report generated yet — this fetches current ATO guidance and builds the full
            breakdown and tax estimate in one step. Complete triage first if you haven't already.
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
          <div className="flex items-center justify-between">
            <p className="text-sm text-ink2">
              Generated {new Date(report.generated_at).toLocaleString("en-AU")}
            </p>
            <button
              onClick={generateReport}
              disabled={generating}
              className={`text-xs font-mono uppercase tracking-wide disabled:opacity-50 ${
                stale ? "text-flag hover:text-flag" : "text-ink2 hover:text-ink"
              }`}
            >
              {generating ? "Regenerating…" : "Regenerate ↻"}
            </button>
          </div>

          {stale && !generating && (
            <div className="card p-4 border-flag bg-flag/5">
              <p className="text-sm text-flag">
                Records have changed since this report was generated — click "Regenerate" above so
                the figures below reflect your latest edits.
              </p>
            </div>
          )}

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
    </div>
  );
}
