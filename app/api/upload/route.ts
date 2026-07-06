import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizeCsv } from "@/lib/csv-normalizer";
import { extractFromText } from "@/lib/text-extractor";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const sessionId = formData.get("sessionId") as string | null;

  if (!file || !sessionId) {
    return NextResponse.json({ error: "file and sessionId required" }, { status: 400 });
  }

  const filename = file.name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  // --- CSV path: exchange/bank exports go through the normalizer ---
  if (filename.endsWith(".csv")) {
    const text = buffer.toString("utf-8");
    const { format, rows, unrecognized } = normalizeCsv(text);

    if (unrecognized) {
      return NextResponse.json(
        {
          error:
            "Unrecognised CSV format. Supported: Binance, CoinSpot, Independent Reserve, generic bank export."
        },
        { status: 422 }
      );
    }

    const insertRows = rows.map((r) => ({
      session_id: sessionId,
      source: "csv" as const,
      raw_input: JSON.stringify(r.raw_row),
      extracted: {
        amount: r.amount,
        date: r.date,
        description: r.description,
        asset: r.asset,
        quantity: r.quantity
      },
      category_code: r.asset ? "ASSET-CRYPTO" : null,
      status: "candidate" as const,
      evidence_ref: file.name,
      confidence: 0.7
    }));

    const { data, error } = await supabase.from("tax_records").insert(insertRows).select();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ format, count: data.length, records: data });
  }

  // --- PDF path: extract text, then run the same free-text extractor per line ---
  if (filename.endsWith(".pdf")) {
    const pdfParse = (await import("pdf-parse")).default;
    const parsed = await pdfParse(buffer);
    const lines = parsed.text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 5);

    const insertRows = lines.slice(0, 200).map((line) => ({
      session_id: sessionId,
      source: "file" as const,
      raw_input: line,
      extracted: extractFromText(line),
      category_code: null,
      status: "unknown" as const,
      evidence_ref: file.name,
      confidence: 0.3
    }));

    const { data, error } = await supabase.from("tax_records").insert(insertRows).select();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ format: "pdf_text", count: data.length, records: data });
  }

  // --- Plain text fallback ---
  const text = buffer.toString("utf-8");
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 5);

  const insertRows = lines.slice(0, 200).map((line) => ({
    session_id: sessionId,
    source: "file" as const,
    raw_input: line,
    extracted: extractFromText(line),
    category_code: null,
    status: "unknown" as const,
    evidence_ref: file.name,
    confidence: 0.3
  }));

  const { data, error } = await supabase.from("tax_records").insert(insertRows).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ format: "plain_text", count: data.length, records: data });
}
