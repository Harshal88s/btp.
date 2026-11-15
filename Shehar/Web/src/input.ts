// Unified input: keyboard (WASD etc.), gamepad, and on-screen touch controls (joystick + buttons) for mobile.
export type Action = 'enter' | 'interact' | 'camera' | 'map' | 'missions' | 'pause' | 'reset' | 'horn' | 'lights' | 'cheat' | 'jump';

export class Input {
  throttle = 0; steer = 0; handbrake = false; boost = false; lookX = 0; lookY = 0;
  private keys = new Set<string>();
  private pressed = new Set<Action>();
  private joy = { id: -1, x0: 0, y0: 0, x: 0, y: 0 };
  private touchBrake = false; private touchBoost = false; private touchHorn = false;
  private look = { id: -1, x: 0, y: 0 };
  touch = false;
  bindings: Record<string, Action> = { KeyE: 'enter', KeyF: 'interact', KeyC: 'camera', KeyM: 'map', Tab: 'missions', Escape: 'pause', KeyR: 'reset', KeyL: 'lights', Backquote: 'cheat', KeyT: 'cheat', Space: 'jump' };
  /** true while a text box (cheat console) has focus: game keys are ignored */
  typing = false;
  down = false; // heli descend (Shift / DOWN button)

  constructor(private touchRoot: HTMLElement) {
    addEventListener('keydown', e => {
      if (this.typing || (e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
      if (!e.repeat && this.bindings[e.code]) this.pressed.add(this.bindings[e.code]);
      this.keys.add(e.code);
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    this.touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.setupTouch();
  }

  /** consume a one-shot action */
  take(a: Action) { const h = this.pressed.has(a); this.pressed.delete(a); return h; }
  press(a: Action) { this.pressed.add(a); }

  private setupTouch() {
    const root = this.touchRoot;
    const stick = root.querySelector('#joy') as HTMLElement, knob = root.querySelector('#joyKnob') as HTMLElement;
    const zone = root.querySelector('#joyZone') as HTMLElement;
    zone.addEventListener('pointerdown', e => {
      this.joy = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY };
      stick.style.left = e.clientX + 'px'; stick.style.top = e.clientY + 'px'; stick.classList.add('on');
      try { zone.setPointerCapture(e.pointerId); } catch { /* capture is best-effort */ } e.preventDefault();
    });
    zone.addEventListener('pointermove', e => {
      if (e.pointerId !== this.joy.id) return;
      this.joy.x = e.clientX; this.joy.y = e.clientY;
      const dx = this.joy.x - this.joy.x0, dy = this.joy.y - this.joy.y0, l = Math.hypot(dx, dy), m = Math.min(l, 55) / (l || 1);
      knob.style.transform = `translate(${dx * m}px, ${dy * m}px)`;
    });
    const end = (e: PointerEvent) => { if (e.pointerId !== this.joy.id) return; this.joy.id = -1; knob.style.transform = ''; stick.classList.remove('on'); };
    zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);
    // look / orbit by dragging the right half of the screen
    const lookZone = root.querySelector('#lookZone') as HTMLElement;
    lookZone.addEventListener('pointerdown', e => { this.look = { id: e.pointerId, x: e.clientX, y: e.clientY }; try { lookZone.setPointerCapture(e.pointerId); } catch { /* best-effort */ } });
    lookZone.addEventListener('pointermove', e => {
      if (e.pointerId !== this.look.id) return;
      this.lookX += (e.clientX - this.look.x) * 1.4; this.lookY += (e.clientY - this.look.y) * 1.4; // raw pixels, scaled by the camera
      this.look.x = e.clientX; this.look.y = e.clientY;
    });
    const lend = (e: PointerEvent) => { if (e.pointerId === this.look.id) this.look.id = -1; };
    lookZone.addEventListener('pointerup', lend); lookZone.addEventListener('pointercancel', lend);
    const hold = (id: string, set: (v: boolean) => void) => {
      const b = root.querySelector(id) as HTMLElement;
      b.addEventListener('pointerdown', e => { set(true); b.classList.add('on'); try { b.setPointerCapture(e.pointerId); } catch { /* best-effort */ } e.preventDefault(); });
      const up = () => { set(false); b.classList.remove('on'); };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
    };
    hold('#bBrake', v => { this.touchBrake = v; if (v) this.pressed.add('jump'); }); hold('#bBoost', v => (this.touchBoost = v)); hold('#bHorn', v => (this.touchHorn = v));
    const tap = (id: string, a: Action) => (root.querySelector(id) as HTMLElement).addEventListener('pointerdown', e => { this.pressed.add(a); e.preventDefault(); });
    tap('#bEnter', 'enter'); tap('#bCam', 'camera'); tap('#bAct', 'interact'); tap('#bMap', 'map'); tap('#bMenu', 'pause'); tap('#bReset', 'reset');
  }

  get horn() { return this.keys.has('KeyH') || this.touchHorn || this.padButton(4); }

  private padButton(i: number) { const p = navigator.getGamepads?.()[0]; return !!p && !!p.buttons[i] && p.buttons[i].pressed; }

  /** call once per frame */
  poll() {
    const k = this.keys;
    let t = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    let s = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    this.handbrake = k.has('Space') || this.touchBrake;
    this.boost = k.has('ShiftLeft') || k.has('ShiftRight') || this.touchBoost;
    this.down = k.has('ShiftLeft') || k.has('ShiftRight') || k.has('ControlLeft') || this.touchBoost;
    if (this.joy.id >= 0) {
      const dx = (this.joy.x - this.joy.x0) / 55, dy = (this.joy.y - this.joy.y0) / 55;
      s = Math.max(-1, Math.min(1, dx)); t = Math.max(-1, Math.min(1, -dy));
      if (Math.abs(s) < 0.12) s = 0; if (Math.abs(t) < 0.12) t = 0;
    }
    const pad = navigator.getGamepads?.()[0];
    if (pad && t === 0 && s === 0) {
      s = Math.abs(pad.axes[0]) > 0.15 ? pad.axes[0] : 0;
      const rt = pad.buttons[7]?.value || 0, lt = pad.buttons[6]?.value || 0;
      t = rt - lt || (Math.abs(pad.axes[1]) > 0.15 ? -pad.axes[1] : 0);
      if (pad.buttons[0]?.pressed) this.handbrake = true;
      if (pad.buttons[5]?.pressed) this.boost = true;
      if (Math.abs(pad.axes[2]) > 0.15) this.lookX += pad.axes[2] * 18;
      if (Math.abs(pad.axes[3]) > 0.15) this.lookY += pad.axes[3] * 18;
      const map: [number, Action][] = [[3, 'enter'], [2, 'interact'], [1, 'camera'], [8, 'map'], [9, 'pause']];
      for (const [b, a] of map) { const on = !!pad.buttons[b]?.pressed; if (on && !this.padPrev[b]) this.pressed.add(a); this.padPrev[b] = on; }
    }
    this.throttle = t; this.steer = s;
  }
  private padPrev: boolean[] = [];

  consumeLook(): [number, number] { const r: [number, number] = [this.lookX, this.lookY]; this.lookX = 0; this.lookY = 0; return r; }
  mouseLook(dx: number, dy: number) { this.lookX += dx; this.lookY += dy; }
}
