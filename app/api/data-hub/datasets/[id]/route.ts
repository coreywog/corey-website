import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/auth";
import { DatasetColumnsSchema, type DatasetColumn } from "@/lib/datasetCsv";
import { DatasetComputedColumnsSchema, parseFormula, FormulaError } from "@/lib/datasetFormula";

const COLUMN_KINDS = ["text", "number", "date"] as const;

const patchSchema = z
  .object({
    // Only ever re-labels an existing raw column's display kind — never
    // adds/removes/renames a raw column, so this is a name->kind map, not a
    // full array replace (which would let a malformed request silently
    // drop columns the CSV actually has).
    columnKinds: z.record(z.string(), z.enum(COLUMN_KINDS)).optional(),
    computedColumns: DatasetComputedColumnsSchema.max(30).optional(),
  })
  .refine((v) => v.columnKinds !== undefined || v.computedColumns !== undefined, { message: "Nothing to update" });

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const isAuthed = await requireAdminSession();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  const dataset = await prisma.dataset.findUnique({ where: { id }, select: { columns: true } });
  if (!dataset) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const existingColumns = DatasetColumnsSchema.safeParse(dataset.columns);
  if (!existingColumns.success) {
    return NextResponse.json({ error: "This dataset's column info is out of date" }, { status: 409 });
  }
  const rawNames = new Set(existingColumns.data.map((c) => c.name));

  const data: { columns?: DatasetColumn[]; computedColumns?: { name: string; formula: string }[] } = {};

  const columnKinds = parsed.data.columnKinds;
  if (columnKinds) {
    for (const name of Object.keys(columnKinds)) {
      if (!rawNames.has(name)) {
        return NextResponse.json({ error: `No column named "${name}" on this dataset` }, { status: 400 });
      }
    }
    data.columns = existingColumns.data.map((c) => (columnKinds[c.name] ? { ...c, kind: columnKinds[c.name] } : c));
  }

  if (parsed.data.computedColumns) {
    const names = new Set<string>();
    for (const cc of parsed.data.computedColumns) {
      if (rawNames.has(cc.name)) {
        return NextResponse.json({ error: `"${cc.name}" is already a column on this dataset` }, { status: 400 });
      }
      if (names.has(cc.name)) {
        return NextResponse.json({ error: `Duplicate computed column name "${cc.name}"` }, { status: 400 });
      }
      names.add(cc.name);
      // Formulas may only reference raw columns, not other computed ones —
      // keeps evaluation a single pass with no dependency ordering or cycle
      // detection to get right.
      const refs = [...cc.formula.matchAll(/\[([^\]]*)\]/g)].map((m) => m[1].trim());
      for (const ref of refs) {
        if (!rawNames.has(ref)) {
          return NextResponse.json(
            { error: `"${cc.name}": [${ref}] isn't a column on this dataset (computed columns can't reference each other)` },
            { status: 400 },
          );
        }
      }
      try {
        parseFormula(cc.formula);
      } catch (err) {
        const message = err instanceof FormulaError ? err.message : "Invalid formula";
        return NextResponse.json({ error: `"${cc.name}": ${message}` }, { status: 400 });
      }
    }
    data.computedColumns = parsed.data.computedColumns;
  }

  try {
    await prisma.dataset.update({ where: { id }, data });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Failed to update dataset", err);
    return NextResponse.json({ error: "Failed to update dataset" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Proxy already gates this route, but never trust that alone — re-verify.
  const isAuthed = await requireAdminSession();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  try {
    // ON DELETE CASCADE (see migration) takes its rows with it.
    await prisma.dataset.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Failed to delete dataset", err);
    return NextResponse.json({ error: "Failed to delete dataset" }, { status: 500 });
  }
}
