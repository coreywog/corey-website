"use client";

import dynamic from "next/dynamic";

const GymScene = dynamic(() => import("./GymScene"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-sm text-zinc-500">
      Loading scene…
    </div>
  ),
});

export function GymSceneLoader() {
  return <GymScene />;
}
