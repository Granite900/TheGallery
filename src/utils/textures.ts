/**
 * All textures in the game are generated at runtime on <canvas> elements —
 * no external assets. Every generator takes a numeric seed so the museum
 * looks identical on every visit (seeds live in config.ts).
 */
import * as THREE from 'three';

/** Small, fast, deterministic PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  return [c, ctx];
}

function toTexture(c: HTMLCanvasElement, repeat = false): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
  }
  tex.anisotropy = 4;
  return tex;
}

/** Per-pixel value noise over a base colour. */
function noiseFill(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  base: [number, number, number],
  amp: number,
  rnd: () => number,
): void {
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let i = 0; i < w * h; i++) {
    const n = (rnd() - 0.5) * 2 * amp;
    d[i * 4] = Math.max(0, Math.min(255, base[0] + n));
    d[i * 4 + 1] = Math.max(0, Math.min(255, base[1] + n));
    d[i * 4 + 2] = Math.max(0, Math.min(255, base[2] + n));
    d[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

/** Beige institutional carpet. */
export function carpetTexture(seed: number): THREE.CanvasTexture {
  const rnd = mulberry32(seed);
  const [c, ctx] = canvas(256, 256);
  noiseFill(ctx, 256, 256, [178, 168, 146], 22, rnd);
  // faint tile seams every 64px
  ctx.strokeStyle = 'rgba(90,84,70,0.10)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 256; i += 64) {
    ctx.beginPath();
    ctx.moveTo(i + 0.5, 0);
    ctx.lineTo(i + 0.5, 256);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i + 0.5);
    ctx.lineTo(256, i + 0.5);
    ctx.stroke();
  }
  return toTexture(c, true);
}

/** Warm off-white plaster (#E8E4DC with very subtle grain). */
export function wallTexture(seed: number): THREE.CanvasTexture {
  const rnd = mulberry32(seed);
  const [c, ctx] = canvas(256, 256);
  noiseFill(ctx, 256, 256, [232, 228, 220], 5, rnd);
  return toTexture(c, true);
}

/** Plain white ceiling tile grid. */
export function ceilingTexture(seed: number): THREE.CanvasTexture {
  const rnd = mulberry32(seed);
  const [c, ctx] = canvas(256, 256);
  noiseFill(ctx, 256, 256, [244, 242, 236], 4, rnd);
  ctx.strokeStyle = 'rgba(120,116,104,0.16)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 256; i += 128) {
    ctx.strokeRect(0.5, i + 0.5, 256, 128);
    ctx.strokeRect(i + 0.5, 0.5, 128, 256);
  }
  return toTexture(c, true);
}

/** Grey painted concrete for the service corridor. */
export function concreteTexture(seed: number): THREE.CanvasTexture {
  const rnd = mulberry32(seed);
  const [c, ctx] = canvas(256, 256);
  noiseFill(ctx, 256, 256, [148, 146, 140], 14, rnd);
  // hairline cracks
  ctx.strokeStyle = 'rgba(70,68,62,0.25)';
  ctx.lineWidth = 1;
  for (let k = 0; k < 4; k++) {
    let x = rnd() * 256;
    let y = rnd() * 256;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < 6; s++) {
      x += (rnd() - 0.5) * 60;
      y += (rnd() - 0.5) * 60;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return toTexture(c, true);
}

// ---------------------------------------------------------------------------
// Procedural abstract paintings
// ---------------------------------------------------------------------------

const PALETTES: string[][] = [
  ['#22262e', '#5d6672', '#aeb6bd', '#d9d4c5'],
  ['#7a1f1f', '#c96f3b', '#e8d5a2', '#2c2420'],
  ['#1d3a4f', '#88a9b8', '#e4e0d3', '#c2b280'],
  ['#3d4a2e', '#93a35f', '#e6e2ce', '#20241c'],
  ['#4b3b52', '#9b8aa6', '#ded8e0', '#26222a'],
  ['#b8b0a0', '#8f8878', '#6b6558', '#403c33'],
  ['#0e0f12', '#3a3f4a', '#c8b98a', '#e0dccf'],
];

/** Abstract painting: colour fields, lines, or fuzzy shapes, chosen by seed. */
export function paintingTexture(seed: number): THREE.CanvasTexture {
  const rnd = mulberry32(seed);
  const S = 512;
  const [c, ctx] = canvas(S, S);
  const pal = PALETTES[Math.floor(rnd() * PALETTES.length)];
  const style = Math.floor(rnd() * 4);

  ctx.fillStyle = pal[3];
  ctx.fillRect(0, 0, S, S);

  if (style === 0) {
    // horizontal colour fields with soft transitions
    const bands = 2 + Math.floor(rnd() * 3);
    let y = 0;
    for (let i = 0; i < bands; i++) {
      const h = (S - y) / (bands - i) * (0.7 + rnd() * 0.6);
      const col = pal[Math.floor(rnd() * 3)];
      const g = ctx.createLinearGradient(0, y - 20, 0, y + h);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(Math.min(0.35, 0.1 + rnd() * 0.3), col);
      g.addColorStop(1, col);
      ctx.fillStyle = g;
      ctx.fillRect(0, Math.max(0, y - 20), S, h + 20);
      y += h;
    }
  } else if (style === 1) {
    // stripes
    const vertical = rnd() > 0.5;
    const n = 5 + Math.floor(rnd() * 10);
    let p = 0;
    for (let i = 0; i < n && p < S; i++) {
      const w = 12 + rnd() * (S / n) * 1.6;
      ctx.fillStyle = pal[Math.floor(rnd() * pal.length)];
      ctx.globalAlpha = 0.75 + rnd() * 0.25;
      if (vertical) ctx.fillRect(p, 0, w, S);
      else ctx.fillRect(0, p, S, w);
      p += w + rnd() * 26;
    }
    ctx.globalAlpha = 1;
  } else if (style === 2) {
    // fuzzy blobs
    const n = 4 + Math.floor(rnd() * 5);
    for (let i = 0; i < n; i++) {
      const x = rnd() * S;
      const y = rnd() * S;
      const r = 60 + rnd() * 190;
      const col = pal[Math.floor(rnd() * 3)];
      const g = ctx.createRadialGradient(x, y, r * 0.05, x, y, r);
      g.addColorStop(0, col);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.5 + rnd() * 0.45;
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, S, S);
    }
    ctx.globalAlpha = 1;
  } else {
    // hard-edge geometry
    const n = 3 + Math.floor(rnd() * 5);
    for (let i = 0; i < n; i++) {
      ctx.save();
      ctx.translate(rnd() * S, rnd() * S);
      ctx.rotate((rnd() - 0.5) * 0.9);
      ctx.fillStyle = pal[Math.floor(rnd() * 3)];
      ctx.globalAlpha = 0.8 + rnd() * 0.2;
      if (rnd() > 0.3) ctx.fillRect(-rnd() * 140, -rnd() * 140, 60 + rnd() * 240, 40 + rnd() * 200);
      else {
        ctx.beginPath();
        ctx.arc(0, 0, 30 + rnd() * 90, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = pal[0];
    ctx.lineWidth = 3 + rnd() * 5;
    ctx.beginPath();
    ctx.moveTo(rnd() * S, rnd() * S);
    ctx.lineTo(rnd() * S, rnd() * S);
    ctx.stroke();
  }

  // canvas grain + darkened edges
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = `rgba(${rnd() > 0.5 ? '255,255,255' : '0,0,0'},${0.02 + rnd() * 0.05})`;
    ctx.fillRect(rnd() * S, rnd() * S, 1.5, 1.5);
  }
  const vg = ctx.createRadialGradient(S / 2, S / 2, S * 0.4, S / 2, S / 2, S * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(20,15,5,0.28)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, S, S);

  return toTexture(c);
}

/** Small etched wall plaque with title + tiny body text. */
export function placardTexture(title: string, body: string): THREE.CanvasTexture {
  const [c, ctx] = canvas(512, 288);
  ctx.fillStyle = '#efeadb';
  ctx.fillRect(0, 0, 512, 288);
  ctx.strokeStyle = '#a89f88';
  ctx.lineWidth = 4;
  ctx.strokeRect(10, 10, 492, 268);

  ctx.fillStyle = '#2c2a24';
  ctx.font = '600 30px Georgia, serif';
  ctx.fillText(title.length > 34 ? title.slice(0, 33) + '…' : title, 30, 62);

  ctx.font = '19px Georgia, serif';
  ctx.fillStyle = '#4a463c';
  const words = body.split(' ');
  let line = '';
  let y = 108;
  for (const w of words) {
    if (ctx.measureText(line + w).width > 440) {
      ctx.fillText(line, 30, y);
      line = '';
      y += 28;
      if (y > 260) break;
    }
    line += w + ' ';
  }
  if (y <= 260) ctx.fillText(line, 30, y);
  return toTexture(c);
}

/**
 * Generic Artist Note plaque face. The actual (tiered, dread-scaled) body
 * text only appears in the reading modal — the physical plaque just shows
 * a calm, consistent "curatorial note" label so it reads the same in the
 * world regardless of which tier the player will unlock on interaction.
 */
export function artistNoteTexture(workTitle: string): THREE.CanvasTexture {
  const [c, ctx] = canvas(512, 288);
  ctx.fillStyle = '#efeadb';
  ctx.fillRect(0, 0, 512, 288);
  ctx.strokeStyle = '#a89f88';
  ctx.lineWidth = 4;
  ctx.strokeRect(10, 10, 492, 268);

  ctx.fillStyle = '#8d8468';
  ctx.font = '600 15px Helvetica, Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('ARTIST NOTE', 30, 46);

  ctx.fillStyle = '#2c2a24';
  ctx.font = '600 27px Georgia, serif';
  const title = workTitle.length > 34 ? workTitle.slice(0, 33) + '…' : workTitle;
  ctx.fillText(title, 30, 88);

  ctx.strokeStyle = 'rgba(140,132,112,0.4)';
  ctx.lineWidth = 1;
  for (let y = 130; y <= 240; y += 34) {
    ctx.beginPath();
    ctx.moveTo(30, y);
    ctx.lineTo(482, y);
    ctx.stroke();
  }
  return toTexture(c);
}

/** Institutional sign, e.g. STAFF ONLY. */
export function signTexture(
  lines: string[],
  opts: { bg?: string; fg?: string; border?: string; fontSize?: number } = {},
): THREE.CanvasTexture {
  const [c, ctx] = canvas(512, 256);
  ctx.fillStyle = opts.bg ?? '#f2efe6';
  ctx.fillRect(0, 0, 512, 256);
  ctx.strokeStyle = opts.border ?? '#8c1d1d';
  ctx.lineWidth = 10;
  ctx.strokeRect(12, 12, 488, 232);
  ctx.fillStyle = opts.fg ?? '#8c1d1d';
  ctx.textAlign = 'center';
  const fs = opts.fontSize ?? (lines.length > 1 ? 56 : 68);
  ctx.font = `700 ${fs}px Helvetica, Arial, sans-serif`;
  lines.forEach((l, i) => {
    ctx.fillText(l, 256, 128 + (i - (lines.length - 1) / 2) * (fs + 14) + fs * 0.35);
  });
  return toTexture(c);
}
