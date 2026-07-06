import Anthropic from "@anthropic-ai/sdk";
import { ATO_CATEGORIES } from "./taxonomy";
import { ExtractedFields, FinancialYear } from "./types";

// Whole-document version of lib/classifier.ts: instead of classifying one
// scanty chat line, this reads an entire extracted document (a PDF tax
// return, a messy crypto report, a plain-text export) in one pass and
// returns only the genuine financial line items — filtering out personal
// details, signatures, declarations, and boilerplate, and avoiding
// double-counting subtotals against the line items that make them up.
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-sonnet-5";

const CATEGORY_LIST = ATO_CATEGORIES.filter((c) => c.question_type !== "structural")
  .map((c) => `${c.code} | ${c.question_type} | ${c.label}`)
  .join("\n");

export interface ClassifiedLine extends ExtractedFields {
  category_code: string | null;
  confidence: number;
}

const MAX_CHARS = 60000; // comfortably within context; documents rarely exceed this

export async function classifyDocumentText(
  text: string,
  financialYear: FinancialYear
): Promise<ClassifiedLine[]> {
  if (!process.env.ANTHROPIC_API_KEY) return [];

  const prompt = `You are triaging a document for an Australian tax return, financial year ${financialYear}.
The document could be a tax return form, a bank/crypto exchange report, or a plain financial summary —
you don't know its exact shape in advance.

Extract ONLY genuine financial line items relevant to an individual tax return: real income, deduction,
offset, or capital gain/loss amounts.

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
{"lines": [{"amount": number, "date": string|null, "description": string, "category_code": string|null, "confidence": number, "reasoning": string}]}

Document text:
"""
${text.slice(0, MAX_CHARS)}
"""`;

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
