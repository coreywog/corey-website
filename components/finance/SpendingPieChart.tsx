"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { BarDatum } from "./SpendingBarChart";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/** Pie chart of the same category/subcategory/merchant totals as the paired bar chart and list — dims every slice except `selectedKey` when one is set. */
export function SpendingPieChart({ data, selectedKey }: { data: BarDatum[]; selectedKey: string | null }) {
  if (data.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-zinc-500">
        No spending in this range.
      </div>
    );
  }

  const total = data.reduce((sum, d) => sum + d.total, 0);

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="total" nameKey="label" innerRadius={40} outerRadius={72} paddingAngle={1}>
            {data.map((d) => (
              <Cell key={d.key} fill={d.color} opacity={selectedKey && selectedKey !== d.key ? 0.3 : 1} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value, name) => {
              const num = Number(value);
              return [
                `${currencyFormatter.format(num)} (${total > 0 ? Math.round((num / total) * 100) : 0}%)`,
                String(name),
              ];
            }}
            contentStyle={{ fontSize: 12, borderRadius: 6 }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
