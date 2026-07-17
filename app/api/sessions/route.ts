import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { answerNode } from "@/lib/triage-engine";

export async function GET(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { data, error } = await supabase
    .from("tax_sessions")
    .select("*")
    .eq("user_id", user.id)
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

// Body: { sessionId, code, applies, notes? } for a triage answer, OR
// { sessionId, occupation } to correct the occupation after creation — kept
// as a separate branch since it doesn't touch triage_state and shouldn't
// require re-answering anything.
export async function PATCH(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = await request.json();
  const { sessionId, code, applies, notes, occupation } = body;

  const { data: session, error: fetchError } = await supabase
    .from("tax_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .single();

  if (fetchError || !session)
    return NextResponse.json({ error: "session not found" }, { status: 404 });

  if (occupation !== undefined && !code) {
    const { data, error } = await supabase
      .from("tax_sessions")
      .update({ occupation: occupation || null, updated_at: new Date().toISOString() })
      .eq("id", sessionId)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  const updatedState = answerNode(session.triage_state, code, applies, notes);

  const { data, error } = await supabase
    .from("tax_sessions")
    .update({ triage_state: updatedState, updated_at: new Date().toISOString() })
    .eq("id", sessionId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// Query: ?id= — deletes a whole filing. Records, guidance, and reports go
// with it via the on-delete-cascade foreign keys, so an old FY's entries
// can be removed entirely in one action.
export async function DELETE(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await supabase.from("tax_sessions").delete().eq("id", id).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
