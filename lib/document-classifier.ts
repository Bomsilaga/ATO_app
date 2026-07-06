import Anthropic from "@anthropic-ai/sdk";
import { ATO_CATEGORIES } from "./taxonomy";
import { ExtractedFields, FinancialYear } from "./types";

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

For each genuine line item, pick the single best-fitting ATO category from this list, or null if
genuinely nothing fits:
${CATEGORY_LIST}

Set confidence 0-1 reflecting how sure you are, and give a one-sentence reasoning for the category
(or for why it's null).

Return ONLY JSON, no markdown fences, no preamble:
{"lines": [{"amount": number, "date": string|null, "description": string, "category_code": string|null, "confidence": number, "reasoning": string}]}`;
}

function parseLines(responseText: string): ClassifiedLine[] {
  try {
    const parsed = JSON.parse(responseText.replace(/```json|```/g, "").trim());
    const lines = Array.isArray(parsed.lines) ? parsed.lines : [];

    return lines
      .filter((l: any) => typeof l.amount === "number" && l.amount !== 0)
      .map((l: any) => ({
        amount: l.amount,
        date: l.date ?? undefined,
        description: l.description || "Extracted from document",
        reasoning: l.reasoning ?? undefined,
        category_code: l.category_code ?? null,
        confidence: typeof l.confidence === "number" ? l.confidence : 0
      }));
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
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }]
    });
    const responseText = response.content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n");
    return parseLines(responseText);
  } catch {
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
      max_tokens: 4000,
      messages: [{ role: "user", content: [block, { type: "text", text: buildPrompt(financialYear) }] as any }]
    });
    const responseText = response.content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n");
    return parseLines(responseText);
  } catch {
    return [];
  }
}
