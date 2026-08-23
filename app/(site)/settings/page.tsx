import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { ThemeSettings } from "@/components/ThemeSettings";

export default async function SettingsPage() {
  // Proxy already gates this route, but never trust that alone — re-verify.
  const isAuthed = await requireAdminSession();
  if (!isAuthed) {
    redirect("/quietharbor");
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-10 px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-500 creamsicle:text-orange-700">
          Appearance
        </h2>
        <ThemeSettings />
      </div>
    </div>
  );
}
