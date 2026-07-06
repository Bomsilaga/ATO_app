"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { TaxSession } from "@/lib/types";
import ReportPanel from "@/components/ReportPanel";

export default function ReportPage() {
  const params = useParams();
  const id = params.id as string;

  const [session, setSession] = useState<TaxSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/sessions?id=${id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then(setSession)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <main className="p-12 text-sm text-ink2">Loading…</main>;
  if (!session) return <main className="p-12 text-sm text-flag">Filing not found.</main>;

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
        <p className="text-sm text-ink2 mt-1">FY {session.financial_year}</p>
      </div>

      <ReportPanel sessionId={id} financialYear={session.financial_year} />
    </main>
  );
}
