/**
 * Museum-label reading modal. Pointer lock is kept while it is open;
 * the player is frozen and presses E again to step back.
 *
 * Two modes:
 *   'standard' — full-width, museum-header, instant text
 *   'direct'   — narrower, no work-title header, 1.5× slower typewriter
 */

const CSS = `
#placard-modal {
  position: fixed; left: 50%; bottom: 16%; transform: translate(-50%, 24px);
  z-index: 15; width: min(540px, 86vw);
  background: #f0ead9; color: #2c2a24; border: 1px solid #b3aa90;
  box-shadow: 0 18px 60px rgba(0,0,0,0.65);
  padding: 26px 32px 20px; font-family: Georgia, 'Times New Roman', serif;
  opacity: 0; pointer-events: none;
  transition: opacity 0.18s ease, transform 0.18s ease;
}
#placard-modal.open { opacity: 1; transform: translate(-50%, 0); }
#placard-modal h2 {
  margin: 0 0 12px; font-size: 19px; font-weight: 600; letter-spacing: 0.02em;
  border-bottom: 1px solid #cdc4a8; padding-bottom: 10px;
}
#placard-modal p { margin: 0; font-size: 15.5px; line-height: 1.65; color: #45412f; }
#placard-modal .close-hint {
  margin-top: 16px; font-family: Helvetica, Arial, sans-serif;
  font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; color: #8d8468;
}
#placard-modal.direct-mode {
  width: min(380px, 72vw);
  background: #0c0b09;
  color: #ccc7b7;
  border-color: #3a3830;
  box-shadow: 0 18px 60px rgba(0,0,0,0.85);
}
#placard-modal.direct-mode h2 {
  display: none;
}
#placard-modal.direct-mode p {
  color: #ccc7b7;
  font-style: italic;
  font-size: 14.5px;
  line-height: 1.8;
}
#placard-modal.direct-mode .close-hint {
  color: #4a4638;
}
`;

export class PlacardModal {
  private el: HTMLDivElement;
  private titleEl: HTMLHeadingElement;
  private bodyEl: HTMLParagraphElement;
  isOpen = false;

  private typewriterTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    this.el = document.createElement('div');
    this.el.id = 'placard-modal';
    this.titleEl = document.createElement('h2');
    this.bodyEl = document.createElement('p');
    const hint = document.createElement('div');
    hint.className = 'close-hint';
    hint.textContent = 'E — step back';
    this.el.append(this.titleEl, this.bodyEl, hint);
    document.body.appendChild(this.el);
  }

  open(title: string, body: string, mode: 'standard' | 'direct' = 'standard'): void {
    this.stopTypewriter();
    this.titleEl.textContent = title;
    this.el.classList.toggle('direct-mode', mode === 'direct');

    if (mode === 'direct') {
      this.bodyEl.textContent = '';
      this.el.classList.add('open');
      this.isOpen = true;
      this.runTypewriter(body, 38); // ~38ms per char = 1.5× slower than "instant"
    } else {
      this.bodyEl.textContent = body;
      this.el.classList.add('open');
      this.isOpen = true;
    }
  }

  private runTypewriter(text: string, msPerChar: number): void {
    let i = 0;
    this.typewriterTimer = setInterval(() => {
      if (i <= text.length) {
        this.bodyEl.textContent = text.slice(0, i);
        i++;
      } else {
        this.stopTypewriter();
      }
    }, msPerChar);
  }

  private stopTypewriter(): void {
    if (this.typewriterTimer !== null) {
      clearInterval(this.typewriterTimer);
      this.typewriterTimer = null;
    }
  }

  close(): void {
    this.stopTypewriter();
    this.el.classList.remove('open');
    this.el.classList.remove('direct-mode');
    this.isOpen = false;
  }
}
