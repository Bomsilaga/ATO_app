import Anthropic from "@anthropic-ai/sdk";
import { ATO_CATEGORIES, getCategoryByCode } from "./taxonomy";
import { ExtractedFields, FinancialYear, RecordType } from "./types";

// Reads a whole document — a PDF tax return, a messy crypto report, a plain
// text export, a photographed receipt — in one pass and returns only the
// genuine financial line items, each already assigned a category,
// confidence, and one-sentence reasoning (the same shape lib/classifier.ts
// produces for one typed chat line, but for a whole document).
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-sonnet-5";

const CATEGORY_LIST = ATO_CATEGORIES.filter((c) => c.question_type !== "structural")
  .map((c) => `${c.code} | ${c.question_type} | ${c.label}`)
  .join("\n");

export interface ClassifiedLine extends ExtractedFields {
  category_code: string | null;
  record_type: RecordType | null;
  confidence: number;
}

function buildPrompt(financialYear: FinancialYear): string {
  return `You are triaging a document for an Australian tax return, financial year ${financialYear}.
The document could be a tax return form, a bank/crypto exchange report, or a plain financial
summary — you don't know its exact shape in advance.

Extract ONLY genuine financial line items relevant to an individual tax return: real income,
deduction, offset, or capital gain/loss amounts.

If this is an ATO individual tax return form, pay particular attention to the income section — it
lists a payer/employer name alongside a "tax withheld" figure and an "income" figure per payer, plus
a combined total above the per-payer breakdown (extract the per-payer figures as separate line
items, not the combined total, to avoid double-counting). Numbers in adjacent table columns are
sometimes run together with no separator when a document is read as plain text (e.g. "6,73527,633"
meaning $6,735 and $27,633) — read carefully and split them correctly using valid thousands-comma
grouping, rather than skipping them as unparseable.

Skip entirely — do not return a line for any of these:
- personal details (name, address, date of birth, TFN, phone, email, bank BSB/account numbers)
- signatures, declarations, legal boilerplate, consent/authorisation text
- page headers/footers, form field labels with no associated amount
- subtotal or summary rows that just re-state a total already covered by the individual line items
  you're extracting elsewhere in the same document (never double-count)
- placeholder or zero-value rows that carry no real figure

For crypto/trading reports, extract each distinct platform/asset gain-or-loss figure as its own line
item rather than the running summary of them.

Some documents record inputs to a standard ATO deduction method instead of a direct dollar cost —
most commonly:
- Work-related kilometres driven in the taxpayer's own car (not home-to-work commuting) — claimable
  via the cents-per-kilometre method, capped at 5,000 km per car per year.
- Hours worked from home on a genuine income-producing basis — claimable via the ATO's fixed-rate
  home-office running-expenses method. Only treat hours as this if the document clearly indicates
  the work was done FROM HOME — a general staff roster or payroll hours summary with no indication
  of home-based work is NOT this, and should not have an amount invented for it.

When you find kilometres or hours that clearly qualify as one of these, use the web_search tool to
look up the CURRENT ATO rate for financial year ${financialYear} for that method, then compute
amount = quantity × rate (respecting the 5,000 km cap for the car method). Return that line with the
computed amount, category_code "D1" (car) or "D5" (home office), record_type "expense", the
quantity, the unit ("km" or "hours"), and a reasoning that states the quantity, the rate you found
and its source, and that it's a computed estimate the taxpayer should verify before lodging. If the
kilometres or hours are ambiguous as to work-relatedness or home-basis, skip that line — do not
invent a claim.

For each genuine line item, pick the single best-fitting ATO category from this list, or null if
genuinely nothing fits:
${CATEGORY_LIST}

Also decide record_type for each line: "income" if money was received (wages, sale proceeds,
interest, gains), "expense" if money was spent or is a deductible cost, or null if genuinely
unclear.

Set confidence 0-1 reflecting how sure you are, and give a one-sentence reasoning for the category
(or for why it's null).

Return ONLY JSON, no markdown fences, no preamble:
{"lines": [{"amount": number, "date": string|null, "description": string, "category_code": string|null, "record_type": "income"|"expense"|null, "confidence": number, "reasoning": string, "quantity": number|null, "unit": string|null}]}`;
}

function parseLines(responseText: string): ClassifiedLine[] {
  try {
    const parsed = JSON.parse(responseText.replace(/```json|```/g, "").trim());
    const lines = Array.isArray(parsed.lines) ? parsed.lines : [];

    return lines
      .filter((l: any) => typeof l.amount === "number" && l.amount !== 0)
      .map((l: any) => {
        const categoryCode = l.category_code ?? null;
        let recordType: RecordType | null =
          l.record_type === "income" || l.record_type === "expense" ? l.record_type : null;
        if (!recordType && categoryCode) {
          const questionType = getCategoryByCode(categoryCode)?.question_type;
          if (questionType === "income") recordType = "income";
          if (questionType === "deduction") recordType = "expense";
        }

        return {
          amount: l.amount,
          date: l.date ?? undefined,
          description: l.description || "Extracted from document",
          reasoning: l.reasoning ?? undefined,
          category_code: categoryCode,
          record_type: recordType,
          quantity: typeof l.quantity === "number" ? l.quantity : undefined,
          unit: l.unit ?? undefined,
          confidence: typeof l.confidence === "number" ? l.confidence : 0
        };
      });
  } catch {
    return [];
  }
}

// Text-based path — for CSV/plain-text uploads, where the extracted text
// already reflects the document's real structure (rows/columns or plain
// prose), so there's no layout to lose by not sending the original bytes.
export async function classifyDocumentText(
  text: string,
  financialYear: FinancialYear
): Promise<ClassifiedLine[]> {
  if (!process.env.ANTHROPIC_API_KEY) return [];

  const prompt = `${buildPrompt(financialYear)}\n\nDocument text:\n"""\n${text.slice(0, 60000)}\n"""`;

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      messages: [{ role: "user", content: prompt }],
      tools: [{ type: "web_search_20250305", name: "web_search" } as any]
    });
    const responseText = response.content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n");
    const lines = parseLines(responseText);
    if (lines.length === 0) {
      console.error(
        "classifyDocumentText: 0 lines. stop_reason:", response.stop_reason,
        "usage:", JSON.stringify(response.usage),
        "block types:", response.content.map((b: any) => b.type).join(","),
        "input length:", text.length,
        "response:", responseText.slice(0, 2000)
      );
    }
    return lines;
  } catch (err) {
    console.error("classifyDocumentText failed:", err instanceof Error ? err.message : err);
    return [];
  }
}

// Document/image-based path — for PDFs and photographed receipts. Sends the
// raw bytes so Claude reads the actual visual layout (table columns, form
// fields) instead of pdf-parse's flattened plain text, which loses exactly
// the structure needed to correctly pair a label with its value and can
// merge adjacent numbers together with no separator.
export async function classifyDocumentFile(
  buffer: Buffer,
  mediaType: string,
  financialYear: FinancialYear
): Promise<ClassifiedLine[]> {
  if (!process.env.ANTHROPIC_API_KEY) return [];

  const isPdf = mediaType === "application/pdf";
  const block = isPdf
    ? {
        type: "document" as const,
        source: { type: "base64" as const, media_type: mediaType, data: buffer.toString("base64") }
      }
    : {
        type: "image" as const,
        source: { type: "base64" as const, media_type: mediaType as any, data: buffer.toString("base64") }
      };

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      messages: [{ role: "user", content: [block, { type: "text", text: buildPrompt(financialYear) }] as any }],
      tools: [{ type: "web_search_20250305", name: "web_search" } as any]
    });
    const responseText = response.content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n");
    const lines = parseLines(responseText);
    if (lines.length === 0) {
      console.error(
        "classifyDocumentFile: 0 lines. stop_reason:", response.stop_reason,
        "usage:", JSON.stringify(response.usage),
        "block types:", response.content.map((b: any) => b.type).join(","),
        "buffer bytes:", buffer.length,
        "response:", responseText.slice(0, 2000)
      );
    }
    return lines;
  } catch (err) {
    console.error("classifyDocumentFile failed:", err instanceof Error ? err.message : err);
    return [];
  }
}
