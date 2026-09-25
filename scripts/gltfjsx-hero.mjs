// Makes src/scene/models/HeroModel.tsx from the baked hero (ADR 0009).
// Run after every re-bake of hero.glb: `npm run gen:hero`. The component
// is baked output, like the .glb itself (ADR 0007): nobody edits it by
// hand; change this script and run it again.
//
// 1. gltfjsx turns hero.glb into a React component in build/gltfjsx/
//    (git ignores build/).
// 2. This script keeps gltfjsx's node types and mesh tree and applies the
//    game's edits: the inlined model import, meshopt without Draco, the
//    hero's tint materials, the face layers and the baked ink, one
//    `visible` per part from the director, bloom on the painted hair, and
//    no frustum culling.
// 3. Prettier formats the result into src/scene/models/HeroModel.tsx.

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as prettier from 'prettier';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MODEL = 'src/renderer/models/hero.glb';
const RAW = join(ROOT, 'build', 'gltfjsx', 'HeroModel.raw.tsx');
const OUT = join(ROOT, 'src', 'scene', 'models', 'HeroModel.tsx');

/** Blender's painted regions → the hero's tint materials (renderer/hero.ts),
 *  and the face layers (ADR 0012) → the layer materials. */
const REGIONS = {
  PaintedOutfit: 'materials.body',
  PaintedSkin: 'materials.skin',
  PaintedTrim: 'materials.trim',
  PaintedHair: 'materials.hair',
  Face: 'materials.face',
  Iris: 'materials.iris',
};
/** The face layers draw after the body, the iris above the face. They
 *  are light on the skin: no shadow, no ink. */
const LAYERS = { Face: 1, Iris: 2 };

mkdirSync(dirname(RAW), { recursive: true });
const gltfjsx = spawnSync(
  process.execPath,
  [
    join(ROOT, 'node_modules', 'gltfjsx', 'cli.js'),
    MODEL,
    '--types',
    '--shadows',
    '--keepnames',
    '--output',
    RAW,
  ],
  { cwd: ROOT, stdio: 'inherit' },
);
if (gltfjsx.status !== 0) process.exit(gltfjsx.status ?? 1);
const raw = readFileSync(RAW, 'utf8');

// The node types, as gltfjsx wrote them.
const nodes = raw.match(/nodes: \{\n([\s\S]*?)\n\s*\}/)?.[1];
if (!nodes) throw new Error('gltfjsx output has no node types');

// The mesh tree: from the armature's group to the tag that closes it.
const lines = raw.split('\n');
const start = lines.findIndex((line) => line.includes('<group name="HeroRig">'));
if (start < 0) throw new Error('gltfjsx output has no HeroRig group');
let depth = 0;
let end = start;
for (; end < lines.length; end++) {
  const line = lines[end] ?? '';
  if (/<group\b/.test(line) && !line.includes('/>')) depth++;
  if (line.includes('</group>')) depth--;
  if (depth === 0) break;
}

// A body is a part on its own; a piece fitted to a body (hero.py
// piece_name) is `<part>-<body>`, shown with that body. gltfjsx keys a
// node with a hyphen in brackets: nodes['Hair_spiky_short-BodyBoy_1'].
const tree = [];
for (const line of lines.slice(start, end + 1)) {
  const body = line.match(/^(\s*)<group name="(Body\w+)">$/);
  if (body) {
    tree.push(`${body[1]}<group name="${body[2]}" visible={show('${body[2]}')}>`);
    continue;
  }
  const piece = line.match(/^(\s*)<group name="((?:Garment|Hair_)\w+)-(Body\w+)">$/);
  if (piece) {
    const [, indent, part, of] = piece;
    tree.push(`${indent}<group name="${part}-${of}" visible={show('${part}', '${of}')}>`);
    continue;
  }
  const mesh = line.match(
    /^(\s*)<skinnedMesh name="([\w-]+)" geometry=\{(nodes(?:\.\w+|\['[\w-]+'\]))\.geometry\} material=\{materials\.(\w+)\} skeleton=\{nodes(?:\.\w+|\['[\w-]+'\])\.skeleton\} \/>$/,
  );
  if (!mesh) {
    tree.push(line);
    continue;
  }
  const [, indent, name, node, material] = mesh;
  const props = [`name="${name}"`, `geometry={${node}.geometry}`, `skeleton={${node}.skeleton}`];
  if (material === 'Ink') {
    props.push('material={ink}', 'userData={INK}');
  } else {
    const region = REGIONS[material];
    if (!region) throw new Error(`hero.glb has an unknown material: ${material}`);
    props.push(`material={${region}}`);
    if (material in LAYERS) props.push(`renderOrder={${LAYERS[material]}}`);
    else props.push('castShadow');
    if (material === 'PaintedHair') props.push('layers={BLOOM}');
  }
  props.push('frustumCulled={false}');
  tree.push(`${indent}<skinnedMesh ${props.join(' ')} />`);
}

const source = `/** @jsxImportSource react */
/*
Baked output: made by scripts/gltfjsx-hero.mjs (npm run gen:hero) from
src/renderer/models/hero.glb, which gltfjsx turns into a component. Do not
edit this file by hand (ADR 0007, ADR 0009); change the script and run it
again after every re-bake of the hero.
The script's edits: the inlined model import (no network), meshopt
without Draco (no web worker), the hero's tint materials and face layers
(renderer/hero.ts) and the ink of materials.ts in place of Blender's, one
\`visible\` per part from the director's parts, bloom on the painted hair,
no frustum culling (the attack clips carry the root 4 m), and the group
ref from the parent (it drives useAnimations).
*/

import { useGLTF } from '@react-three/drei';
import { useGraph } from '@react-three/fiber';
import { useMemo } from 'react';
import type { Ref } from 'react';
import * as THREE from 'three';
import { SkeletonUtils } from 'three-stdlib';
import type { GLTF } from 'three-stdlib';
import type { HeroMaterials } from '../../renderer/hero';
import type { HeroParts } from '../../renderer/heroDirector';
import { bakedInkSurface, BLOOM_LAYER } from '../../renderer/materials';
import heroModelUrl from '../../renderer/models/hero.glb';

type GLTFResult = GLTF & {
  nodes: {
${nodes}
  };
  materials: {
${Object.keys(REGIONS)
  .concat('Ink')
  .map((name) => `    ${name}: THREE.MeshStandardMaterial;`)
  .join('\n')}
  };
};

/** The painted hair glows for real in surge and Super mode. */
const BLOOM = new THREE.Layers();
BLOOM.enable(BLOOM_LAYER);

/** A baked inverted hull: skipped by the cel treatment and by freeMesh. */
const INK = { outlineHull: true };

/** Draco off, meshopt on: meshopt decodes on the main thread. */
export function useHeroGltf(): GLTFResult {
  return useGLTF(heroModelUrl, false, true) as unknown as GLTFResult;
}

export function HeroModel({
  groupRef,
  parts,
  materials,
}: {
  groupRef: Ref<THREE.Group>;
  parts: HeroParts;
  materials: HeroMaterials;
}) {
  const { scene } = useHeroGltf();
  // dispose={null} below: the clone shares the cached template's geometry.
  const clone = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const { nodes } = useGraph(clone) as unknown as GLTFResult;
  const ink = useMemo(() => bakedInkSurface(), []);
  // A piece fitted to one body (\`<part>-<body>\`) shows with that body.
  const show = (part: string, of?: string) =>
    (of === undefined || of === parts.body) &&
    (part === parts.body || part === parts.garment || part === parts.hair);
  return (
    <group ref={groupRef} dispose={null}>
      <group name="Scene">
${tree.join('\n')}
      </group>
    </group>
  );
}

// Decode at boot, before the hero first shows.
useGLTF.preload(heroModelUrl, false, true);
`;

const config = await prettier.resolveConfig(OUT);
writeFileSync(OUT, await prettier.format(source, { ...config, filepath: OUT }));
console.log(`wrote ${OUT}`);
