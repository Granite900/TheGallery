/** Minimal DOM helpers. */
type Child = Node | string | number | null | undefined | false;
type Props = Record<string, unknown> & { class?: string; style?: string; onclick?: (e: MouseEvent) => void };

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props | null = null, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = String(v);
      else if (k === 'style') el.setAttribute('style', String(v));
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
      else if (k === 'html') el.innerHTML = String(v);
      else if (k in el && typeof v !== 'string') (el as unknown as Record<string, unknown>)[k] = v;
      else el.setAttribute(k, String(v));
    }
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const ui = () => document.getElementById('ui')!;

export function btn(label: string, onclick: () => void, cls = ''): HTMLButtonElement {
  return h('button', { class: `dymo ${cls}`, onclick: (e: MouseEvent) => (e.stopPropagation(), onclick()) }, label);
}

export function link(label: string, onclick: () => void): HTMLButtonElement {
  return h('button', { class: 'textlink', onclick: (e: MouseEvent) => (e.stopPropagation(), onclick()) }, label);
}

export function money(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

/** Jagged torn-edge clip-path for the bottom of a sheet */
export function tornClip(seed = 1): string {
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const pts = ['0 0', '100% 0'];
  const n = 26;
  for (let i = n; i >= 0; i--) {
    const x = (i / n) * 100;
    const y = 100 - rnd() * 2.2;
    pts.push(`${x.toFixed(2)}% ${y.toFixed(2)}%`);
  }
  return `polygon(${pts.join(',')})`;
}

export function paperNoiseDataUrl(): string {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(256, 256);
  for (let i = 0; i < 256 * 256; i++) {
    const v = Math.random();
    const fibre = Math.random() < 0.004 ? 40 : 0;
    const a = Math.floor(v * 18 + fibre);
    img.data[i * 4] = 70;
    img.data[i * 4 + 1] = 55;
    img.data[i * 4 + 2] = 30;
    img.data[i * 4 + 3] = a;
  }
  ctx.putImageData(img, 0, 0);
  return `url(${c.toDataURL()})`;
}

export function stampMaskDataUrl(): string {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = `rgba(0,0,0,${Math.random()})`;
    ctx.clearRect(Math.random() * 128, Math.random() * 128, Math.random() * 3, Math.random() * 2);
  }
  return `url(${c.toDataURL()})`;
}

export function keycap(k: string, label: string): HTMLElement {
  return h('span', null, h('span', { class: 'key' }, k), label);
}
