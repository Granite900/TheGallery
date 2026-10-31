/**
 * Latent Image Camera — Android companion.
 *
 * Turns the phone into one of the cameras from your in-game collection.
 * The viewfinder, dials and faults are the camera's; the light is real.
 * Photographs are never shown: they are stored as an exposed roll and sent
 * to the desktop darkroom over the local network.
 */
import '@fontsource/jost/400.css';
import '@fontsource/jost/500.css';
import '@fontsource/jost/600.css';
import '@fontsource/courier-prime/400.css';
import '@fontsource/reenie-beanie/400.css';
import '../ui/ui.css';
import './phone.css';
import jsQR from 'jsqr';
import { h, btn, paperNoiseDataUrl } from '../ui/dom';
import { Audio } from '../app/audio';
import { ImageStore } from '../app/save';
import { camera, film, lens as lensModel, aperturesFor, formatSpeed, formatAperture } from '../sim/data';
import { Lighting, LIGHTING_LABEL } from '../sim/exposure';
import { PairInfo, PhoneCamera, PhoneCollection, PhoneFrameMeta, PhoneRoll, capacityFor, cropFor, emulateExposure, sceneEVFromLighting, sceneEVFromPhone, stocksFor } from '../sim/phoneLink';
import { clamp } from '../sim/rng';

// ---------------------------------------------------------------- storage
const LS = {
  get<T>(k: string, d: T): T {
    try {
      const v = localStorage.getItem(`li-phone-${k}`);
      return v ? (JSON.parse(v) as T) : d;
    } catch {
      return d;
    }
  },
  set(k: string, v: unknown) {
    try {
      localStorage.setItem(`li-phone-${k}`, JSON.stringify(v));
    } catch {
      /* storage full or blocked */
    }
  },
};

interface LocalRoll extends Omit<PhoneRoll, 'shots'> {
  shots: { idx: number; meta: PhoneFrameMeta; key: string }[];
  /** film reserved from the desktop fridge */
  reserved: boolean;
}

interface Settings {
  phoneAperture: number;
  haptics: boolean;
}

const app = document.getElementById('app')!;
const audio = new Audio();
const images = new ImageStore();
let pairing: PairInfo | null = LS.get<PairInfo | null>('pair', null);
let collection: PhoneCollection | null = LS.get<PhoneCollection | null>('collection', null);
let rolls: LocalRoll[] = LS.get<LocalRoll[]>('rolls', []);
const settings: Settings = LS.get<Settings>('settings', { phoneAperture: 1.8, haptics: true });
const saveRolls = () => LS.set('rolls', rolls);
let stream: MediaStream | null = null;

function buzz(ms: number) {
  if (settings.haptics) navigator.vibrate?.(ms);
}

function stopStream() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
}

function show(el: HTMLElement) {
  stopStream();
  app.innerHTML = '';
  app.append(el);
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  if (!pairing) throw new Error('Not paired with a PC yet.');
  const res = await fetch(`${pairing.url}${path}`, { ...init, headers: { 'content-type': 'application/json', 'x-latent-token': pairing.token, ...(init?.headers ?? {}) } });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* no body */
  }
  if (!res.ok) throw new Error((body as { message?: string } | null)?.message ?? `PC answered ${res.status}`);
  return body as T;
}

async function refreshCollection(): Promise<string> {
  const c = await api<PhoneCollection>('/api/collection');
  collection = c;
  LS.set('collection', c);
  return `${c.cameras.length} camera${c.cameras.length === 1 ? '' : 's'} in your bag.`;
}

// ---------------------------------------------------------------- home
function home(msg = '') {
  const el = h('div', { class: 'screen' });
  el.append(h('div', { class: 'ph-title' }, 'Latent Image'), h('div', { class: 'ph-sub' }, 'camera · the real world'));
  const status = h('div', { class: 'sheet card' });
  status.append(h('h3', null, 'Darkroom link'), h('p', { class: 'small' }, pairing ? `Paired with ${pairing.url}` : 'Not paired. On the PC: Settings → Phone camera, then scan the code.'));
  if (collection) status.append(h('p', { class: 'small' }, `${collection.cameras.length} camera${collection.cameras.length === 1 ? '' : 's'} · day ${collection.day}`));
  const statusLine = h('p', { class: 'hand', style: 'font-size:21px;min-height:22px' }, msg);
  status.append(statusLine, h('div', { class: 'ph-row' }, btn(pairing ? 'Re-pair' : 'Pair', () => pairScreen()), pairing ? btn('Sync bag', () => void refreshCollection().then((m) => (statusLine.textContent = m)).catch((e: Error) => (statusLine.textContent = e.message))) : null));
  el.append(status);
  const bag = h('div', { class: 'sheet' }, h('h3', null, 'Your bag'));
  if (!collection?.cameras.length) bag.append(h('p', { class: 'small' }, 'Pair with the PC to see the cameras you own in the game.'));
  for (const c of collection?.cameras ?? []) {
    const m = camera(c.modelId);
    const r = rolls.find((x) => x.unitId === c.id && x.shots.length < x.capacity);
    bag.append(
      h(
        'div',
        { class: 'ph-cam', onclick: () => pickCamera(c) },
        h('div', null, h('b', null, `${m.maker} ${m.name}`), h('div', { class: 'small' }, `No. ${c.serial}${c.lensModelId && m.mount !== 'fixed' ? ` · ${lensModel(c.lensModelId).name}` : ''}`)),
        h('span', { class: 'label' }, r ? `${film(r.stockId).name.split(' ')[0]} ${r.shots.length}/${r.capacity}` : 'empty'),
      ),
    );
  }
  el.append(bag);
  const out = rolls.filter((r) => r.shots.length > 0);
  const rl = h('div', { class: 'sheet card' }, h('h3', null, 'Exposed film'));
  if (!out.length) rl.append(h('p', { class: 'small' }, 'No exposed film yet.'));
  for (const r of out) {
    const c = collection?.cameras.find((x) => x.id === r.unitId);
    const line = h('p', { class: 'small' });
    rl.append(
      h('div', { class: 'ph-cam' }, h('div', null, h('b', null, `${film(r.stockId).maker} ${film(r.stockId).name}`), h('div', { class: 'small' }, `${c ? camera(c.modelId).name : 'camera'} · ${r.shots.length}/${r.capacity} exposed`)), btn('Send', () => void sendRoll(r, line), 'mini')),
      line,
    );
  }
  el.append(rl);
  const st = h('div', { class: 'sheet card' }, h('h3', null, 'Phone'));
  const apSel = h('select', { onchange: (e: Event) => ((settings.phoneAperture = Number((e.target as HTMLSelectElement).value)), LS.set('settings', settings)) }, ...[1.5, 1.6, 1.7, 1.8, 1.9, 2.0, 2.2, 2.4].map((a) => h('option', { value: String(a), selected: a === settings.phoneAperture }, `f/${a}`)));
  st.append(h('div', { class: 'ph-row' }, h('span', { class: 'small' }, 'Phone lens aperture (for metering)'), apSel), h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: settings.haptics, onchange: (e: Event) => ((settings.haptics = (e.target as HTMLInputElement).checked), LS.set('settings', settings)) }), 'Vibrate on shutter and wind'));
  el.append(st);
  show(el);
}

// ---------------------------------------------------------------- pairing
function pairScreen() {
  const el = h('div', { class: 'vf-screen' });
  const video = h('video', { playsinline: true, muted: true, autoplay: true });
  const panel = h('div', { class: 'sheet card', style: 'position:absolute;left:12px;right:12px;bottom:calc(env(safe-area-inset-bottom) + 12px)' });
  const url = h('input', { class: 'ph-input', type: 'text', placeholder: 'http://192.168.1.20:47820', value: pairing?.url ?? '' });
  const code = h('input', { class: 'ph-input', type: 'text', placeholder: 'CODE', value: pairing?.token ?? '', style: 'text-transform:uppercase;letter-spacing:.2em' });
  const msg = h('p', { class: 'small' }, 'Point at the QR code on the PC (Settings → Phone camera).');
  panel.append(h('h3', null, 'Pair with the darkroom'), msg, h('div', { class: 'label' }, 'Or type it in'), url, code, h('div', { class: 'ph-row' }, btn('Connect', () => void connect({ url: url.value.trim().replace(/\/$/, ''), token: code.value.trim().toUpperCase(), v: 1 })), btn('Back', () => home(), 'red')));
  el.append(video, h('div', { class: 'scan-box' }), panel);
  show(el);
  let busy = false;
  const connect = async (p: PairInfo) => {
    if (busy) return;
    busy = true;
    msg.textContent = `Connecting to ${p.url}…`;
    const prev = pairing;
    pairing = p;
    try {
      await api('/api/ping');
      const m = await refreshCollection();
      LS.set('pair', p);
      buzz(40);
      home(`Paired. ${m}`);
    } catch (e) {
      pairing = prev;
      msg.textContent = `${(e as Error).message} Same Wi-Fi? Is the game open on the PC?`;
      busy = false;
    }
  };
  void navigator.mediaDevices
    ?.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false })
    .then((s) => {
      stream = s;
      video.srcObject = s;
      const c = document.createElement('canvas');
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      const scan = () => {
        if (!stream || busy) return;
        if (video.videoWidth) {
          c.width = 480;
          c.height = Math.round((480 * video.videoHeight) / video.videoWidth);
          ctx.drawImage(video, 0, 0, c.width, c.height);
          const img = ctx.getImageData(0, 0, c.width, c.height);
          const qr = jsQR(img.data, c.width, c.height);
          if (qr?.data) {
            try {
              const p = JSON.parse(qr.data) as PairInfo;
              if (p.url && p.token) void connect(p);
            } catch {
              /* not our code */
            }
          }
        }
        setTimeout(scan, 250);
      };
      scan();
    })
    .catch(() => (msg.textContent = 'No camera permission. Type the address and code from the PC instead.'));
}

// ---------------------------------------------------------------- loading film
function pickCamera(c: PhoneCamera) {
  const loaded = rolls.find((x) => x.unitId === c.id && x.shots.length < x.capacity);
  if (loaded) {
    viewfinder(c, loaded);
    return;
  }
  const m = camera(c.modelId);
  const el = h('div', { class: 'screen' });
  el.append(h('div', { class: 'ph-title', style: 'font-size:18px' }, `${m.maker} ${m.name}`), h('div', { class: 'ph-sub' }, m.notes));
  const sheet = h('div', { class: 'sheet card' }, h('h3', null, 'Load film'));
  const stocks = collection ? stocksFor(c.modelId, collection).filter((st) => st.count - reservedCount(st.stockId, st.expiredYears) > 0) : [];
  if (!stocks.length) sheet.append(h('p', { class: 'small' }, `No ${m.format === '120' ? '120' : '35mm'} film left in the fridge. Buy some in the game (desk → catalogue), then sync your bag.`));
  for (const st of stocks) {
    const f = film(st.stockId);
    const pushes = m.autoExposure ? [1] : [1, 2, 4];
    sheet.append(
      h(
        'div',
        { class: 'ph-cam' },
        h('div', null, h('b', null, `${f.maker} ${f.name}`), h('div', { class: 'small' }, `${st.expiredYears ? `expired ~${st.expiredYears} y · ` : ''}${st.count - reservedCount(st.stockId, st.expiredYears)} in the fridge`)),
        h('div', { class: 'ph-row' }, ...pushes.map((k) => btn(k === 1 ? `ISO ${f.iso}` : `EI ${f.iso * k}`, () => load(st.stockId, f.iso * k, st.expiredYears), 'mini'))),
      ),
    );
  }
  el.append(sheet, btn('Back', () => home(), 'red'));
  show(el);
  const load = (stockId: string, ei: number, expiredYears: number) => {
    const r: LocalRoll = { id: `ph-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, unitId: c.id, stockId, ei, capacity: capacityFor(c.modelId, collection?.rollLength ?? 12), expiredYears, shots: [], reserved: true };
    rolls.push(r);
    saveRolls();
    audio.door();
    buzz(25);
    viewfinder(c, r);
  };
}

function reservedCount(stockId: string, expiredYears: number) {
  return rolls.filter((r) => r.reserved && r.stockId === stockId && r.expiredYears === expiredYears).length;
}

// ---------------------------------------------------------------- viewfinder
const ZONES = [{ d: 1, label: 'portrait' }, { d: 1.5, label: 'couple' }, { d: 3, label: 'group' }, { d: 1000, label: 'mountains' }];
const LIGHTS: Lighting[] = ['sun', 'hazy', 'overcast', 'shade', 'golden', 'dusk', 'window', 'room'];

interface CapTrack extends MediaStreamTrack {
  getCapabilities(): MediaTrackCapabilities & { exposureTime?: { min: number; max: number }; iso?: { min: number; max: number }; zoom?: { min: number; max: number } };
}
type ImgCap = { takePhoto(): Promise<Blob> };

function viewfinder(c: PhoneCamera, roll: LocalRoll) {
  const m = camera(c.modelId);
  const lens = c.lensModelId ? lensModel(c.lensModelId) : undefined;
  const apertures = lens ? aperturesFor(lens) : [8];
  const speeds = [...m.speeds].sort((a, b) => b - a);
  const crop = cropFor(c.modelId, lens?.focal ?? 50);
  const st = { aperture: apertures[Math.min(3, apertures.length - 1)], speed: speeds[Math.floor(speeds.length / 2)] ?? 1 / 125, focus: 3, zone: 2 };
  let cocked = false;
  let lighting: Lighting = 'sun';
  let cameraEV: number | null = null;
  let busy = false;
  const el = h('div', { class: 'vf-screen' });
  const video = h('video', { playsinline: true, muted: true, autoplay: true });
  const mask = h('canvas', { class: 'vf-mask' });
  const flash = h('div', { class: 'vf-flash' });
  const needle = h('div', { class: 'vf-needle' }, h('b'), h('i'));
  const info = h('div', { class: 'vf-info' });
  const lightChip = h('button', { class: 'vf-chip', onclick: () => pickLight() });
  const top = h('div', { class: 'vf-top' }, h('button', { class: 'vf-chip', onclick: () => home() }, '◂ bag'), info, lightChip);
  const plate = h('div', { class: 'vf-plate' });
  const lever = h('div', { class: 'vf-lever' }, h('span', { class: 'lbl' }, 'WIND ▸'), h('div', { class: 'knob' }));
  el.append(video, mask, needle, top, lever, plate, flash);
  show(el);
  const toast = (t: string, ms = 1800) => {
    const x = h('div', { class: 'vf-toast' }, t);
    el.append(x);
    setTimeout(() => x.remove(), ms);
  };

  // dials: drag horizontally to turn, tap to step
  const dial = (key: string, get: () => string, step: (dir: number) => void, locked = false) => {
    const d = h('div', { class: `vf-dial ${locked ? 'locked' : ''}` }, h('div', { class: 'v' }, get()), h('div', { class: 'k' }, key));
    let x0 = 0;
    let acc = 0;
    d.addEventListener('pointerdown', (e) => {
      x0 = e.clientX;
      acc = 0;
      d.setPointerCapture(e.pointerId);
    });
    d.addEventListener('pointermove', (e) => {
      if (!d.hasPointerCapture(e.pointerId) || locked) return;
      acc += e.clientX - x0;
      x0 = e.clientX;
      while (Math.abs(acc) > 28) {
        step(acc > 0 ? 1 : -1);
        acc -= Math.sign(acc) * 28;
        audio.tick();
        buzz(6);
      }
      update();
    });
    d.addEventListener('pointerup', (e) => {
      if (Math.abs(acc) < 5 && !locked) {
        step(e.clientX > d.getBoundingClientRect().left + d.clientWidth / 2 ? 1 : -1);
        audio.tick();
        update();
      }
    });
    (d as unknown as { refresh: () => void }).refresh = () => ((d.firstChild as HTMLElement).textContent = get());
    return d as unknown as HTMLElement & { refresh: () => void };
  };
  const focusDial = m.kind === 'zone'
    ? dial('zone', () => ZONES[st.zone].label, (dir) => ((st.zone = clamp(st.zone + dir, 0, 3)), (st.focus = ZONES[st.zone].d)))
    : dial('focus', () => (st.focus >= 999 ? '∞' : `${st.focus.toFixed(st.focus < 3 ? 1 : 0)} m`), (dir) => {
        const dpt = clamp(1 / st.focus - dir * 0.08, 0, 1 / (lens?.minFocus ?? 1));
        st.focus = dpt < 0.001 ? 1000 : 1 / dpt;
      });
  const apDial = dial('aperture', () => (m.autoExposure ? 'auto' : formatAperture(st.aperture)), (dir) => (st.aperture = apertures[clamp(apertures.indexOf(st.aperture) + dir, 0, apertures.length - 1)]), !!m.autoExposure);
  const spDial = dial('shutter', () => (m.autoExposure ? 'auto' : formatSpeed(st.speed)), (dir) => (st.speed = speeds[clamp(speeds.indexOf(st.speed) + dir, 0, speeds.length - 1)]), !!m.autoExposure);
  const counter = h('div', { class: 'vf-dial locked', style: 'opacity:1;flex:0 0 58px' }, h('div', { class: 'v' }), h('div', { class: 'k' }, 'frame'));
  const shutterBtn = h('button', { class: 'vf-shutter', 'aria-label': 'shutter' });
  plate.append(focusDial, apDial, spDial, counter, shutterBtn);

  const sceneEV = () => cameraEV ?? sceneEVFromLighting(lighting);
  const update = () => {
    focusDial.refresh();
    apDial.refresh();
    spDial.refresh();
    (counter.firstChild as HTMLElement).textContent = `${roll.shots.length}/${roll.capacity}`;
    lightChip.textContent = cameraEV != null ? `EV ${cameraEV.toFixed(1)}` : LIGHTING_LABEL[lighting];
    const ex = emulateExposure(c, sceneEV(), roll.ei, st.aperture, st.speed);
    const metered = m.meter !== 'none' && m.meter !== 'selenium' && !m.autoExposure;
    needle.style.display = metered ? '' : 'none';
    (needle.lastChild as HTMLElement).style.top = `${50 - ex.needle * 18}%`;
    info.textContent = `${film(roll.stockId).name} · EI ${roll.ei}${ex.redFlag ? ' · ▮ too dark' : ''}${cocked ? '' : ' · wind on'}`;
    lever.style.opacity = cocked ? '0.4' : '1';
    drawMask();
  };
  const pickLight = () => {
    const list = h('div', { class: 'pick-list' }, h('div', { class: 'small', style: 'width:100%' }, cameraEV != null ? 'The phone is metering the scene for you. Pick a light only to override it.' : 'This phone does not report its exposure. Say what the light is like (sunny-16 style):'));
    if (cameraEV != null) list.append(btn('Use phone meter', () => ((overrideLight = false), list.remove(), update()), 'mini blue'));
    for (const l of LIGHTS) list.append(btn(LIGHTING_LABEL[l], () => ((lighting = l), (overrideLight = true), (cameraEV = null), list.remove(), update()), 'mini'));
    el.append(list);
  };
  let overrideLight = false;

  // viewfinder geometry: frame lines / masks per camera type
  const drawMask = () => {
    const W = (mask.width = el.clientWidth);
    const H = (mask.height = el.clientHeight - plate.clientHeight);
    const ctx = mask.getContext('2d')!;
    ctx.clearRect(0, 0, W, H);
    const reflex = m.kind === 'slr' || m.kind === 'tlr';
    // the preview is zoomed so the photo area fills `fill` of the short side
    const fill = reflex ? 0.92 : 0.78;
    let fw = W * fill;
    let fh = fw / crop.aspect;
    if (fh > H * fill) {
      fh = H * fill;
      fw = fh * crop.aspect;
    }
    const x0 = (W - fw) / 2;
    const y0 = (H - fh) / 2;
    if (reflex) {
      ctx.fillStyle = 'rgba(0,0,0,0.94)';
      ctx.fillRect(0, 0, W, y0);
      ctx.fillRect(0, y0 + fh, W, H - y0 - fh);
      ctx.fillRect(0, y0, x0, fh);
      ctx.fillRect(x0 + fw, y0, W - x0 - fw, fh);
      if (m.kind === 'tlr') {
        ctx.strokeStyle = 'rgba(0,0,0,.35)';
        for (let i = 1; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(x0 + (fw * i) / 3, y0);
          ctx.lineTo(x0 + (fw * i) / 3, y0 + fh);
          ctx.moveTo(x0, y0 + (fh * i) / 3);
          ctx.lineTo(x0 + fw, y0 + (fh * i) / 3);
          ctx.stroke();
        }
      } else {
        // split-prism circle
        ctx.strokeStyle = 'rgba(255,255,255,.35)';
        ctx.beginPath();
        ctx.arc(W / 2, H / 2, Math.min(fw, fh) * 0.08, 0, Math.PI * 2);
        ctx.moveTo(W / 2 - Math.min(fw, fh) * 0.08, H / 2);
        ctx.lineTo(W / 2 + Math.min(fw, fh) * 0.08, H / 2);
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, W, H);
      ctx.clearRect(x0 - fw * 0.12, y0 - fh * 0.12, fw * 1.24, fh * 1.24);
      ctx.strokeStyle = 'rgba(255,248,225,0.9)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x0, y0, fw, fh);
      if (m.focus === 'rangefinder') {
        ctx.strokeStyle = 'rgba(255,230,140,0.7)';
        ctx.strokeRect(W / 2 - fw * 0.07, H / 2 - fh * 0.06, fw * 0.14, fh * 0.12);
      }
    }
    if (m.id === 'trip35' && emulateExposure(c, sceneEV(), roll.ei, 8, 1 / 125).redFlag) {
      ctx.fillStyle = '#d0321e';
      ctx.fillRect(x0 + fw - 22, y0 + fh / 2 - 20, 12, 40);
    }
    // zoom the video so the frame area shows exactly what grab() will keep
    const vw = video.videoWidth || 1920;
    const vh = video.videoHeight || 1080;
    let cw = vw;
    if (cw / crop.aspect > vh) cw = vh * crop.aspect;
    const scale = fw / (cw / crop.zoom);
    video.style.width = `${vw}px`;
    video.style.height = `${vh}px`;
    video.style.minWidth = '0';
    video.style.minHeight = '0';
    video.style.left = `${W / 2}px`;
    video.style.top = `${H / 2}px`;
    video.style.transform = `translate(-50%, -50%) scale(${(crop.mirror ? -1 : 1) * Math.max(scale, 0.2)}, ${Math.max(scale, 0.2)})`;
  };

  // phone auto-exposure → real scene brightness
  const readExposure = () => {
    const track = stream?.getVideoTracks()[0] as CapTrack | undefined;
    if (!track || overrideLight) return;
    const s = track.getSettings() as MediaTrackSettings & { exposureTime?: number; iso?: number };
    if (s.exposureTime && s.iso) {
      // Image Capture spec: exposureTime is in 100 µs units
      cameraEV = sceneEVFromPhone(s.exposureTime / 10000, s.iso, settings.phoneAperture);
    }
  };

  const fire = async () => {
    if (busy) return;
    if (roll.shots.length >= roll.capacity) {
      toast('End of the roll. Go back to the bag and send it to the darkroom.');
      return;
    }
    if (!cocked) {
      toast(m.kind === 'zone' ? 'Wind the thumbwheel first.' : 'The shutter is not cocked. Wind on.');
      buzz(80);
      return;
    }
    readExposure();
    const ev = sceneEV();
    const ex = emulateExposure(c, ev, roll.ei, st.aperture, st.speed);
    if (ex.redFlag) {
      toast('Red flag: too dark. The Trip will not fire.');
      buzz(120);
      return;
    }
    busy = true;
    audio.shutter(m.kind === 'slr' ? 'slr' : m.shutter === 'leaf' ? 'leaf' : 'focalplane', ex.actual, c.traits.squeal);
    buzz(30);
    flash.classList.add('on');
    try {
      const blob = await grab(crop.aspect, crop.zoom);
      const key = `${roll.id}-${roll.shots.length}`;
      await images.put(key, blob);
      roll.shots.push({ idx: roll.shots.length, key, meta: { aperture: ex.aperture, marked: ex.marked, actual: ex.actual, focus: st.focus, focal: lens?.focal ?? 50, sceneEV: ev, evSource: cameraEV != null ? 'camera' : 'manual', lighting: cameraEV != null ? undefined : lighting, error: ex.error, usedMeter: ex.usedMeter, takenAt: Date.now() } });
      saveRolls();
      cocked = false;
      if (roll.shots.length >= roll.capacity) toast('Last frame. Rewind and send it to the darkroom.', 2600);
    } catch (e) {
      toast(`The camera jammed: ${(e as Error).message}`);
    } finally {
      setTimeout(() => flash.classList.remove('on'), 80);
      busy = false;
      update();
    }
  };

  /** Capture a still, crop it to the film format and lens, never display it. */
  const grab = async (aspect: number, zoom: number): Promise<Blob> => {
    const track = stream?.getVideoTracks()[0];
    let src: CanvasImageSource = video;
    let sw = video.videoWidth;
    let sh = video.videoHeight;
    const IC = (window as unknown as { ImageCapture?: new (t: MediaStreamTrack) => ImgCap }).ImageCapture;
    if (track && IC) {
      try {
        const photo = await new IC(track).takePhoto();
        const bmp = await createImageBitmap(photo);
        src = bmp;
        sw = bmp.width;
        sh = bmp.height;
      } catch {
        /* fall back to a video frame */
      }
    }
    if (!sw || !sh) throw new Error('no picture from the sensor');
    // centre crop: film aspect, then the lens' narrower field of view
    let cw = sw;
    let ch = cw / aspect;
    if (ch > sh) {
      ch = sh;
      cw = ch * aspect;
    }
    cw /= zoom;
    ch /= zoom;
    const outW = Math.round(Math.min(1080, cw));
    const outH = Math.round(outW / aspect);
    const cv = document.createElement('canvas');
    cv.width = outW;
    cv.height = outH;
    cv.getContext('2d')!.drawImage(src, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, outW, outH);
    return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('encode failed'))), 'image/jpeg', 0.92));
  };

  // wind lever: drag the knob to the right
  const knob = lever.lastChild as HTMLElement;
  let lx = 0;
  lever.addEventListener('pointerdown', (e) => {
    lx = e.clientX;
    lever.setPointerCapture(e.pointerId);
  });
  lever.addEventListener('pointermove', (e) => {
    if (!lever.hasPointerCapture(e.pointerId) || cocked) return;
    const d = clamp(e.clientX - lx, 0, 92);
    knob.style.left = `${4 + d}px`;
    if (d >= 90) {
      if (roll.shots.length >= roll.capacity) {
        toast('The advance will not go any further.');
      } else {
        cocked = true;
        audio.advance(m.kind === 'tlr' ? 'crank' : m.id === 'trip35' ? 'wheel' : 'lever');
        buzz(20);
        update();
      }
    }
  });
  lever.addEventListener('pointerup', () => (knob.style.left = '4px'));
  shutterBtn.addEventListener('click', () => void fire());

  void navigator.mediaDevices
    ?.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 3840 }, height: { ideal: 2160 } }, audio: false })
    .then((s) => {
      stream = s;
      video.srcObject = s;
      video.addEventListener('loadedmetadata', () => update());
      const t = setInterval(() => {
        if (!stream) return clearInterval(t);
        readExposure();
        update();
      }, 600);
    })
    .catch(() => toast('No camera permission. Allow camera access for Latent Image Camera in Android settings.', 4000));
  update();
  window.addEventListener('resize', update);
}

// ---------------------------------------------------------------- sending
async function blobToB64(b: Blob): Promise<string> {
  const buf = new Uint8Array(await b.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

async function sendRoll(r: LocalRoll, line: HTMLElement) {
  line.textContent = 'Rewinding…';
  audio.rewind();
  try {
    const shots = [];
    for (const sh of r.shots) {
      const b = await images.get(sh.key);
      if (!b) continue;
      shots.push({ idx: sh.idx, meta: sh.meta, jpeg: await blobToB64(b) });
    }
    line.textContent = 'Sending to the darkroom…';
    const body: PhoneRoll = { id: r.id, unitId: r.unitId, stockId: r.stockId, ei: r.ei, capacity: r.capacity, expiredYears: r.expiredYears, shots };
    const res = await api<{ ok: boolean; message: string }>('/api/roll', { method: 'POST', body: JSON.stringify(body) });
    rolls = rolls.filter((x) => x.id !== r.id);
    saveRolls();
    buzz(50);
    void refreshCollection().catch(() => undefined);
    home(res.message || 'Roll delivered.');
  } catch (e) {
    line.textContent = `${(e as Error).message}`;
  }
}

// ---------------------------------------------------------------- boot
async function boot() {
  document.documentElement.style.setProperty('--paper-noise', paperNoiseDataUrl());
  await images.open();
  document.addEventListener('pointerdown', () => audio.ensure(), { once: true });
  home();
  if (pairing) void refreshCollection().then(() => home()).catch(() => undefined);
}

void boot();
