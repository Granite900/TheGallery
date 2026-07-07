import { CONFIG } from '../config';

/**
 * Fully procedural WebAudio: a low fluorescent room-tone hum, soft UI beeps,
 * footsteps, and the ending tone. No audio files are loaded.
 * The context is created lazily on the first user gesture.
 *
 * `updateDread` blends the hum/PA-static bed smoothly with global dread —
 * detune + slight gain growth on the hum, an occasional faint distant
 * thud/static swell that never exceeds the hum's own volume. No stingers,
 * no words, no sudden spikes.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private humGain: GainNode | null = null;
  private humOscillators: OscillatorNode[] = [];
  private staticGain: GainNode | null = null;
  private distantTimer = 2;

  private ensure(): AudioContext | null {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.9;
        this.master.connect(this.ctx.destination);
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  /** Continuous fluorescent hum + faint air bed. */
  startAmbience(): void {
    const ctx = this.ensure();
    if (!ctx || !this.master || this.humGain) return;

    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0;
    this.humGain.gain.linearRampToValueAtTime(1, ctx.currentTime + 3);
    this.humGain.connect(this.master);

    const mk = (freq: number, type: OscillatorType, gain: number) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = gain;
      o.connect(g).connect(this.humGain!);
      o.start();
      this.humOscillators.push(o);
    };
    mk(60, 'sine', 0.014);
    mk(120, 'sine', 0.007);
    mk(179.5, 'triangle', 0.0035);

    // filtered noise air bed
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    const g = ctx.createGain();
    g.gain.value = 0.012;
    src.connect(lp).connect(g).connect(this.humGain);
    src.start();

    // faint PA static bed — silent until dread rises, always under the hum
    const staticBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const sd = staticBuf.getChannelData(0);
    for (let i = 0; i < len; i++) sd[i] = Math.random() * 2 - 1;
    const staticSrc = ctx.createBufferSource();
    staticSrc.buffer = staticBuf;
    staticSrc.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1300;
    bp.Q.value = 0.5;
    const sg = ctx.createGain();
    sg.gain.value = 0;
    staticSrc.connect(bp).connect(sg).connect(this.master);
    staticSrc.start();
    this.staticGain = sg;
  }

  /**
   * Smoothly blend the ambience with global dread: detune + slightly grow
   * the hum, swell faint PA static (always quieter than the hum), and
   * occasionally trigger a very quiet, distant thud. No spikes.
   */
  updateDread(level: number, dt: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const a = CONFIG.dread.audio;
    for (const o of this.humOscillators) {
      o.detune.setTargetAtTime(level * a.humDetuneCents, t, 0.8);
    }
    if (this.humGain) this.humGain.gain.setTargetAtTime(1 + level * a.humGainBoost, t, 1.4);
    if (this.staticGain) this.staticGain.gain.setTargetAtTime(level * a.staticMaxGain, t, 1.6);

    this.distantTimer -= dt;
    if (this.distantTimer <= 0) {
      this.distantTimer = 2.5 + Math.random() * 3.5;
      if (Math.random() < level * a.distantEventMaxChancePerCheck) this.distantEvent();
    }
  }

  /** A very quiet, low, slow thud — a faint distant footstep or PA click. Never a stinger. */
  private distantEvent(): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const dur = 0.5 + Math.random() * 0.3;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = 0.4 + Math.random() * 0.2;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 220;
    const g = ctx.createGain();
    g.gain.value = 0.02;
    src.connect(lp).connect(g).connect(this.master);
    src.start();
  }

  /**
   * A couple of faint, distant footstep-like taps, optionally panned toward
   * one side — accompanies the silhouette anomaly's appearance. Quieter than
   * the player's own footsteps, never a stinger, and never repeats fast
   * enough to feel like something approaching.
   */
  ambientPresence(pan = 0): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const hasPanner = typeof ctx.createStereoPanner === 'function';
    const panner = hasPanner ? ctx.createStereoPanner() : null;
    if (panner) {
      panner.pan.value = Math.max(-1, Math.min(1, pan * 0.6));
      panner.connect(this.master);
    }
    const dest = panner ?? this.master;
    const steps = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < steps; i++) {
      const when = i * (0.4 + Math.random() * 0.12);
      const dur = 0.11;
      const len = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let j = 0; j < len; j++) d[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / len, 2);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = 0.5 + Math.random() * 0.1;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 240;
      const g = ctx.createGain();
      g.gain.value = 0.04;
      src.connect(lp).connect(g).connect(dest);
      src.start(ctx.currentTime + when);
    }
  }

  /**
   * A cold, dissonant liminal swell — three detuned low partials (a slow,
   * uneasy beat plus a hollow upper partial) that sink in pitch as a lowpass
   * closes over them, under a breathy filtered-noise "presence". Accompanies
   * the silhouette glimpses: distinctly unsettling, but slow-attack and never
   * loud — a swell that crawls up and sinks away, never a jumpscare stinger.
   */
  eerieGlimpse(pan = 0): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const hasPanner = typeof ctx.createStereoPanner === 'function';
    const panner = hasPanner ? ctx.createStereoPanner() : null;
    if (panner) {
      panner.pan.value = Math.max(-1, Math.min(1, pan * 0.5));
      panner.connect(this.master);
    }
    const dest = panner ?? this.master;
    const t = ctx.currentTime;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.06, t + 0.28);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.1);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(340, t);
    lp.frequency.exponentialRampToValueAtTime(140, t + 2.1); // filter slowly closes
    lp.connect(g).connect(dest);

    // 96 & 103.5 Hz beat together; 146 Hz sits a sour interval above them.
    const oscs: OscillatorNode[] = [];
    for (const f of [96, 103.5, 146]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * 0.9, t + 2.1); // slow sink
      o.connect(lp);
      o.start(t);
      o.stop(t + 2.2);
      oscs.push(o);
    }

    // breathy noise "presence" — a little closer/louder than before
    const dur = 1.1;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.6);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1500;
    bp.Q.value = 0.7;
    const ng = ctx.createGain();
    ng.gain.value = 0.024;
    src.connect(bp).connect(ng).connect(dest);
    src.start(t + 0.05);
  }

  private tone(freq: number, dur: number, gain: number, type: OscillatorType = 'sine', when = 0): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** Soft catalog beep. */
  beep(): void {
    this.tone(880, 0.28, 0.09);
    this.tone(1320, 0.2, 0.03);
  }

  /** Two-note chime when the exit unlocks. */
  unlockChime(): void {
    this.tone(523.25, 0.5, 0.07);
    this.tone(784, 0.7, 0.06, 'sine', 0.18);
  }

  /** Soft single bell tone on a successful catalog correction. */
  correctBell(): void {
    this.tone(659.25, 0.9, 0.06);
    this.tone(880, 0.6, 0.025, 'sine', 0.08);
  }

  /** Quiet, low rejection click on a wrong-slot attempt — no stinger. */
  misfilePenalty(): void {
    this.tone(110, 0.18, 0.07, 'triangle');
    this.tone(82, 0.22, 0.04, 'triangle', 0.06);
  }

  /** Dull thud for a locked door. */
  lockedThud(): void {
    this.tone(92, 0.16, 0.12, 'triangle');
  }

  /** Sliding-door rumble. */
  doorSlide(): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const dur = 1.2;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 220;
    const g = ctx.createGain();
    g.gain.value = 0.22;
    src.connect(lp).connect(g).connect(this.master);
    src.start();
  }

  /** Quiet paper/UI tick. */
  tick(): void {
    this.tone(1750, 0.05, 0.03, 'square');
  }

  /** Soft carpet footstep. `volumeMul` scales the base gain (used for the
   * dark-spot dip and the delayed déjà-vu echo layer). */
  footstep(volumeMul = 1): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const dur = 0.09;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = 0.8 + Math.random() * 0.35;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 340;
    const g = ctx.createGain();
    g.gain.value = 0.05 * volumeMul;
    src.connect(lp).connect(g).connect(this.master);
    src.start();
  }

  /** Final resolving tone; the hum fades away under it. */
  endTone(): void {
    const ctx = this.ensure();
    if (!ctx) return;
    if (this.humGain) {
      this.humGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 2.5);
    }
    this.tone(261.63, 2.6, 0.06);
    this.tone(392, 2.6, 0.05, 'sine', 0.4);
    this.tone(523.25, 3.2, 0.04, 'sine', 0.9);
  }
}
