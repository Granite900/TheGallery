/**
 * Synthesised sound. Shutter sounds play two mechanical clicks separated by
 * the *actual* exposure time, so a slow 1 s sounds like one second and a
 * dragging shutter is audible on inspection.
 */
export class Audio {
  ctx: AudioContext | null = null;
  master!: GainNode;
  private noiseBuf!: AudioBuffer;
  private loops = new Map<string, { stop: () => void }>();
  volume = 0.8;

  ensure(): AudioContext | null {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    }
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch {
      this.ctx = null;
    }
    return this.ctx;
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.ctx) this.master.gain.value = v;
  }

  private noise(t0: number, dur: number, freq: number, q: number, gain: number, type: BiquadFilterType = 'bandpass', attack = 0.001) {
    const c = this.ensure();
    if (!c) return;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t0, Math.random());
    src.stop(t0 + dur + 0.05);
  }

  private tone(t0: number, dur: number, freq: number, gain: number, type: OscillatorType = 'sine', endFreq?: number) {
    const c = this.ensure();
    if (!c) return;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  click(gain = 0.25, freq = 3200) {
    const c = this.ensure();
    if (!c) return;
    this.noise(c.currentTime, 0.03, freq, 3, gain);
  }

  /** kind: leaf (soft tick), focalplane (clack), slr (mirror slap + curtain) */
  shutter(kind: 'leaf' | 'focalplane' | 'slr' | 'rotary', seconds: number, squeal = false) {
    const c = this.ensure();
    if (!c) return;
    const t = c.currentTime + 0.01;
    const close = t + Math.max(seconds, 0.0015);
    if (kind === 'leaf') {
      this.noise(t, 0.035, 4200, 4, 0.35);
      this.tone(t, 0.02, 2100, 0.05, 'triangle');
      this.noise(close, 0.03, 3600, 4, seconds > 0.05 ? 0.28 : 0.0);
    } else if (kind === 'slr') {
      this.noise(t, 0.06, 900, 1.2, 0.5);
      this.noise(t, 0.04, 2600, 2, 0.35);
      this.noise(close + 0.012, 0.08, 1100, 1, 0.45);
      this.noise(close + 0.02, 0.05, 2400, 2, 0.25);
      if (squeal) this.tone(close + 0.02, 0.16, 3300, 0.06, 'sawtooth', 3000);
    } else if (kind === 'rotary') {
      this.noise(t, 0.02, 2500, 2, 0.2);
    } else {
      this.noise(t, 0.04, 1800, 2, 0.4);
      this.noise(close, 0.04, 1600, 2, seconds > 0.02 ? 0.35 : 0.0);
    }
  }

  advance(kind: 'lever' | 'wheel' | 'crank' = 'lever') {
    const c = this.ensure();
    if (!c) return;
    const n = kind === 'wheel' ? 9 : kind === 'crank' ? 14 : 7;
    const span = kind === 'crank' ? 0.5 : 0.28;
    for (let i = 0; i < n; i++) this.noise(c.currentTime + (i / n) * span + Math.random() * 0.01, 0.012, 3800 + Math.random() * 800, 6, 0.08);
    this.noise(c.currentTime + span + 0.02, 0.03, 2500, 3, 0.18);
  }

  rewind() {
    const c = this.ensure();
    if (!c) return;
    for (let i = 0; i < 28; i++) this.noise(c.currentTime + i * 0.06, 0.02, 3000 + (i % 3) * 300, 5, 0.06);
  }

  door() {
    const c = this.ensure();
    if (!c) return;
    this.noise(c.currentTime, 0.05, 1200, 2, 0.3);
    this.tone(c.currentTime, 0.04, 400, 0.05, 'triangle');
  }

  pour(seconds = 1.5) {
    const c = this.ensure();
    if (!c) return;
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(700, t);
    f.frequency.linearRampToValueAtTime(1300, t + seconds);
    f.Q.value = 1.4;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.25, t + 0.15);
    g.gain.setValueAtTime(0.25, t + seconds - 0.2);
    g.gain.linearRampToValueAtTime(0, t + seconds);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + seconds + 0.1);
  }

  slosh() {
    const c = this.ensure();
    if (!c) return;
    this.noise(c.currentTime, 0.35, 500, 1, 0.22, 'lowpass', 0.08);
    this.noise(c.currentTime + 0.1, 0.25, 900, 1.5, 0.1);
  }

  tick() {
    const c = this.ensure();
    if (!c) return;
    this.noise(c.currentTime, 0.012, 5000, 8, 0.05);
  }

  bell() {
    const c = this.ensure();
    if (!c) return;
    const t = c.currentTime;
    for (let i = 0; i < 3; i++) {
      this.tone(t + i * 0.22, 0.18, 2200, 0.12, 'square');
      this.tone(t + i * 0.22, 0.18, 2210, 0.08, 'square');
    }
  }

  paper() {
    const c = this.ensure();
    if (!c) return;
    this.noise(c.currentTime, 0.18, 2600, 0.8, 0.12, 'highpass', 0.04);
  }

  stamp() {
    const c = this.ensure();
    if (!c) return;
    this.noise(c.currentTime, 0.09, 220, 1, 0.6, 'lowpass');
  }

  coin() {
    const c = this.ensure();
    if (!c) return;
    this.tone(c.currentTime, 0.3, 2400, 0.06, 'sine');
    this.tone(c.currentTime + 0.05, 0.4, 3200, 0.05, 'sine');
  }

  /** looping ambiences */
  loop(id: 'harbour' | 'market' | 'room' | 'darkroom' | 'projector' | 'park' | 'motor', on: boolean) {
    const c = this.ensure();
    const cur = this.loops.get(id);
    if (!on) {
      cur?.stop();
      this.loops.delete(id);
      return;
    }
    if (cur || !c) return;
    const nodes: AudioScheduledSourceNode[] = [];
    const out = c.createGain();
    out.gain.value = 0;
    out.gain.linearRampToValueAtTime(1, c.currentTime + 1.2);
    out.connect(this.master);
    const bed = (freq: number, q: number, gain: number, type: BiquadFilterType = 'lowpass', lfo = 0) => {
      const src = c.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const f = c.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = c.createGain();
      g.gain.value = gain;
      src.connect(f).connect(g).connect(out);
      if (lfo > 0) {
        const o = c.createOscillator();
        o.frequency.value = lfo;
        const og = c.createGain();
        og.gain.value = gain * 0.6;
        o.connect(og).connect(g.gain);
        o.start();
        nodes.push(o);
      }
      src.start(0, Math.random());
      nodes.push(src);
    };
    let timer = 0;
    const events: (() => void)[] = [];
    if (id === 'harbour') {
      bed(400, 0.6, 0.12, 'lowpass', 0.12);
      bed(1800, 0.5, 0.02, 'bandpass', 0.07);
      events.push(() => this.gull());
    } else if (id === 'park') {
      bed(1200, 0.4, 0.025, 'bandpass', 0.05);
      events.push(() => this.bird());
    } else if (id === 'market') {
      bed(500, 0.5, 0.08, 'bandpass', 0.3);
      bed(1200, 0.8, 0.03, 'bandpass', 0.5);
      events.push(() => this.gull(), () => this.click(0.05, 2500));
    } else if (id === 'room') {
      bed(160, 0.7, 0.03, 'lowpass');
      events.push(() => this.tick());
    } else if (id === 'darkroom') {
      bed(120, 1, 0.025, 'lowpass');
      const hum = c.createOscillator();
      hum.frequency.value = 100;
      const hg = c.createGain();
      hg.gain.value = 0.006;
      hum.connect(hg).connect(out);
      hum.start();
      nodes.push(hum);
    } else if (id === 'projector' || id === 'motor') {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = id === 'projector' ? 18 : 24;
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 900;
      f.Q.value = 1.5;
      const g = c.createGain();
      g.gain.value = 0.12;
      o.connect(f).connect(g).connect(out);
      o.start();
      nodes.push(o);
      bed(300, 1, 0.04, 'lowpass');
    }
    if (events.length) {
      timer = window.setInterval(() => {
        if (Math.random() < 0.35) events[Math.floor(Math.random() * events.length)]();
      }, 2200);
    }
    this.loops.set(id, {
      stop: () => {
        clearInterval(timer);
        out.gain.cancelScheduledValues(c.currentTime);
        out.gain.linearRampToValueAtTime(0, c.currentTime + 0.5);
        setTimeout(() => nodes.forEach((n) => n.stop()), 600);
      },
    });
  }

  stopAll() {
    for (const k of [...this.loops.keys()]) this.loop(k as 'room', false);
  }

  gull() {
    const c = this.ensure();
    if (!c) return;
    const t = c.currentTime;
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const f = 1500 + Math.random() * 400;
      this.tone(t + i * 0.22, 0.2, f, 0.025, 'sawtooth', f * 0.6);
    }
  }

  bird() {
    const c = this.ensure();
    if (!c) return;
    const t = c.currentTime;
    for (let i = 0; i < 4; i++) this.tone(t + i * 0.09, 0.07, 3500 + Math.random() * 1500, 0.02, 'sine', 2800);
  }
}
