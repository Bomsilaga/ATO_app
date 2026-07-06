import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import NewFilingForm from "@/components/NewFilingForm";
import StatTile from "@/components/StatTile";

export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: sessions } = await supabase
    .from("tax_sessions")
    .select("id, name, financial_year, status, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  const filings = sessions ?? [];
  const complete = filings.filter((s) => s.status === "complete").length;
  const inProgress = filings.length - complete;

  return (
    <main className="min-h-screen px-6 py-12 max-w-5xl mx-auto">
      <header className="mb-10 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <span className="code-tag">SIGNED IN</span>
          <h1 className="ledger-heading text-2xl font-semibold mt-2">{user.email}</h1>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/settings"
            className="text-xs font-mono uppercase tracking-wide text-ink2 hover:text-ink"
          >
            Change login
          </Link>
          <form action="/api/sessions/signout" method="post">
            <button className="text-xs font-mono uppercase tracking-wide text-ink2 hover:text-ink">
              Sign out
            </button>
          </form>
        </div>
      </header>

      {filings.length > 0 && (
        <section className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-8">
          <StatTile label="Total filings" value={String(filings.length)} />
          <StatTile label="In progress" value={String(inProgress)} />
          <StatTile label="Complete" value={String(complete)} />
        </section>
      )}

      <section className="grid gap-8 md:grid-cols-2 items-start">
        <NewFilingForm userId={user.id} />

        <div className="card p-6">
          <h2 className="ledger-heading text-xl font-semibold mb-4">Your filings</h2>
          {filings.length === 0 ? (
            <p className="text-sm text-ink2">
              No filings started yet. Name one and pick a financial year to begin.
            </p>
          ) : (
            <ul className="space-y-1">
              {filings.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/session/${s.id}`}
                    className="flex items-center justify-between gap-4 py-3 hairline hover:bg-paper -mx-2 px-2 rounded-md transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-ink truncate">{s.name}</p>
                      <p className="text-xs text-ink2 font-mono">
                        FY {s.financial_year} ·{" "}
                        <span className="capitalize">{s.status.replace(/_/g, " ")}</span>
                      </p>
                    </div>
                    <span className="text-xs font-mono uppercase tracking-wide text-ledger shrink-0">
                      Open →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}
