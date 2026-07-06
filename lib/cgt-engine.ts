import { CryptoLot, CryptoDisposal, TaxRecord } from "./types";

// Generalizes the logic from the Dec 2025 Koinly-style report: opening
// balances are valued at market value on the Australian tax residency start
// date, every disposal is matched against lots FIFO by default, fees are
// always cost-base adjustments (never standalone income), and each disposal
// is checked against the 12-month CGT discount threshold per lot.

const DISCOUNT_ELIGIBLE_DAYS = 365;

export interface BuildLedgerInput {
  asset: string;
  acquisitions: {
    record_id: string;
    date: string;
    quantity: number;
    aud_cost: number; // purchase price + acquisition fees, in AUD
  }[];
  residencyStartDate?: string;
  residencyStartMarketValueAud?: number; // required if pre-residency holdings exist
}

export function buildCostBaseLedger(input: BuildLedgerInput): CryptoLot[] {
  const lots: CryptoLot[] = [];

  for (const acq of input.acquisitions) {
    // Pre-residency acquisitions get re-based to market value at residency
    // start date, per the opening-balance approach used previously.
    const isPreResidency =
      input.residencyStartDate && acq.date < input.residencyStartDate;

    lots.push({
      asset: input.asset,
      acquired_date: isPreResidency ? input.residencyStartDate! : acq.date,
      quantity: acq.quantity,
      cost_base_aud: isPreResidency
        ? (input.residencyStartMarketValueAud ?? acq.aud_cost)
        : acq.aud_cost,
      source_record_id: acq.record_id,
      remaining_quantity: acq.quantity
    });
  }

  // FIFO ordering by acquisition date
  return lots.sort((a, b) => a.acquired_date.localeCompare(b.acquired_date));
}

export interface DisposalInput {
  record_id: string;
  asset: string;
  date: string;
  quantity: number;
  proceeds_aud: number; // sale/swap/spend value in AUD, fees already netted out
  isBusinessTrading: boolean; // from Q18-CRYPTO-BIZ triage answer
}

export function matchDisposal(
  lots: CryptoLot[],
  disposal: DisposalInput
): CryptoDisposal {
  let remainingToMatch = disposal.quantity;
  const matched: CryptoDisposal["matched_lots"] = [];
  let totalCostBase = 0;
  let weightedHoldDays = 0;

  for (const lot of lots) {
    if (remainingToMatch <= 0) break;
    if (lot.asset !== disposal.asset || lot.remaining_quantity <= 0) continue;

    const take = Math.min(lot.remaining_quantity, remainingToMatch);
    const proportionalCost = (take / lot.quantity) * lot.cost_base_aud;

    matched.push({
      lot_id: lot.source_record_id,
      quantity: take,
      cost_base_aud: proportionalCost
    });

    totalCostBase += proportionalCost;
    const holdDays =
      (new Date(disposal.date).getTime() - new Date(lot.acquired_date).getTime()) /
      (1000 * 60 * 60 * 24);
    weightedHoldDays += holdDays * take;

    lot.remaining_quantity -= take;
    remainingToMatch -= take;
  }

  const avgHoldDays = disposal.quantity > 0 ? weightedHoldDays / disposal.quantity : 0;
  const gain = disposal.proceeds_aud - totalCostBase;

  return {
    asset: disposal.asset,
    disposal_date: disposal.date,
    quantity: disposal.quantity,
    proceeds_aud: disposal.proceeds_aud,
    matched_lots: matched,
    discount_eligible:
      !disposal.isBusinessTrading && avgHoldDays >= DISCOUNT_ELIGIBLE_DAYS && gain > 0,
    gain_or_loss_aud: gain,
    treatment: disposal.isBusinessTrading ? "income" : "capital",
    source_record_id: disposal.record_id
  };
}

// Applies the 50% CGT discount where eligible. Only ever applied to net
// capital gains, and only for individuals (not business trading treatment).
export function applyCgtDiscount(disposal: CryptoDisposal): number {
  if (disposal.treatment === "income") return disposal.gain_or_loss_aud;
  if (disposal.discount_eligible && disposal.gain_or_loss_aud > 0) {
    return disposal.gain_or_loss_aud * 0.5;
  }
  return disposal.gain_or_loss_aud;
}

export function summarizeCryptoYear(disposals: CryptoDisposal[]): {
  totalCapitalGainsAud: number;
  totalIncomeTreatedAud: number;
  totalLossesAud: number;
} {
  let totalCapitalGainsAud = 0;
  let totalIncomeTreatedAud = 0;
  let totalLossesAud = 0;

  for (const d of disposals) {
    const netAmount = applyCgtDiscount(d);
    if (d.treatment === "income") {
      totalIncomeTreatedAud += netAmount;
    } else if (netAmount >= 0) {
      totalCapitalGainsAud += netAmount;
    } else {
      totalLossesAud += Math.abs(netAmount);
    }
  }

  return { totalCapitalGainsAud, totalIncomeTreatedAud, totalLossesAud };
}
