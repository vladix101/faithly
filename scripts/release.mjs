#!/usr/bin/env node
// Publishes dist/faithly.apk as a GitHub Release asset named exactly "faithly.apk".
//   npm run release            # uses version from app.json and release-notes/v<version>.md
//   npm run release -- --draft # optional: create as draft for review
// Needs the GitHub CLI logged in (gh auth login) and a git remote "origin" on GitHub.
// The release is published as a normal (not pre-release) release so that
// https://github.com/<owner>/<repo>/releases/latest/download/faithly.apk always points to it.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: root, encoding: 'utf8', ...opts }).trim();

const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo;
const tag = `v${app.version}`;
const apk = path.join(root, 'dist', 'faithly.apk');
const notes = path.join(root, 'release-notes', `${tag}.md`);
const draft = process.argv.includes('--draft');

if (!fs.existsSync(apk)) throw new Error('dist/faithly.apk not found – run "npm run build:apk" first.');
if (!fs.existsSync(notes)) throw new Error(`Missing ${path.relative(root, notes)}`);

const remote = sh('git', ['remote', 'get-url', 'origin']);
const m = remote.match(/github\.com[:/]([^/]+)\/(.+?)(\.git)?$/);
if (!m) throw new Error(`origin is not a GitHub remote: ${remote}`);
const repo = `${m[1]}/${m[2]}`;

const exists = (() => {
  try {
    sh('gh', ['release', 'view', tag, '--repo', repo]);
    return true;
  } catch {
    return false;
  }
})();

if (exists) {
  console.log(`Release ${tag} exists – replacing its faithly.apk asset.`);
  sh('gh', ['release', 'upload', tag, `${apk}#faithly.apk`, '--clobber', '--repo', repo], { stdio: 'inherit' });
} else {
  sh('git', ['push', 'origin', 'HEAD'], { stdio: 'inherit' });
  sh(
    'gh',
    [
      'release',
      'create',
      tag,
      `${apk}#faithly.apk`,
      '--repo',
      repo,
      '--title',
      `Faithly ${app.version}`,
      '--notes-file',
      notes,
      '--target',
      sh('git', ['rev-parse', 'HEAD']),
      ...(draft ? ['--draft'] : ['--latest']),
    ],
    { stdio: 'inherit' },
  );
}
console.log(`\nDownload link: https://github.com/${repo}/releases/latest/download/faithly.apk`);
