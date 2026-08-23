"use client";

import {
  Bar,
  BarChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function CashFlowChart({
  income,
  spending,
}: {
  income: number;
  spending: number;
}) {
  const data = [{ name: "", Income: income, Spending: spending }];

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <XAxis dataKey="name" tick={false} axisLine={false} tickLine={false} />
          <YAxis
            tick={{ fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={64}
            tickFormatter={(v) => currencyFormatter.format(v)}
          />
          <Tooltip
            formatter={(value) => currencyFormatter.format(Number(value))}
            labelFormatter={() => ""}
            contentStyle={{ fontSize: 12, borderRadius: 6 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="Income" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={80} />
          <Bar dataKey="Spending" fill="#f43f5e" radius={[4, 4, 0, 0]} maxBarSize={80} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
