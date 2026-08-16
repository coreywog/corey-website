"use client";

import { useEffect, useMemo, useRef } from "react";
import type { Mesh } from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { createDirtGrassTexture, createStoneTexture } from "./textures";

const SKY_COLOR = "#bfe0e8";
const WATER_COLOR = "#5aa9c9";

const BASIN_WATER_Y = 0.66;
const PEDESTAL_Y = 1.0;
const UPPER_BOWL_Y = 1.55;
const UPPER_BOWL_WATER_Y = 1.66;
const UPPER_BOWL_RIM_Y = 1.68;
const UPPER_BOWL_RIM_RADIUS = 0.8;
const SPOUT_Y = 1.85;
const FINIAL_Y = 2.0;
const JET_TOP_Y = 2.08;

type DropletSeed = { phase: number; angle: number };

function makeDropletSeeds(count: number): DropletSeed[] {
  return Array.from({ length: count }, () => ({
    phase: Math.random(),
    angle: Math.random() * Math.PI * 2,
  }));
}

/**
 * A loop of small spheres falling from one height/radius to another —
 * reused for both the top jet (center → upper bowl) and the overflow
 * (upper bowl's rim → lower basin).
 */
function Droplets({
  count,
  originY,
  originRadius,
  targetY,
  outwardSpread,
  duration,
}: {
  count: number;
  originY: number;
  originRadius: number;
  targetY: number;
  outwardSpread: number;
  duration: number;
}) {
  const refs = useRef<(Mesh | null)[]>([]);
  const seeds = useMemo(() => makeDropletSeeds(count), [count]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    seeds.forEach((seed, i) => {
      const mesh = refs.current[i];
      if (!mesh) return;
      const localT = ((t / duration + seed.phase) % 1);
      const y = originY - localT * (originY - targetY);
      const r = originRadius + localT * outwardSpread;
      mesh.position.set(
        Math.cos(seed.angle) * r,
        y,
        Math.sin(seed.angle) * r,
      );
      mesh.scale.setScalar(1 - localT * 0.35);
    });
  });

  return (
    <>
      {seeds.map((_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
        >
          <sphereGeometry args={[0.055, 8, 8]} />
          <meshStandardMaterial
            color={WATER_COLOR}
            transparent
            opacity={0.85}
            roughness={0.1}
          />
        </mesh>
      ))}
    </>
  );
}

/** A little bulge at the spout tip that pulses like water bubbling up. */
function JetBulge() {
  const ref = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    const s = 1 + Math.sin(clock.getElapsedTime() * 6) * 0.15;
    ref.current?.scale.setScalar(s);
  });
  return (
    <mesh ref={ref} position={[0, JET_TOP_Y, 0]}>
      <sphereGeometry args={[0.13, 10, 10]} />
      <meshStandardMaterial
        color={WATER_COLOR}
        transparent
        opacity={0.75}
        roughness={0.1}
      />
    </mesh>
  );
}

/** A still water surface, given a gentle shimmer — reused for both bowls. */
function WaterSurface({
  radius,
  baseY,
  bobSpeed = 1.5,
  bobAmount = 0.01,
}: {
  radius: number;
  baseY: number;
  bobSpeed?: number;
  bobAmount?: number;
}) {
  const ref = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.position.y =
      baseY + Math.sin(clock.getElapsedTime() * bobSpeed) * bobAmount;
  });
  return (
    <mesh ref={ref}>
      <cylinderGeometry args={[radius, radius, 0.05, 24]} />
      <meshStandardMaterial
        color={WATER_COLOR}
        transparent
        opacity={0.85}
        roughness={0.1}
        metalness={0.1}
      />
    </mesh>
  );
}

/**
 * Classic tiered fountain: water squirts from the top spout, falls into
 * the upper bowl, and overflows over its rim into the lower basin.
 */
function Fountain() {
  const stoneTexture = useMemo(() => createStoneTexture(2, 2), []);
  return (
    <group position={[0, 0, 0]}>
      {/* lower basin */}
      <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[2.2, 2.4, 0.6, 24]} />
        <meshStandardMaterial map={stoneTexture} />
      </mesh>
      <WaterSurface radius={2.05} baseY={BASIN_WATER_Y - 0.04} />

      {/* pedestal */}
      <mesh position={[0, PEDESTAL_Y, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.28, 0.4, 0.7, 20]} />
        <meshStandardMaterial map={stoneTexture} />
      </mesh>

      {/* upper bowl — flared so it reads as a cup, not a solid block */}
      <mesh position={[0, UPPER_BOWL_Y, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.85, 0.5, 0.3, 20]} />
        <meshStandardMaterial map={stoneTexture} />
      </mesh>
      <WaterSurface
        radius={0.72}
        baseY={UPPER_BOWL_WATER_Y}
        bobSpeed={2}
        bobAmount={0.008}
      />

      {/* spout */}
      <mesh position={[0, SPOUT_Y, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.14, 0.3, 12]} />
        <meshStandardMaterial map={stoneTexture} />
      </mesh>
      {/* finial */}
      <mesh position={[0, FINIAL_Y, 0]} castShadow>
        <sphereGeometry args={[0.12, 12, 12]} />
        <meshStandardMaterial map={stoneTexture} />
      </mesh>

      <JetBulge />
      {/* jet: top → upper bowl */}
      <Droplets
        count={9}
        originY={JET_TOP_Y}
        originRadius={0}
        targetY={UPPER_BOWL_WATER_Y}
        outwardSpread={0.22}
        duration={1.1}
      />
      {/* overflow: upper bowl's rim → lower basin */}
      <Droplets
        count={16}
        originY={UPPER_BOWL_RIM_Y}
        originRadius={UPPER_BOWL_RIM_RADIUS}
        targetY={BASIN_WATER_Y}
        outwardSpread={0.12}
        duration={1.3}
      />
    </group>
  );
}

const STONE_BAND_INNER = 2.7;
const STONE_BAND_OUTER = 3.9;
const STONE_ROW_GAP = 0.36;
const STONE_SIZE = 0.32;
const STONE_GAP = 0.05;
const STONE_COLORS = ["#8a8a86", "#9c9c96", "#76766f", "#b0b0a8", "#6e6e68"];

type StoneLayout = {
  position: [number, number, number];
  rotationY: number;
  size: [number, number, number];
  colorIndex: number;
};

/**
 * Lays stones edge-to-edge (with a small fixed gap so grass peeks through)
 * in clean concentric rings around the fountain, each stone rotated to
 * follow the ring's curve so the path reads as a connected circle.
 */
function makeStoneLayout(): StoneLayout[] {
  const stones: StoneLayout[] = [];
  const slotSize = STONE_SIZE + STONE_GAP;
  for (
    let radius = STONE_BAND_INNER;
    radius <= STONE_BAND_OUTER;
    radius += STONE_ROW_GAP
  ) {
    const circumference = 2 * Math.PI * radius;
    const count = Math.max(8, Math.round(circumference / slotSize));
    const stepAngle = (Math.PI * 2) / count;
    for (let i = 0; i < count; i++) {
      const angle = i * stepAngle;
      // Depth (Z, tangential after rotation) must stay fixed so every
      // neighbor's flat edge lines up with a consistent gap. Width (X,
      // radial) is free to vary for a bit of organic texture.
      const w = STONE_SIZE + (Math.random() - 0.5) * 0.08;
      const d = STONE_SIZE;
      const h = 0.08 + Math.random() * 0.03;
      stones.push({
        position: [
          Math.cos(angle) * radius,
          h / 2 + 0.01,
          Math.sin(angle) * radius,
        ],
        // Negative angle — matches three.js's rotateY handedness so the
        // box's tangential face actually tracks the circle (verified: a
        // positive-angle rotation drifts the gap wider stone-by-stone
        // instead of holding it constant).
        rotationY: -angle,
        size: [w, h, d],
        colorIndex: Math.floor(Math.random() * STONE_COLORS.length),
      });
    }
  }
  return stones;
}

/** A cobblestone path ring around the fountain, connected with tiny gaps. */
function ScatteredStones() {
  const stones = useMemo(() => makeStoneLayout(), []);
  return (
    <>
      {stones.map((s, i) => (
        <mesh
          key={i}
          position={s.position}
          rotation={[0, s.rotationY, 0]}
          receiveShadow
          castShadow
        >
          <boxGeometry args={s.size} />
          <meshStandardMaterial color={STONE_COLORS[s.colorIndex]} />
        </mesh>
      ))}
    </>
  );
}

function Ground() {
  const groundTexture = useMemo(() => createDirtGrassTexture(10, 10), []);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[60, 60]} />
      <meshStandardMaterial map={groundTexture} />
    </mesh>
  );
}

export default function HubScene() {
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
      camera={{ position: [5, 4, 6], fov: 45 }}
      className="!touch-none"
    >
      <color attach="background" args={[SKY_COLOR]} />
      <fog attach="fog" args={[SKY_COLOR, 12, 40]} />
      <hemisphereLight args={[SKY_COLOR, "#5c6b3a", 0.7]} />
      <directionalLight
        position={[8, 10, 4]}
        intensity={1.4}
        color="#fff2d9"
        castShadow
        shadow-mapSize={[1024, 1024]}
      />

      <Ground />
      <ScatteredStones />
      <Fountain />

      <OrbitControls
        enableDamping
        minDistance={3}
        maxDistance={16}
        maxPolarAngle={Math.PI / 2 - 0.05}
      />
    </Canvas>
  );
}
