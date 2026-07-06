import Papa from "papaparse";
import { ExtractedFields } from "./types";

export interface NormalizedTxn extends ExtractedFields {
  raw_row: Record<string, string>;
  detected_format: string;
}

// Column signatures for common exchange/bank export formats. Extend this map
// as new formats are encountered — the detector picks the first signature
// whose required columns are all present (case-insensitive).
const FORMAT_SIGNATURES: {
  name: string;
  requiredColumns: string[];
  map: (row: Record<string, string>) => ExtractedFields;
}[] = [
  {
    name: "binance",
    requiredColumns: ["UTC_Time", "Coin", "Change"],
    map: (row) => ({
      date: safeDate(row["UTC_Time"]),
      asset: row["Coin"],
      quantity: safeNumber(row["Change"]),
      description: `${row["Operation"] ?? "Binance transaction"} ${row["Coin"] ?? ""}`.trim(),
      amount: safeNumber(row["Change"])
    })
  },
  {
    name: "coinspot",
    requiredColumns: ["Market", "Type", "Amount", "Rate"],
    map: (row) => ({
      date: safeDate(row["Date"] ?? row["date"]),
      asset: row["Market"],
      quantity: safeNumber(row["Amount"]),
      amount: safeNumber(row["Amount"]) * safeNumber(row["Rate"]),
      description: `CoinSpot ${row["Type"]} ${row["Market"]}`.trim()
    })
  },
  {
    name: "independent_reserve",
    requiredColumns: ["Primary Currency Code", "Secondary Currency Code", "Volume"],
    map: (row) => ({
      date: safeDate(row["Created Timestamp Utc"]),
      asset: row["Primary Currency Code"],
      quantity: safeNumber(row["Volume"]),
      description: `Independent Reserve ${row["Order Type"] ?? "transaction"}`.trim()
    })
  },
  {
    name: "generic_bank",
    requiredColumns: ["Date", "Description", "Amount"],
    map: (row) => ({
      date: safeDate(row["Date"]),
      description: row["Description"],
      amount: safeNumber(row["Amount"])
    })
  }
];

export function safeNumber(v: string | undefined): number {
  if (!v) return 0;
  const n = parseFloat(v.replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}

export function safeDate(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
}

export function detectFormat(headerRow: string[]): (typeof FORMAT_SIGNATURES)[number] | null {
  const lowerHeaders = headerRow.map((h) => h.trim().toLowerCase());
  for (const sig of FORMAT_SIGNATURES) {
    const allPresent = sig.requiredColumns.every((col) =>
      lowerHeaders.includes(col.toLowerCase())
    );
    if (allPresent) return sig;
  }
  return null;
}

export function normalizeCsv(csvText: string): {
  format: string;
  rows: NormalizedTxn[];
  unrecognized: boolean;
  headers: string[];
  rawRows: Record<string, string>[];
} {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true
  });

  const headers = parsed.meta.fields ?? [];
  const signature = detectFormat(headers);

  if (!signature) {
    return { format: "unknown", rows: [], unrecognized: true, headers, rawRows: parsed.data };
  }

  const rows: NormalizedTxn[] = parsed.data.map((row) => ({
    ...signature.map(row),
    raw_row: row,
    detected_format: signature.name
  }));

  return { format: signature.name, rows, unrecognized: false, headers, rawRows: parsed.data };
}

// Column-name → field mapping, used when no hardcoded FORMAT_SIGNATURE matches
// (see lib/spreadsheet-mapper.ts, which infers this mapping via Claude).
export interface ColumnMapping {
  date_column: string | null;
  description_column: string | null;
  amount_column: string | null;
  asset_column: string | null;
  quantity_column: string | null;
}

export function applyColumnMapping(
  rows: Record<string, string>[],
  mapping: ColumnMapping
): NormalizedTxn[] {
  return rows.map((row) => ({
    date: mapping.date_column ? safeDate(row[mapping.date_column]) : undefined,
    description: mapping.description_column ? row[mapping.description_column] : undefined,
    amount: mapping.amount_column ? safeNumber(row[mapping.amount_column]) : undefined,
    asset: mapping.asset_column ? row[mapping.asset_column] : undefined,
    quantity: mapping.quantity_column ? safeNumber(row[mapping.quantity_column]) : undefined,
    raw_row: row,
    detected_format: "ai_mapped"
  }));
}
