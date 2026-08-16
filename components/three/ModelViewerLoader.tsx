"use client";

import dynamic from "next/dynamic";

const ModelViewer = dynamic(
  () => import("./ModelViewer").then((mod) => mod.ModelViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center text-sm text-zinc-500">
        Loading viewer…
      </div>
    ),
  },
);

export function ModelViewerLoader({ models }: { models: string[] }) {
  return <ModelViewer models={models} />;
}
