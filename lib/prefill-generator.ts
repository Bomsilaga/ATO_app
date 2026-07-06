import {
  TaxRecord,
  PrefillLabel,
  PrefillOutput,
  FinancialYear,
  MaximizationFlag
} from "./types";
import { getCategoryByCode } from "./taxonomy";

const DISCLAIMER =
  "This is a tax preparation aid, not tax advice and not a lodged return. Verify every figure " +
  "against your own records and current ATO guidance before lodging. Categories flagged for agent " +
  "review should be checked by a registered tax agent, particularly capital gains, rental property, " +
  "foreign income, and business income.";

export function generatePrefill(
  sessionId: string,
  financialYear: FinancialYear,
  confirmedRecords: TaxRecord[],
  maximizationFlags: MaximizationFlag[]
): PrefillOutput {
  const byCategory = new Map<string, TaxRecord[]>();

  for (const record of confirmedRecords) {
    if (!record.category_code) continue;
    const list = byCategory.get(record.category_code) ?? [];
    list.push(record);
    byCategory.set(record.category_code, list);
  }

  const labels: PrefillLabel[] = [];

  for (const [code, records] of byCategory.entries()) {
    const node = getCategoryByCode(code);
    if (!node) continue;

    const total = records.reduce((sum, r) => sum + (r.extracted.amount ?? 0), 0);

    labels.push({
      question_code: code,
      label: node.label,
      amount: round2(total),
      contributing_record_ids: records.map((r) => r.id),
      agent_review_recommended: node.requires_agent_review
    });
  }

  const agentFlags = labels
    .filter((l) => l.agent_review_recommended)
    .map((l) => `${l.question_code} — ${l.label}`)
    .concat(
      maximizationFlags
        .filter((f) => !f.requires_evidence)
        .map((f) => f.message)
    );

  const summary = buildPlainEnglishSummary(labels);

  return {
    session_id: sessionId,
    financial_year: financialYear,
    generated_at: new Date().toISOString(),
    labels: labels.sort((a, b) => a.question_code.localeCompare(b.question_code)),
    plain_english_summary: summary,
    agent_review_flags: agentFlags,
    disclaimer: DISCLAIMER
  };
}

function buildPlainEnglishSummary(labels: PrefillLabel[]): string {
  if (labels.length === 0) {
    return "No confirmed records yet — complete triage and add records before generating a summary.";
  }
  const lines = labels.map(
    (l) => `${l.question_code} (${l.label}): $${l.amount.toLocaleString()}`
  );
  return `Based on confirmed records this session:\n${lines.join("\n")}`;
}

// Raw totals feeding the deterministic tax estimate (lib/tax-estimator.ts) —
// kept separate from the label breakdown above since these sum by
// record_type (income vs expense), not by category.
export function computeIncomeAndDeductionTotals(confirmedRecords: TaxRecord[]) {
  let totalIncome = 0;
  let totalDeductions = 0;
  let totalTaxWithheld = 0;

  for (const r of confirmedRecords) {
    const amount = Math.abs(r.extracted.amount ?? 0);
    if (r.record_type === "income") totalIncome += amount;
    if (r.record_type === "expense") totalDeductions += amount;
    totalTaxWithheld += r.extracted.tax_withheld ?? 0;
  }

  return { totalIncome: round2(totalIncome), totalDeductions: round2(totalDeductions), totalTaxWithheld: round2(totalTaxWithheld) };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
