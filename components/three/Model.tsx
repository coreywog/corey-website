"use client";

import { Suspense } from "react";
import { Gltf, type GltfProps } from "@react-three/drei";

/**
 * Drops a Blender-exported .glb into a scene. `src` is the public path,
 * e.g. "/models/fountain.glb" (see public/models/README.md for export
 * conventions). Wrapped in its own Suspense boundary so one still-loading
 * model doesn't blank out the rest of an already-rendered scene while it
 * streams in — each <Model> pops in independently.
 */
export function Model({
  castShadow = true,
  receiveShadow = true,
  ...props
}: GltfProps) {
  return (
    <Suspense fallback={null}>
      <Gltf castShadow={castShadow} receiveShadow={receiveShadow} {...props} />
    </Suspense>
  );
}
