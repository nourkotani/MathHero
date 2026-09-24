// Makes, scores, and picks HY-Motion candidates for one clip (ADR 0010).
//
//   npm run motion -- <clip>              make every candidate, score, render the best
//   npm run motion -- <clip> --pick <id>  install a candidate as the clip's source
//
// The clip's brief is in scripts/blender/sources/hy-motion/clips.json:
// prompts, frames, samples per prompt, master seed, window, length, and
// the score weights. Every run of the same brief makes the same
// candidates, bit for bit.
//
// 1. HY-Motion makes <samples> candidates per prompt into build/motion/
//    (git ignores build/). It runs outside the repo: set HY_MOTION_DIR if
//    it is not in C:\Users\nourk\ai\HY-Motion-1.0, and HY_MOTION_GPU to
//    pick the GPU (default 1: GPU 0 drives the display).
// 2. Blender retargets every candidate onto the hero exactly as the bake
//    does, measures it on the hero's bones, and renders the best ones
//    (scripts/blender/motion_score.py). Needs build/models/hero.blend:
//    run `npm run bake:models hero` first.
// 3. --pick copies a candidate into sources/ and records it as chosen.
//    Then bake again: `npm run bake:models hero && npm run gen:hero`.
//
// HY-Motion's license limits its outputs to its Territory: never push a
// source while the repo is public.

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES = join(ROOT, 'scripts', 'blender', 'sources', 'hy-motion');
const CLIPS = join(SOURCES, 'clips.json');
const HY = process.env.HY_MOTION_DIR ?? 'C:\\Users\\nourk\\ai\\HY-Motion-1.0';

function findBlender() {
  if (process.env.BLENDER) return process.env.BLENDER;
  const windows = 'C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe';
  return existsSync(windows) ? windows : 'blender';
}

function run(command, args, options) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

const [clip, flag, pickId] = process.argv.slice(2);
const manifest = JSON.parse(readFileSync(CLIPS, 'utf8'));
const brief = clip ? manifest.clips[clip] : undefined;
if (!brief) {
  console.error(`usage: npm run motion -- <clip> [--pick <id>]; clips: ${Object.keys(manifest.clips).join(', ')}`);
  process.exit(1);
}
const work = join(ROOT, 'build', 'motion', clip);
const out = join(work, 'out');

/** Candidates on disk: HY-Motion names them <prompt number>_<sample>.npz. */
function candidates() {
  if (!existsSync(out)) return [];
  return readdirSync(out)
    .map((file) => file.match(/^0*(\d+)_(\d+)\.npz$/))
    .filter((m) => m !== null)
    .map((m) => ({ id: `p${Number(m[1]) - 1}s${Number(m[2])}`, file: join(out, m[0]) }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

if (flag === '--pick') {
  const chosen = candidates().find((c) => c.id === pickId);
  if (!chosen) {
    console.error(`no candidate ${pickId} in ${out}; run \`npm run motion -- ${clip}\` first`);
    process.exit(1);
  }
  const scores = JSON.parse(readFileSync(join(work, 'scores.json'), 'utf8'));
  const score = scores.find((s) => s.id === pickId)?.score;
  const file = `${clip}.npz`;
  copyFileSync(chosen.file, join(SOURCES, file));
  brief.chosen = {
    file,
    candidate: pickId,
    by: `npm run motion (score ${score?.toFixed(3)}), ${new Date().toISOString().slice(0, 10)}`,
  };
  writeFileSync(CLIPS, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`chose ${pickId} for ${clip}; now run: npm run bake:models hero && npm run gen:hero`);
  process.exit(0);
}

// 1. Make the candidates. Prompt files sort in brief order, which fixes
//    the order HY-Motion draws the seeds in.
rmSync(work, { recursive: true, force: true });
const prompts = join(work, 'prompts');
mkdirSync(prompts, { recursive: true });
brief.prompts.forEach((text, i) => {
  writeFileSync(join(prompts, `p${String(i).padStart(2, '0')}.txt`), `${text}#${brief.frames}#${i + 1}\n`);
});
const cache = join(HY, '..', 'cache');
const status = run(
  join(HY, '.venv', 'Scripts', 'python.exe'),
  [
    'run_seeded.py',
    String(brief.master_seed),
    '--model_path',
    join('ckpts', 'tencent', manifest.model),
    '--input_text_dir',
    prompts,
    '--output_dir',
    out,
    '--disable_rewrite',
    '--disable_duration_est',
    '--num_seeds',
    String(brief.samples),
  ],
  {
    cwd: HY,
    env: {
      ...process.env,
      USE_HF_MODELS: '1',
      HF_HUB_OFFLINE: '1',
      HF_HOME: join(cache, 'hf'),
      XDG_CACHE_HOME: join(cache, 'xdg'),
      TORCH_HOME: join(cache, 'torch'),
      CUDA_VISIBLE_DEVICES: process.env.HY_MOTION_GPU ?? '1',
      PYTHONIOENCODING: 'utf-8',
    },
  },
);
// HY-Motion's reference-character export can fail after the motion is
// saved; only missing motion files are an error.
const made = candidates();
const expected = brief.prompts.length * brief.samples;
if (made.length !== expected) {
  console.error(`HY-Motion made ${made.length} of ${expected} candidates (exit ${status})`);
  process.exit(1);
}

// 2. Score them on the hero and render the best.
const heroBlend = join(ROOT, 'build', 'models', 'hero.blend');
if (!existsSync(heroBlend)) {
  console.error('build/models/hero.blend is missing: run `npm run bake:models hero` first');
  process.exit(1);
}
const scored = run(findBlender(), [
  '--background',
  heroBlend,
  '--python-exit-code',
  '1',
  '--python',
  join(ROOT, 'scripts', 'blender', 'motion_score.py'),
  '--',
  clip,
  work,
  ...made.map((c) => `${c.id}=${c.file}`),
]);
if (scored !== 0) process.exit(scored);

const scores = JSON.parse(readFileSync(join(work, 'scores.json'), 'utf8'));
console.log(`\n${clip}: ${scores.length} candidates, best first (weights ${JSON.stringify(brief.score)})`);
for (const s of scores) {
  const m = Object.entries(s.metrics)
    .map(([k, v]) => `${k} ${v.toFixed(2)}`)
    .join('  ');
  const mark = s.id === brief.chosen?.candidate ? '  <- chosen now' : '';
  console.log(`  ${s.id}  score ${s.score.toFixed(3)}  ${m}${mark}`);
}
console.log(`\ncontact sheet (best ${Math.min(4, scores.length)}, best on top): ${join(work, 'sheet.png')}`);
console.log(`to choose one: npm run motion -- ${clip} --pick <id>`);
