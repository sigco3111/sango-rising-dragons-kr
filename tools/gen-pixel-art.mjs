// Generates crisp SVG pixel-art unit sprites for the battle scene.
// Run: node tools/gen-pixel-art.mjs
import { writeFileSync, mkdirSync } from 'fs';

const PAL = {
  K: '#2a1f14', // outline
  S: '#d9a86c', // skin
  H: '#9aa0ab', // steel light
  A: '#5f646e', // steel
  D: '#3f434b', // steel dark
  R: '#a8312a', // red
  r: '#7e221d', // red dark
  G: '#d9a93c', // gold
  B: '#6e4f2a', // wood
  b: '#4a3418', // wood dark
  W: '#e9e6da', // blade
  C: '#8c5a2e', // horse coat
  c: '#6e4220', // horse shade
  M: '#2e2014', // mane / hoof
};

// 戟兵 — halberdier (infantry), front-facing
const infantry = [
  '............W...',
  '...........WWW..',
  '...KKKKKK...W...',
  '..KGGGGGGK..B...',
  '..KAAAAAAK..B...',
  '..KSSSSSSK..B...',
  '..KSKSSKSK..B...',
  '...KSSSSK...B...',
  '..KRRRRRRK..B...',
  '.KAAAAAAAAK.B...',
  '.KAGDAADGAK.B...',
  '.KAAAAAAAAKSB...',
  '..KDDDDDDK..B...',
  '..KDD..DDK..B...',
  '..KK....KK..B...',
  '................',
];

// 弓兵 — archer with bow, front-facing
const archer = [
  '................',
  '................',
  '...KKKKKK...B...',
  '..KRRRRRRK..WB..',
  '..KSSSSSSK..WB..',
  '..KSKSSKSK..WB..',
  '...KSSSSK...WB..',
  '..KrrrrrrK..WB..',
  '.KBBBBBBBBK.WB..',
  '.KBrBBBBrBK.WB..',
  '.KBBBBBBBBKSWB..',
  '..KbbbbbbK..WB..',
  '..Kbb..bbK..WB..',
  '..KK....KK..B...',
  '................',
  '................',
];

// 騎兵 — cavalryman on horse, facing right
const cavalry = [
  '............W...',
  '...........WWW..',
  '....KKKK....W...',
  '...KGGGGK...B...',
  '...KSSSSK...B...',
  '...KSKSSK...B...',
  '...KRRRRK...B...',
  '..KAAAAAAK..B...',
  '..KADAADAKSKKK..',
  '.KKAAAAAAKKCCCK.',
  'KMCCCCCCCCCCCCK.',
  'KMCCCCCCCCCKCSK.',
  '.KCCCCCCCCCK.KK.',
  '..KCC.KCC.K.....',
  '..KMC.KMC.K.....',
  '...KK..KK.......',
];

function toSvg(rows, name) {
  const h = rows.length, w = rows[0].length;
  const rects = [];
  for (let y = 0; y < h; y++) {
    if (rows[y].length !== w) throw new Error(`${name} row ${y} has length ${rows[y].length}, expected ${w}`);
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      if (ch === '.') continue;
      if (!PAL[ch]) throw new Error(`${name}: unknown palette char '${ch}' at ${x},${y}`);
      rects.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${PAL[ch]}"/>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${rects.join('')}</svg>`;
}

mkdirSync(new URL('../public/assets/px/', import.meta.url), { recursive: true });
for (const [name, rows] of [['infantry', infantry], ['archer', archer], ['cavalry', cavalry]]) {
  const svg = toSvg(rows, name);
  writeFileSync(new URL(`../public/assets/px/${name}.svg`, import.meta.url), svg);
  console.log(`px/${name}.svg written (${svg.length} bytes)`);
}
