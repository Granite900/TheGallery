/**
 * DOM-based HUD: crosshair, catalog counter, carried-slip display,
 * interaction prompt, toasts, a fade overlay used for teleports/ending,
 * and the start/pause/end screens (including the catalog submission modal).
 */
import { CONFIG } from '../../config';

const CSS = `
#hud * { box-sizing: border-box; }
#hud {
  position: fixed; inset: 0; pointer-events: none; z-index: 10;
  font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #eae6da;
}
#hud .crosshair {
  position: absolute; left: 50%; top: 50%; width: 5px; height: 5px;
  margin: -2.5px 0 0 -2.5px; border-radius: 50%;
  background: rgba(240,236,224,0.75);
  transition: transform 0.12s ease, background 0.12s ease;
}
#hud .crosshair.active { transform: scale(1.9); background: #ffd98a; }
#hud .counter {
  position: absolute; top: 22px; left: 26px;
  font-size: 13px; letter-spacing: 0.22em; text-transform: uppercase;
  color: rgba(234,230,218,0.85); text-shadow: 0 1px 3px rgba(0,0,0,0.6);
}
#hud .carried-slip {
  position: absolute; bottom: 24px; right: 26px;
  font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase;
  color: rgba(255,217,138,0.9); text-shadow: 0 1px 3px rgba(0,0,0,0.7);
  background: rgba(12,11,9,0.55); border: 1px solid rgba(255,217,138,0.3);
  padding: 6px 12px; border-radius: 2px;
  opacity: 0; transition: opacity 0.22s ease;
}
#hud .carried-slip.visible { opacity: 1; }
#hud .prompt {
  position: absolute; bottom: 12%; left: 50%; transform: translateX(-50%);
  padding: 9px 18px; border-radius: 3px; font-size: 14px; letter-spacing: 0.08em;
  background: rgba(12,11,9,0.62); border: 1px solid rgba(234,230,218,0.22);
  opacity: 0; transition: opacity 0.15s ease; white-space: nowrap;
}
#hud .prompt.visible { opacity: 1; }
#hud .prompt b { color: #ffd98a; font-weight: 600; }
#hud .toast {
  position: absolute; bottom: 20%; left: 50%; transform: translateX(-50%);
  font-size: 15px; letter-spacing: 0.14em; text-transform: uppercase;
  color: rgba(234,230,218,0.95); text-shadow: 0 1px 4px rgba(0,0,0,0.8);
  opacity: 0; transition: opacity 0.5s ease; white-space: nowrap;
}
#hud .fade {
  position: absolute; inset: 0; background: #000; opacity: 1; pointer-events: none;
}
#hud .sprint-hint {
  position: absolute; top: 26%; left: 50%; transform: translate(-50%, -6px);
  font-size: 12px; letter-spacing: 0.22em; text-transform: uppercase;
  color: rgba(234,230,218,0.9); text-shadow: 0 1px 3px rgba(0,0,0,0.7);
  opacity: 0; transition: opacity 0.6s ease, transform 0.6s ease;
}
#hud .sprint-hint.visible { opacity: 1; transform: translate(-50%, 0); }
#hud .sprint-hint b { color: #ffd98a; }
.gb-screen {
  position: fixed; inset: 0; z-index: 20; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 14px; text-align: center;
  background: radial-gradient(ellipse at center, #14120e 0%, #060504 75%);
  color: #e6e1d3; font-family: Georgia, 'Times New Roman', serif;
  cursor: pointer; user-select: none;
}
.gb-screen h1 { font-size: 44px; font-weight: 400; letter-spacing: 0.35em; margin: 0 0 2px; text-indent: 0.35em; }
.gb-screen .sub { font-size: 14px; letter-spacing: 0.3em; text-transform: uppercase; color: #9a927d; text-indent: 0.3em; }
.gb-screen .rule { width: 120px; height: 1px; background: #57503f; margin: 16px 0; }
.gb-screen .controls { font-family: Helvetica, Arial, sans-serif; font-size: 13px; line-height: 2; color: #b6ae9a; letter-spacing: 0.06em; }
.gb-screen .hint { margin-top: 26px; font-family: Helvetica, Arial, sans-serif; font-size: 13px; letter-spacing: 0.25em; text-transform: uppercase; color: #d8d2c0; animation: gbPulse 2.2s ease-in-out infinite; }
@keyframes gbPulse { 0%,100% { opacity: 0.45; } 50% { opacity: 1; } }
.gb-screen button {
  margin-top: 22px; padding: 12px 34px; font-family: Georgia, serif; font-size: 15px;
  letter-spacing: 0.22em; text-transform: uppercase; color: #e6e1d3;
  background: transparent; border: 1px solid #8a8168; cursor: pointer;
  pointer-events: all;
}
.gb-screen button:hover { background: #2a2619; }
/* Submission modal */
#submission-modal {
  position: fixed; inset: 0; z-index: 25; display: flex; align-items: center;
  justify-content: center; background: rgba(4,3,2,0.92); opacity: 0;
  pointer-events: none; transition: opacity 0.6s ease;
  font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
}
#submission-modal.open { opacity: 1; pointer-events: all; }
#submission-modal .form {
  background: #f0ead9; color: #2c2a24; width: min(540px,88vw);
  padding: 36px 40px 28px; border: 1px solid #b3aa90;
  box-shadow: 0 24px 80px rgba(0,0,0,0.7);
}
#submission-modal h2 {
  margin: 0 0 4px; font-family: Georgia,serif; font-size: 18px; font-weight:600;
  letter-spacing: 0.06em;
}
#submission-modal .sub {
  font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase;
  color: #7a7260; margin-bottom: 24px; display: block;
}
#submission-modal table { width: 100%; border-collapse: collapse; margin-bottom: 22px; }
#submission-modal td {
  font-size: 13px; padding: 5px 0; line-height: 1.5; vertical-align: top;
}
#submission-modal td:first-child { color: #7a7260; width: 58%; }
#submission-modal td:last-child { color: #2c2a24; font-weight: 500; text-align: right; }
#submission-modal .note-line {
  font-size: 12px; color: #8a6a40; font-style: italic; margin-bottom: 20px;
  border-left: 2px solid #c8b98a; padding-left: 10px; line-height: 1.5;
}
#submission-modal .buttons { display: flex; gap: 14px; }
#submission-modal .buttons button {
  flex: 1; padding: 11px 0; font-family: Georgia,serif; font-size: 14px;
  letter-spacing: 0.18em; text-transform: uppercase; cursor: pointer;
  border: 1px solid #8a8168; background: transparent; color: #2c2a24;
}
#submission-modal .buttons button:hover { background: #e0d9c8; }
#submission-modal .buttons button.primary { background: #2c2a24; color: #f0ead9; }
#submission-modal .buttons button.primary:hover { background: #3e3a2e; }
`;

export class HUD {
  private root: HTMLDivElement;
  private crosshair: HTMLDivElement;
  private counter: HTMLDivElement;
  private carriedSlipEl: HTMLDivElement;
  private prompt: HTMLDivElement;
  private toastEl: HTMLDivElement;
  private fadeEl: HTMLDivElement;
  private startScreen: HTMLDivElement | null = null;
  private pauseScreen: HTMLDivElement | null = null;
  private toastTimer = 0;

  constructor() {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    this.root = document.createElement('div');
    this.root.id = 'hud';
    this.crosshair = this.el('crosshair');
    this.counter = this.el('counter');
    this.carriedSlipEl = this.el('carried-slip');
    this.prompt = this.el('prompt');
    this.toastEl = this.el('toast');
    this.fadeEl = this.el('fade');
    document.body.appendChild(this.root);
    this.setCounter(0, CONFIG.catalog.correctionsRequired);
  }

  private el(cls: string): HTMLDivElement {
    const d = document.createElement('div');
    d.className = cls;
    this.root.appendChild(d);
    return d;
  }

  setCounter(n: number, total: number): void {
    this.counter.textContent = `Catalog corrected: ${n}/${total}`;
  }

  setCarriedSlip(ref: string | null): void {
    if (ref === null) {
      this.carriedSlipEl.classList.remove('visible');
    } else {
      this.carriedSlipEl.textContent = `Carrying: ${ref}`;
      this.carriedSlipEl.classList.add('visible');
    }
  }

  /** Prompt like "E — Read". Pass null to hide. Text before " — " is highlighted. */
  setPrompt(text: string | null): void {
    if (text === null) {
      this.prompt.classList.remove('visible');
      return;
    }
    const i = text.indexOf(' — ');
    if (i > -1) {
      this.prompt.innerHTML = `<b>${text.slice(0, i)}</b> — ${text
        .slice(i + 3)
        .replace(/</g, '&lt;')}`;
    } else {
      this.prompt.textContent = text;
    }
    this.prompt.classList.add('visible');
  }

  setCrosshairActive(on: boolean): void {
    this.crosshair.classList.toggle('active', on);
  }

  /** One-time, unobtrusive "Shift — sprint" hint, shown after the sprint note is first read. */
  showSprintHint(): void {
    if (!CONFIG.tutorial.sprintHintEnabled) return;
    const el = this.el('sprint-hint');
    el.innerHTML = '<b>Shift</b> — sprint';
    requestAnimationFrame(() => el.classList.add('visible'));
    window.setTimeout(() => {
      el.classList.remove('visible');
      window.setTimeout(() => el.remove(), 700);
    }, CONFIG.tutorial.sprintHintDurationMs);
  }

  toast(text: string, ms = 2600): void {
    this.toastEl.textContent = text;
    this.toastEl.style.opacity = '1';
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toastEl.style.opacity = '0';
    }, ms);
  }

  /** Animate the black overlay to a target opacity. Resolves when done. */
  fadeTo(opacity: number, ms: number): Promise<void> {
    this.fadeEl.style.transition = `opacity ${ms}ms ease`;
    void this.fadeEl.offsetHeight;
    this.fadeEl.style.opacity = String(opacity);
    return new Promise((res) => window.setTimeout(res, ms + 30));
  }

  showStart(onEnter: () => void): void {
    const s = document.createElement('div');
    s.className = 'gb-screen';
    s.innerHTML = `
      <h1>GALLERY BELOW</h1>
      <div class="sub">Lower collection · catalog review</div>
      <div class="rule"></div>
      <div class="controls">
        WASD — walk &nbsp;·&nbsp; Mouse — look &nbsp;·&nbsp; Shift — brisk pace<br>
        E — interact &nbsp;·&nbsp; Esc — release cursor<br>
        Three works are misfiled. Find them. Return their loan slips.
      </div>
      <div class="hint">Click to enter</div>`;
    s.addEventListener('click', () => onEnter());
    document.body.appendChild(s);
    this.startScreen = s;
  }

  hideStart(): void {
    this.startScreen?.remove();
    this.startScreen = null;
  }

  showPause(onResume: () => void): void {
    if (this.pauseScreen) return;
    const s = document.createElement('div');
    s.className = 'gb-screen';
    s.style.background = 'rgba(4,3,2,0.82)';
    s.innerHTML = `
      <div class="sub">The tour is paused</div>
      <div class="hint">Click to resume</div>`;
    s.addEventListener('click', () => onResume());
    document.body.appendChild(s);
    this.pauseScreen = s;
  }

  hidePause(): void {
    this.pauseScreen?.remove();
    this.pauseScreen = null;
  }

  /**
   * Catalog submission modal — replaces the old ending screen.
   * Shows auto-filled stats then branches on Accept / Request revision.
   */
  showSubmissionModal(opts: {
    corrections: number;
    misfiles: number;
    annotationsRead: number;
    directNotesRead: number;
    elapsed: string;
    highDread: boolean;
    onAccept: () => void;
    onRevision: () => void;
  }): void {
    const modal = document.createElement('div');
    modal.id = 'submission-modal';

    const flavorLine = opts.highDread
      ? 'Some annotations were not made by staff.'
      : opts.misfiles > 0
        ? `${opts.misfiles} ${opts.misfiles === 1 ? 'entry was' : 'entries were'} rejected before correct placement.`
        : 'No errors recorded.';

    modal.innerHTML = `
      <div class="form">
        <h2>EXIT REQUEST — CATALOG REVIEW</h2>
        <span class="sub">Lower collection · self-guided tour</span>
        <table>
          <tr><td>Entries corrected</td><td>${opts.corrections}/3</td></tr>
          <tr><td>Entries rejected (misfile)</td><td>${opts.misfiles}</td></tr>
          <tr><td>Annotations reviewed</td><td>${opts.annotationsRead + opts.directNotesRead}</td></tr>
          <tr><td>Time on floor</td><td>${opts.elapsed}</td></tr>
          <tr><td>Exit requested</td><td>YES</td></tr>
        </table>
        <div class="note-line">${flavorLine}</div>
        <div class="buttons">
          <button class="primary" id="sub-accept">Accept receipt</button>
          <button id="sub-revision">Request revision</button>
        </div>
      </div>`;

    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('open'));

    modal.querySelector('#sub-accept')!.addEventListener('click', () => {
      modal.classList.remove('open');
      window.setTimeout(() => { modal.remove(); opts.onAccept(); }, 650);
    });
    modal.querySelector('#sub-revision')!.addEventListener('click', () => {
      modal.classList.remove('open');
      window.setTimeout(() => { modal.remove(); opts.onRevision(); }, 650);
    });
  }

  showEnding(opts: { good: boolean; onReplay: () => void }): void {
    const s = document.createElement('div');
    s.className = 'gb-screen';
    s.style.cursor = 'default';
    const msg = opts.good
      ? 'The catalog is corrected. The lower collection is closed.'
      : 'Your revision is under review.\n\nPlease do not leave the floor.';
    s.innerHTML = `
      <div class="sub" style="font-size:15px; letter-spacing:0.25em; color:#ddd6c2; white-space:pre-line;">${msg}</div>
      <div class="rule"></div>
      <button type="button">Visit again</button>`;
    s.querySelector('button')!.addEventListener('click', () => opts.onReplay());
    document.body.appendChild(s);
  }
}
