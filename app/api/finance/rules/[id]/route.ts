import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/auth";

/**
 * Deletes a saved merchant rule. Does NOT revert transactions it already
 * applied to — those keep whatever category/subcategory they were last
 * set to, same as any other manual edit; this only stops the rule from
 * matching future transactions.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  // Proxy already gates this route, but never trust that alone — re-verify.
  const isAuthed = await requireAdminSession();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    await prisma.merchantCategoryRule.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Failed to delete merchant rule", err);
    return NextResponse.json({ error: "Failed to delete rule" }, { status: 500 });
  }
}
