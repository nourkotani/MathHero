// Makes 3D models with Tripo from a committed brief (ADR 0011), through the
// official Tripo CLI (`npm install -g tripo-cli`), which is built for agents:
// it validates a plan for free (--dry-run), polls, and downloads.
//
//   npm run tripo -- balance            show the credit balance
//   npm run tripo -- generate <name>    make every candidate of a brief (one per prompt and seed)
//   npm run tripo -- preview <name>     render every candidate from four sides
//   npm run tripo -- pick <name> <id>   choose a candidate as the model's source
//
// The brief is in scripts/blender/sources/tripo/models.json. Candidates
// download into build/tripo/<name>/<id>/ (git ignores build/): the model,
// Tripo's preview.png, and task.json. Each task's id, status, and cost go
// back into the brief: a cloud seed does not survive a vendor model update,
// so the task id is the record. A finished candidate is never made again.
//
// The key is TRIPO_API_KEY. It must be a paid key: free-tier outputs are
// public and CC BY. A process started before the key was set does not see
// it, so on Windows the tool also reads the user's environment variables
// and hands the key to the CLI.

import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES = join(ROOT, 'scripts', 'blender', 'sources', 'tripo');
const BRIEFS = join(SOURCES, 'models.json');

function apiKey() {
  if (process.env.TRIPO_API_KEY) return process.env.TRIPO_API_KEY;
  if (process.platform === 'win32') {
    const read = spawnSync(
      'powershell',
      ['-NoProfile', '-Command', "[Environment]::GetEnvironmentVariable('TRIPO_API_KEY','User')"],
      { encoding: 'utf8' },
    );
    const key = read.stdout?.trim();
    if (key) return key;
  }
  throw new Error('Set TRIPO_API_KEY to a paid Tripo API key.');
}

// The CLI's exit codes (tripo docs): 2 usage, 3 auth, 4 credits, 5 content
// policy, 6 task failed (refunded), 7 network, 8 not found, 9 rate limit.
const EXIT = {
  2: 'bad parameters',
  3: 'auth',
  4: 'not enough credits (buy API credits: tripo topup)',
  5: 'content policy',
  6: 'task failed (credits refunded)',
  7: 'network',
  9: 'rate limit',
};

/** Run the Tripo CLI; return its one-line JSON result from stdout. */
function tripo(args) {
  const run = spawnSync('tripo', [...args, '--json', '--yes', '--no-open'], {
    encoding: 'utf8',
    shell: process.platform === 'win32', // tripo is a .cmd shim on Windows
    env: { ...process.env, TRIPO_API_KEY: apiKey() },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  if (run.error) throw run.error;
  const last = (run.stdout ?? '').trim().split('\n').pop() ?? '';
  let result = {};
  try {
    result = JSON.parse(last);
  } catch {
    // no JSON: the exit code explains it
  }
  if (run.status !== 0) {
    throw new Error(
      `tripo ${args[0]}: exit ${run.status} (${EXIT[run.status] ?? 'error'}) ${last.slice(0, 300)}`,
    );
  }
  return result;
}

/** Credits for one text-to-model task with these params (Tripo pricing, 2026-09-25). */
function estimate(params) {
  let credits = params.texture === false ? 10 : 20;
  if (params.geometry_quality === 'detailed') credits += 20;
  if (params.texture_quality === 'detailed') credits += 10;
  if (params.texture_quality === 'extreme') credits += 20;
  if (params.quad) credits += 5;
  if (params.smart_low_poly) credits += 10;
  return credits;
}

/** Windows shells split on spaces: quote each argument for the .cmd shim. */
const arg = (value) =>
  process.platform === 'win32' ? `"${String(value).replace(/"/g, '\\"')}"` : String(value);

const manifest = JSON.parse(readFileSync(BRIEFS, 'utf8'));
const save = () => writeFileSync(BRIEFS, `${JSON.stringify(manifest, null, 2)}\n`);
const [command, name, id] = process.argv.slice(2);

if (command === 'balance') {
  const balance = tripo(['balance']);
  console.log(`balance ${balance.balance} credits (${balance.frozen} frozen)`);
  process.exit(0);
}

const brief = name ? manifest.models[name] : undefined;
if (!brief || !['generate', 'preview', 'pick'].includes(command)) {
  console.error(
    `usage: npm run tripo -- balance | generate <name> | preview <name> | pick <name> <id>; models: ${Object.keys(manifest.models).join(', ')}`,
  );
  process.exit(1);
}
const work = join(ROOT, 'build', 'tripo', name);
const candidateIds = brief.prompts.flatMap((_, p) => brief.seeds.map((_, s) => `p${p}s${s}`));
function modelFile(cid) {
  const dir = join(work, cid);
  if (!existsSync(dir)) return null;
  const model = readdirSync(dir).find((f) => /\.(glb|gltf|fbx)$/i.test(f));
  return model ? join(dir, model) : null;
}

if (command === 'generate') {
  const todo = candidateIds.filter((cid) => brief.candidates[cid]?.status !== 'success');
  const makeArgs = (cid) => {
    const [p, s] = [Number(cid[1]), Number(cid[3])];
    const seed = brief.seeds[s];
    const params = {
      ...brief.options.params,
      negative_prompt: brief.negative_prompt,
      image_seed: seed,
      texture_seed: seed,
    };
    return [
      'make',
      arg(brief.prompts[p]),
      '--model',
      brief.options.model,
      '--seed',
      String(seed),
      ...Object.entries(params).flatMap(([k, v]) => ['-p', arg(`${k}=${v}`)]),
      '--out',
      arg(join(work, cid)),
      '--name',
      `${name}-${cid}`,
    ];
  };
  // Validate every plan before anything is spent.
  for (const cid of todo) {
    const plan = tripo([...makeArgs(cid), '--dry-run']);
    if (plan.valid === false)
      throw new Error(`${cid}: invalid plan ${JSON.stringify(plan.errors)}`);
  }
  const cost = todo.length * estimate(brief.options.params);
  const { balance } = tripo(['balance']);
  console.log(`${todo.length} candidates to make: about ${cost} credits; balance ${balance}`);
  if (cost > balance) {
    console.error(
      'Not enough API credits (Studio credits do not count): buy some with `tripo topup`.',
    );
    process.exit(1);
  }
  for (const cid of todo) {
    console.log(`${cid}: making (a few minutes)...`);
    const result = tripo(makeArgs(cid));
    brief.candidates[cid] = {
      task_id: result.task_id,
      status: result.status,
      credits_consumed: result.credits_consumed,
      prompt: Number(cid[1]),
      seed: brief.seeds[Number(cid[3])],
      files: result.output_dir ? relative(ROOT, result.output_dir).replace(/\\/g, '/') : undefined,
    };
    save();
    console.log(
      `${cid}: ${result.status}, ${result.credits_consumed} credits, ${result.model_file ?? ''}`,
    );
  }
  console.log(`done; next: npm run tripo -- preview ${name}`);
}

if (command === 'preview') {
  const ready = candidateIds.filter((cid) => modelFile(cid));
  if (ready.length === 0) {
    console.error(`no downloaded candidates in ${work}; run generate first`);
    process.exit(1);
  }
  const blender =
    process.env.BLENDER ??
    (existsSync('C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe')
      ? 'C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe'
      : 'blender');
  const result = spawnSync(
    blender,
    [
      '--background',
      '--factory-startup',
      '--python-exit-code',
      '1',
      '--python',
      join(ROOT, 'scripts', 'blender', 'tripo_preview.py'),
      '--',
      join(work, 'sheet.png'),
      ...ready.map((cid) => `${cid}=${modelFile(cid)}`),
    ],
    { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' },
  );
  for (const line of (result.stdout ?? '').split('\n')) {
    if (line.startsWith('CANDIDATE')) console.log(line.slice(10));
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
  console.log(
    `sheet (one row per candidate: front, right, back, left): ${join(work, 'sheet.png')}`,
  );
}

if (command === 'pick') {
  const source = id ? modelFile(id) : null;
  if (!source) {
    console.error(`no downloaded candidate ${id}; candidates: ${candidateIds.join(', ')}`);
    process.exit(1);
  }
  mkdirSync(SOURCES, { recursive: true });
  const file = `${name}.glb`;
  copyFileSync(source, join(SOURCES, file));
  brief.chosen = { candidate: id, task_id: brief.candidates[id].task_id, file };
  save();
  console.log(`chose ${id} for ${name}: scripts/blender/sources/tripo/${file}`);
}
