// Address autocomplete + driving distance, both via free OSM-backed
// services (no API key, fine for a single-user app). Server-side only —
// Nominatim's usage policy requires a real User-Agent and forbids
// client-side/browser-direct calls, so both routes proxy through our own
// API rather than being hit straight from the browser.

const USER_AGENT = "ATO-Triage-App/1.0 (personal tax tracker)";

export interface PlaceSuggestion {
  label: string;
  lat: number;
  lon: number;
}

export async function searchPlaces(query: string): Promise<PlaceSuggestion[]> {
  if (query.trim().length < 3) return [];

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "5");
  url.searchParams.set("countrycodes", "au");

  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) return [];
  const data = await res.json();
  if (!Array.isArray(data)) return [];

  return data.map((r: any) => ({
    label: r.display_name,
    lat: parseFloat(r.lat),
    lon: parseFloat(r.lon)
  }));
}

// Reverse geocode: turn a lat/lon (e.g. from the browser's current
// location) into a human-readable address, for "use my current location"
// auto-fill.
export async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lon));
  url.searchParams.set("format", "jsonv2");

  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.display_name ?? null;
}

// One-way driving distance in km between two coordinates.
export async function drivingDistanceKm(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number }
): Promise<number | null> {
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=false`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) return null;
  const data = await res.json();
  const meters = data?.routes?.[0]?.distance;
  if (typeof meters !== "number") return null;
  return Math.round((meters / 1000) * 10) / 10;
}
