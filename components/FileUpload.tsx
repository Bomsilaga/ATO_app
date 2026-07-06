"use client";

import { useRef, useState } from "react";

export default function FileUpload({
  sessionId,
  onUploaded
}: {
  sessionId: string;
  onUploaded: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setStatus("Uploading…");
    setError(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("sessionId", sessionId);

    const res = await fetch("/api/upload", { method: "POST", body: formData });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Upload failed");
      setStatus(null);
      return;
    }

    setStatus(`${data.count} record(s) added from ${data.format} format`);
    onUploaded();
  }

  return (
    <div className="hairline pb-4">
      <label className="text-xs font-mono uppercase tracking-wide text-ink/60">
        Upload CSV (crypto/bank export), PDF, or text file
      </label>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.pdf,.txt"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        className="mt-2 block w-full text-sm file:mr-3 file:py-1.5 file:px-3 file:border file:border-ledger file:text-ledger file:bg-transparent file:text-xs file:font-mono file:uppercase"
      />
      {status && <p className="mt-2 text-xs text-ledger">{status}</p>}
      {error && <p className="mt-2 text-xs text-flag">{error}</p>}
    </div>
  );
}
