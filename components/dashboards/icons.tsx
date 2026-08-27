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
    <svg {...base} className={className} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 3v7l6 3a7 7 0 1 0-6-10Z" />
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
