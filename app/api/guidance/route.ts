import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { activeCategories, isTriageComplete } from "@/lib/triage-engine";
import { ATO_CATEGORIES } from "@/lib/taxonomy";
import { fetchLiveGuidance } from "@/lib/guidance-fetcher";

// Body: { sessionId }
// Fetches guidance fresh every time this is called — no caching beyond what
// is stored for this specific session, and the session's own guidance_cache
// row is overwritten (not appended) so it's never mixed with a stale run.
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { sessionId } = await request.json();

  const { data: session, error } = await supabase
    .from("tax_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .single();

  if (error || !session) return NextResponse.json({ error: "session not found" }, { status: 404 });

  // Triage answers are the preferred source of active categories. For a
  // deductions-tracker filing that hasn't run the sweep yet, fall back to
  // the categories actually present on its records — the user shouldn't
  // need 30 triage answers before seeing guidance for the three categories
  // they've been logging all year. (The final report still nudges them to
  // finish triage so nothing is silently assumed "no".)
  let activeCodes = isTriageComplete(session.triage_state)
    ? activeCategories(session.triage_state)
    : [];

  if (activeCodes.length === 0) {
    const { data: records } = await supabase
      .from("tax_records")
      .select("category_code")
      .eq("session_id", sessionId)
      .in("status", ["candidate", "confirmed"]);
    activeCodes = Array.from(
      new Set((records ?? []).map((r) => r.category_code).filter((c): c is string => Boolean(c)))
    );
  }

  const activeNodes = ATO_CATEGORIES.filter((c) => activeCodes.includes(c.code));

  if (activeNodes.length === 0) {
    return NextResponse.json(
      { error: "no active categories yet — add at least one record (or complete triage) first" },
      { status: 400 }
    );
  }

  const guidance = await fetchLiveGuidance(activeNodes, session.financial_year);

  await supabase.from("guidance_cache").delete().eq("session_id", sessionId);
  const { data: stored, error: insertError } = await supabase
    .from("guidance_cache")
    .insert({
      session_id: sessionId,
      category_codes: guidance.category_codes,
      financial_year: guidance.financial_year,
      fetched_at: guidance.fetched_at,
      summary: guidance.summary,
      thresholds: guidance.thresholds,
      rulings_in_force: guidance.rulings_in_force,
      citations: guidance.citations
    })
    .select()
    .single();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  await supabase
    .from("tax_sessions")
    .update({ status: "ready_for_output" })
    .eq("id", sessionId);

  return NextResponse.json(stored);
}
