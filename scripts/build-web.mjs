#!/usr/bin/env node
// Production PWA build → web-dist/ (served by the Cloudflare Worker's static assets)
//   npm run build:web
// 1. content packages from assets/db/content.db  2. expo export (SPA)  3. service worker + headers
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'web-dist');
const win = process.platform === 'win32';
const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, stdio: 'inherit', shell: win });

run('node', ['scripts/build-web-content.mjs']);
// Export to a fresh folder, then move it into web-dist. web-dist itself is only emptied, not
// deleted: on Windows a running `wrangler dev` keeps it busy.
const tmp = path.join(root, '.web-export');
fs.rmSync(tmp, { recursive: true, force: true });
run('npx', ['expo', 'export', '--platform', 'web', '--output-dir', '.web-export', '--clear']);
fs.mkdirSync(out, { recursive: true });
for (const e of fs.readdirSync(out)) fs.rmSync(path.join(out, e), { recursive: true, force: true });
for (const e of fs.readdirSync(tmp)) fs.renameSync(path.join(tmp, e), path.join(out, e));
fs.rmSync(tmp, { recursive: true, force: true });

// Every file except content packages and source maps belongs to the app shell.
const files = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    const rel = '/' + path.relative(out, p).split(path.sep).join('/');
    if (e.isDirectory()) {
      if (rel !== '/content') walk(p);
    } else if (!rel.endsWith('.map') && rel !== '/_headers' && rel !== '/sw.js') files.push(rel);
  }
};
walk(out);
files.sort();
const hash = crypto.createHash('sha256');
for (const f of files) hash.update(f).update(fs.readFileSync(path.join(out, f)));
const buildId = hash.digest('hex').slice(0, 12);
const precache = ['/', ...files.filter((f) => f !== '/index.html'), '/index.html'];

const template = fs.readFileSync(path.join(root, 'web/sw.template.js'), 'utf8');
fs.writeFileSync(
  path.join(out, 'sw.js'),
  template.replace("'__BUILD_ID__'", JSON.stringify(buildId)).replace('__PRECACHE__', JSON.stringify(precache)),
);

// Cache and security headers for Workers Static Assets.
fs.writeFileSync(
  path.join(out, '_headers'),
  `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  X-Frame-Options: DENY

/sw.js
  Cache-Control: no-cache
  Service-Worker-Allowed: /

/index.html
  Cache-Control: no-cache

/manifest.webmanifest
  Cache-Control: no-cache
  Content-Type: application/manifest+json

/_expo/static/*
  Cache-Control: public, max-age=31536000, immutable

/content/*
  Cache-Control: public, max-age=31536000, immutable
`,
);
const size = files.reduce((s, f) => s + fs.statSync(path.join(out, f)).size, 0);
console.log(`\nweb-dist ready: build ${buildId}, ${files.length} shell files (${(size / 1e6).toFixed(1)} MB precached)`);
