import { readdir } from "fs/promises";
import path from "path";
import { ModelViewerLoader } from "@/components/three/ModelViewerLoader";

const MODEL_EXTENSIONS = [".glb", ".gltf"];

async function listModels(): Promise<string[]> {
  const dir = path.join(process.cwd(), "public", "models");
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  return entries
    .filter(
      (entry) =>
        entry.isFile() &&
        MODEL_EXTENSIONS.includes(path.extname(entry.name).toLowerCase()),
    )
    .map((entry) => entry.name)
    .sort();
}

export default async function ModelsDevPage() {
  const models = await listModels();

  return (
    <div className="flex w-full flex-1 flex-col gap-4 px-6 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Model viewer
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Drop a .glb into <code>public/models</code> and it shows up here —
          see{" "}
          <code>public/models/README.md</code> for Blender export
          conventions.
        </p>
      </div>
      {models.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No models in <code>public/models</code> yet.
        </p>
      ) : (
        <div className="h-[70vh] w-full overflow-hidden rounded-lg border border-black/[.08] dark:border-white/[.1]">
          <ModelViewerLoader models={models} />
        </div>
      )}
    </div>
  );
}
