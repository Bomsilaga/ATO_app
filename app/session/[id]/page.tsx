"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { TaxSession, TaxRecord } from "@/lib/types";
import { nextTriageBatch, isTriageComplete } from "@/lib/triage-engine";
import { getCategoryByCode } from "@/lib/taxonomy";
import CategoryTriage from "@/components/CategoryTriage";
import FileUpload from "@/components/FileUpload";
import RecordList from "@/components/RecordList";
import SessionSummary from "@/components/SessionSummary";

interface ChatMessage {
  text: string;
  reply: string;
}

export default function SessionPage() {
  const params = useParams();
  const id = params.id as string;

  const [session, setSession] = useState<TaxSession | null>(null);
  const [records, setRecords] = useState<TaxRecord[]>([]);
  const [textInput, setTextInput] = useState("");
  const [chatLog, setChatLog] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [guidanceLoading, setGuidanceLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSession = useCallback(async () => {
    const res = await fetch(`/api/sessions?id=${id}`);
    if (res.ok) setSession(await res.json());
  }, [id]);

  const loadRecords = useCallback(async () => {
    if (!session) return;
    const res = await fetch(`/api/records?sessionId=${session.id}`);
    if (res.ok) setRecords(await res.json());
  }, [session]);

  useEffect(() => {
    loadSession().finally(() => setLoading(false));
  }, [loadSession]);

  useEffect(() => {
    if (session) loadRecords();
  }, [session, loadRecords]);

  function handleAnswered(code: string, applies: boolean) {
    setSession((prev) =>
      prev
        ? {
            ...prev,
            triage_state: prev.triage_state.map((n) =>
              n.code === code ? { ...n, state: "asked_and_answered", applies } : n
            )
          }
        : prev
    );
  }

  async function submitText() {
    if (!session || !textInput.trim() || sending) return;
    const text = textInput.trim();
    setTextInput("");
    setSending(true);

    const res = await fetch("/api/records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: session.id, rawText: text })
    });
    const data = await res.json();
    setSending(false);

    let reply: string;
    if (!res.ok) {
      reply = `Couldn't save that — ${data.error}`;
    } else if (data.clarification_question) {
      reply = data.clarification_question;
    } else if (data.category_code) {
      const category = getCategoryByCode(data.category_code);
      reply = `Filed under ${data.category_code} — ${category?.label ?? "unrecognised category"} (${Math.round(
        (data.confidence ?? 0) * 100
      )}% confidence) for FY ${session.financial_year}.`;
    } else {
      reply = "Couldn't confidently categorise that — pick a category from the list below.";
    }

    setChatLog((log) => [...log, { text, reply }]);
    loadRecords();
  }

  async function fetchGuidance() {
    if (!session) return;
    setGuidanceLoading(true);
    setError(null);
    const res = await fetch("/api/guidance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: session.id })
    });
    const data = await res.json();
    setGuidanceLoading(false);
    if (!res.ok) {
      setError(data.error);
      return;
    }
    loadSession();
  }

  if (loading) return <main className="p-12 text-sm text-ink2">Loading…</main>;
  if (!session) return <main className="p-12 text-sm text-flag">Filing not found.</main>;

  const triageComplete = isTriageComplete(session.triage_state);
  const batch = nextTriageBatch(session.triage_state);

  return (
    <main className="min-h-screen px-6 py-10 max-w-6xl mx-auto">
      <Link
        href="/dashboard"
        className="text-xs font-mono uppercase tracking-wide text-ink2 hover:text-ink"
      >
        ← All filings
      </Link>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8 items-start">
        <div className="space-y-8 min-w-0">
          {!triageComplete && (
            <section className="card p-6">
              <h1 className="ledger-heading text-xl font-semibold mb-2">Triage sweep</h1>
              <p className="text-sm text-ink2 mb-6">
                Answer plainly — every category gets asked, nothing is assumed from your
                occupation or income type.
              </p>
              <CategoryTriage sessionId={session.id} batch={batch} onAnswered={handleAnswered} />
            </section>
          )}

          {triageComplete && (
            <>
              <section className="card p-6 space-y-4">
                <div>
                  <h2 className="ledger-heading text-lg font-semibold">Chat</h2>
                  <p className="text-sm text-ink2 mt-1">
                    Type scanty details — an amount, a rough date, what it was for — and it's
                    categorised against FY {session.financial_year} immediately.
                  </p>
                </div>

                {chatLog.length > 0 && (
                  <div className="space-y-3 max-h-72 overflow-y-auto hairline pb-4">
                    {chatLog.map((m, i) => (
                      <div key={i} className="text-sm">
                        <p className="text-ink">
                          <span className="font-mono text-xs text-muted mr-2">YOU</span>
                          {m.text}
                        </p>
                        <p className="text-ledger mt-1">
                          <span className="font-mono text-xs text-ledger/70 mr-2">TRIAGE</span>
                          {m.reply}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                <textarea
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      submitText();
                    }
                  }}
                  placeholder="e.g. laptop $1500 june"
                  rows={2}
                  className="w-full border border-line rounded-md p-3 text-sm bg-paper outline-none focus:border-ledger"
                />
                <div className="flex items-center justify-between gap-4">
                  <button
                    onClick={submitText}
                    disabled={sending}
                    className="px-4 py-1.5 text-xs font-mono uppercase tracking-wide border border-ledger text-ledger rounded-md hover:bg-ledger hover:text-paper disabled:opacity-50"
                  >
                    {sending ? "Categorising…" : "Send"}
                  </button>
                </div>
                <div className="pt-2 hairline">
                  <FileUpload sessionId={session.id} onUploaded={loadRecords} />
                </div>
              </section>

              <section className="card p-6">
                <h2 className="ledger-heading text-lg font-semibold mb-4">Records</h2>
                <RecordList records={records} onChanged={loadRecords} />
              </section>

              <section className="card p-6 space-y-3">
                <h2 className="ledger-heading text-lg font-semibold">Live guidance & report</h2>
                <p className="text-sm text-ink2">
                  Fetches current ATO thresholds and rulings for your active categories, then the
                  full report — label-mapped pre-fill, tax estimate, and export — is generated on
                  its own page.
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={fetchGuidance}
                    disabled={guidanceLoading}
                    className="px-4 py-2 text-xs font-mono uppercase tracking-wide border border-ledger text-ledger rounded-md hover:bg-ledger hover:text-paper disabled:opacity-50"
                  >
                    {guidanceLoading ? "Fetching…" : "Fetch current ATO guidance"}
                  </button>
                  <Link
                    href={`/session/${session.id}/report`}
                    className="px-4 py-2 text-xs font-mono uppercase tracking-wide border border-line text-ink2 rounded-md hover:border-ink hover:text-ink"
                  >
                    View / generate report →
                  </Link>
                </div>
                {error && <p className="text-sm text-flag">{error}</p>}
              </section>
            </>
          )}
        </div>

        <SessionSummary session={session} records={records} />
      </div>
    </main>
  );
}
