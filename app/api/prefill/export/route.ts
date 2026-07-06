import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generatePdfReport, generateXlsxReport, generateDocxReport } from "@/lib/report-export";

export const runtime = "nodejs";

const CONTENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
};

// Query: ?sessionId=&format=pdf|xlsx|docx
export async function GET(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const sessionId = request.nextUrl.searchParams.get("sessionId");
  const format = request.nextUrl.searchParams.get("format");
  if (!sessionId || !format || !CONTENT_TYPES[format]) {
    return NextResponse.json({ error: "sessionId and a valid format (pdf, xlsx, docx) are required" }, { status: 400 });
  }

  const { data: session } = await supabase
    .from("tax_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .single();
  if (!session) return NextResponse.json({ error: "session not found" }, { status: 404 });

  const { data: report } = await supabase
    .from("prefill_outputs")
    .select("*")
    .eq("session_id", sessionId)
    .order("generated_at", { ascending: false })
    .limit(1)
    .single();
  if (!report) return NextResponse.json({ error: "no report generated yet for this session" }, { status: 404 });

  const reportData = {
    session,
    labels: report.labels ?? [],
    plainEnglishSummary: report.plain_english_summary ?? "",
    agentReviewFlags: report.agent_review_flags ?? [],
    disclaimer: report.disclaimer ?? "",
    taxEstimate: report.tax_estimate ?? null,
    generatedAt: report.generated_at
  };

  let buffer: Buffer;
  try {
    if (format === "pdf") buffer = await generatePdfReport(reportData);
    else if (format === "xlsx") buffer = generateXlsxReport(reportData);
    else buffer = await generateDocxReport(reportData);
  } catch (err) {
    console.error("report export failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Failed to generate the export — try again." }, { status: 500 });
  }

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": CONTENT_TYPES[format],
      "Content-Disposition": `attachment; filename="tax-report-${session.financial_year}.${format}"`
    }
  });
}
