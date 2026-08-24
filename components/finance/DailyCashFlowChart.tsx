"use client";

import { useMemo, useState, type Key } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DailyCashFlowPoint, DateRangeSelection } from "@/lib/finance";
import { resolveDateRange, listAvailableMonthsFromStrings } from "@/lib/finance";
import { RangeSelector } from "./RangeSelector";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

type Point = DailyCashFlowPoint & { cumulativeNet: number };

const NET_COLOR = "#6366f1";
const SCHWAB_COLOR = "#a855f7";

function CashFlowTooltip({
  active,
  payload,
  showSchwab,
}: {
  active?: boolean;
  payload?: { payload: Point }[];
  showSchwab: boolean;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-md border border-black/[.08] bg-white/95 px-3 py-2 text-xs shadow-sm dark:border-white/[.1] dark:bg-zinc-900/95 creamsicle:border-orange-200 creamsicle:bg-orange-50/95">
      <div className="mb-1.5 font-medium text-zinc-500">{point.date}</div>
      <div className="flex items-center justify-between gap-6">
        <span className="text-emerald-600 dark:text-emerald-400">Income</span>
        <span className="font-medium">{currencyFormatter.format(point.income)}</span>
      </div>
      <div className="flex items-center justify-between gap-6">
        <span className="text-rose-600 dark:text-rose-400">Spending</span>
        <span className="font-medium">{currencyFormatter.format(point.spending)}</span>
      </div>
      {showSchwab && (
        <div className="flex items-center justify-between gap-6" style={{ color: SCHWAB_COLOR }}>
          <span>Schwab deposit</span>
          <span className="font-medium">{currencyFormatter.format(point.schwabDeposit)}</span>
        </div>
      )}
      <div className="mt-1.5 flex items-center justify-between gap-6 border-t border-black/[.08] pt-1.5 dark:border-white/[.1]">
        <span className="text-zinc-500">Running net</span>
        <span className="font-semibold">{currencyFormatter.format(point.cumulativeNet)}</span>
      </div>
    </div>
  );
}

/**
 * Running (cumulative) net position over time, not a per-day net line —
 * a per-day net zigzags sharply around $0 (a payday spikes it, then it
 * snaps back), which reads as noise. The cumulative line instead climbs on
 * income and eases back down as purchases happen, which is the shape
 * people actually mean by "net trend". Income/spending are still there,
 * just moved into the hover tooltip instead of their own lines/legend.
 */
export function DailyCashFlowChart({ data }: { data: DailyCashFlowPoint[] }) {
  const [range, setRange] = useState<DateRangeSelection>({ mode: "relative", months: 6 });
  const [showSchwab, setShowSchwab] = useState(false);

  // Cumulative sum runs over the full fetched history (6 months back = $0
  // baseline) before the range selection windows it, so switching ranges
  // zooms the same continuous line rather than resetting the baseline.
  const withCumulative: Point[] = useMemo(() => {
    let running = 0;
    return data.map((d) => {
      running += d.net;
      return { ...d, cumulativeNet: Math.round(running * 100) / 100 };
    });
  }, [data]);

  const availableMonths = useMemo(() => listAvailableMonthsFromStrings(data.map((d) => d.date)), [data]);

  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-black/[.08] text-sm text-zinc-500 dark:border-white/[.1] creamsicle:border-orange-200">
        No activity in the last 6 months yet.
      </div>
    );
  }

  const { start, end } = resolveDateRange(range);
  const visibleData = withCumulative.filter((d) => d.date >= start && d.date < end);

  // One vertical line at the first data point of each distinct month in
  // view, alongside the horizontal zero line — makes it possible to tell
  // months apart at a glance instead of squinting at the date labels.
  const monthLines: string[] = [];
  const seenMonths = new Set<string>();
  for (const d of visibleData) {
    const monthKey = d.date.slice(0, 7);
    if (!seenMonths.has(monthKey)) {
      seenMonths.add(monthKey);
      monthLines.push(d.date);
    }
  }

  // Schwab deposits color the net line itself at the days they happened,
  // rather than drawing a whole second line — a gradient along the same
  // stroke, indigo everywhere except a narrow violet band at each deposit's
  // x-position (by index in visibleData, matching how the category axis
  // itself spaces points — this is a sparse day-with-activity series, not
  // every calendar day, so index-based offsets are what actually lines up).
  const schwabIndices = showSchwab
    ? visibleData.reduce<number[]>((acc, d, i) => {
        if (d.schwabDeposit !== 0) acc.push(i);
        return acc;
      }, [])
    : [];
  const gradientStops =
    schwabIndices.length > 0
      ? (() => {
          const lastIndex = Math.max(visibleData.length - 1, 1);
          const band = 1.2; // percentage points of the gradient on each side of a spike
          const stops: { offset: number; color: string }[] = [{ offset: 0, color: NET_COLOR }];
          for (const i of schwabIndices) {
            const center = (i / lastIndex) * 100;
            stops.push({ offset: Math.max(0, center - band), color: NET_COLOR });
            stops.push({ offset: center, color: SCHWAB_COLOR });
            stops.push({ offset: Math.min(100, center + band), color: NET_COLOR });
          }
          stops.push({ offset: 100, color: NET_COLOR });
          return stops.sort((a, b) => a.offset - b.offset);
        })()
      : null;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-black/[.08] p-4 dark:border-white/[.1] creamsicle:border-orange-200 creamsicle:bg-orange-50/40">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <RangeSelector value={range} onChange={setRange} availableMonths={availableMonths} />
          <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-500 creamsicle:text-orange-700">
            Cash flow trend
          </h2>
        </div>
        <button
          type="button"
          onClick={() => setShowSchwab((v) => !v)}
          aria-pressed={showSchwab}
          className={
            "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors " +
            (showSchwab
              ? "border-current"
              : "border-black/[.08] text-zinc-500 hover:text-zinc-700 dark:border-white/[.1] dark:hover:text-zinc-300 creamsicle:border-orange-200 creamsicle:hover:text-orange-800")
          }
          style={showSchwab ? { color: SCHWAB_COLOR } : undefined}
        >
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: showSchwab ? SCHWAB_COLOR : "currentColor", opacity: showSchwab ? 1 : 0.4 }}
          />
          Schwab deposits
        </button>
      </div>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={visibleData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
            {gradientStops && (
              <defs>
                <linearGradient id="netLineGradient" x1="0" y1="0" x2="1" y2="0">
                  {gradientStops.map((s, i) => (
                    <stop key={i} offset={`${s.offset}%`} stopColor={s.color} />
                  ))}
                </linearGradient>
              </defs>
            )}
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
            <ReferenceLine y={0} stroke="currentColor" strokeOpacity={0.25} strokeDasharray="4 4" />
            {monthLines.map((d) => (
              <ReferenceLine key={d} x={d} stroke="currentColor" strokeOpacity={0.12} />
            ))}
            <Tooltip content={<CashFlowTooltip showSchwab={showSchwab} />} />
            <Line
              type="monotone"
              dataKey="cumulativeNet"
              name="Net"
              stroke={gradientStops ? "url(#netLineGradient)" : NET_COLOR}
              strokeWidth={2}
              dot={
                showSchwab
                  ? // eslint-disable-next-line @typescript-eslint/no-explicit-any -- recharts' own dot-renderer prop typing is inconsistent across versions; narrowed by hand below instead.
                    (props: any) => {
                      const { cx, cy, payload, key } = props as {
                        cx?: number;
                        cy?: number;
                        payload?: Point;
                        key?: Key;
                      };
                      if (!payload || payload.schwabDeposit === 0 || cx === undefined || cy === undefined) {
                        return <g key={key} />;
                      }
                      return <circle key={key} cx={cx} cy={cy} r={4} fill={SCHWAB_COLOR} />;
                    }
                  : false
              }
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
