"use client";

import { WaveVisualizer } from "@/components/menu/WaveVisualizer";

export default function Home() {
  return (
    <div className="flex h-dvh w-full flex-col items-center justify-center gap-1 bg-zinc-50 px-6">
      <WaveVisualizer hoverX={null} />
    </div>
  );
}
