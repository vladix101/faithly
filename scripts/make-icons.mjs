#!/usr/bin/env node
// Renders the Faithly icon set from SVG: a candle flame inside an arched window.
// Needs @resvg/resvg-js (not a project dependency):
//   npm i --no-save @resvg/resvg-js@2.6.2 && node scripts/make-icons.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(process.env.RESVG_FROM ? path.join(process.env.RESVG_FROM, 'x.js') : import.meta.url);
const { Resvg } = require('@resvg/resvg-js');
const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../assets/images');

const C = { cream: '#F6F0E3', ink: '#2A251E', gold: '#C9A24E', goldLight: '#F1D58C', deep: '#1B1814' };

// Arch window, candle and flame in a 1024 box, centred; `s` scales around the centre.
function mark({ arch, flame, flameInner, candle, s = 1 }) {
  return `<g transform="translate(512 512) scale(${s}) translate(-512 -550)">
    <path d="M322 820 V470 A190 190 0 0 1 702 470 V820 Z" fill="${arch}"/>
    <path d="M512 382 C566 468 600 520 600 584 C600 642 560 684 512 684 C464 684 424 642 424 584 C424 520 458 470 512 382 Z" fill="${flame}"/>
    ${flameInner ? `<path d="M512 520 C536 560 552 586 552 614 C552 642 534 660 512 660 C490 660 472 642 472 614 C472 586 488 560 512 520 Z" fill="${flameInner}"/>` : ''}
    <rect x="486" y="704" width="52" height="116" rx="6" fill="${candle}"/>
  </g>`;
}

const svg = (body, bg) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${bg ? `<rect width="1024" height="1024" fill="${bg}"/>` : ''}${body}</svg>`;

function render(name, content, size = 1024) {
  const png = new Resvg(content, { fitTo: { mode: 'width', value: size } }).render().asPng();
  fs.writeFileSync(path.join(out, name), png);
  console.log(name, size);
}

fs.mkdirSync(out, { recursive: true });
const light = { arch: C.ink, flame: C.gold, flameInner: C.goldLight, candle: C.goldLight };
render('icon.png', svg(mark({ ...light, s: 1.4 }), C.cream));
// Adaptive icon: Android masks the outer third, so the mark sits in the 66% safe zone.
render('android-icon-foreground.png', svg(mark({ ...light, s: 1.0 })));
// Monochrome (themed) icon: only alpha matters, so flame and candle are cut out of the arch.
render(
  'android-icon-monochrome.png',
  svg(`<defs><mask id="m"><rect width="1024" height="1024" fill="#fff"/>${mark({ arch: 'none', flame: '#000', candle: '#000', s: 1.0 })}</mask></defs><g mask="url(#m)">${mark({ arch: '#FFFFFF', flame: '#FFFFFF', candle: '#FFFFFF', s: 1.0 })}</g>`),
);
render('splash-icon.png', svg(mark(light)), 512);
render('splash-icon-dark.png', svg(mark({ arch: C.cream, flame: C.gold, flameInner: C.goldLight, candle: C.gold })), 512);
render('favicon.png', svg(mark({ ...light, s: 1.5 }), C.cream), 96);
// Notification small icon: white silhouette on transparent (Android tints it).
render(
  'notification-icon.png',
  svg(`<g transform="translate(512 512) scale(1.25) translate(-512 -560)"><path d="M512 382 C566 468 600 520 600 584 C600 642 560 684 512 684 C464 684 424 642 424 584 C424 520 458 470 512 382 Z" fill="#FFFFFF"/><rect x="486" y="704" width="52" height="116" rx="6" fill="#FFFFFF"/></g>`),
  96,
);
