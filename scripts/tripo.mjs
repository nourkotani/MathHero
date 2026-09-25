// Makes 3D models with Tripo from a committed brief (ADR 0011), through the
// official Tripo CLI (`npm install -g tripo-cli`), which is built for agents:
// it validates a plan for free (--dry-run), polls, and downloads.
//
//   npm run tripo -- balance            show the credit balance
//   npm run tripo -- generate <name>    make every candidate of a brief (one per prompt and seed)
//   npm run tripo -- preview <name>     render every candidate from four sides
//   npm run tripo -- pick <name> <id>   choose a candidate
//   npm run tripo -- retexture <name>   paint the chosen candidate again from the
//                                       brief's "retexture" text (same shape)
//   npm run tripo -- rig <name>         rig the chosen candidate (rig check first, free)
//   npm run tripo -- animate <name>     apply the brief's preset animations to the rig;
//                                       the result is the model's source in sources/tripo/
//
// The brief is in scripts/blender/sources/tripo/models.json. Candidates
// download into build/tripo/<name>/<id>/ (git ignores build/): the model,
// Tripo's preview.png, and task.json. The tool keeps each candidate's model
// at full detail in sources/tripo/<name>/candidates/ (git LFS), the chosen
// one and the others alike. Each task's id, status, and cost go back into
// the brief: a cloud seed does not survive a vendor model update, so the
// task id is the record. A finished candidate is never made again.
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
import { dirname, join } from 'node:path';
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

/**
 * The CLI's own entry script (tripo-cli dist/cli.js). Node runs it with the
 * arguments as they are: on Windows, `tripo` is a .cmd shim, and the shell
 * splits the quotes inside a JSON parameter. TRIPO_CLI overrides the search.
 */
function cliEntry() {
  if (process.env.TRIPO_CLI) return process.env.TRIPO_CLI;
  const roots = [
    join(process.env.LOCALAPPDATA ?? '', 'Volta', 'tools', 'image', 'packages', 'tripo-cli', 'node_modules'),
  ];
  const npmRoot = spawnSync('npm', ['root', '-g'], { encoding: 'utf8', shell: process.platform === 'win32' });
  if (npmRoot.stdout) roots.push(npmRoot.stdout.trim());
  return roots.map((root) => join(root, 'tripo-cli', 'dist', 'cli.js')).find(existsSync) ?? null;
}
const CLI = cliEntry();

/** Run the Tripo CLI; return its one-line JSON result from stdout. */
function tripo(args) {
  const flags = [...args, '--json', '--yes', '--no-open'];
  const run = spawnSync(CLI ? process.execPath : 'tripo', CLI ? [CLI, ...flags] : flags, {
    encoding: 'utf8',
    shell: !CLI && process.platform === 'win32', // without the entry: the .cmd shim
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
    // A failed --dry-run lists its reasons in `errors`: show them whole.
    const detail = result.errors ? JSON.stringify(result.errors) : last.slice(0, 300);
    throw new Error(`tripo ${args[0]}: exit ${run.status} (${EXIT[run.status] ?? 'error'}) ${detail}`);
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

/** Only the .cmd shim needs quotes: the shell splits on spaces. */
const arg = (value) =>
  !CLI && process.platform === 'win32' ? `"${String(value).replace(/"/g, '\\"')}"` : String(value);

const manifest = JSON.parse(readFileSync(BRIEFS, 'utf8'));
const save = () => writeFileSync(BRIEFS, `${JSON.stringify(manifest, null, 2)}\n`);
const [command, name, id] = process.argv.slice(2);

if (command === 'balance') {
  const balance = tripo(['balance']);
  console.log(`balance ${balance.balance} credits (${balance.frozen} frozen)`);
  process.exit(0);
}

const brief = name ? manifest.models[name] : undefined;
if (!brief || !['generate', 'preview', 'pick', 'retexture', 'rig', 'animate'].includes(command)) {
  console.error(
    `usage: npm run tripo -- balance | generate <name> | preview <name> | pick <name> <id> | retexture <name> | rig <name> | animate <name>; models: ${Object.keys(manifest.models).join(', ')}`,
  );
  process.exit(1);
}
const work = join(ROOT, 'build', 'tripo', name);
const candidateIds = brief.prompts.flatMap((_, p) => brief.seeds.map((_, s) => `p${p}s${s}`));
/** The model file under dir; the CLI nests it a folder or two down. */
function findModel(root) {
  const find = (dir) => {
    if (!existsSync(dir)) return null;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        const found = find(path);
        if (found) return found;
      } else if (/\.(glb|gltf|fbx)$/i.test(entry.name)) {
        return path;
      }
    }
    return null;
  };
  return find(root);
}
const candidates = join(SOURCES, name, 'candidates');
/** A candidate's model: the committed copy, else the download. */
const modelFile = (cid) => {
  const kept = join(candidates, `${cid}.glb`);
  return existsSync(kept) ? kept : findModel(join(work, cid));
};

if (command === 'generate') {
  // A candidate with a live task is paid for: never make it again, even
  // when it is still queued (fetch it with `tripo task watch <id> --download`).
  const failed = ['failed', 'cancelled', 'banned', 'expired'];
  const todo = candidateIds.filter((cid) => {
    const made = brief.candidates[cid];
    return !made?.task_id || failed.includes(made.status);
  });
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
    const model = findModel(join(work, cid));
    if (model) {
      mkdirSync(candidates, { recursive: true });
      copyFileSync(model, join(candidates, `${cid}.glb`));
    }
    brief.candidates[cid] = {
      task_id: result.task_id,
      status: result.status,
      credits_consumed: result.credits_consumed,
      prompt: Number(cid[1]),
      seed: brief.seeds[Number(cid[3])],
      file: model ? `${name}/candidates/${cid}.glb` : undefined,
    };
    save();
    console.log(
      `${cid}: ${result.status}, ${result.credits_consumed} credits, ${result.model_file ?? ''}`,
    );
  }
  console.log(`done; next: npm run tripo -- preview ${name}`);
}

/** Run a script from scripts/blender/ headless; return its stdout. */
function runBlender(script, args) {
  const windows = 'C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe';
  const blender = process.env.BLENDER ?? (existsSync(windows) ? windows : 'blender');
  const result = spawnSync(
    blender,
    [
      '--background',
      '--factory-startup',
      '--python-exit-code',
      '1',
      '--python',
      join(ROOT, 'scripts', 'blender', script),
      '--',
      ...args,
    ],
    { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' },
  );
  if (result.status !== 0) throw new Error(`blender ${script} failed (exit ${result.status})`);
  return result.stdout ?? '';
}

if (command === 'preview') {
  const ready = candidateIds.filter((cid) => modelFile(cid));
  if (ready.length === 0) {
    console.error(`no downloaded candidates in ${work}; run generate first`);
    process.exit(1);
  }
  const out = runBlender('tripo_preview.py', [
    join(work, 'sheet.png'),
    ...ready.map((cid) => `${cid}=${modelFile(cid)}`),
  ]);
  for (const line of out.split('\n')) {
    if (line.startsWith('CANDIDATE')) console.log(line.slice(10));
  }
  console.log(
    `sheet (one row per candidate: front, right, back, left): ${join(work, 'sheet.png')}`,
  );
}

if (command === 'pick') {
  if (!id || !brief.candidates[id]?.task_id) {
    console.error(`no finished candidate ${id}; candidates: ${candidateIds.join(', ')}`);
    process.exit(1);
  }
  brief.chosen = { candidate: id, task_id: brief.candidates[id].task_id };
  save();
  console.log(`chose ${id} for ${name}; next: npm run tripo -- rig ${name}`);
}

// A texture painted again keeps the model's UV layout (checked on hero-girl:
// the UVs match exactly), so it never replaces the chosen model: the rig
// and the regions use the chosen one, and the bake takes only what it needs
// from the new texture (ADR 0012: the face).
if (command === 'retexture') {
  if (!brief.chosen) throw new Error(`pick a candidate first: npm run tripo -- pick ${name} <id>`);
  const paint = brief.retexture;
  if (!paint?.text) throw new Error(`the brief has no "retexture": {"text": ...}`);
  if (paint.task_id) throw new Error(`already painted again: task ${paint.task_id}`);
  const cid = brief.chosen.candidate;
  const cost = paint.quality === 'detailed' ? 20 : 10;
  const { balance } = tripo(['balance']);
  console.log(`painting ${cid} again: about ${cost} credits; balance ${balance}`);
  if (cost > balance) throw new Error('Not enough API credits: buy some with `tripo topup`.');
  const out = join(work, `${cid}-texture`);
  const result = tripo([
    'model',
    'texture',
    brief.candidates[cid].task_id,
    '--texture-quality',
    paint.quality ?? 'standard',
    '--texture-alignment',
    'geometry',
    '-p',
    `texture_prompt=${JSON.stringify({ text: paint.text })}`,
    '-p',
    `texture_seed=${paint.seed ?? brief.candidates[cid].seed}`,
    '--out',
    arg(out),
    '--name',
    `${name}-${cid}-texture`,
  ]);
  const model = findModel(out);
  if (!model) throw new Error('the texture task finished without a model file');
  const file = `${name}/candidates/${cid}-texture.glb`;
  copyFileSync(model, join(SOURCES, file));
  Object.assign(paint, {
    candidate: cid,
    task_id: result.task_id,
    credits_consumed: result.credits_consumed,
    file,
  });
  save();
  console.log(`painted: task ${result.task_id}, ${result.credits_consumed} credits (the bake reads ${file})`);
}

if (command === 'rig') {
  if (!brief.chosen) throw new Error(`pick a candidate first: npm run tripo -- pick ${name} <id>`);
  const { model, spec, faces } = brief.rig;
  // Tripo's retarget fails on the full ~780k-face model, and the game needs
  // far fewer faces: decimate first (the script is the record), then upload
  // and rig that. Through `make --then` the CLI sends the rig model; the
  // presets need rig v1.0 and Tripo's native skeleton (spec "tripo"): a
  // Mixamo-named rig matches no preset skeleton profile.
  const prepared = join(work, 'prepared.glb');
  runBlender('tripo_prepare.py', [modelFile(brief.chosen.candidate), prepared, String(faces)]);
  const result = tripo([
    'make',
    arg(prepared),
    '--then',
    `rig-check,rig:spec=${spec},model=${model}`,
    '--out',
    arg(join(work, 'rig')),
    '--name',
    `${name}-rig`,
  ]);
  const byType = (type) => (result.credits_breakdown ?? []).find((t) => t.type === type);
  brief.rig.import_task_id = byType('import_model')?.task_id;
  brief.rig.task_id = byType('animate_rig')?.task_id ?? result.task_id;
  brief.rig.credits_consumed = result.credits_consumed;
  save();
  console.log(
    `rigged: task ${brief.rig.task_id}, ${brief.rig.credits_consumed} credits; next: npm run tripo -- animate ${name}`,
  );
}

if (command === 'animate') {
  if (!brief.rig?.task_id) throw new Error(`rig the model first: npm run tripo -- rig ${name}`);
  // One preset per task: a multi-preset task was billed for every preset
  // but returned only the last one (task 6bb52ba3, 2026-09-25). The first
  // clip carries the geometry and is the base; the others are animation
  // only, which keeps each file small. The bake merges them.
  const dir = join(SOURCES, name);
  mkdirSync(dir, { recursive: true });
  brief.clips ??= {};
  Object.entries(brief.animations).forEach(([clip, preset], i) => {
    const file = `${clip}.glb`;
    if (brief.clips[clip]?.task_id && existsSync(join(dir, file))) return; // already made
    const out = join(work, 'clips', clip);
    const result = tripo([
      'anim',
      'retarget',
      brief.rig.task_id,
      '--animation',
      preset,
      '--out-format',
      'glb',
      '--animate-in-place',
      '-p',
      `export_with_geometry=${i === 0}`,
      '--out',
      arg(out),
      '--name',
      `${name}-${clip}`,
    ]);
    const model = findModel(out);
    if (!model) throw new Error(`the ${clip} task finished without a model file`);
    copyFileSync(model, join(dir, file));
    brief.clips[clip] = {
      preset,
      task_id: result.task_id,
      credits_consumed: result.credits_consumed,
      file: `${name}/${file}`,
      geometry: i === 0,
    };
    save();
    console.log(`${clip}: ${preset}, task ${result.task_id}, ${result.credits_consumed} credits`);
  });
  console.log(`animated: sources in scripts/blender/sources/tripo/${name}/`);
}
