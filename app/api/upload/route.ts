import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";
import { applyColumnMapping, normalizeCsv } from "@/lib/csv-normalizer";
import { inferColumnMapping } from "@/lib/spreadsheet-mapper";
import { extractFromText } from "@/lib/text-extractor";
import { extractLinesFromDocument } from "@/lib/document-extractor";
import { ExtractedFields } from "@/lib/types";
import { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const IMAGE_MEDIA_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif"
};

// Shared by the CSV and Excel branches, since Excel is converted to CSV text
// before hitting the same normalizer. Falls back to an AI-inferred column
// mapping when no hardcoded FORMAT_SIGNATURE matches, instead of failing
// outright on spreadsheets that aren't a raw exchange/bank export.
async function handleCsvLikeText(
  supabase: SupabaseClient,
  csvText: string,
  sessionId: string,
  filename: string
) {
  const { format, rows, unrecognized, headers, rawRows } = normalizeCsv(csvText);

  let finalRows = rows;
  let finalFormat = format;

  if (unrecognized) {
    const mapping = await inferColumnMapping(headers, rawRows);
    if (!mapping) {
      return NextResponse.json(
        {
          error:
            "Unrecognised spreadsheet columns. Supported: Binance, CoinSpot, Independent Reserve, generic bank export layouts."
        },
        { status: 422 }
      );
    }
    finalRows = applyColumnMapping(rawRows, mapping);
    finalFormat = "ai_mapped";
  }

  const insertRows = finalRows.map((r) => ({
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
    evidence_ref: filename,
    confidence: finalFormat === "ai_mapped" ? 0.5 : 0.7
  }));

  const { data, error } = await supabase.from("tax_records").insert(insertRows).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ format: finalFormat, count: data.length, records: data });
}

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
  const ext = filename.split(".").pop() ?? "";
  const buffer = Buffer.from(await file.arrayBuffer());

  async function insertExtractedLines(lines: ExtractedFields[], confidence: number, format: string) {
    const insertRows = lines.map((f) => ({
      session_id: sessionId,
      source: "file" as const,
      raw_input: f.description ?? file!.name,
      extracted: f,
      category_code: null,
      status: "unknown" as const,
      evidence_ref: file!.name,
      confidence
    }));
    const { data, error } = await supabase.from("tax_records").insert(insertRows).select();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ format, count: data.length, records: data });
  }

  // --- CSV: exchange/bank exports go through the normalizer ---
  if (ext === "csv") {
    return handleCsvLikeText(supabase, buffer.toString("utf-8"), sessionId, file.name);
  }

  // --- Excel: convert the first sheet to CSV, then reuse the same path ---
  if (ext === "xlsx" || ext === "xls") {
    let csvText: string;
    try {
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      csvText = XLSX.utils.sheet_to_csv(firstSheet);
    } catch {
      return NextResponse.json(
        { error: "Couldn't read this spreadsheet — is it a valid .xlsx/.xls file?" },
        { status: 422 }
      );
    }

    return handleCsvLikeText(supabase, csvText, sessionId, file.name);
  }

  // --- PDF: try plain text extraction first; fall back to Claude document
  // understanding for scanned, signed, or otherwise non-text-extractable PDFs ---
  if (ext === "pdf") {
    let lines: string[] = [];
    try {
      const pdfParse = (await import("pdf-parse")).default;
      const parsed = await pdfParse(buffer);
      lines = parsed.text
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 5);
    } catch {
      lines = [];
    }

    if (lines.length > 0) {
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

    const extracted = await extractLinesFromDocument(buffer, "application/pdf");
    if (extracted.length === 0) {
      return NextResponse.json(
        {
          error:
            "Couldn't extract any text or line items from this PDF — it may be scanned, signed, or image-only. Try adding the details via chat instead."
        },
        { status: 422 }
      );
    }

    return await insertExtractedLines(extracted, 0.5, "pdf_vision");
  }

  // --- Images: receipts, screenshots — via Claude vision ---
  const imageMediaType = IMAGE_MEDIA_TYPES[ext];
  if (imageMediaType) {
    const extracted = await extractLinesFromDocument(buffer, imageMediaType);
    if (extracted.length === 0) {
      return NextResponse.json(
        { error: "Couldn't find any line items in this image — make sure amounts/dates are legible." },
        { status: 422 }
      );
    }

    return await insertExtractedLines(extracted, 0.5, "image_vision");
  }

  // --- Plain text ---
  if (ext === "txt" || ext === "md") {
    const lines = buffer
      .toString("utf-8")
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

  return NextResponse.json(
    {
      error: `Unsupported file type ".${ext}". Supported: CSV, XLSX/XLS, PDF, JPG/PNG/WEBP/GIF, TXT/MD.`
    },
    { status: 422 }
  );
}
