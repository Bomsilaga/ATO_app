import Anthropic from "@anthropic-ai/sdk";
import { ColumnMapping } from "./csv-normalizer";

// Fallback for spreadsheets that don't match any hardcoded FORMAT_SIGNATURE in
// csv-normalizer.ts (e.g. a personal consolidated crypto/tax summary rather
// than a raw exchange export). Asks Claude once for a column mapping — not a
// per-row extraction — so it stays cheap regardless of file size.
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-sonnet-5";

export async function inferColumnMapping(
  headers: string[],
  sampleRows: Record<string, string>[]
): Promise<ColumnMapping | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  const prompt = `A spreadsheet of financial transactions has these columns:
${headers.join(", ")}

Sample rows:
${JSON.stringify(sampleRows.slice(0, 5), null, 2)}

Identify which column (use the exact header text from the list above, or null if none fits)
represents each of the following. A column may be used for at most one role.
- date_column: the transaction, acquisition, or disposal date
- description_column: a description or transaction type
- amount_column: the single clearest AUD dollar amount (net proceeds, value, or price)
- asset_column: an asset/currency/ticker code (e.g. BTC, ETH), if this is a crypto file
- quantity_column: a quantity/units column, if present

Return ONLY JSON, no markdown fences, no preamble:
{"date_column": string|null, "description_column": string|null, "amount_column": string|null, "asset_column": string|null, "quantity_column": string|null}`;

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }]
    });

    const text = response.content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n");
    const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());

    if (!parsed.amount_column) return null; // need at least an amount to be useful
    return parsed;
  } catch (err) {
    console.error("inferColumnMapping failed:", err instanceof Error ? err.message : err);
    return null;
  }
}
