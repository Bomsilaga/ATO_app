"use client";

import { useEffect, useMemo, useState } from "react";

interface TravelRoute {
  id: string;
  from_place: string;
  to_place: string;
  km: number;
}

const NEW_PLACE = "__new__";

// Trip-based travel deduction: pick start and stop from saved places, and
// the one-way distance fills itself in from the last time this pair was
// used (either direction). First time on a new pair, enter the km once —
// after that it's remembered. The claimable amount is computed server-side
// against the current ATO cents-per-km rate, never hardcoded here.
export default function TravelAdd({
  sessionId,
  onAdded
}: {
  sessionId: string;
  onAdded: (message: string) => void;
}) {
  const [routes, setRoutes] = useState<TravelRoute[]>([]);
  const [fromPlace, setFromPlace] = useState("");
  const [toPlace, setToPlace] = useState("");
  const [newFrom, setNewFrom] = useState("");
  const [newTo, setNewTo] = useState("");
  const [km, setKm] = useState("");
  const [kmAutoFilled, setKmAutoFilled] = useState(false);
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

  const places = useMemo(() => {
    const set = new Set<string>();
    for (const r of routes) {
      set.add(r.from_place);
      set.add(r.to_place);
    }
    return Array.from(set).sort();
  }, [routes]);

  const effectiveFrom = fromPlace === NEW_PLACE ? newFrom.trim() : fromPlace;
  const effectiveTo = toPlace === NEW_PLACE ? newTo.trim() : toPlace;

  // Auto-fill the distance when a known pair is selected (either direction).
  useEffect(() => {
    if (!effectiveFrom || !effectiveTo) return;
    const match = routes.find(
      (r) =>
        (r.from_place === effectiveFrom && r.to_place === effectiveTo) ||
        (r.from_place === effectiveTo && r.to_place === effectiveFrom)
    );
    if (match) {
      setKm(String(match.km));
      setKmAutoFilled(true);
    } else {
      setKmAutoFilled(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveFrom, effectiveTo, routes]);

  async function save() {
    const parsedKm = parseFloat(km);
    const parsedTrips = Math.max(1, parseInt(trips, 10) || 1);
    if (!effectiveFrom || !effectiveTo || isNaN(parsedKm) || parsedKm <= 0) {
      setError("Pick (or type) both places and a one-way distance in km.");
      return;
    }
    if (effectiveFrom === effectiveTo) {
      setError("Start and stop can't be the same place.");
      return;
    }
    setSaving(true);
    setError(null);

    // Remember the pair for next time (fire-and-forget on failure — the
    // deduction itself matters more than the saved route).
    fetch("/api/travel-routes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromPlace: effectiveFrom, toPlace: effectiveTo, km: parsedKm })
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((route) => {
        if (route) {
          setRoutes((prev) => [...prev.filter((r) => r.id !== route.id), route]);
        }
      })
      .catch(() => {});

    const totalKm = parsedKm * (returnTrip ? 2 : 1) * parsedTrips;
    const tripLabel = `${effectiveFrom} → ${effectiveTo}${returnTrip ? " and back" : ""}${
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

    const amountNote =
      data.extracted?.amount !== undefined
        ? ` — $${Number(data.extracted.amount).toLocaleString()} at the current ATO cents/km rate`
        : "";
    const warning = data.date_warning ? ` ⚠ ${data.date_warning}` : "";
    onAdded(`Logged ${totalKm} km (${tripLabel})${amountNote}.${warning}`);
  }

  const placePicker = (
    value: string,
    setValue: (v: string) => void,
    newValue: string,
    setNewValue: (v: string) => void,
    label: string
  ) => (
    <div className="flex-1 min-w-[140px]">
      <label className="text-xs font-mono uppercase tracking-wide text-muted">{label}</label>
      <select
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="mt-1 w-full text-sm border border-line rounded-md px-2 py-2 bg-surface text-ink"
      >
        <option value="">Choose…</option>
        {places.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
        <option value={NEW_PLACE}>+ New place…</option>
      </select>
      {value === NEW_PLACE && (
        <input
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          placeholder="Name or address"
          className="mt-1 w-full text-sm border border-line rounded-md px-2 py-1.5 bg-paper outline-none focus:border-ledger"
        />
      )}
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        {placePicker(fromPlace, setFromPlace, newFrom, setNewFrom, "Start")}
        {placePicker(toPlace, setToPlace, newTo, setNewTo, "Stop")}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs font-mono uppercase tracking-wide text-muted">
            One-way km {kmAutoFilled && <span className="text-ledger normal-case">(remembered)</span>}
          </label>
          <input
            type="number"
            step="0.1"
            min="0"
            inputMode="decimal"
            value={km}
            onChange={(e) => {
              setKm(e.target.value);
              setKmAutoFilled(false);
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
        Claim is computed at the current ATO cents-per-km rate (capped at 5,000 km per car per
        year). Home-to-work commuting isn't claimable — only work-related travel.
      </p>

      {error && <p className="text-xs text-flag">{error}</p>}
    </div>
  );
}
