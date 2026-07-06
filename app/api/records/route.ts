import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractFromText, looksLikeMultiItemPaste } from "@/lib/text-extractor";
import { classifyRecord } from "@/lib/classifier";
import { classifyDocumentText } from "@/lib/document-classifier";

export async function GET(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const sessionId = request.nextUrl.searchParams.get("sessionId");
  if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });

  const { data, error } = await supabase
    .from("tax_records")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// Body: { sessionId, rawText, categoryCode?, recordId? }
// Free-text / chat input path. When the caller doesn't already know the
// category, the note is classified server-side against the ATO taxonomy for
// this session's financial year, so the client never embeds classification
// logic and the chat can show the result immediately.
//
// recordId is set when rawText is a clarification-question follow-up rather
// than a brand new note — the caller merges the accumulated conversation
// text itself and passes back the record to update, so answering "23 may
// 2026" re-classifies the FULL merged note (not that bare date alone) and
// updates the same row instead of leaving an orphaned duplicate behind.
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = await request.json();
  const { sessionId, rawText, categoryCode, recordId } = body;

  if (!sessionId || !rawText) {
    return NextResponse.json({ error: "sessionId and rawText required" }, { status: 400 });
  }

  const { data: session, error: sessionError } = await supabase
    .from("tax_sessions")
    .select("financial_year, occupation")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .single();

  if (sessionError || !session)
    return NextResponse.json({ error: "session not found" }, { status: 404 });

  // A pasted email, receipt, or statement dump usually contains several
  // genuine line items rather than one scanty note — extract all of them in
  // one pass instead of forcing the single-note classifier to guess at just
  // one amount from a much longer blob.
  if (!categoryCode && looksLikeMultiItemPaste(rawText)) {
    const lines = await classifyDocumentText(rawText, session.financial_year, session.occupation);
    if (lines.length > 1) {
      const insertRows = lines.map((l) => ({
        session_id: sessionId,
        source: "text" as const,
        raw_input: l.description ?? rawText.slice(0, 200),
        extracted: {
          amount: l.amount,
          date: l.date,
          description: l.description,
          reasoning: l.reasoning,
          quantity: l.quantity,
          unit: l.unit,
          tax_withheld: l.tax_withheld
        },
        category_code: l.category_code,
        record_type: l.record_type,
        status: l.category_code ? ("candidate" as const) : ("unknown" as const),
        confidence: l.confidence
      }));

      const { data, error } = await supabase.from("tax_records").insert(insertRows).select();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      return NextResponse.json({ multi: true, count: data.length, records: data });
    }
    // 0 or 1 line found — fall through to the single-note classifier below,
    // which still gives a clarification question if something's missing.
  }

  const classification = categoryCode
    ? {
        category_code: categoryCode as string,
        record_type: null as "income" | "expense" | null,
        confidence: 0.6,
        extracted: extractFromText(rawText),
        clarification_question: null as string | null
      }
    : await classifyRecord(rawText, session.financial_year, session.occupation);

  const row = {
    session_id: sessionId,
    source: "text" as const,
    raw_input: rawText,
    extracted: classification.extracted,
    category_code: classification.category_code,
    record_type: classification.record_type,
    status: classification.category_code ? ("candidate" as const) : ("unknown" as const),
    confidence: classification.confidence
  };

  const { data, error } = recordId
    ? await supabase.from("tax_records").update(row).eq("id", recordId).select().single()
    : await supabase.from("tax_records").insert(row).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ...data, clarification_question: classification.clarification_question });
}

// Body: { recordId, status?, categoryCode?, recordType?, extracted? }
// Used to confirm a candidate record, exclude it, reclassify it, or edit its
// auto-filled amount/date/description (extracted is merged, not replaced, so
// callers only need to send the fields they changed).
export async function PATCH(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = await request.json();
  const { recordId, status, categoryCode, recordType, extracted } = body;

  const updatePayload: Record<string, unknown> = {};
  if (status) updatePayload.status = status;
  if (categoryCode !== undefined) updatePayload.category_code = categoryCode || null;
  if (recordType !== undefined) updatePayload.record_type = recordType || null;

  if (extracted && typeof extracted === "object") {
    const { data: existing } = await supabase
      .from("tax_records")
      .select("extracted")
      .eq("id", recordId)
      .single();
    updatePayload.extracted = { ...(existing?.extracted ?? {}), ...extracted };
  }

  const { data, error } = await supabase
    .from("tax_records")
    .update(updatePayload)
    .eq("id", recordId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// Query: ?recordId= — permanently removes a record (unlike "excluded" status,
// which keeps it around but out of totals). RLS already scopes this to the
// caller's own records via the session ownership policy.
export async function DELETE(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const recordId = request.nextUrl.searchParams.get("recordId");
  if (!recordId) return NextResponse.json({ error: "recordId required" }, { status: 400 });

  const { error } = await supabase.from("tax_records").delete().eq("id", recordId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
