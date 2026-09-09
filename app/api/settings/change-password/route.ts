import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession, getCurrentUsername } from "@/lib/auth";
import { changePassword, MIN_PASSWORD_LENGTH } from "@/lib/adminCredentials";

const bodySchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(MIN_PASSWORD_LENGTH),
});

/** Settings' "Change password" form — see lib/adminCredentials.ts for the
 * actual verify-then-rehash logic. Changes whichever account is actually
 * logged in (getCurrentUsername, from the session token) — never any
 * other account, even though every account has identical access. Requires
 * the current password (not just an active session) so a session left
 * open on a shared computer can't be used to lock the real account holder
 * out. */
export async function POST(request: NextRequest) {
  // Proxy already gates this route, but never trust that alone — re-verify.
  const isAuthed = await requireAdminSession();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const username = await getCurrentUsername();
  if (!username) {
    // Should be unreachable given requireAdminSession just passed (both
    // read the same token), but never assume — a session token from
    // before username was added to it would hit exactly this.
    return NextResponse.json({ error: "Your session is out of date — please log in again." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
      { status: 400 },
    );
  }

  const result = await changePassword(username, parsed.data.currentPassword, parsed.data.newPassword);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
