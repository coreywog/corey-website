# Models

Drop `.glb` files here and they're served at `/models/<name>.glb`. Preview
any file the moment it lands, without touching scene code, at
**`/dev/models`** (password-gated like the rest of the site) — it lists
everything in this folder and renders whichever one you pick with the same
lighting/ground rig the real scenes use.

## Exporting from Blender

Blender's default unit (1 Blender unit = 1 meter) matches the scenes'
world units directly — model at real-world scale and it'll drop in with
`scale={1}`. For reference, the current procedural stand-ins: the hub
fountain's basin is ~4.4m across and ~2m tall to the finial; the gym
building is ~4m wide, ~4m tall to the roof peak.

Before exporting:

1. **Apply all transforms** — select the object(s), `Ctrl+A` → *All
   Transforms*. Keeps the glTF's root transform clean (identity) so what
   you see in Blender is what you get in the scene, no surprise offsets.
2. **Apply modifiers** — leave "Apply Modifiers" checked in the export
   panel (it's on by default) so subdivision/mirror/etc. bake into the
   exported mesh.
3. **Materials** — stick to Principled BSDF nodes; the exporter maps them
   to glTF's PBR metallic-roughness model. Image-texture nodes feeding
   Base Color / Roughness / Normal export fine. Fancier node graphs
   (custom shaders, complex mixes) won't survive the round-trip.
4. **Keep it low-poly** — a few hundred to a couple thousand tris per
   prop, in keeping with the stylized look the procedural scenes already
   have. Big meshes will show it (slower loads, no perf budget yet).

Then `File → Export → glTF 2.0 (.glb/.gltf)`:

- Format: **glTF Binary (.glb)** — single file, easiest to drop in here.
- Leave **+Y Up** checked (default) — Blender converts its Z-up axes for
  you; don't manually rotate the object to compensate.
- Turn on **Limit to Selected** if the .blend has more in it than the one
  prop you're exporting.
- Leave Draco compression off for now — files are small enough at this
  polycount that it's not worth the extra decoder round-trip. Revisit if
  a model's file size gets out of hand.

## Naming

Lower-kebab-case, matching what a scene will reference, e.g.
`fountain.glb`, `gym-building.glb`.

## Using a model in a scene

```tsx
import { Model } from "@/components/three/Model";

<Model src="/models/fountain.glb" position={[0, 0, 0]} />;
```

`Model` wraps drei's `<Gltf>` in its own `Suspense` boundary and defaults
`castShadow`/`receiveShadow` to `true`, so it's a straight swap for the
primitive-built stand-ins in `HubScene.tsx` / `GymScene.tsx` once a real
model exists.
