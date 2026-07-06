import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import NewFilingForm from "@/components/NewFilingForm";

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

  return (
    <main className="min-h-screen px-6 py-12 max-w-3xl mx-auto">
      <header className="mb-10 flex items-center justify-between">
        <div>
          <span className="code-tag">SIGNED IN</span>
          <h1 className="ledger-heading text-2xl font-semibold mt-2">{user.email}</h1>
        </div>
        <form action="/api/sessions/signout" method="post">
          <button className="text-xs font-mono uppercase tracking-wide text-ink/50 hover:text-ink">
            Sign out
          </button>
        </form>
      </header>

      <section className="grid gap-8 md:grid-cols-2">
        <NewFilingForm userId={user.id} />

        <div className="border border-line p-6 bg-white/40">
          <h2 className="ledger-heading text-xl font-semibold mb-4">Your filings</h2>
          {!sessions || sessions.length === 0 ? (
            <p className="text-sm text-ink/60">
              No filings started yet. Name one and pick a financial year to begin.
            </p>
          ) : (
            <ul className="space-y-3">
              {sessions.map((s) => (
                <li key={s.id} className="hairline pb-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm">{s.name}</p>
                    <p className="text-xs text-ink/50 font-mono">
                      FY {s.financial_year} · <span className="capitalize">{s.status.replace(/_/g, " ")}</span>
                    </p>
                  </div>
                  <Link
                    href={`/session/${s.id}`}
                    className="text-xs font-mono uppercase tracking-wide text-ledger hover:underline"
                  >
                    Open →
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
