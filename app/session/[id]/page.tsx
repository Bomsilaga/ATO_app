"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { TaxSession, TaxRecord } from "@/lib/types";
import { nextTriageBatch, isTriageComplete } from "@/lib/triage-engine";
import { getCategoryByCode } from "@/lib/taxonomy";
import CategoryTriage from "@/components/CategoryTriage";
import FileUpload from "@/components/FileUpload";
import RecordList from "@/components/RecordList";
import PrefillReport from "@/components/PrefillReport";

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
  const [prefill, setPrefill] = useState<any>(null);
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

  async function generatePrefill() {
    if (!session) return;
    setError(null);
    const res = await fetch("/api/prefill", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: session.id })
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      return;
    }
    setPrefill(data);
  }

  if (loading) return <main className="p-12 text-sm text-ink/60">Loading…</main>;
  if (!session) return <main className="p-12 text-sm text-flag">Filing not found.</main>;

  const triageComplete = isTriageComplete(session.triage_state);
  const batch = nextTriageBatch(session.triage_state);

  return (
    <main className="min-h-screen px-6 py-12 max-w-3xl mx-auto space-y-10">
      <header>
        <span className="code-tag">FY {session.financial_year}</span>
        <h1 className="ledger-heading text-2xl font-semibold mt-2">{session.name}</h1>
        <p className="text-sm text-ink/50 mt-1">
          {triageComplete ? "Records & pre-fill" : "Triage sweep"}
        </p>
      </header>

      {!triageComplete && (
        <section className="border border-line p-6 bg-white/40">
          <p className="text-sm text-ink/60 mb-6">
            Answer plainly — every category gets asked, nothing is assumed from your
            occupation or income type.
          </p>
          <CategoryTriage sessionId={session.id} batch={batch} onAnswered={handleAnswered} />
        </section>
      )}

      {triageComplete && (
        <>
          <section className="border border-line p-6 bg-white/40 space-y-4">
            <h2 className="ledger-heading text-lg font-semibold">Chat</h2>
            <p className="text-sm text-ink/60">
              Type scanty details — an amount, a rough date, what it was for — and it's
              categorised against FY {session.financial_year} immediately.
            </p>

            {chatLog.length > 0 && (
              <div className="space-y-3 max-h-72 overflow-y-auto hairline pb-4">
                {chatLog.map((m, i) => (
                  <div key={i} className="text-sm">
                    <p className="text-ink">
                      <span className="font-mono text-xs text-ink/40 mr-2">YOU</span>
                      {m.text}
                    </p>
                    <p className="text-ledger mt-1">
                      <span className="font-mono text-xs text-ledger/60 mr-2">TRIAGE</span>
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
              className="w-full border border-line p-3 text-sm bg-transparent outline-none focus:border-ledger"
            />
            <button
              onClick={submitText}
              disabled={sending}
              className="px-4 py-1.5 text-xs font-mono uppercase tracking-wide border border-ledger text-ledger hover:bg-ledger hover:text-paper disabled:opacity-50"
            >
              {sending ? "Categorising…" : "Send"}
            </button>
            <FileUpload sessionId={session.id} onUploaded={loadRecords} />
          </section>

          <section className="border border-line p-6 bg-white/40">
            <h2 className="ledger-heading text-lg font-semibold mb-4">Records</h2>
            <RecordList records={records} onChanged={loadRecords} />
          </section>

          <section className="border border-line p-6 bg-white/40 space-y-3">
            <h2 className="ledger-heading text-lg font-semibold">Live guidance & pre-fill</h2>
            <p className="text-sm text-ink/60">
              Fetches current ATO thresholds and rulings for your active categories, then
              generates a label-mapped pre-fill from your confirmed records.
            </p>
            <div className="flex gap-3">
              <button
                onClick={fetchGuidance}
                disabled={guidanceLoading}
                className="px-4 py-2 text-xs font-mono uppercase tracking-wide border border-ledger text-ledger hover:bg-ledger hover:text-paper disabled:opacity-50"
              >
                {guidanceLoading ? "Fetching…" : "Fetch current ATO guidance"}
              </button>
              <button
                onClick={generatePrefill}
                className="px-4 py-2 text-xs font-mono uppercase tracking-wide border border-line text-ink/70 hover:border-ink hover:text-ink"
              >
                Generate pre-fill
              </button>
            </div>
            {error && <p className="text-sm text-flag">{error}</p>}
          </section>

          {prefill && (
            <PrefillReport
              labels={prefill.labels}
              summary={prefill.plain_english_summary}
              agentFlags={prefill.agent_review_flags}
              disclaimer={prefill.disclaimer}
            />
          )}
        </>
      )}
    </main>
  );
}
