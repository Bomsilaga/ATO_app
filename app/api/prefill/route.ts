import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generatePrefill } from "@/lib/prefill-generator";
import { runMaximizationPass } from "@/lib/deduction-maximizer";

// Body: { sessionId }
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { sessionId } = await request.json();

  const { data: session } = await supabase
    .from("tax_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .single();

  if (!session) return NextResponse.json({ error: "session not found" }, { status: 404 });

  const { data: records } = await supabase
    .from("tax_records")
    .select("*")
    .eq("session_id", sessionId)
    .eq("status", "confirmed");

  const { data: guidanceRows } = await supabase
    .from("guidance_cache")
    .select("*")
    .eq("session_id", sessionId)
    .order("fetched_at", { ascending: false })
    .limit(1);

  const guidance = guidanceRows?.[0];
  if (!guidance) {
    return NextResponse.json(
      { error: "no guidance fetched yet for this session — fetch guidance first" },
      { status: 409 }
    );
  }

  const flags = runMaximizationPass(
    records ?? [],
    session.triage_state,
    {
      category_codes: guidance.category_codes,
      financial_year: guidance.financial_year,
      fetched_at: guidance.fetched_at,
      summary: guidance.summary,
      thresholds: guidance.thresholds,
      rulings_in_force: guidance.rulings_in_force,
      citations: guidance.citations
    },
    session.occupation
  );

  const output = generatePrefill(sessionId, session.financial_year, records ?? [], flags);

  const { data: stored, error } = await supabase
    .from("prefill_outputs")
    .insert({
      session_id: sessionId,
      generated_at: output.generated_at,
      labels: output.labels,
      plain_english_summary: output.plain_english_summary,
      agent_review_flags: output.agent_review_flags,
      disclaimer: output.disclaimer
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("tax_sessions").update({ status: "complete" }).eq("id", sessionId);

  return NextResponse.json({ ...stored, maximization_flags: flags, guidance_summary: guidance.summary });
}
