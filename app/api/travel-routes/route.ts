import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Saved from/to distances powering the travel quick-add dropdowns. A route's
// km is entered once by the user; every later trip between the same places
// is two dropdown picks with the distance auto-filled.

export async function GET() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { data, error } = await supabase
    .from("travel_routes")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// Body: { fromPlace, toPlace, km } — upserts so re-entering a pair with a
// corrected distance just updates it.
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { fromPlace, toPlace, km } = await request.json();
  const parsedKm = Number(km);
  if (!fromPlace?.trim() || !toPlace?.trim() || !(parsedKm > 0)) {
    return NextResponse.json({ error: "fromPlace, toPlace and a positive km are required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("travel_routes")
    .upsert(
      { user_id: user.id, from_place: fromPlace.trim(), to_place: toPlace.trim(), km: parsedKm },
      { onConflict: "user_id,from_place,to_place" }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// Query: ?routeId=
export async function DELETE(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const routeId = request.nextUrl.searchParams.get("routeId");
  if (!routeId) return NextResponse.json({ error: "routeId required" }, { status: 400 });

  const { error } = await supabase.from("travel_routes").delete().eq("id", routeId).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
