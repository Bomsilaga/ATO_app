"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { TaxSession, TaxRecord } from "@/lib/types";
import { nextTriageBatch, isTriageComplete } from "@/lib/triage-engine";
import { getCategoryByCode } from "@/lib/taxonomy";
import { isCatchUpFiling } from "@/lib/financial-year";
import CategoryTriage from "@/components/CategoryTriage";
import FileUpload from "@/components/FileUpload";
import QuickAdd from "@/components/QuickAdd";
import RecordList from "@/components/RecordList";
import SessionSummary from "@/components/SessionSummary";
import ReportPanel from "@/components/ReportPanel";

interface ChatMessage {
  text: string;
  reply: string;
}

interface PendingClarification {
  recordId: string;
  accumulatedText: string;
  question: string;
}

type Tab = "add" | "chat" | "records" | "report" | "triage";

export default function SessionPage() {
  const params = useParams();
  const id = params.id as string;

  const [session, setSession] = useState<TaxSession | null>(null);
  const [records, setRecords] = useState<TaxRecord[]>([]);
  const [textInput, setTextInput] = useState("");
  const [chatLog, setChatLog] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("add");
  const [pending, setPending] = useState<PendingClarification | null>(null);
  const [addedMsg, setAddedMsg] = useState<string | null>(null);

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

    // If a clarification question is pending, this reply only makes sense
    // combined with the original note's full context — classifying "23 may
    // 2026" alone tells you nothing. Merge onto the accumulated text and
    // update the same record instead of spawning an unrelated new one.
    const isFollowUp = pending !== null;
    const rawText = isFollowUp ? `${pending!.accumulatedText}. ${text}` : text;

    const res = await fetch("/api/records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: session.id,
        rawText,
        recordId: isFollowUp ? pending!.recordId : undefined
      })
    });
    const data = await res.json();
    setSending(false);

    let reply: string;
    if (!res.ok) {
      reply = `Couldn't save that — ${data.error}`;
      setPending(null);
    } else if (data.multi) {
      const lines = (data.records as TaxRecord[]).map((r) => {
        const category = r.category_code ? getCategoryByCode(r.category_code) : undefined;
        const amount = r.extracted.amount !== undefined ? `$${r.extracted.amount.toLocaleString()}` : "no amount";
        return `• ${amount} — ${category ? `${r.category_code} (${category.label})` : "uncategorised"}`;
      });
      reply = `Found ${data.count} record${data.count === 1 ? "" : "s"} in that:\n${lines.join("\n")}`;
      setPending(null);
    } else if (data.clarification_question && data.category_code) {
      // Already filed successfully, but the classifier still wants an
      // optional detail (e.g. a missing date) — say so instead of showing
      // only the question, which reads as if nothing was understood.
      const category = getCategoryByCode(data.category_code);
      reply = `Filed under ${data.category_code} — ${category?.label ?? "unrecognised category"}${
        data.extracted?.amount !== undefined ? ` ($${data.extracted.amount.toLocaleString()})` : ""
      }. ${data.clarification_question}`;
      setPending({ recordId: data.id, accumulatedText: rawText, question: data.clarification_question });
    } else if (data.clarification_question) {
      reply = data.clarification_question;
      setPending({ recordId: data.id, accumulatedText: rawText, question: data.clarification_question });
    } else if (data.category_code) {
      const category = getCategoryByCode(data.category_code);
      reply = `Filed under ${data.category_code} — ${category?.label ?? "unrecognised category"} (${Math.round(
        (data.confidence ?? 0) * 100
      )}% confidence) for FY ${session.financial_year}.`;
      setPending(null);
    } else {
      reply = "Couldn't confidently categorise that — pick a category from the list below.";
      setPending(null);
    }

    if (res.ok && data.date_warning) reply += `\n\n⚠ ${data.date_warning}`;
    if (res.ok && data.date_warnings?.length) {
      reply += `\n\n${data.date_warnings.map((w: string) => `⚠ ${w}`).join("\n")}`;
    }

    setChatLog((log) => [...log, { text, reply }]);
    loadRecords();
  }

  if (loading) return <main className="p-12 text-sm text-ink2">Loading…</main>;
  if (!session) return <main className="p-12 text-sm text-flag">Filing not found.</main>;

  const triageComplete = isTriageComplete(session.triage_state);
  const batch = nextTriageBatch(session.triage_state);
  // Catch-up filings (FY ended 6+ months ago) front-load the full triage
  // sweep — the year is done, so answer everything once, then reconstruct.
  // A current or recently-ended FY works like a deductions tracker instead:
  // straight into quick-add, with triage available as a tab whenever
  // they're ready to finalise.
  const mustTriageFirst = !triageComplete && isCatchUpFiling(session.financial_year);

  const tabs: { key: Tab; label: string }[] = [
    { key: "add", label: "+ Add" },
    { key: "chat", label: "Chat" },
    { key: "records", label: "Records" },
    { key: "report", label: "Report" },
    ...(!triageComplete ? [{ key: "triage" as Tab, label: "Triage sweep" }] : [])
  ];

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
          {mustTriageFirst && (
            <section className="card p-6">
              <h1 className="ledger-heading text-xl font-semibold mb-2">Triage sweep</h1>
              <p className="text-sm text-ink2 mb-6">
                This financial year ended a while ago, so start by answering plainly — every
                category gets asked, nothing is assumed from your occupation or income type.
              </p>
              <CategoryTriage sessionId={session.id} batch={batch} onAnswered={handleAnswered} />
            </section>
          )}

          {!mustTriageFirst && (
            <>
              <div className="flex gap-1 border-b border-line overflow-x-auto">
                {tabs.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`px-4 py-2 text-xs font-mono uppercase tracking-wide border-b-2 -mb-px transition-colors whitespace-nowrap ${
                      activeTab === tab.key
                        ? "border-ledger text-ledger"
                        : "border-transparent text-ink2 hover:text-ink"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {activeTab === "add" && (
                <section className="card p-6 space-y-5">
                  <div>
                    <h2 className="ledger-heading text-lg font-semibold">Add a deduction or income</h2>
                    <p className="text-sm text-ink2 mt-1">
                      Log it the moment it happens — amount, date, what it was for. Category is
                      picked automatically unless you choose one.
                    </p>
                  </div>

                  <QuickAdd
                    sessionId={session.id}
                    onAdded={(msg) => {
                      setAddedMsg(msg);
                      loadRecords();
                    }}
                  />

                  {addedMsg && <p className="text-sm text-ledger whitespace-pre-line">✓ {addedMsg}</p>}

                  <div className="pt-3 hairline">
                    <FileUpload sessionId={session.id} onUploaded={loadRecords} />
                  </div>
                </section>
              )}

              {activeTab === "triage" && !triageComplete && (
                <section className="card p-6">
                  <h2 className="ledger-heading text-lg font-semibold mb-2">Triage sweep</h2>
                  <p className="text-sm text-ink2 mb-6">
                    Optional while you're still tracking, but worth finishing before you finalise —
                    it makes sure no category is silently assumed to be "no".
                  </p>
                  <CategoryTriage sessionId={session.id} batch={batch} onAnswered={handleAnswered} />
                </section>
              )}

              {activeTab === "chat" && (
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
                            {m.text.length > 300 ? `${m.text.slice(0, 300)}…` : m.text}
                          </p>
                          <p className="text-ledger mt-1 whitespace-pre-line">
                            <span className="font-mono text-xs text-ledger/70 mr-2">TRIAGE</span>
                            {m.reply}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {pending && (
                    <div className="flex items-center justify-between gap-3 text-xs bg-warn/10 border border-warn/30 rounded-md px-3 py-2">
                      <span className="text-ink2">
                        Still working out one note — your next reply answers "{pending.question}"
                      </span>
                      <button
                        onClick={() => setPending(null)}
                        className="font-mono uppercase text-ink2 hover:text-ink shrink-0"
                      >
                        Start new note ✕
                      </button>
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
                    placeholder={
                      pending
                        ? "Answer the question above…"
                        : "e.g. laptop $1500 june — or paste a whole email, receipt, or statement to file everything in it at once"
                    }
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
                </section>
              )}

              {activeTab === "records" && (
                <section className="card p-6">
                  <h2 className="ledger-heading text-lg font-semibold mb-4">Records</h2>
                  <RecordList records={records} onChanged={loadRecords} />
                </section>
              )}

              {activeTab === "report" && (
                <ReportPanel sessionId={session.id} financialYear={session.financial_year} />
              )}
            </>
          )}
        </div>

        <SessionSummary session={session} records={records} onSessionChanged={loadSession} />
      </div>
    </main>
  );
}
