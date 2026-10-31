/** Persistent HUD layers: ledger, objective clip, hint card, toasts, fades, modals. */
import { h, ui, btn, money, keycap, tornClip } from './dom';
import type { GameState } from '../sim/state';
import { chapterProgress, currentChapter } from '../sim/career';

export class Hud {
  root: HTMLElement;
  private ledger: HTMLElement;
  private clip: HTMLElement;
  private hint: HTMLElement;
  private toasts: HTMLElement;
  private fadeEl: HTMLElement;
  private tooltipEl: HTMLElement;
  private modalStack: HTMLElement[] = [];
  private layer: HTMLElement;

  constructor() {
    this.root = ui();
    this.layer = h('div', { class: 'passthrough', style: 'position:absolute;inset:0' });
    this.ledger = h('div', { class: 'ledger' });
    this.clip = h('div', { class: 'sheet card clip pin' });
    this.hint = h('div', { class: 'hintcard' });
    this.toasts = h('div', { class: 'toasts' });
    this.fadeEl = h('div', { class: 'fade' });
    this.tooltipEl = h('div', { class: 'tooltip', style: 'display:none' });
    this.root.append(this.layer, this.ledger, this.clip, this.hint, this.toasts, this.tooltipEl, this.fadeEl);
    this.clip.addEventListener('click', () => this.clip.classList.toggle('collapsed'));
  }

  /** Scene-owned layer, cleared on scene switch */
  get sceneLayer(): HTMLElement {
    return this.layer;
  }

  clearScene(): void {
    this.layer.innerHTML = '';
    this.closeAll();
    this.tooltip(null);
  }

  setVisible(parts: { ledger?: boolean; clip?: boolean; hint?: boolean }): void {
    if (parts.ledger !== undefined) this.ledger.style.display = parts.ledger ? '' : 'none';
    if (parts.clip !== undefined) this.clip.style.display = parts.clip ? '' : 'none';
    if (parts.hint !== undefined) this.hint.style.display = parts.hint ? '' : 'none';
  }

  update(s: GameState): void {
    this.ledger.innerHTML = '';
    this.ledger.append(h('span', null, h('b', null, 'CASH '), money(s.money)), h('span', null, h('b', null, 'REP '), String(s.rep)), h('span', null, h('b', null, 'DAY '), String(s.day)));
    const ch = currentChapter(s);
    this.clip.innerHTML = '';
    if (!ch || s.sandbox) {
      this.clip.append(h('h3', null, s.sandbox ? 'Free shooting' : 'Your own time'), h('div', { class: 'small' }, s.sandbox ? 'Everything is yours. Shoot, develop, print.' : 'The career is complete. The market still runs every Saturday.'));
      return;
    }
    const prog = chapterProgress(s);
    const objs = h('div', { class: 'objs' });
    for (const o of ch.objectives) {
      const done = prog.done.includes(o);
      objs.append(h('div', { class: `obj ${done ? 'done' : ''}` }, h('span', { class: 'box' }), h('span', null, o.text)));
    }
    const next = prog.todo[0];
    if (next?.hint && s.assist !== 'purist') objs.append(h('div', { class: 'hintline' }, next.hint));
    this.clip.append(h('h3', null, `${ch.subtitle}: ${ch.title}`), objs);
  }

  hints(items: [string, string][]): void {
    this.hint.innerHTML = '';
    for (const [k, l] of items) this.hint.append(keycap(k, l));
    this.hint.style.display = items.length ? '' : 'none';
  }

  toast(msg: string, kind: '' | 'good' | 'bad' = '', ms = 4200): void {
    const t = h('div', { class: `toast ${kind}` }, msg);
    this.toasts.append(t);
    setTimeout(() => {
      t.style.transition = 'opacity .4s';
      t.style.opacity = '0';
      setTimeout(() => t.remove(), 450);
    }, ms);
  }

  tooltip(text: string | null, x = 0, y = 0): void {
    if (!text) {
      this.tooltipEl.style.display = 'none';
      return;
    }
    this.tooltipEl.textContent = text;
    this.tooltipEl.style.display = '';
    this.tooltipEl.style.left = `${x}px`;
    this.tooltipEl.style.top = `${y}px`;
  }

  async fade(on: boolean): Promise<void> {
    this.fadeEl.classList.toggle('on', on);
    await new Promise((r) => setTimeout(r, 460));
  }

  /** Show a modal sheet. Returns a close function. */
  modal(content: HTMLElement, opts: { clear?: boolean; onClose?: () => void; dismissable?: boolean } = {}): () => void {
    const ov = h('div', { class: `overlay ${opts.clear ? 'clear' : ''}` }, content);
    if (opts.dismissable !== false)
      ov.addEventListener('mousedown', (e) => {
        if (e.target === ov) close();
      });
    this.root.append(ov);
    this.modalStack.push(ov);
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      ov.remove();
      this.modalStack = this.modalStack.filter((m) => m !== ov);
      opts.onClose?.();
    };
    (ov as HTMLElement & { close?: () => void }).close = close;
    return close;
  }

  get modalOpen(): boolean {
    return this.modalStack.length > 0;
  }

  closeTop(): boolean {
    const top = this.modalStack[this.modalStack.length - 1] as (HTMLElement & { close?: () => void }) | undefined;
    if (!top) return false;
    top.close?.();
    return true;
  }

  closeAll(): void {
    while (this.closeTop()) {
      /* */
    }
  }

  letter(from: string, title: string, body: string, onClose?: () => void): void {
    const sheet = h('div', { class: 'sheet lettersheet tape torn-bottom', style: `--torn:${tornClip(title.length)}` }, h('h2', null, title), ...body.split('\n').map((p) => h('p', null, p)), h('div', { class: 'from' }, `— ${from}`), h('div', { style: 'margin-top:14px' }, btn('Put it down', () => close())));
    sheet.style.setProperty('--torn', tornClip(title.length));
    const close = this.modal(sheet, { onClose });
  }

  confirm(title: string, body: string, yes: string, no: string): Promise<boolean> {
    return new Promise((resolve) => {
      let result = false;
      const sheet = h('div', { class: 'sheet card', style: 'width:420px' }, h('h2', null, title), h('p', null, body), h('div', null, btn(yes, () => ((result = true), close())), btn(no, () => close(), 'red')));
      const close = this.modal(sheet, { onClose: () => resolve(result) });
    });
  }
}
