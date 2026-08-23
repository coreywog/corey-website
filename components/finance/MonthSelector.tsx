"use client";

import { useRouter } from "next/navigation";
import { formatMonthLabel } from "@/lib/finance";

export function MonthSelector({
  months,
  selected,
}: {
  months: string[];
  selected: string;
}) {
  const router = useRouter();

  return (
    <select
      value={selected}
      onChange={(e) => router.push(`/finance?month=${e.target.value}`)}
      className="rounded-md border border-black/[.1] bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400 dark:border-white/[.15] dark:bg-zinc-900 dark:focus:border-zinc-500"
    >
      {months.map((m) => (
        <option key={m} value={m}>
          {formatMonthLabel(m)}
        </option>
      ))}
    </select>
  );
}
