"use client";

import { CartesianGrid, Line, LineChart, Bar, BarChart, Pie, PieChart, Cell, Tooltip, XAxis, YAxis, ResponsiveContainer } from "recharts";
import type { AggregatedPoint, WidgetResult } from "@/lib/dashboardQuery";

export type WidgetWithData = {
  id: string;
  type: string;
  title: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
  result: WidgetResult | { error: string };
};

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function EmptyState() {
  return (
    <div className="flex h-full items-center justify-center text-center text-sm text-zinc-500">
      No data in this range.
    </div>
  );
}

function LineWidget({ points }: { points: AggregatedPoint[] }) {
  if (points.length === 0) return <EmptyState />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={points} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={32} />
        <YAxis
          tick={{ fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          width={56}
          tickFormatter={(v: number) => currencyFormatter.format(v)}
        />
        <Tooltip formatter={(v) => currencyFormatter.format(Number(v))} />
        <Line type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function BarWidget({ points }: { points: AggregatedPoint[] }) {
  if (points.length === 0) return <EmptyState />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={points} margin={{ top: 8, right: 8, left: 8, bottom: 16 }}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} interval={0} angle={-20} textAnchor="end" height={40} />
        <YAxis
          tick={{ fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          width={56}
          tickFormatter={(v: number) => currencyFormatter.format(v)}
        />
        <Tooltip formatter={(v) => currencyFormatter.format(Number(v))} />
        <Bar dataKey="value" isAnimationActive={false}>
          {points.map((p) => (
            <Cell key={p.key} fill={p.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function PieWidget({ points }: { points: AggregatedPoint[] }) {
  if (points.length === 0) return <EmptyState />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Tooltip formatter={(v) => currencyFormatter.format(Number(v))} />
        <Pie data={points} dataKey="value" nameKey="label" innerRadius="45%" outerRadius="80%" isAnimationActive={false}>
          {points.map((p) => (
            <Cell key={p.key} fill={p.color} />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}

function StatWidget({ result }: { result: Extract<WidgetResult, { kind: "stat" }> }) {
  const delta = result.previousValue !== undefined ? result.value - result.previousValue : null;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1">
      <div className="text-2xl font-semibold tabular-nums">{currencyFormatter.format(result.value)}</div>
      {delta !== null && (
        <div
          className={
            delta >= 0
              ? "text-sm text-emerald-600 dark:text-emerald-400"
              : "text-sm text-rose-600 dark:text-rose-400"
          }
        >
          {delta >= 0 ? "+" : ""}
          {currencyFormatter.format(delta)} vs. prior period
        </div>
      )}
    </div>
  );
}

function TableWidget({ points }: { points: AggregatedPoint[] }) {
  if (points.length === 0) return <EmptyState />;
  return (
    <div className="h-full overflow-y-auto text-sm">
      <table className="w-full">
        <tbody>
          {points.map((p) => (
            <tr key={p.key} className="border-b border-black/[.05] dark:border-white/[.06]">
              <td className="py-1 pr-2">
                <span className="mr-2 inline-block h-2 w-2 rounded-full align-middle" style={{ backgroundColor: p.color }} />
                {p.label}
              </td>
              <td className="py-1 text-right tabular-nums">{currencyFormatter.format(p.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * One dashboard tile. The drag handle is scoped to just the title bar
 * (`.widget-drag-handle`, matched by DashboardGrid's dragConfig) so
 * interactive content underneath (a future table's scroll, tooltips) isn't
 * fighting drag gestures.
 */
export function Widget({ widget }: { widget: WidgetWithData }) {
  const title = widget.title ?? "Widget";

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-black/[.08] bg-[var(--background)] dark:border-white/[.1] creamsicle:border-orange-200 creamsicle:bg-orange-50/40">
      <div className="widget-drag-handle cursor-move select-none border-b border-black/[.08] px-3 py-2 text-sm font-medium text-zinc-500 dark:border-white/[.1] dark:text-zinc-500 creamsicle:border-orange-200 creamsicle:text-orange-700">
        {title}
      </div>
      <div className="min-h-0 flex-1 p-3">
        {"error" in widget.result ? (
          <div className="flex h-full items-center justify-center text-center text-sm text-red-600 dark:text-red-400">
            {widget.result.error}
          </div>
        ) : widget.result.kind === "stat" ? (
          <StatWidget result={widget.result} />
        ) : widget.type === "bar" ? (
          <BarWidget points={widget.result.points} />
        ) : widget.type === "pie" ? (
          <PieWidget points={widget.result.points} />
        ) : widget.type === "table" ? (
          <TableWidget points={widget.result.points} />
        ) : (
          <LineWidget points={widget.result.points} />
        )}
      </div>
    </div>
  );
}
