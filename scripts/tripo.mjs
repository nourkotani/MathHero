// Makes 3D models with the Tripo API from a committed brief (ADR 0011).
//
//   npm run tripo -- balance            show the credit balance
//   npm run tripo -- generate <name>    make every candidate of a brief (one per prompt and seed)
//   npm run tripo -- preview <name>     render every candidate from four sides
//   npm run tripo -- pick <name> <id>   choose a candidate as the model's source
//
// The brief is in scripts/blender/sources/tripo/models.json. Candidates
// download into build/tripo/<name>/<id>/ (git ignores build/), and each
// task's id, status, and cost go back into the brief: a cloud seed does not
// survive a vendor model update, so the task id is the record. A run that
// stops early resumes: a candidate with a task id is polled, not made again.
//
// The key is TRIPO_API_KEY. It must be a paid key: free-tier outputs are
// public and CC BY. A process started before the key was set does not see
// it in its environment, so on Windows the tool also reads the user's
// environment variables.

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES = join(ROOT, 'scripts', 'blender', 'sources', 'tripo');
const BRIEFS = join(SOURCES, 'models.json');
const API = 'https://openapi.tripo3d.ai/v3';
const POLL_MS = 5000;
const RUNNING = new Set(['queued', 'running', 'pending', 'processing']);

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

async function call(method, path, body) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || (json.code !== undefined && json.code !== 0)) {
    throw new Error(
      `${method} ${path}: HTTP ${response.status} ${JSON.stringify(json).slice(0, 300)}`,
    );
  }
  return json.data ?? json;
}

/** Credits for one text-to-model task with these options (Tripo pricing, 2026-09-25). */
function estimate(options) {
  let credits = options.texture === false ? 10 : 20;
  if (options.geometry_quality === 'detailed') credits += 20;
  if (options.texture_quality === 'detailed') credits += 10;
  if (options.texture_quality === 'extreme') credits += 20;
  if (options.quad) credits += 5;
  if (options.smart_low_poly) credits += 10;
  return credits;
}

const manifest = JSON.parse(readFileSync(BRIEFS, 'utf8'));
const save = () => writeFileSync(BRIEFS, `${JSON.stringify(manifest, null, 2)}\n`);
const [command, name, id] = process.argv.slice(2);

if (command === 'balance') {
  const balance = await call('GET', '/account/balance');
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
const modelFile = (cid) => join(work, cid, 'model.glb');

if (command === 'generate') {
  const todo = candidateIds.filter((cid) => brief.candidates[cid]?.status !== 'success');
  const fresh = todo.filter((cid) => !brief.candidates[cid]?.task_id);
  const cost = fresh.length * estimate(brief.options);
  const { balance } = await call('GET', '/account/balance');
  console.log(
    `${todo.length} candidates to finish, ${fresh.length} new: about ${cost} credits; balance ${balance}`,
  );
  if (cost > balance) {
    console.error('Not enough credits: buy a credit pack on the Tripo console first.');
    process.exit(1);
  }
  for (const cid of fresh) {
    const [p, s] = [Number(cid[1]), Number(cid[3])];
    const seed = brief.seeds[s];
    const task = await call('POST', '/generation/text-to-model', {
      prompt: brief.prompts[p],
      negative_prompt: brief.negative_prompt,
      ...brief.options,
      model_seed: seed,
      image_seed: seed,
      texture_seed: seed,
    });
    brief.candidates[cid] = { task_id: task.task_id, status: 'queued', prompt: p, seed };
    save();
    console.log(`${cid}: task ${task.task_id}`);
  }
  // Poll every unfinished task, then download what it made at once: the
  // expiry of the download links is not documented.
  let open = todo;
  while (open.length > 0) {
    for (const cid of open) {
      const task = await call('GET', `/tasks/${brief.candidates[cid].task_id}`);
      const record = brief.candidates[cid];
      record.status = task.status;
      if (RUNNING.has(task.status)) continue;
      record.credits_consumed = task.credits_consumed;
      if (task.status === 'success') {
        const dir = join(work, cid);
        mkdirSync(dir, { recursive: true });
        for (const [key, url] of Object.entries(task.output ?? {})) {
          if (typeof url !== 'string' || !url.startsWith('http')) continue;
          const ext = extname(new URL(url).pathname) || '.bin';
          const file = key === 'model_url' ? 'model.glb' : `${key.replace(/_url$/, '')}${ext}`;
          const bytes = Buffer.from(await (await fetch(url)).arrayBuffer());
          writeFileSync(join(dir, file), bytes);
          console.log(`${cid}: ${file} (${(bytes.length / 1e6).toFixed(1)} MB)`);
        }
      } else {
        console.error(`${cid}: task ended as ${task.status}`);
      }
      save();
    }
    open = open.filter((cid) => RUNNING.has(brief.candidates[cid].status));
    if (open.length > 0) {
      process.stdout.write(`waiting for ${open.join(', ')}\n`);
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
  }
  console.log(`done; next: npm run tripo -- preview ${name}`);
}

if (command === 'preview') {
  const ready = candidateIds.filter((cid) => existsSync(modelFile(cid)));
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
  for (const line of (result.stdout ?? '').split('\n'))
    if (line.startsWith('CANDIDATE')) console.log(line.slice(10));
  if (result.status !== 0) process.exit(result.status ?? 1);
  console.log(
    `sheet (one row per candidate: front, right, back, left): ${join(work, 'sheet.png')}`,
  );
}

if (command === 'pick') {
  if (!id || !existsSync(modelFile(id))) {
    console.error(`no downloaded candidate ${id}; candidates: ${candidateIds.join(', ')}`);
    process.exit(1);
  }
  mkdirSync(SOURCES, { recursive: true });
  const file = `${name}.glb`;
  copyFileSync(modelFile(id), join(SOURCES, file));
  brief.chosen = { candidate: id, task_id: brief.candidates[id].task_id, file };
  save();
  console.log(`chose ${id} for ${name}: scripts/blender/sources/tripo/${file}`);
}
