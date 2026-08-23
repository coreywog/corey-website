"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export type BarDatum = { key: string; label: string; total: number; color: string };

/**
 * Bar chart of category/subcategory/merchant totals, colored per item.
 * `mode` controls how `selectedKey` affects rendering: "isolate" filters
 * down to just the selected bar; "highlight" keeps every bar visible but
 * dims everything except the selected one. Selection is driven by a paired
 * list component elsewhere — this chart never triggers it itself.
 */
export function SpendingBarChart({
  data,
  mode,
  selectedKey,
}: {
  data: BarDatum[];
  mode: "isolate" | "highlight";
  selectedKey: string | null;
}) {
  if (data.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-zinc-500">
        No spending in this range.
      </div>
    );
  }

  const visibleData = mode === "isolate" && selectedKey ? data.filter((d) => d.key === selectedKey) : data;

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={visibleData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            interval={0}
            angle={-35}
            textAnchor="end"
            height={56}
          />
          <YAxis
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={56}
            tickFormatter={(v) => currencyFormatter.format(v)}
          />
          <Tooltip
            formatter={(value) => currencyFormatter.format(Number(value))}
            contentStyle={{ fontSize: 12, borderRadius: 6 }}
          />
          <Bar dataKey="total" radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive={false}>
            {visibleData.map((d) => (
              <Cell
                key={d.key}
                fill={d.color}
                opacity={mode === "highlight" && selectedKey && selectedKey !== d.key ? 0.25 : 1}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
