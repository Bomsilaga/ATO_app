"use client";

import { useRef, useState } from "react";

interface FileStatus {
  name: string;
  state: "pending" | "uploading" | "done" | "error";
  message?: string;
}

export default function FileUpload({
  sessionId,
  onUploaded
}: {
  sessionId: string;
  onUploaded: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<FileStatus[]>([]);
  const [busy, setBusy] = useState(false);

  async function handleFiles(fileList: FileList) {
    const selected = Array.from(fileList);
    setBusy(true);
    setFiles(selected.map((f) => ({ name: f.name, state: "pending" })));

    // Sequential rather than parallel: each upload can trigger a full-document
    // AI classification call, so this keeps load predictable and per-file
    // progress easy to follow.
    for (let i = 0; i < selected.length; i++) {
      const file = selected[i];
      setFiles((prev) => prev.map((f, idx) => (idx === i ? { ...f, state: "uploading" } : f)));

      const formData = new FormData();
      formData.append("file", file);
      formData.append("sessionId", sessionId);

      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();

      setFiles((prev) =>
        prev.map((f, idx) =>
          idx === i
            ? res.ok
              ? { ...f, state: "done", message: `${data.count} record(s) added (${data.format})` }
              : { ...f, state: "error", message: data.error ?? "Upload failed" }
            : f
        )
      );

      if (res.ok) onUploaded();
    }

    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div>
      <label className="text-xs font-mono uppercase tracking-wide text-ink2">
        Upload CSV, Excel, PDF, receipt photos, or text files
      </label>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".csv,.xlsx,.xls,.pdf,.txt,.md,.jpg,.jpeg,.png,.webp,.gif"
        onChange={(e) => e.target.files && e.target.files.length > 0 && handleFiles(e.target.files)}
        disabled={busy}
        className="mt-2 block w-full text-sm file:mr-3 file:py-1.5 file:px-3 file:border file:border-ledger file:rounded-md file:text-ledger file:bg-transparent file:text-xs file:font-mono file:uppercase file:cursor-pointer disabled:opacity-50"
      />

      {files.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {files.map((f, i) => (
            <li key={i} className="flex items-center justify-between gap-3 text-xs">
              <span className="text-ink truncate">{f.name}</span>
              <span
                className={
                  f.state === "error"
                    ? "text-flag shrink-0"
                    : f.state === "done"
                      ? "text-ledger shrink-0"
                      : "text-muted shrink-0"
                }
              >
                {f.state === "pending" && "Queued…"}
                {f.state === "uploading" && "Uploading…"}
                {(f.state === "done" || f.state === "error") && f.message}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
