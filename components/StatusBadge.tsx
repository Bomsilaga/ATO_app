import { RecordStatus } from "@/lib/types";

const STATUS_CONFIG: Record<RecordStatus, { label: string; className: string }> = {
  confirmed: { label: "Confirmed", className: "badge-good" },
  candidate: { label: "Needs review", className: "badge-warn" },
  unknown: { label: "Uncategorised", className: "badge-serious" },
  excluded: { label: "Excluded", className: "badge-muted" }
};

export default function StatusBadge({ status }: { status: RecordStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={`badge ${cfg.className}`}>
      <span className="badge-dot" style={{ backgroundColor: "currentColor" }} />
      {cfg.label}
    </span>
  );
}
