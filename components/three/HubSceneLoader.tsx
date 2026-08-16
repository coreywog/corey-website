"use client";

import dynamic from "next/dynamic";

const HubScene = dynamic(() => import("./HubScene"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-sm text-zinc-500">
      Loading scene…
    </div>
  ),
});

export function HubSceneLoader() {
  return <HubScene />;
}
