import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import NewFilingForm from "@/components/NewFilingForm";
import FilingList from "@/components/FilingList";
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
          <FilingList filings={filings} />
        </div>
      </section>
    </main>
  );
}
