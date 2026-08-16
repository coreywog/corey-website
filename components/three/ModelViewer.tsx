"use client";

import { useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Center, Grid, OrbitControls } from "@react-three/drei";
import { Model } from "./Model";

/**
 * Renders a picked-model dropdown + canvas so a .glb dropped into
 * public/models/ can be eyeballed immediately — no scene wiring required.
 * Centers the model and sizes the grid to real-world meters so scale
 * relative to the hub/gym scenes is obvious at a glance.
 */
export function ModelViewer({ models }: { models: string[] }) {
  const [selected, setSelected] = useState(models[0]);

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex items-center gap-2 border-b border-black/[.08] bg-zinc-50 px-3 py-2 dark:border-white/[.1] dark:bg-zinc-900">
        <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
          Model
        </label>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="rounded-md border border-black/[.1] bg-white px-2 py-1 text-sm outline-none dark:border-white/[.15] dark:bg-zinc-800"
        >
          {models.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex-1">
        <Canvas
          shadows
          camera={{ position: [4, 3, 4], fov: 45 }}
          className="!touch-none"
        >
          <color attach="background" args={["#e5e5e5"]} />
          <hemisphereLight args={["#ffffff", "#444444", 0.8]} />
          <directionalLight
            position={[5, 8, 3]}
            intensity={1.2}
            castShadow
            shadow-mapSize={[1024, 1024]}
          />
          <Grid
            args={[20, 20]}
            cellSize={1}
            cellColor="#bbbbbb"
            sectionSize={5}
            sectionColor="#888888"
            fadeDistance={30}
            infiniteGrid
          />
          {/* key={selected} forces a clean remount on swap, so a model that
              errors doesn't leave the previous one's Suspense state stuck */}
          <Center key={selected}>
            <Model src={`/models/${selected}`} />
          </Center>
          <OrbitControls enableDamping minDistance={0.5} maxDistance={30} />
        </Canvas>
      </div>
    </div>
  );
}
