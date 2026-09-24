// Publishes the hosted copy to GitHub Pages (ADR 0006). Run by hand:
// `npm run deploy`. There is no CI: this script runs the full check gate
// first and stops if it fails, so a broken build never reaches the family.
//
// The single file stays the deliverable. The site is that file plus what
// lives AROUND it: index.html is MathHero.html with the Home Screen tags
// added (the single file itself never links a manifest — on file:// that
// would be a request), and site/ holds the manifest, the service worker,
// and the baked icons. The branch gh-pages holds only the latest site.
//
// `npm run deploy -- --dry-run` skips the gate and the push, and leaves the
// site in build/site/ to look at.

import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'build', 'site');
const dryRun = process.argv.includes('--dry-run');

const run = (command, args, cwd = ROOT) =>
  execFileSync(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
const read = (command, args, cwd = ROOT) =>
  execFileSync(command, args, { cwd, encoding: 'utf8', shell: process.platform === 'win32' }).trim();

if (!dryRun) {
  if (read('git', ['status', '--porcelain']) !== '') {
    throw new Error('Commit or stash your changes first: the site must match a commit.');
  }
  run('npm', ['run', 'check']);
}

// Only the hosted copy gets these: the Home Screen name, icon, and
// full-screen launch, plus the manifest that iOS and Android read.
const HOME_SCREEN_TAGS = `
    <link rel="manifest" href="manifest.webmanifest" />
    <link rel="apple-touch-icon" href="icon-180.png" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="MathHero" />
    <meta name="theme-color" content="#0b0e22" />
  </head>
  <body`;

const single = readFileSync(join(ROOT, 'dist', 'MathHero.html'), 'utf8');
// The real end of the head is the one right before <body>: the inlined
// script also sits in the head, and its text is never touched.
const HEAD_END = /<\/head>\s*<body/;
if (!HEAD_END.test(single)) throw new Error('dist/MathHero.html has no </head> before <body>');

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
cpSync(join(ROOT, 'site'), OUT, { recursive: true });
writeFileSync(join(OUT, 'index.html'), single.replace(HEAD_END, HOME_SCREEN_TAGS));
// The unchanged single file, for a parent who wants to download it.
copyFileSync(join(ROOT, 'dist', 'MathHero.html'), join(OUT, 'MathHero.html'));
// Serve the files as they are: no Jekyll processing on Pages.
writeFileSync(join(OUT, '.nojekyll'), '');
console.log(`site ready in ${OUT}`);

if (dryRun) process.exit(0);

// A fresh one-commit repository, force-pushed as gh-pages: the branch holds
// only the latest site, never the history of builds.
const commit = read('git', ['rev-parse', '--short', 'HEAD']);
const origin = read('git', ['remote', 'get-url', 'origin']);
run('git', ['init', '--quiet', '--initial-branch=gh-pages'], OUT);
run('git', ['add', '--all'], OUT);
run('git', ['commit', '--quiet', '-m', `Deploy MathHero from ${commit}`], OUT);
run('git', ['push', '--force', origin, 'gh-pages'], OUT);
console.log(`deployed ${commit} to gh-pages`);
