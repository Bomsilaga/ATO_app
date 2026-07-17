import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { searchPlaces, drivingDistanceKm, reverseGeocode } from "@/lib/geocoding";

// Query: ?q= — address/place autocomplete. Or ?lat=&lon= — reverse geocode
// (e.g. the browser's current location) into a display address. Both
// proxied server-side since Nominatim requires a real User-Agent and
// disallows direct browser calls.
export async function GET(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const lat = request.nextUrl.searchParams.get("lat");
  const lon = request.nextUrl.searchParams.get("lon");
  if (lat && lon) {
    const label = await reverseGeocode(parseFloat(lat), parseFloat(lon));
    if (!label) return NextResponse.json({ error: "Couldn't resolve an address for that location." }, { status: 422 });
    return NextResponse.json({ label, lat: parseFloat(lat), lon: parseFloat(lon) });
  }

  const q = request.nextUrl.searchParams.get("q") ?? "";
  const suggestions = await searchPlaces(q);
  return NextResponse.json(suggestions);
}

// Body: { from: {lat, lon}, to: {lat, lon} } — one-way driving distance.
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { from, to } = await request.json();
  if (!from?.lat || !to?.lat) {
    return NextResponse.json({ error: "from and to coordinates required" }, { status: 400 });
  }

  const km = await drivingDistanceKm(from, to);
  if (km === null) return NextResponse.json({ error: "Couldn't calculate a driving distance for that pair." }, { status: 422 });

  return NextResponse.json({ km });
}
