import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/auth";
import { encryptText } from "@/lib/crypto";
import { parseCsvToDataset } from "@/lib/datasetCsv";

// Bounds worst-case upload/decrypt/render cost — a hub tab renders its
// whole dataset today (no pagination yet), so this caps that at something
// that stays fast rather than letting one huge file slow the page down.
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_ROWS = 20_000;

export async function GET() {
  // Proxy already gates this route, but never trust that alone — re-verify.
  const isAuthed = await requireAdminSession();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const datasets = await prisma.dataset.findMany({
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true, columns: true, _count: { select: { rows: true } } },
  });
  return NextResponse.json({ datasets });
}

/**
 * Uploads a CSV as a new Dataset tab in Data Management. XLSX isn't
 * supported yet — the only maintained parser (the `xlsx` npm package) ships
 * with two unpatched high-severity CVEs (prototype pollution, ReDoS) for
 * exactly this — parsing an untrusted uploaded file — so it isn't worth
 * pulling in until there's a safe way to do it. CSV export is standard from
 * basically every source this is meant to cover in the meantime.
 */
export async function POST(request: NextRequest) {
  const isAuthed = await requireAdminSession();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  const name = formData?.get("name");

  if (!(file instanceof File) || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "A name and a file are required" }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".csv")) {
    return NextResponse.json({ error: "Only .csv files are supported right now" }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "File is too large (5MB max)" }, { status: 400 });
  }

  const text = await file.text();
  const parsed = parseCsvToDataset(text);
  if (parsed.rows.length === 0) {
    return NextResponse.json({ error: "No rows found in that file" }, { status: 400 });
  }
  if (parsed.rows.length > MAX_ROWS) {
    return NextResponse.json({ error: `Too many rows (${parsed.rows.length.toLocaleString()}, max ${MAX_ROWS.toLocaleString()})` }, { status: 400 });
  }

  try {
    const maxOrder = await prisma.dataset.aggregate({ _max: { order: true } });
    const dataset = await prisma.dataset.create({
      data: {
        name: name.trim(),
        order: (maxOrder._max.order ?? -1) + 1,
        columns: parsed.columns,
      },
    });
    // One encrypt call per row (not per cell) — see prisma/schema.prisma's
    // DatasetRow comment on why: this can be a wide file, and per-cell
    // encryption would multiply the crypto cost for no real benefit.
    await prisma.datasetRow.createMany({
      data: parsed.rows.map((row) => ({ datasetId: dataset.id, data: encryptText(JSON.stringify(row)) })),
    });
    return NextResponse.json({ dataset: { id: dataset.id, name: dataset.name, rowCount: parsed.rows.length } }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && "code" in err && err.code === "P2002") {
      return NextResponse.json({ error: "A dataset with that name already exists" }, { status: 409 });
    }
    console.error("Failed to create dataset", err);
    return NextResponse.json({ error: "Failed to save dataset" }, { status: 500 });
  }
}
