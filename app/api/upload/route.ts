import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";
import { applyColumnMapping, normalizeCsv } from "@/lib/csv-normalizer";
import { inferColumnMapping } from "@/lib/spreadsheet-mapper";
import { extractFromText, sanitizeText } from "@/lib/text-extractor";
import { classifyDocumentText, classifyDocumentFile, ClassifiedLine } from "@/lib/document-classifier";
import { FinancialYear } from "@/lib/types";
import { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const IMAGE_MEDIA_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif"
};

async function insertClassifiedLines(
  supabase: SupabaseClient,
  lines: ClassifiedLine[],
  sessionId: string,
  filename: string,
  source: "file" | "csv",
  format: string
) {
  const insertRows = lines.map((l) => ({
    session_id: sessionId,
    source,
    raw_input: l.description ?? filename,
    extracted: { amount: l.amount, date: l.date, description: l.description, reasoning: l.reasoning },
    category_code: l.category_code,
    record_type: l.record_type,
    status: l.category_code ? ("candidate" as const) : ("unknown" as const),
    evidence_ref: filename,
    confidence: l.confidence
  }));

  const { data, error } = await supabase.from("tax_records").insert(insertRows).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ format, count: data.length, records: data });
}

// Shared by the CSV and Excel branches, since Excel is converted to CSV text
// before hitting the same normalizer. Falls back to an AI-inferred column
// mapping when no hardcoded FORMAT_SIGNATURE matches, and further falls back
// to whole-document classification when even that mapping looks degenerate
// (e.g. a consolidated report where amounts land in different columns per
// row rather than a clean fixed table).
async function handleCsvLikeText(
  supabase: SupabaseClient,
  csvText: string,
  sessionId: string,
  filename: string,
  financialYear: FinancialYear
) {
  const { format, rows, unrecognized, headers, rawRows } = normalizeCsv(csvText);

  if (!unrecognized) {
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
      evidence_ref: filename,
      confidence: 0.7
    }));

    const { data, error } = await supabase.from("tax_records").insert(insertRows).select();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ format, count: data.length, records: data });
  }

  const mapping = await inferColumnMapping(headers, rawRows);
  const mappedRows = mapping ? applyColumnMapping(rawRows, mapping) : [];
  const nonZeroCount = mappedRows.filter((r) => r.amount && r.amount !== 0).length;
  const looksDegenerate = mappedRows.length === 0 || nonZeroCount / mappedRows.length < 0.2;

  if (mapping && !looksDegenerate) {
    const insertRows = mappedRows.map((r) => ({
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
      confidence: 0.5
    }));

    const { data, error } = await supabase.from("tax_records").insert(insertRows).select();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ format: "ai_mapped", count: data.length, records: data });
  }

  // No usable column mapping (or one that mostly produced zero amounts —
  // typical of a ragged report rather than a clean table): read the whole
  // thing as a document instead of column-by-column.
  const classified = await classifyDocumentText(csvText, financialYear);
  if (classified.length === 0) {
    return NextResponse.json(
      {
        error:
          "Couldn't identify any financial line items in this spreadsheet. Supported exchange/bank layouts: Binance, CoinSpot, Independent Reserve, generic bank export."
      },
      { status: 422 }
    );
  }

  return insertClassifiedLines(supabase, classified, sessionId, filename, "csv", "ai_classified");
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

  const { data: session, error: sessionError } = await supabase
    .from("tax_sessions")
    .select("financial_year")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .single();

  if (sessionError || !session)
    return NextResponse.json({ error: "session not found" }, { status: 404 });

  const filename = file.name.toLowerCase();
  const ext = filename.split(".").pop() ?? "";
  const buffer = Buffer.from(await file.arrayBuffer());

  // --- CSV: exchange/bank exports go through the normalizer ---
  if (ext === "csv") {
    return handleCsvLikeText(supabase, buffer.toString("utf-8"), sessionId, file.name, session.financial_year);
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

    return handleCsvLikeText(supabase, csvText, sessionId, file.name, session.financial_year);
  }

  // --- PDF: classify the raw bytes directly so Claude reads the actual
  // table/form layout (payer name next to tax-withheld next to income, in
  // separate visual columns) instead of pdf-parse's flattened plain text,
  // which merges adjacent numbers together with no separator and scrambles
  // label/value pairing. Falls back to a plain per-line text dump only when
  // no ANTHROPIC_API_KEY is configured at all. ---
  if (ext === "pdf") {
    if (!process.env.ANTHROPIC_API_KEY) {
      let text = "";
      try {
        const pdfParse = (await import("pdf-parse")).default;
        const parsed = await pdfParse(buffer);
        text = sanitizeText(parsed.text);
      } catch {
        text = "";
      }

      const lines = text
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 5);

      if (lines.length === 0) {
        return NextResponse.json(
          { error: "Couldn't extract any text from this PDF — it may be scanned or image-only." },
          { status: 422 }
        );
      }

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

    const classified = await classifyDocumentFile(buffer, "application/pdf", session.financial_year);
    if (classified.length === 0) {
      return NextResponse.json(
        {
          error:
            "Couldn't identify any financial line items in this PDF (only personal details, declarations, or boilerplate were found). Add specific amounts via chat instead."
        },
        { status: 422 }
      );
    }
    return insertClassifiedLines(supabase, classified, sessionId, file.name, "file", "pdf_classified");
  }

  // --- Images: receipts, screenshots — via Claude vision ---
  const imageMediaType = IMAGE_MEDIA_TYPES[ext];
  if (imageMediaType) {
    const classified = await classifyDocumentFile(buffer, imageMediaType, session.financial_year);
    if (classified.length === 0) {
      return NextResponse.json(
        { error: "Couldn't find any financial line items in this image — make sure amounts/dates are legible." },
        { status: 422 }
      );
    }

    return insertClassifiedLines(supabase, classified, sessionId, file.name, "file", "image_classified");
  }

  // --- Plain text ---
  if (ext === "txt" || ext === "md") {
    const text = sanitizeText(buffer.toString("utf-8"));

    if (!process.env.ANTHROPIC_API_KEY) {
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

    const classified = await classifyDocumentText(text, session.financial_year);
    if (classified.length === 0) {
      return NextResponse.json(
        { error: "Couldn't identify any financial line items in this file." },
        { status: 422 }
      );
    }
    return insertClassifiedLines(supabase, classified, sessionId, file.name, "file", "text_classified");
  }

  return NextResponse.json(
    {
      error: `Unsupported file type ".${ext}". Supported: CSV, XLSX/XLS, PDF, JPG/PNG/WEBP/GIF, TXT/MD.`
    },
    { status: 422 }
  );
}
