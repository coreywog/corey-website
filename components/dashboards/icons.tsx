// A handful of hand-rolled icons for the widget type/chart pickers
// (components/dashboards/WidgetEditorPanel.tsx) — the app has no icon
// library, and pulling one in for six glyphs isn't worth the dependency.
// All 20x20, stroke-based, inherit currentColor so they follow the
// button's own text color (including the active/selected state).

type IconProps = { className?: string };

const base = { width: 20, height: 20, viewBox: "0 0 20 20", fill: "none", stroke: "currentColor" } as const;

export function GraphIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 15V7M10 15V4M16 15v-5" />
      <path d="M2.5 16.5h15" strokeOpacity={0.4} />
    </svg>
  );
}

export function TextIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5h12M10 5v10" />
    </svg>
  );
}

export function LineChartIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 14l4-5 3 3 6-7" />
      <path d="M2.5 16.5h15" strokeOpacity={0.4} />
    </svg>
  );
}

export function BarChartIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 15V9M10 15V5M15 15v-3" />
      <path d="M2.5 16.5h15" strokeOpacity={0.4} />
    </svg>
  );
}

export function PieChartIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} strokeWidth={1.6} strokeLinejoin="round">
      <circle cx="10" cy="10" r="7" />
      <path d="M10 3a7 7 0 0 1 7 7h-7Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ScatterIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} strokeWidth={1.6} strokeLinecap="round">
      <path d="M3 3v14h14" strokeOpacity={0.4} />
      <circle cx="7" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="10.5" cy="7" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="13" cy="10.5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="6" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="9" cy="14.5" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function StatIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 4l-1.5 12M15 4l-1.5 12M3 8h13M2.5 12.5h13" />
    </svg>
  );
}

export function TableIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="14" height="12" rx="1.5" />
      <path d="M3 8.5h14M8 4v12" />
    </svg>
  );
}

export function AreaChartIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} strokeWidth={1.6} strokeLinejoin="round">
      <path d="M3 14l4-5 3 3 6-7v10.5H3Z" fill="currentColor" fillOpacity={0.25} stroke="currentColor" strokeLinecap="round" />
      <path d="M2.5 16.5h15" strokeOpacity={0.4} strokeLinecap="round" />
    </svg>
  );
}

export function StackedBarIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 15v-3M5 10.5V9M10 15v-5M10 8.5V5M15 15v-2M15 11.5V9" strokeOpacity={1} />
      <path d="M2.5 16.5h15" strokeOpacity={0.4} />
    </svg>
  );
}

export function HistogramIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} strokeWidth={1.6} strokeLinejoin="round">
      <path d="M3 15V12H6V9H9V6H11V9H14V12H17V15Z" fill="currentColor" stroke="none" />
      <path d="M2.5 16.5h15" strokeOpacity={0.4} strokeLinecap="round" />
    </svg>
  );
}

export function CalendarIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="14" height="12" rx="1.5" />
      <path d="M3 8h14" />
      <rect x="5.5" y="10" width="2" height="2" fill="currentColor" stroke="none" />
      <rect x="9" y="10" width="2" height="2" fill="currentColor" stroke="none" fillOpacity={0.5} />
      <rect x="12.5" y="10" width="2" height="2" fill="currentColor" stroke="none" fillOpacity={0.25} />
    </svg>
  );
}
