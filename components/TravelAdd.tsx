"use client";

import { useEffect, useMemo, useRef, useState } from "react";

interface TravelRoute {
  id: string;
  from_place: string;
  to_place: string;
  from_lat: number | null;
  from_lon: number | null;
  to_lat: number | null;
  to_lon: number | null;
  km: number;
}

interface PlaceValue {
  label: string;
  lat?: number;
  lon?: number;
}

interface PlaceSuggestion {
  label: string;
  lat: number;
  lon: number;
}

const EMPTY: PlaceValue = { label: "" };

// A single start/stop field: type to search (previously used places first,
// then live address autocomplete via Nominatim), pick a result, and its
// coordinates come along for the ride — that's what makes automatic
// distance lookup possible afterwards.
function PlaceField({
  label,
  value,
  onChange,
  knownPlaces
}: {
  label: string;
  value: PlaceValue;
  onChange: (v: PlaceValue) => void;
  knownPlaces: PlaceValue[];
}) {
  const [query, setQuery] = useState(value.label);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setQuery(value.label), [value.label]);

  const knownMatches = useMemo(
    () =>
      query.trim().length > 0
        ? knownPlaces.filter((p) => p.label.toLowerCase().includes(query.trim().toLowerCase()))
        : knownPlaces,
    [query, knownPlaces]
  );

  function handleType(text: string) {
    setQuery(text);
    onChange({ label: text }); // typing invalidates any previously picked coordinates
    setOpen(true);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(text)}`);
        setSuggestions(res.ok ? await res.json() : []);
      } catch {
        setSuggestions([]);
      }
      setLoading(false);
    }, 400);
  }

  function pick(place: PlaceValue) {
    setQuery(place.label);
    onChange(place);
    setOpen(false);
    setSuggestions([]);
  }

  function useMyLocation() {
    if (!("geolocation" in navigator)) {
      setLocateError("Location isn't available in this browser.");
      return;
    }
    setLocating(true);
    setLocateError(null);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          const res = await fetch(`/api/geocode?lat=${latitude}&lon=${longitude}`);
          const data = await res.json();
          if (res.ok) {
            pick({ label: data.label, lat: data.lat, lon: data.lon });
          } else {
            setLocateError(data.error ?? "Couldn't resolve an address for your location.");
          }
        } catch {
          setLocateError("Couldn't resolve an address for your location.");
        }
        setLocating(false);
      },
      () => {
        setLocateError("Location permission denied.");
        setLocating(false);
      },
      { timeout: 10000 }
    );
  }

  return (
    <div className="flex-1 min-w-[180px] relative">
      <div className="flex items-center justify-between">
        <label className="text-xs font-mono uppercase tracking-wide text-muted">{label}</label>
        <button
          type="button"
          onClick={useMyLocation}
          disabled={locating}
          className="text-xs text-ledger hover:underline disabled:opacity-50"
          title="Fill in from your current location"
        >
          {locating ? "Locating…" : "📍 Use my location"}
        </button>
      </div>
      <input
        value={query}
        onChange={(e) => handleType(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search a saved place or type an address…"
        className="mt-1 w-full text-sm border border-line rounded-md px-3 py-2 bg-paper outline-none focus:border-ledger"
      />
      {value.lat !== undefined && (
        <span className="absolute right-2 top-9 text-ledger text-xs" title="Address resolved">
          ✓
        </span>
      )}
      {locateError && <p className="text-xs text-flag mt-1">{locateError}</p>}

      {open && (knownMatches.length > 0 || suggestions.length > 0 || loading) && (
        <ul className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto bg-surface border border-line rounded-md shadow-lg text-sm">
          {knownMatches.length > 0 && (
            <li className="px-3 py-1 text-xs font-mono uppercase text-muted bg-paper">Saved places</li>
          )}
          {knownMatches.map((p) => (
            <li key={`known-${p.label}`}>
              <button
                type="button"
                onMouseDown={() => pick(p)}
                className="w-full text-left px-3 py-2 hover:bg-paper truncate"
              >
                {p.label}
              </button>
            </li>
          ))}
          {loading && <li className="px-3 py-2 text-xs text-muted">Searching…</li>}
          {suggestions.length > 0 && (
            <li className="px-3 py-1 text-xs font-mono uppercase text-muted bg-paper">Addresses</li>
          )}
          {suggestions.map((s) => (
            <li key={`sugg-${s.label}`}>
              <button
                type="button"
                onMouseDown={() => pick(s)}
                className="w-full text-left px-3 py-2 hover:bg-paper truncate"
              >
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Trip-based travel deduction: search/pick start and stop (saved places or
// live address autocomplete), and the one-way distance fills itself in —
// either remembered from the last time this exact pair was used, or
// calculated automatically from the two addresses' coordinates via OSRM.
// Manual entry always stays available as an override. The claimable amount
// is computed server-side against the current ATO cents-per-km rate.
export default function TravelAdd({
  sessionId,
  onAdded
}: {
  sessionId: string;
  onAdded: (message: string) => void;
}) {
  const [routes, setRoutes] = useState<TravelRoute[]>([]);
  const [from, setFrom] = useState<PlaceValue>(EMPTY);
  const [to, setTo] = useState<PlaceValue>(EMPTY);
  const [km, setKm] = useState("");
  const [kmSource, setKmSource] = useState<"" | "remembered" | "calculated">("");
  const [calculating, setCalculating] = useState(false);
  const [returnTrip, setReturnTrip] = useState(true);
  const [trips, setTrips] = useState("1");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/travel-routes")
      .then((res) => (res.ok ? res.json() : []))
      .then(setRoutes)
      .catch(() => {});
  }, []);

  const knownPlaces = useMemo(() => {
    const byLabel = new Map<string, PlaceValue>();
    for (const r of routes) {
      if (!byLabel.has(r.from_place)) {
        byLabel.set(r.from_place, {
          label: r.from_place,
          lat: r.from_lat ?? undefined,
          lon: r.from_lon ?? undefined
        });
      }
      if (!byLabel.has(r.to_place)) {
        byLabel.set(r.to_place, { label: r.to_place, lat: r.to_lat ?? undefined, lon: r.to_lon ?? undefined });
      }
    }
    return Array.from(byLabel.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [routes]);

  // Resolve the one-way km whenever both ends are set: prefer an exact
  // remembered pair, otherwise calculate it from coordinates if both are
  // known, otherwise leave it for manual entry.
  useEffect(() => {
    const fromLabel = from.label.trim();
    const toLabel = to.label.trim();
    if (!fromLabel || !toLabel) return;

    const remembered = routes.find(
      (r) =>
        (r.from_place === fromLabel && r.to_place === toLabel) ||
        (r.from_place === toLabel && r.to_place === fromLabel)
    );
    if (remembered) {
      setKm(String(remembered.km));
      setKmSource("remembered");
      return;
    }

    if (from.lat !== undefined && from.lon !== undefined && to.lat !== undefined && to.lon !== undefined) {
      setCalculating(true);
      setKmSource("");
      fetch("/api/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: { lat: from.lat, lon: from.lon }, to: { lat: to.lat, lon: to.lon } })
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.km) {
            setKm(String(data.km));
            setKmSource("calculated");
          }
        })
        .catch(() => {})
        .finally(() => setCalculating(false));
    } else {
      setKmSource("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from.label, from.lat, from.lon, to.label, to.lat, to.lon, routes]);

  async function save() {
    const parsedKm = parseFloat(km);
    const parsedTrips = Math.max(1, parseInt(trips, 10) || 1);
    const fromLabel = from.label.trim();
    const toLabel = to.label.trim();
    if (!fromLabel || !toLabel || isNaN(parsedKm) || parsedKm <= 0) {
      setError("Pick both places and make sure a one-way distance in km is set.");
      return;
    }
    if (fromLabel === toLabel) {
      setError("Start and stop can't be the same place.");
      return;
    }
    setSaving(true);
    setError(null);

    fetch("/api/travel-routes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fromPlace: fromLabel,
        toPlace: toLabel,
        km: parsedKm,
        fromCoords: from.lat !== undefined ? { lat: from.lat, lon: from.lon } : undefined,
        toCoords: to.lat !== undefined ? { lat: to.lat, lon: to.lon } : undefined
      })
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((route) => {
        if (route) setRoutes((prev) => [...prev.filter((r) => r.id !== route.id), route]);
      })
      .catch(() => {});

    const totalKm = parsedKm * (returnTrip ? 2 : 1) * parsedTrips;
    const tripLabel = `${fromLabel} → ${toLabel}${returnTrip ? " and back" : ""}${
      parsedTrips > 1 ? ` × ${parsedTrips} trips` : ""
    }`;

    const res = await fetch("/api/records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        rawText: `Drove ${totalKm} km work-related travel in my own car on ${date} (${tripLabel} — not home-to-work commuting)`,
        fields: { date, description: `Work travel: ${tripLabel} (${totalKm} km)`, recordType: "expense" }
      })
    });
    const data = await res.json();
    setSaving(false);

    if (!res.ok) {
      setError(data.error ?? "Couldn't save the trip.");
      return;
    }

    setFrom(EMPTY);
    setTo(EMPTY);
    setKm("");
    setKmSource("");

    const amountNote =
      data.extracted?.amount !== undefined
        ? ` — $${Number(data.extracted.amount).toLocaleString()} at the current ATO cents/km rate`
        : "";
    const warning = data.date_warning ? ` ⚠ ${data.date_warning}` : "";
    onAdded(`Logged ${totalKm} km (${tripLabel})${amountNote}.${warning}`);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <PlaceField label="Start" value={from} onChange={setFrom} knownPlaces={knownPlaces} />
        <PlaceField label="Stop" value={to} onChange={setTo} knownPlaces={knownPlaces} />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs font-mono uppercase tracking-wide text-muted">
            One-way km{" "}
            {kmSource === "remembered" && <span className="text-ledger normal-case">(remembered)</span>}
            {kmSource === "calculated" && <span className="text-ledger normal-case">(auto-calculated)</span>}
            {calculating && <span className="text-muted normal-case">calculating…</span>}
          </label>
          <input
            type="number"
            step="0.1"
            min="0"
            inputMode="decimal"
            value={km}
            onChange={(e) => {
              setKm(e.target.value);
              setKmSource("");
            }}
            placeholder="km"
            className="mt-1 w-24 text-sm font-mono border border-line rounded-md px-2 py-2 bg-paper outline-none focus:border-ledger"
          />
        </div>
        <div>
          <label className="text-xs font-mono uppercase tracking-wide text-muted">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 w-full text-sm font-mono border border-line rounded-md px-2 py-2 bg-paper outline-none focus:border-ledger"
          />
        </div>
        <div>
          <label className="text-xs font-mono uppercase tracking-wide text-muted">Trips</label>
          <input
            type="number"
            min="1"
            step="1"
            value={trips}
            onChange={(e) => setTrips(e.target.value)}
            className="mt-1 w-16 text-sm font-mono border border-line rounded-md px-2 py-2 bg-paper outline-none focus:border-ledger"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-ink2 pb-2.5">
          <input type="checkbox" checked={returnTrip} onChange={(e) => setReturnTrip(e.target.checked)} />
          Return trip
        </label>
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 text-xs font-mono uppercase tracking-wide bg-ledger text-paper rounded-md hover:bg-ledgerLight disabled:opacity-50"
        >
          {saving ? "Logging…" : "+ Log trip"}
        </button>
      </div>

      <p className="text-xs text-muted">
        Type an address to search, or pick a saved place — the distance fills in automatically
        (remembered from last time, or calculated from the two addresses) and can always be
        edited by hand. Claim is computed at the current ATO cents-per-km rate (capped at 5,000 km
        per car per year). Home-to-work commuting isn't claimable — only work-related travel.
      </p>

      {error && <p className="text-xs text-flag">{error}</p>}
    </div>
  );
}
