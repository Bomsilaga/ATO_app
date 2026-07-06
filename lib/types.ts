// Core domain types for the ATO triage engine.
// Every record and category starts "unknown" — nothing is assumed true or false
// until the triage engine has explicitly asked and the user has answered.

export type FinancialYear = string; // e.g. "2025-26"

export type QuestionType = "income" | "deduction" | "offset" | "structural";

export type RecordSource = "text" | "file" | "csv" | "api" | "manual";

export type RecordStatus = "unknown" | "candidate" | "confirmed" | "excluded";

export type RecordType = "income" | "expense";

export interface ExtractedFields {
  amount?: number;
  date?: string; // ISO date
  description?: string;
  counterparty?: string;
  asset?: string; // for crypto/shares/property
  quantity?: number;
  unit?: string; // unit for quantity, e.g. "km" or "hours" — set when amount was computed from a rate
  reasoning?: string; // one-sentence "why this category" from the classifier, for display
  tax_withheld?: number; // PAYG tax withheld associated with this income line (e.g. per-payer ITR figure)
}

export interface TaxRecord {
  id: string;
  session_id: string;
  source: RecordSource;
  raw_input: string;
  extracted: ExtractedFields;
  category_code: string | null; // maps to CategoryNode.code
  record_type: RecordType | null; // income vs expense — auto-set by the classifier, user-editable
  status: RecordStatus;
  evidence_ref: string | null; // uploaded file path, if any
  confidence: number; // 0-1, classifier confidence
  created_at: string;
}

export interface CategoryNode {
  code: string; // e.g. "D5", "Q21", "T1"
  label: string;
  question_type: QuestionType;
  triage_prompt: string;
  requires_agent_review: boolean;
  parent_group: string; // e.g. "employment", "property", "crypto", "offsets"
}

export type TriageAnswerState = "unknown" | "asked_and_answered";

export interface TriageNodeState {
  code: string;
  state: TriageAnswerState;
  applies: boolean | null; // null until answered
  notes?: string;
}

export interface TaxSession {
  id: string;
  user_id: string;
  name: string;
  financial_year: FinancialYear;
  occupation: string | null;
  triage_state: TriageNodeState[];
  status: "in_progress" | "guidance_pending" | "ready_for_output" | "complete";
  created_at: string;
  updated_at: string;
}

export interface CryptoLot {
  asset: string;
  acquired_date: string;
  quantity: number;
  cost_base_aud: number; // total AUD cost base for this lot (incl. acquisition fees)
  source_record_id: string;
  remaining_quantity: number;
}

export interface CryptoDisposal {
  asset: string;
  disposal_date: string;
  quantity: number;
  proceeds_aud: number;
  matched_lots: { lot_id: string; quantity: number; cost_base_aud: number }[];
  discount_eligible: boolean; // held > 12 months
  gain_or_loss_aud: number;
  treatment: "capital" | "income"; // capital = CGT event, income = business trading
  source_record_id: string;
}

export interface GuidanceResult {
  category_codes: string[];
  financial_year: FinancialYear;
  fetched_at: string;
  summary: string;
  thresholds: Record<string, string>;
  rulings_in_force: string[];
  citations: { title: string; url: string }[];
}

export interface MaximizationFlag {
  category_code: string;
  message: string;
  requires_evidence: boolean;
}

export interface PrefillLabel {
  question_code: string; // e.g. "D5", "Q21"
  label: string;
  amount: number;
  contributing_record_ids: string[];
  agent_review_recommended: boolean;
}

export interface PrefillOutput {
  session_id: string;
  financial_year: FinancialYear;
  generated_at: string;
  labels: PrefillLabel[];
  plain_english_summary: string;
  agent_review_flags: string[];
  disclaimer: string;
}

export interface TaxBracket {
  min: number;
  max: number | null; // null = no upper bound (top bracket)
  rate: number; // marginal rate, e.g. 0.32 for 32%
}

export interface LitoParams {
  max_offset: number;
  taper_start: number;
  taper_rate: number;
  taper2_start?: number;
  taper2_rate?: number;
}

export interface IncomeTaxRates {
  financial_year: FinancialYear;
  fetched_at: string;
  brackets: TaxBracket[];
  medicare_levy_rate: number; // e.g. 0.02
  medicare_levy_low_income_threshold: number; // below this, levy is nil (simplified — no shade-in band)
  lito: LitoParams;
  source_note: string;
  citations: { title: string; url: string }[];
}

export interface TaxEstimate {
  financial_year: FinancialYear;
  total_income: number;
  total_deductions: number;
  taxable_income: number;
  tax_on_taxable_income: number;
  lito_offset: number;
  medicare_levy: number;
  total_tax_payable: number;
  total_tax_withheld: number;
  net_result: number; // positive = refund, negative = amount owing
  is_refund: boolean;
  notes: string;
  citations: { title: string; url: string }[];
}
