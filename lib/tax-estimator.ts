import { IncomeTaxRates, TaxEstimate } from "./types";

// Pure arithmetic only — no AI calls here. The rates themselves come from a
// live lookup (lib/guidance-fetcher.ts's fetchIncomeTaxRates) since brackets,
// the Medicare levy, and LITO change most years, but once we have those
// numbers the actual tax calculation is deterministic and must not be left
// to a language model to compute, same principle as the FIFO cost-base
// matching in cgt-engine.ts.

function taxOnIncome(taxableIncome: number, brackets: IncomeTaxRates["brackets"]): number {
  let tax = 0;
  for (const bracket of brackets) {
    if (taxableIncome <= bracket.min) continue;
    const upper = bracket.max ?? Infinity;
    const amountInBracket = Math.min(taxableIncome, upper) - bracket.min;
    if (amountInBracket > 0) tax += amountInBracket * bracket.rate;
  }
  return tax;
}

function litoOffset(taxableIncome: number, lito: IncomeTaxRates["lito"]): number {
  if (taxableIncome <= lito.taper_start) return lito.max_offset;

  let offset = lito.max_offset - (taxableIncome - lito.taper_start) * lito.taper_rate;

  if (lito.taper2_start !== undefined && lito.taper2_rate !== undefined && taxableIncome > lito.taper2_start) {
    const stage1Offset = lito.max_offset - (lito.taper2_start - lito.taper_start) * lito.taper_rate;
    offset = stage1Offset - (taxableIncome - lito.taper2_start) * lito.taper2_rate;
  }

  return Math.max(0, round2(offset));
}

// Simplified: full Medicare levy above the low-income threshold, nil below
// it. Omits the shade-in phase-in band just above the threshold — flagged
// in the estimate's notes since this is an estimate, not a lodgement.
function medicareLevy(taxableIncome: number, rates: IncomeTaxRates): number {
  if (taxableIncome <= rates.medicare_levy_low_income_threshold) return 0;
  return round2(taxableIncome * rates.medicare_levy_rate);
}

export function estimateTax(
  totalIncome: number,
  totalDeductions: number,
  totalTaxWithheld: number,
  rates: IncomeTaxRates
): TaxEstimate {
  const taxableIncome = Math.max(0, round2(totalIncome - totalDeductions));
  const grossTax = round2(taxOnIncome(taxableIncome, rates.brackets));
  const lito = litoOffset(taxableIncome, rates.lito);
  const levy = medicareLevy(taxableIncome, rates);
  const totalPayable = Math.max(0, round2(grossTax - lito + levy));
  const netResult = round2(totalTaxWithheld - totalPayable);

  return {
    financial_year: rates.financial_year,
    total_income: round2(totalIncome),
    total_deductions: round2(totalDeductions),
    taxable_income: taxableIncome,
    tax_on_taxable_income: grossTax,
    lito_offset: lito,
    medicare_levy: levy,
    total_tax_payable: totalPayable,
    total_tax_withheld: round2(totalTaxWithheld),
    net_result: netResult,
    is_refund: netResult >= 0,
    notes:
      "Estimate only — assumes full Medicare levy above the low-income threshold with no phase-in " +
      "band, and does not account for HECS/HELP repayments, Medicare levy surcharge, or offsets " +
      "beyond LITO. Verify with a registered tax agent before lodging. " + rates.source_note,
    citations: rates.citations
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
