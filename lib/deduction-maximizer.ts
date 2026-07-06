import { GuidanceResult, MaximizationFlag, TaxRecord, TriageNodeState } from "./types";
import { ATO_CATEGORIES } from "./taxonomy";

// Cross-references confirmed records + triage answers against live guidance
// to surface likely-eligible-but-unclaimed items. This NEVER writes an amount
// into the output on its own — every flag comes back to the user as a
// question requiring evidence, consistent with the zero-assumption principle.

export function runMaximizationPass(
  records: TaxRecord[],
  triageState: TriageNodeState[],
  guidance: GuidanceResult,
  occupation: string | null
): MaximizationFlag[] {
  const flags: MaximizationFlag[] = [];

  const answeredYesCodes = new Set(
    triageState.filter((n) => n.state === "asked_and_answered" && n.applies).map((n) => n.code)
  );
  const recordCategoryCodes = new Set(records.map((r) => r.category_code).filter(Boolean));

  // 1. Work-related categories the user confirmed apply to them (via
  // occupation or triage) but have zero supporting records yet.
  const workRelatedCodes = ["D1", "D2", "D3", "D4", "D5", "D6"];
  for (const code of workRelatedCodes) {
    if (answeredYesCodes.has(code) && !recordCategoryCodes.has(code)) {
      const node = ATO_CATEGORIES.find((c) => c.code === code);
      flags.push({
        category_code: code,
        message: `You indicated ${node?.label.toLowerCase()} may apply, but no supporting record has been added yet. Do you have receipts or a diary/logbook for this?`,
        requires_evidence: true
      });
    }
  }

  // 2. Occupation-based prompts — only ever phrased as a question.
  if (occupation) {
    flags.push({
      category_code: "D5",
      message: `Workers in "${occupation}" commonly claim tools, PPE, licences, or professional memberships. Have you incurred any of these this year?`,
      requires_evidence: true
    });
  }

  // 3. Donation deduction — flag the removed $2 minimum if guidance surfaced it.
  if (guidance.rulings_in_force.some((r) => /donation|gift/i.test(r)) && answeredYesCodes.has("D9")) {
    flags.push({
      category_code: "D9",
      message:
        "The $2 minimum for deductible gifts has been removed — even small donations to a registered charity may now be claimable. Do you have records of any donations under $2?",
      requires_evidence: true
    });
  }

  // 4. Super co-contribution — only relevant if D11 applies and income is low enough;
  // actual threshold check happens against live guidance.thresholds["SUPER-CO"].
  if (answeredYesCodes.has("D11") && guidance.thresholds["SUPER-CO"]) {
    flags.push({
      category_code: "SUPER-CO",
      message: `Based on current guidance (${guidance.thresholds["SUPER-CO"]}), you may be eligible for a government super co-contribution. Confirm your total income to check eligibility.`,
      requires_evidence: false
    });
  }

  // 5. Rental property — always flag agent review given TR changes are frequent.
  if (answeredYesCodes.has("Q21") || answeredYesCodes.has("ASSET-PROPERTY")) {
    flags.push({
      category_code: "D-RENTAL",
      message:
        "Rental property deduction rules changed materially in recent rulings — a registered tax agent review is strongly recommended before lodging this category.",
      requires_evidence: false
    });
  }

  return flags;
}
