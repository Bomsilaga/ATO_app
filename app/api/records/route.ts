import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractFromText } from "@/lib/text-extractor";
import { classifyRecord } from "@/lib/classifier";

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

// Body: { sessionId, rawText, categoryCode? }
// Free-text / chat input path. When the caller doesn't already know the
// category, the note is classified server-side against the ATO taxonomy for
// this session's financial year, so the client never embeds classification
// logic and the chat can show the result immediately.
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = await request.json();
  const { sessionId, rawText, categoryCode } = body;

  if (!sessionId || !rawText) {
    return NextResponse.json({ error: "sessionId and rawText required" }, { status: 400 });
  }

  const { data: session, error: sessionError } = await supabase
    .from("tax_sessions")
    .select("financial_year")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .single();

  if (sessionError || !session)
    return NextResponse.json({ error: "session not found" }, { status: 404 });

  const classification = categoryCode
    ? {
        category_code: categoryCode as string,
        record_type: null as "income" | "expense" | null,
        confidence: 0.6,
        extracted: extractFromText(rawText),
        clarification_question: null as string | null
      }
    : await classifyRecord(rawText, session.financial_year);

  const { data, error } = await supabase
    .from("tax_records")
    .insert({
      session_id: sessionId,
      source: "text",
      raw_input: rawText,
      extracted: classification.extracted,
      category_code: classification.category_code,
      record_type: classification.record_type,
      status: classification.category_code ? "candidate" : "unknown",
      confidence: classification.confidence
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ...data, clarification_question: classification.clarification_question });
}

// Body: { recordId, status, categoryCode? }
// Used to confirm a candidate record, exclude it, or reclassify it.
export async function PATCH(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = await request.json();
  const { recordId, status, categoryCode, recordType } = body;

  const updatePayload: Record<string, unknown> = {};
  if (status) updatePayload.status = status;
  if (categoryCode !== undefined) updatePayload.category_code = categoryCode || null;
  if (recordType !== undefined) updatePayload.record_type = recordType || null;

  const { data, error } = await supabase
    .from("tax_records")
    .update(updatePayload)
    .eq("id", recordId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
