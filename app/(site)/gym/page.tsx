import { GymSceneLoader } from "@/components/three/GymSceneLoader";

export default function GymPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Gym</h1>
        <p className="max-w-xl text-lg leading-8 text-zinc-600 dark:text-zinc-400">
          Early proof of concept for a 3D gym world — drag to rotate, scroll
          to zoom.
        </p>
      </div>
      <div className="h-[420px] w-full overflow-hidden rounded-lg border border-black/[.08] dark:border-white/[.1]">
        <GymSceneLoader />
      </div>
    </div>
  );
}
