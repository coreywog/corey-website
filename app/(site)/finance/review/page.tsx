import { redirect } from "next/navigation";

// Transaction Detail is now the Finance tab inside the Data Management Hub
// (see app/(site)/data-hub/page.tsx) — this route just forwards anyone with
// an old link or bookmark rather than 404ing them.
export default function ReviewPageRedirect() {
  redirect("/data-hub?tab=finance");
}
