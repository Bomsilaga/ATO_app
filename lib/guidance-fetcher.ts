import Anthropic from "@anthropic-ai/sdk";
import { CategoryNode, FinancialYear, GuidanceResult, IncomeTaxRates } from "./types";

// Fetches CURRENT ATO guidance for the active category set. This is called
// once per session (batched across all active categories, not once per
// category) and is never cached beyond the session's lifetime — thresholds,
// rulings, and rates change every financial year and sometimes mid-year, so
// nothing here should ever ship as a static baked-in dataset.

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function fetchLiveGuidance(
  categories: CategoryNode[],
  financialYear: FinancialYear
): Promise<GuidanceResult> {
  const categoryList = categories
    .map((c) => `${c.code} — ${c.label}`)
    .join("\n");

  const prompt = `You are assisting a tax preparation tool (not lodging tax returns yourself).
For the Australian financial year ${financialYear}, search the ATO website (ato.gov.au) and
provide CURRENT guidance for exactly these categories:

${categoryList}

Return ONLY a JSON object, no preamble, no markdown fences, matching this shape:
{
  "summary": "2-3 sentence plain-English summary of anything materially relevant to these categories this year",
  "thresholds": { "<category_code>": "<current threshold/rate/rule as text>" },
  "rulings_in_force": ["<any Taxation Ruling, Practical Compliance Guideline, or law change name relevant this year>"],
  "citations": [{ "title": "<page title>", "url": "<ato.gov.au url>" }]
}

Be precise about the financial year — do not use rules from a different year. If something is
uncertain or you could not verify it via search, say so plainly in the summary rather than guessing.`;

  const response = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 2000,
    messages: [{ role: "user", content: prompt }],
    tools: [{ type: "web_search_20250305", name: "web_search" } as any]
  });

  const textBlocks = response.content
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("\n");

  let parsed: any;
  try {
    const cleaned = textBlocks.replace(/```json|```/g, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    parsed = {
      summary:
        "Guidance could not be parsed automatically this session — review the raw response and verify manually before relying on it.",
      thresholds: {},
      rulings_in_force: [],
      citations: []
    };
  }

  return {
    category_codes: categories.map((c) => c.code),
    financial_year: financialYear,
    fetched_at: new Date().toISOString(),
    summary: parsed.summary ?? "",
    thresholds: parsed.thresholds ?? {},
    rulings_in_force: parsed.rulings_in_force ?? [],
    citations: parsed.citations ?? []
  };
}

// Fetches the CURRENT individual resident income tax brackets, Medicare levy
// settings, and Low Income Tax Offset parameters for the given financial
// year. Kept separate from fetchLiveGuidance (which covers category-specific
// thresholds) because these numbers feed a deterministic calculation
// (lib/tax-estimator.ts) rather than being displayed as free text — same
// "never hardcode a rate that changes every year" principle as the rest of
// this file, but returned as structured numbers instead of prose.
export async function fetchIncomeTaxRates(financialYear: FinancialYear): Promise<IncomeTaxRates> {
  const prompt = `Search the ATO website (ato.gov.au) for the CURRENT Australian individual RESIDENT
income tax rates for financial year ${financialYear}, plus the Medicare levy and Low Income Tax
Offset (LITO) parameters for the same year.

Return ONLY a JSON object, no preamble, no markdown fences, matching this shape exactly:
{
  "brackets": [{"min": number, "max": number|null, "rate": number}],
  "medicare_levy_rate": number,
  "medicare_levy_low_income_threshold": number,
  "lito": {
    "max_offset": number,
    "taper_start": number,
    "taper_rate": number,
    "taper2_start": number|null,
    "taper2_rate": number|null
  },
  "source_note": "<one sentence noting the year these rates apply to and any caveat>",
  "citations": [{"title": "<page title>", "url": "<ato.gov.au url>"}]
}

Rates are fractions, not percentages (e.g. 0.325 for 32.5%, not 32.5). "max": null means the top
bracket (no upper bound). Be precise about the financial year — do not use a different year's rates.
If LITO has only a single taper stage, set taper2_start and taper2_rate to null.`;

  const response = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1500,
    messages: [{ role: "user", content: prompt }],
    tools: [{ type: "web_search_20250305", name: "web_search" } as any]
  });

  const textBlocks = response.content
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("\n");

  let parsed: any;
  try {
    parsed = JSON.parse(textBlocks.replace(/```json|```/g, "").trim());
  } catch (err) {
    console.error("fetchIncomeTaxRates: failed to parse response:", textBlocks.slice(0, 2000));
    throw new Error("Couldn't determine current income tax rates — try again shortly.");
  }

  return {
    financial_year: financialYear,
    fetched_at: new Date().toISOString(),
    brackets: Array.isArray(parsed.brackets) ? parsed.brackets : [],
    medicare_levy_rate: typeof parsed.medicare_levy_rate === "number" ? parsed.medicare_levy_rate : 0,
    medicare_levy_low_income_threshold:
      typeof parsed.medicare_levy_low_income_threshold === "number" ? parsed.medicare_levy_low_income_threshold : 0,
    lito: {
      max_offset: parsed.lito?.max_offset ?? 0,
      taper_start: parsed.lito?.taper_start ?? 0,
      taper_rate: parsed.lito?.taper_rate ?? 0,
      taper2_start: parsed.lito?.taper2_start ?? undefined,
      taper2_rate: parsed.lito?.taper2_rate ?? undefined
    },
    source_note: parsed.source_note ?? "",
    citations: parsed.citations ?? []
  };
}
