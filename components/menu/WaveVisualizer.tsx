"use client";

import { useEffect, useRef, useState } from "react";

const SAMPLES = 90;
const HEIGHT = 40;
const CENTER_Y = HEIGHT / 2;
// The spike's height rides on how far (vertically) the mouse is from the
// wave, anywhere on the page — the farther away, the taller it reaches.
const BASE_HEIGHT = 45;
const DIST_HEIGHT_SCALE = 0.3;
const MAX_HEIGHT = 260;
// As the spike grows taller it also gets narrower at the base, and the
// falloff curve sharpens — a wide hill becomes a slim needle.
const BASE_RADIUS = 170;
const MIN_RADIUS = 55;
const RADIUS_SHRINK = 0.55;
const SPIKE_EXPONENT = 2.1;
const RAINBOW_SPEED = 40; // degrees of hue per second
const JITTER_AMP_1 = 1.6;
const JITTER_AMP_2 = 1;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

// A big stack of sine waves layered on top of each other — each one gets
// its own amplitude/frequency/speed/phase so nothing moves in lockstep,
// and the later ones taper off in size/opacity so the pile reads as
// "busy" instead of an illegible smear.
const LINE_COUNT = 14;
const LINES = Array.from({ length: LINE_COUNT }, (_, i) => {
  const fade = i / (LINE_COUNT - 1);
  return {
    amp: 2 + (i % 5) * 0.8,
    freq: 0.09 + (i % 7) * 0.035,
    speed: 1.3 + (i % 6) * 0.3,
    phase: i * 0.85,
    bumpMul: 1 - fade * 0.6,
    opacity: 0.9 - fade * 0.68,
    width: 0.95 - fade * 0.55,
  };
});

function buildPath(
  line: (typeof LINES)[number],
  i: number,
  t: number,
  width: number,
  bumpX: number | null,
  bumpHeight: number,
  bumpRadius: number,
) {
  let d = "";
  for (let s = 0; s <= SAMPLES; s++) {
    const x = (s / SAMPLES) * width;
    const idle =
      line.amp * Math.sin(t * line.speed + s * line.freq + line.phase) +
      JITTER_AMP_1 * Math.sin(t * 23 + s * 0.9 + i * 2.3) +
      JITTER_AMP_2 * Math.sin(t * 37 + s * 0.5 + i * 1.1);
    const dist = bumpX == null ? Infinity : Math.abs(x - bumpX);
    const shape = Math.max(0, 1 - dist / bumpRadius);
    const bump = bumpHeight * line.bumpMul * shape ** SPIKE_EXPONENT;
    const y = CENTER_Y - idle - bump;
    d += `${s === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)} `;
  }
  return d;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hue < 60) [r, g, b] = [c, x, 0];
  else if (hue < 120) [r, g, b] = [x, c, 0];
  else if (hue < 180) [r, g, b] = [0, c, x];
  else if (hue < 240) [r, g, b] = [0, x, c];
  else if (hue < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

export function WaveVisualizer({
  hoverX,
}: {
  /** Viewport clientX to spike toward (e.g. a keyboard-focused menu item), or null. */
  hoverX: number | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mouseXRef = useRef<number | null>(null);
  const mouseYRef = useRef<number | null>(null);
  const hoverXRef = useRef(hoverX);
  const [width, setWidth] = useState(0);
  const [paths, setPaths] = useState<string[]>(() => LINES.map(() => ""));
  const [colors, setColors] = useState<string[]>(() => LINES.map(() => "rgb(156,163,175)"));

  useEffect(() => {
    hoverXRef.current = hoverX;
  }, [hoverX]);

  // Measure once, and again on resize — kept separate from the animation
  // loop below so the loop never has to restart.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setWidth(el.getBoundingClientRect().width);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // Track the mouse everywhere on the page, not just over this element —
  // the wave reaches for it no matter where it is on screen.
  useEffect(() => {
    const onMove = (e: globalThis.PointerEvent) => {
      mouseXRef.current = e.clientX;
      mouseYRef.current = e.clientY;
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  useEffect(() => {
    let raf: number;
    const start = performance.now();
    const tick = (now: number) => {
      const t = (now - start) / 1000;
      const rect = containerRef.current?.getBoundingClientRect();
      const w = rect?.width ?? 0;

      const localX =
        rect && mouseXRef.current != null ? mouseXRef.current - rect.left : null;
      const bumpX = hoverXRef.current != null && rect ? hoverXRef.current - rect.left : localX;

      const waveScreenY = rect ? rect.top + rect.height / 2 : null;
      // Above the line, the spike reaches up; below it, the spike reaches
      // down — the wave always bends away from the mouse.
      const direction =
        waveScreenY != null && mouseYRef.current != null && mouseYRef.current > waveScreenY ? -1 : 1;
      const verticalDist =
        waveScreenY != null && mouseYRef.current != null ? Math.abs(mouseYRef.current - waveScreenY) : 0;
      const bumpHeight = clamp(BASE_HEIGHT + verticalDist * DIST_HEIGHT_SCALE, BASE_HEIGHT, MAX_HEIGHT);
      const bumpRadius = clamp(BASE_RADIUS - (bumpHeight - BASE_HEIGHT) * RADIUS_SHRINK, MIN_RADIUS, BASE_RADIUS);

      if (w > 0) {
        setPaths(
          LINES.map((line, i) => buildPath(line, i, t, w, bumpX, bumpHeight * direction, bumpRadius)),
        );
      }
      setColors(
        LINES.map((_, i) => {
          const [r, g, b] = hslToRgb(t * RAINBOW_SPEED + i * (360 / LINES.length), 0.75, 0.6);
          return `rgb(${r.toFixed(0)},${g.toFixed(0)},${b.toFixed(0)})`;
        }),
      );
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div ref={containerRef} className="h-10 w-full max-w-xl">
      <svg viewBox={`0 0 ${width || 1} ${HEIGHT}`} className="h-full w-full overflow-visible">
        {LINES.map((line, i) => (
          <path
            key={i}
            d={paths[i]}
            fill="none"
            stroke={colors[i]}
            strokeWidth={line.width}
            strokeLinecap="round"
            opacity={line.opacity}
          />
        ))}
      </svg>
    </div>
  );
}
