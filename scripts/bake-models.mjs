// Bakes the 3D models into src/renderer/models/*.glb (ADR 0007).
// Run on demand: `npm run bake:models [model ...]`. Needs Blender 5.2; set
// BLENDER to its path if it is not in the default install place.
//
// 1. Blender runs headless from factory settings and builds every model
//    from its committed script in scripts/blender/ (bake.py). It writes a
//    .blend for viewing and a raw .glb (WebP textures) into build/models/,
//    which git ignores.
// 2. gltf-transform compresses each raw .glb with meshopt — the only mesh
//    compression that decodes without a web worker — into the committed
//    src/renderer/models/<name>.glb, which the build inlines.
//
// Nobody edits a .glb or a .blend by hand: change the script and re-bake.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW_DIR = join(ROOT, 'build', 'models');
const OUT_DIR = join(ROOT, 'src', 'renderer', 'models');

function findBlender() {
  if (process.env.BLENDER) return process.env.BLENDER;
  const windows = 'C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe';
  return existsSync(windows) ? windows : 'blender';
}

const only = process.argv.slice(2);
mkdirSync(RAW_DIR, { recursive: true });
mkdirSync(OUT_DIR, { recursive: true });

const blender = spawnSync(
  findBlender(),
  [
    '--background',
    '--factory-startup',
    '--python-exit-code',
    '1',
    '--python',
    join(ROOT, 'scripts', 'blender', 'bake.py'),
    '--',
    RAW_DIR,
    ...only,
  ],
  { stdio: 'inherit' },
);
if (blender.error) throw blender.error;
if (blender.status !== 0) process.exit(blender.status ?? 1);

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.encoder': MeshoptEncoder,
});

for (const file of readdirSync(RAW_DIR).filter((f) => f.endsWith('.raw.glb')).sort()) {
  const name = file.replace(/\.raw\.glb$/, '');
  if (only.length > 0 && !only.includes(name)) continue;
  const document = await io.read(join(RAW_DIR, file));
  await document.transform(dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const out = join(OUT_DIR, `${name}.glb`);
  await io.write(out, document);
  console.log(`wrote ${out}`);
}
