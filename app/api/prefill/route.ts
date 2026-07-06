import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generatePrefill, computeIncomeAndDeductionTotals } from "@/lib/prefill-generator";
import { runMaximizationPass } from "@/lib/deduction-maximizer";
import { fetchIncomeTaxRates } from "@/lib/guidance-fetcher";
import { estimateTax } from "@/lib/tax-estimator";

// Query: ?sessionId= — loads the most recently generated report, if any.
export async function GET(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const sessionId = request.nextUrl.searchParams.get("sessionId");
  if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });

  const { data: session } = await supabase
    .from("tax_sessions")
    .select("id")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .single();
  if (!session) return NextResponse.json({ error: "session not found" }, { status: 404 });

  const { data: existing } = await supabase
    .from("prefill_outputs")
    .select("*")
    .eq("session_id", sessionId)
    .order("generated_at", { ascending: false })
    .limit(1)
    .single();

  return NextResponse.json(existing ?? null);
}

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

  const { totalIncome, totalDeductions, totalTaxWithheld } = computeIncomeAndDeductionTotals(records ?? []);
  let taxEstimate = null;
  try {
    const rates = await fetchIncomeTaxRates(session.financial_year);
    taxEstimate = estimateTax(totalIncome, totalDeductions, totalTaxWithheld, rates);
  } catch (err) {
    console.error("tax estimate failed:", err instanceof Error ? err.message : err);
  }

  const { data: stored, error } = await supabase
    .from("prefill_outputs")
    .insert({
      session_id: sessionId,
      generated_at: output.generated_at,
      labels: output.labels,
      plain_english_summary: output.plain_english_summary,
      agent_review_flags: output.agent_review_flags,
      disclaimer: output.disclaimer,
      tax_estimate: taxEstimate
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("tax_sessions").update({ status: "complete" }).eq("id", sessionId);

  return NextResponse.json({ ...stored, maximization_flags: flags, guidance_summary: guidance.summary });
}

// Body: { sessionId, labels } — lets the report page apply manual amount
// overrides before finalizing, then recomputes the tax estimate
// deterministically from the edited totals (record_type still drives which
// side of the ledger each label falls on, since labels are grouped by
// category not by income/expense).
export async function PATCH(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { sessionId, labels } = await request.json();
  if (!sessionId || !Array.isArray(labels)) {
    return NextResponse.json({ error: "sessionId and labels required" }, { status: 400 });
  }

  const { data: session } = await supabase
    .from("tax_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .single();
  if (!session) return NextResponse.json({ error: "session not found" }, { status: 404 });

  const { data: existing } = await supabase
    .from("prefill_outputs")
    .select("*")
    .eq("session_id", sessionId)
    .order("generated_at", { ascending: false })
    .limit(1)
    .single();
  if (!existing) return NextResponse.json({ error: "no report generated yet for this session" }, { status: 404 });

  const { data: records } = await supabase
    .from("tax_records")
    .select("*")
    .eq("session_id", sessionId)
    .eq("status", "confirmed");

  const codeToType = new Map<string, string | null>((records ?? []).map((r: any) => [r.category_code, r.record_type]));
  let totalIncome = 0;
  let totalDeductions = 0;
  for (const l of labels) {
    const amount = Number(l.amount) || 0;
    const recordType = codeToType.get(l.question_code);
    if (recordType === "income") totalIncome += amount;
    if (recordType === "expense") totalDeductions += amount;
  }
  const { totalTaxWithheld } = computeIncomeAndDeductionTotals(records ?? []);

  let taxEstimate = existing.tax_estimate;
  try {
    const rates = await fetchIncomeTaxRates(session.financial_year);
    taxEstimate = estimateTax(totalIncome, totalDeductions, totalTaxWithheld, rates);
  } catch (err) {
    console.error("tax estimate recompute failed:", err instanceof Error ? err.message : err);
  }

  const { data: updated, error } = await supabase
    .from("prefill_outputs")
    .update({ labels, tax_estimate: taxEstimate })
    .eq("id", existing.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(updated);
}
