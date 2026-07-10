'use client';

/**
 * Hero centrepiece: the HBC arrow mark rebuilt as a faceted GEMSTONE.
 *
 * Not an extruded slab — a double-sided cut gem. The arrowhead silhouette is the
 * girdle (widest slice, Z=0); the surface rises to a raised ridge on the front
 * (+Z) and falls to a mirrored ridge on the back (−Z). Every cross-section is a
 * rhombus, so the whole form is a bipyramid blade that throws light off many
 * angled facets. flatShading makes each facet a distinct plane (the sparkle);
 * green tints the upper facets, blue the lower — variation comes from lighting,
 * not a painted gradient. Client-only (ssr:false).
 */

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

type V3 = [number, number, number];
type P2 = [number, number];

// Colours — tints only; all light/dark comes from facet angle + lighting.
const GREEN: V3 = [0.063, 0.725, 0.506];  // #10b981 upper wing
const DGREEN: V3 = [0.02, 0.20, 0.14];    // dark apex for upper
const BLUE: V3 = [0.231, 0.510, 0.965];   // #3b82f6 lower wing
const DBLUE: V3 = [0.03, 0.10, 0.28];     // dark apex for lower

/**
 * Just TWO gems — the green upper wing and the blue lower wing. The centre dart
 * is gone; the two wings' inner edges meet at y = 0 (a hair of overlap) so they
 * touch with no gap between them.
 */
const PARTS: { poly: P2[]; hf: number; hb: number; tint: V3; apex: V3 }[] = [
  { poly: [[18, 0.1], [-10, -20], [-16, 0], [-2, 0.1]], hf: 5, hb: 5, tint: GREEN, apex: DGREEN }, // upper wing
  { poly: [[18, -0.1], [-10, 20], [-16, 0], [-2, -0.1]], hf: 5, hb: 5, tint: BLUE, apex: DBLUE },  // lower wing
];

/** Build the logo as three faceted bipyramid gems (each polygon → a stone that
 *  is pointed front and back at its centroid), merged into one flat-shaded
 *  BufferGeometry. Non-indexed so every facet is its own plane → sparkle. */
function buildLogoGem() {
  const pos: number[] = [];
  const col: number[] = [];
  const tri = (p1: V3, p2: V3, p3: V3, c1: V3, c2: V3, c3: V3) => {
    pos.push(...p1, ...p2, ...p3);
    col.push(...c1, ...c2, ...c3);
  };

  for (const part of PARTS) {
    // to 3D, y-up (flip SVG y), + one subdivided ring for extra facets
    const ring: V3[] = [];
    for (let i = 0; i < part.poly.length; i++) {
      const a = part.poly[i];
      const b = part.poly[(i + 1) % part.poly.length];
      ring.push([a[0], -a[1], 0]);
      ring.push([(a[0] + b[0]) / 2, -(a[1] + b[1]) / 2, 0]); // edge midpoint
    }
    const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length;
    const cy = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    const apexF: V3 = [cx, cy, part.hf];
    const apexB: V3 = [cx, cy, -part.hb];
    for (let i = 0; i < ring.length; i++) {
      const g0 = ring[i];
      const g1 = ring[(i + 1) % ring.length];
      tri(g0, g1, apexF, part.tint, part.tint, part.apex);  // front facet
      tri(g1, g0, apexB, part.tint, part.tint, part.apex);  // back facet
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  g.center();
  return g;
}


function Gem() {
  const spin = useRef<THREE.Group>(null);
  const tilt = useRef<THREE.Group>(null);
  const mouse = useRef(new THREE.Vector2(0, 0));
  const raw = useRef(new THREE.Vector2(0, 0));
  const t = useRef(0);

  const geometry = useMemo(() => buildLogoGem(), []);

  // Responsive size: the gem is a fixed 3D object, so on a narrow phone it
  // overflowed the viewport and swamped the headline. Shrink it on small
  // screens (scales with canvas width, clamped) so it stays a centrepiece,
  // not a wall.
  const width = useThree((s) => s.size.width);
  // Full size on tablet/desktop (>=768px → 0.14, unchanged); shrink on phones
  // down to 0.06 at ~390px so it no longer overflows or swamps the headline.
  const scale = Math.max(0.06, Math.min(0.14, 0.06 + (width - 390) * 0.0002116));

  useEffect(() => {
    const onMove = (e: PointerEvent) =>
      raw.current.set((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1));
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    t.current += dt;
    mouse.current.lerp(raw.current, 1 - Math.pow(0.02, dt));
    if (spin.current) {
      // slow ±12° yaw so highlights travel across the facets — never edge-on
      spin.current.rotation.y = Math.sin(t.current * 0.4) * 0.21;
      spin.current.rotation.x = Math.sin(t.current * 0.3) * 0.05;
    }
    if (tilt.current) {
      tilt.current.rotation.x += (mouse.current.y * 0.22 - tilt.current.rotation.x) * 0.05;
      tilt.current.rotation.y += (mouse.current.x * 0.3 - tilt.current.rotation.y) * 0.05;
    }
  });

  return (
    <group ref={tilt}>
      <group ref={spin} scale={scale} rotation={[-0.1, 0.35, 0]}>
        <mesh geometry={geometry}>
          <meshPhysicalMaterial
            vertexColors
            flatShading
            transmission={1}
            ior={2.2}
            thickness={3.2}
            roughness={0.26}
            metalness={0}
            clearcoat={1}
            clearcoatRoughness={0.4}
            envMapIntensity={1.45}
            dispersion={1.4}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>
    </group>
  );
}

function Scene() {
  return (
    <>
      <ambientLight intensity={0.2} />
      {/* soft key, upper-left — dim enough that flat facets never blow to white */}
      <directionalLight position={[-6, 7, 5]} intensity={1.4} />
      {/* gentle rim, lower-right */}
      <directionalLight position={[6, -5, 3]} intensity={1.2} color="#cfe0ff" />

      {/* environment for reflections + refraction (no external HDR). Bake over the
          first ~40 frames (not every frame): enough to settle after the lights are
          up — fixing the old `frames={1}` black-gem race — then it stops re-rendering
          the cubemap, which was the single biggest per-frame cost on the hero. */}
      <Environment resolution={256} frames={40}>
        <Lightformer form="rect" intensity={1.5} position={[-4, 5, 4]} scale={[10, 8, 1]} color="#eef2f8" />
        <Lightformer form="rect" intensity={1.3} position={[6, -3, 3]} scale={[5, 5, 1]} color="#bcd4ff" />
        <Lightformer form="rect" intensity={1.1} position={[0, 2, -6]} scale={[7, 7, 1]} color="#8affc8" />
      </Environment>

      <Gem />

      <EffectComposer>
        {/* Bright sparkle, natural glow: a high threshold means only the facets
            that genuinely flare to near-white bloom, and a SMALL radius keeps that
            glow tight around the facet (real light-spill) instead of ballooning
            into a soft round "bubble" behind the gem. */}
        <Bloom mipmapBlur intensity={0.6} luminanceThreshold={0.6} luminanceSmoothing={0.6} radius={0.5} />
      </EffectComposer>
    </>
  );
}

export default function HeroLogo({ active = true }: { active?: boolean }) {
  return (
    <Canvas
      // Pause the render loop when the hero is off-screen / tab hidden — otherwise
      // the gem + its per-frame Environment keep rendering a 3456px WebGL frame
      // forever, saturating the main thread and stalling scroll elsewhere.
      frameloop={active ? 'always' : 'never'}
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      camera={{ position: [0, 0, 14], fov: 40 }}
      style={{ pointerEvents: 'none' }}
    >
      <Scene />
    </Canvas>
  );
}
