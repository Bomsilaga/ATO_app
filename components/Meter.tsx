// A ratio against a limit (triage progress, classifier confidence) — filled
// track in the accent hue, unfilled track a lighter step of the same ramp.
export default function Meter({ value, height = 6 }: { value: number; height?: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <div className="meter-track w-full" style={{ height }}>
      <div className="meter-fill h-full" style={{ width: `${pct}%` }} />
    </div>
  );
}
