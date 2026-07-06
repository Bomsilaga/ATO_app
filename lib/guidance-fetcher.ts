import Anthropic from "@anthropic-ai/sdk";
import { CategoryNode, FinancialYear, GuidanceResult } from "./types";

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
