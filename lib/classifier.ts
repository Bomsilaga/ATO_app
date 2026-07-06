import Anthropic from "@anthropic-ai/sdk";
import { ATO_CATEGORIES } from "./taxonomy";
import { ExtractedFields, FinancialYear } from "./types";
import { extractFromText } from "./text-extractor";

// Turns a scanty chat message ("laptop $1500 june") into a categorised
// record: an ATO category code, extracted amount/date/description, and a
// clarification question when something essential is missing. Runs once
// per chat message so the UI can show the categorisation immediately.

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-haiku-4-5-20251001";

const CATEGORY_LIST = ATO_CATEGORIES.filter((c) => c.question_type !== "structural")
  .map((c) => `${c.code} | ${c.question_type} | ${c.label}`)
  .join("\n");

export interface ClassificationResult {
  category_code: string | null;
  confidence: number; // 0-1
  extracted: ExtractedFields;
  clarification_question: string | null;
}

function fallback(rawText: string): ClassificationResult {
  return {
    category_code: null,
    confidence: 0,
    extracted: extractFromText(rawText),
    clarification_question: null
  };
}

export async function classifyRecord(
  rawText: string,
  financialYear: FinancialYear
): Promise<ClassificationResult> {
  if (!process.env.ANTHROPIC_API_KEY) return fallback(rawText);

  const prompt = `You are triaging a single free-text note into an Australian Tax Office (ATO)
individual tax return category for financial year ${financialYear}.

Categories (code | type | label):
${CATEGORY_LIST}

Note from the taxpayer: "${rawText.replace(/"/g, "'")}"

Extract the amount (AUD number, no symbols), date (ISO yyyy-mm-dd — infer the year from financial
year ${financialYear} if only a day/month is given), and a short description. Pick the single
best-fitting category code, or null if genuinely nothing fits. Set confidence 0-1 reflecting how
sure you are. If a key detail is missing or ambiguous (no amount, no date, unclear whether it's
income or a deduction), set clarification_question to one short question asking for exactly what's
missing, else null.

Return ONLY JSON, no markdown fences, no preamble:
{"category_code": string|null, "confidence": number, "amount": number|null, "date": string|null, "description": string, "clarification_question": string|null}`;

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }]
    });

    const text = response.content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n");
    const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());

    return {
      category_code: parsed.category_code ?? null,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
      extracted: {
        amount: parsed.amount ?? undefined,
        date: parsed.date ?? undefined,
        description: parsed.description || rawText.trim()
      },
      clarification_question: parsed.clarification_question ?? null
    };
  } catch {
    return fallback(rawText);
  }
}
