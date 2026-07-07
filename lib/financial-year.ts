import { FinancialYear } from "./types";

// Australian financial year: "2025-26" runs 1 July 2025 - 30 June 2026.
// Every date the classifiers extract should actually fall inside the
// session's own financial year — a transaction dated outside that range
// belongs to a different filing entirely, and silently accepting it (while
// still telling the user "filed for FY2025-26") would be actively wrong.

export function financialYearRange(fy: FinancialYear): { start: string; end: string } {
  const startYear = parseInt(fy.split("-")[0], 10);
  const endYear = startYear + 1;
  return { start: `${startYear}-07-01`, end: `${endYear}-06-30` };
}

export function isDateInFinancialYear(date: string, fy: FinancialYear): boolean {
  const { start, end } = financialYearRange(fy);
  return date >= start && date <= end;
}

// Which FY a date actually belongs to, for building a clear mismatch message.
export function whichFinancialYear(date: string): FinancialYear {
  const d = new Date(date);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  const startYear = month >= 7 ? year : year - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}
