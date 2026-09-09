/**
 * Purely decorative — one big ghosted "everything is crashing" line chart
 * behind the login card (see components/LoginForm.tsx for why there's no
 * text spelling the joke out — it lives here instead). Used to also carry
 * a bar cluster and a donut meter; Corey cut those down to just this one
 * chart, so it's full-bleed and layered (gradient fill, a dashed "budget"
 * reference line the real line clearly blows through, a fainter second
 * line for depth, a soft glow on the primary line/dots) rather than a
 * small corner accent. Fixed full-viewport, behind everything,
 * non-interactive, low-opacity enough to read as texture — the login card
 * has its own solid/blurred background so legibility never depends on
 * this staying subtle.
 */
export function LoginBackdrop() {
  const primaryPoints = "-40,260 200,320 380,300 560,420 740,400 920,560 1100,520 1280,660 1460,620 1650,720";
  const vertices = primaryPoints.split(" ").map((p) => p.split(",").map(Number));

  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 h-full w-full"
      viewBox="0 0 1600 900"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id="crashFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#dc2626" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#dc2626" stopOpacity="0" />
        </linearGradient>
        <filter id="crashGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="7" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Faint grid, for that dashboard-chart feel */}
      {[120, 260, 400, 540, 680].map((y) => (
        <line key={y} x1="0" y1={y} x2="1600" y2={y} className="stroke-black/[.05] dark:stroke-white/[.06] creamsicle:stroke-orange-900/[.06]" strokeWidth="1" />
      ))}

      {/* Dashed "budget" reference line the real line falls well below */}
      <line x1="0" y1="220" x2="1600" y2="220" stroke="#dc2626" strokeWidth="2" strokeDasharray="12 10" opacity="0.22" />
      <text x="24" y="204" fontSize="18" fontFamily="ui-monospace, monospace" fill="#dc2626" opacity="0.3">
        budget
      </text>

      {/* Fainter second line for depth */}
      <polyline
        points="-40,180 220,260 420,220 620,340 820,300 1020,440 1220,380 1420,480 1650,420"
        fill="none"
        stroke="#f87171"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.16"
      />

      {/* Gradient area fill under the primary crash line */}
      <path
        d={
          "M " +
          primaryPoints
            .split(" ")
            .map((p) => p.replace(",", " "))
            .join(" L ") +
          " L 1650 900 L -40 900 Z"
        }
        fill="url(#crashFill)"
      />

      {/* Primary crash line, glowing */}
      <polyline
        points={primaryPoints}
        fill="none"
        stroke="#dc2626"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.45"
        filter="url(#crashGlow)"
      />
      {vertices.map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="8" fill="#dc2626" opacity="0.5" filter="url(#crashGlow)" />
      ))}
    </svg>
  );
}
