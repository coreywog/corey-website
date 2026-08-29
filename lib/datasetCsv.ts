// Parses uploaded CSVs for the Data Management Hub. Hand-rolled rather than
// a dependency (Papaparse, etc.) — correct CSV parsing (quoted fields,
// embedded commas/newlines, escaped quotes) is a small, self-contained,
// well-understood problem, and every dependency here is one more thing
// shipped to the server bundle for something this narrow. Server-only:
// never imported from a "use client" file, so it has no client-bundle cost
// regardless.

import { z } from "zod";

export type ColumnKind = "text" | "number" | "date";
export type DatasetColumn = { name: string; kind: ColumnKind };
export type ParsedDataset = { columns: DatasetColumn[]; rows: Record<string, string>[] };

// Validates Dataset.columns on read — it's JSON precisely because the shape
// is arbitrary per upload, so the same "don't trust it blindly" rule as
// DashboardWidget.config applies (see lib/dashboardConfig.ts): only this
// app's own upload route ever writes it, but a bad/stale value should
// render as an empty table, not crash the page.
export const DatasetColumnsSchema = z.array(z.object({ name: z.string(), kind: z.enum(["text", "number", "date"]) }));

/** RFC-4180-ish: quoted fields, "" as an escaped quote, CRLF or LF. */
function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  while (i < n) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      continue;
    }
    if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += c;
    i++;
  }
  // Final field/row — the file doesn't have to end with a trailing newline.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop wholly-blank lines (a trailing newline produces one; so can blank
  // lines in the middle of a hand-edited export).
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

const NUMBER_PATTERN = /^-?\d+(\.\d+)?$/;

function inferKind(sampleValues: string[]): ColumnKind {
  const nonEmpty = sampleValues.map((v) => v.trim()).filter((v) => v !== "");
  if (nonEmpty.length === 0) return "text";
  if (nonEmpty.every((v) => NUMBER_PATTERN.test(v))) return "number";
  // Date.parse accepts a lot of near-misses (bare numbers, single words) —
  // requiring a 4-digit year alongside a successful parse rules those out
  // without needing a real date-parsing library for what's just a type hint.
  if (nonEmpty.every((v) => /\d{4}/.test(v) && !Number.isNaN(Date.parse(v)))) return "date";
  return "text";
}

/**
 * Column kind is inferred from a sample (not every row) — purely a display
 * hint for the table (right-align numbers, etc.), not used for validation
 * or coercion, so a few outliers in a huge file don't need a full scan to
 * classify correctly enough to be useful.
 */
export function parseCsvToDataset(text: string, sampleSize = 200): ParsedDataset {
  const allRows = parseCsvRows(text);
  const [headerRow, ...dataRows] = allRows;
  const headers = (headerRow ?? []).map((h, i) => h.trim() || `Column ${i + 1}`);

  const sample = dataRows.slice(0, sampleSize);
  const columns: DatasetColumn[] = headers.map((name, colIdx) => ({
    name,
    kind: inferKind(sample.map((r) => r[colIdx] ?? "")),
  }));

  const rows: Record<string, string>[] = dataRows.map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((name, i) => {
      obj[name] = r[i] ?? "";
    });
    return obj;
  });

  return { columns, rows };
}
