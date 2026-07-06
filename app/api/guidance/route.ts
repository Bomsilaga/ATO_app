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

  if (!isTriageComplete(session.triage_state)) {
    return NextResponse.json(
      { error: "triage incomplete — every category must be answered before fetching guidance" },
      { status: 409 }
    );
  }

  const activeCodes = activeCategories(session.triage_state);
  const activeNodes = ATO_CATEGORIES.filter((c) => activeCodes.includes(c.code));

  if (activeNodes.length === 0) {
    return NextResponse.json({ error: "no active categories to fetch guidance for" }, { status: 400 });
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
