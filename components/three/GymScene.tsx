"use client";

import { useEffect, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { createBrickTexture, createRoofTileTexture } from "./textures";

const TRIM_COLOR = "#8a8a82";
const PILLAR_COLOR = "#e3d3ab";
const DOOR_COLOR = "#2b2320";
const WINDOW_FRAME_COLOR = "#2b2320";
const WINDOW_GLASS_COLOR = "#bfe3ea";
const CHIMNEY_COLOR = "#6b5a4c";
const GROUND_COLOR = "#4a7043";

function GymBuilding() {
  const brickTexture = useMemo(() => createBrickTexture(3, 2), []);
  const roofTexture = useMemo(() => createRoofTileTexture(8, 3), []);

  return (
    <group position={[0, 0, 0]}>
      {/* Stone base course */}
      <mesh position={[0, 0.15, 0]} castShadow receiveShadow>
        <boxGeometry args={[4.3, 0.3, 3.3]} />
        <meshStandardMaterial color={TRIM_COLOR} />
      </mesh>

      {/* Brick walls */}
      <mesh position={[0, 1.55, 0]} castShadow receiveShadow>
        <boxGeometry args={[4, 2.5, 3]} />
        <meshStandardMaterial map={brickTexture} />
      </mesh>

      {/* Corner trim pillars */}
      {[
        [1.9, -1.4],
        [1.9, 1.4],
        [-1.9, -1.4],
        [-1.9, 1.4],
      ].map(([x, z]) => (
        <mesh key={`${x}-${z}`} position={[x, 1.55, z]} castShadow>
          <boxGeometry args={[0.28, 2.5, 0.28]} />
          <meshStandardMaterial color={PILLAR_COLOR} />
        </mesh>
      ))}

      {/* Tile roof */}
      <mesh position={[0, 3.4, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[2.9, 1.2, 4]} />
        <meshStandardMaterial map={roofTexture} />
      </mesh>

      {/* Chimney */}
      <mesh position={[1.1, 3.9, -0.6]} castShadow>
        <boxGeometry args={[0.4, 1.3, 0.4]} />
        <meshStandardMaterial color={CHIMNEY_COLOR} />
      </mesh>

      {/* Door */}
      <mesh position={[0, 0.9, 1.51]} castShadow>
        <boxGeometry args={[0.8, 1.2, 0.05]} />
        <meshStandardMaterial color={DOOR_COLOR} />
      </mesh>

      {/* Window (frame + glass) on the side wall */}
      <mesh position={[-2.01, 1.7, 0]} rotation={[0, Math.PI / 2, 0]} castShadow>
        <boxGeometry args={[0.9, 0.9, 0.06]} />
        <meshStandardMaterial color={WINDOW_FRAME_COLOR} />
      </mesh>
      <mesh position={[-2.04, 1.7, 0]} rotation={[0, Math.PI / 2, 0]}>
        <boxGeometry args={[0.7, 0.7, 0.04]} />
        <meshStandardMaterial color={WINDOW_GLASS_COLOR} />
      </mesh>
    </group>
  );
}

export default function GymScene() {
  // Nudge a layout re-measure shortly after mount — the canvas sometimes
  // mounts before its container has a final size (dynamic-import timing),
  // leaving it stuck at a tiny default until something triggers a resize.
  useEffect(() => {
    const id = window.setTimeout(
      () => window.dispatchEvent(new Event("resize")),
      50,
    );
    return () => window.clearTimeout(id);
  }, []);

  return (
    <Canvas
      shadows
      camera={{ position: [6, 4, 7], fov: 45 }}
      className="!touch-none"
    >
      <color attach="background" args={["#87ceeb"]} />
      <ambientLight intensity={0.6} />
      <directionalLight
        position={[5, 8, 3]}
        intensity={1.2}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />

      <GymBuilding />

      {/* Ground */}
      <mesh
        position={[0, 0, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[30, 30]} />
        <meshStandardMaterial color={GROUND_COLOR} />
      </mesh>

      <OrbitControls
        enableDamping
        minDistance={4}
        maxDistance={20}
        maxPolarAngle={Math.PI / 2 - 0.05}
      />
    </Canvas>
  );
}
