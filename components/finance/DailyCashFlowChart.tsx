"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DailyCashFlowPoint } from "@/lib/finance";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const SERIES = [
  { key: "income" as const, label: "Income", color: "#10b981" },
  { key: "spending" as const, label: "Spending", color: "#f43f5e" },
  { key: "net" as const, label: "Net", color: "#6366f1" },
];

export function DailyCashFlowChart({ data }: { data: DailyCashFlowPoint[] }) {
  const [visible, setVisible] = useState<Record<string, boolean>>({
    income: true,
    spending: true,
    net: true,
  });

  function toggle(key: string) {
    setVisible((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-zinc-500">
        No activity in the last 6 months yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        {SERIES.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => toggle(s.key)}
            className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors"
            style={{
              borderColor: visible[s.key] ? s.color : "var(--zinc-border, #d4d4d8)",
              color: visible[s.key] ? s.color : "#71717a",
              opacity: visible[s.key] ? 1 : 0.5,
            }}
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: s.color }}
            />
            {s.label}
          </button>
        ))}
      </div>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              minTickGap={48}
            />
            <YAxis
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={64}
              tickFormatter={(v) => currencyFormatter.format(v)}
            />
            <Tooltip
              formatter={(value) => currencyFormatter.format(Number(value))}
              contentStyle={{ fontSize: 12, borderRadius: 6 }}
            />
            {SERIES.filter((s) => visible[s.key]).map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={1.75}
                dot={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
