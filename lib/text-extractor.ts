import { ExtractedFields } from "./types";

// Lightweight, dependency-free extraction of amount/date/description from a
// free-text line the user types (e.g. "sold my car for $8,000 in March").
// This is intentionally conservative: if it can't confidently find a field,
// it leaves it undefined rather than guessing, so the UI can prompt for it.

const AMOUNT_RE = /\$\s?([0-9][0-9,]*(?:\.[0-9]{1,2})?)/;
const DATE_RE =
  /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s?\d{0,4})\b/i;

export function extractFromText(raw: string): ExtractedFields {
  const fields: ExtractedFields = { description: raw.trim() };

  const amountMatch = raw.match(AMOUNT_RE);
  if (amountMatch) {
    fields.amount = parseFloat(amountMatch[1].replace(/,/g, ""));
  }

  const dateMatch = raw.match(DATE_RE);
  if (dateMatch) {
    fields.date = normalizeLooseDate(dateMatch[1]);
  }

  const counterpartyMatch = raw.match(/\bfrom\s+([A-Z][A-Za-z0-9&.\- ]{2,40})/);
  if (counterpartyMatch) {
    fields.counterparty = counterpartyMatch[1].trim();
  }

  const assetMatch = raw.match(
    /\b(BTC|ETH|bitcoin|ethereum|car|property|house|apartment|shares?|units?)\b/i
  );
  if (assetMatch) {
    fields.asset = assetMatch[1];
  }

  return fields;
}

function normalizeLooseDate(loose: string): string | undefined {
  const parsed = new Date(loose);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return undefined; // leave undefined rather than fabricate a date
}

// Returns true if the extraction found so little that the UI should prompt
// the user for missing amount/date rather than silently proceeding.
export function needsFollowUp(fields: ExtractedFields): string[] {
  const missing: string[] = [];
  if (fields.amount === undefined) missing.push("amount");
  if (fields.date === undefined) missing.push("date");
  return missing;
}
