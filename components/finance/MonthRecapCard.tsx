"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatMonthLabel } from "@/lib/finance";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/**
 * Compact month-level recap — income vs spending as two bars (no daily
 * detail), plus the net figure. Six of these sit in a row for the trailing
 * 6 calendar months, distinct from the full daily trend chart above them.
 */
export function MonthRecapCard({
  month,
  income,
  spending,
  net,
}: {
  month: string; // "YYYY-MM"
  income: number;
  spending: number;
  net: number;
}) {
  const data = [{ name: "", Income: income, Spending: spending }];
  const label = formatMonthLabel(month).split(" ")[0]; // "February 2026" -> "February"

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-black/[.08] p-3 dark:border-white/[.1]">
      <span className="text-xs font-medium text-zinc-500">{label}</span>
      <span
        className={
          net >= 0
            ? "text-sm font-semibold text-emerald-600 dark:text-emerald-400"
            : "text-sm font-semibold text-rose-600 dark:text-rose-400"
        }
      >
        {net >= 0 ? "+" : "-"}
        {currencyFormatter.format(Math.abs(net))}
      </span>
      <div className="h-16 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <Tooltip
              formatter={(value) => currencyFormatter.format(Number(value))}
              labelFormatter={() => ""}
              contentStyle={{ fontSize: 11, borderRadius: 6 }}
            />
            <Bar dataKey="Income" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={28} />
            <Bar dataKey="Spending" fill="#f43f5e" radius={[3, 3, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
