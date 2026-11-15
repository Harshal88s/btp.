// Interactive controls tutorial: one control per step, highlights the real on-screen button (phones) or
// shows the key caps (desktop), detects when the player actually performs the action, Next / Back / Skip.
export interface TutStep {
  title: string; text: string; touchText?: string;
  keys?: string[]; touchKeys?: string[];
  highlight?: string[]; touchHighlight?: string[];
  done?: () => boolean;
}

export class Tutorial {
  private i = 0; private hi: HTMLElement[] = []; private doneShown = false;
  active = false;
  constructor(private steps: TutStep[], private touch: boolean, private onEnd: (skipped: boolean) => void) {
    const $ = (id: string) => document.getElementById(id)!;
    $('tutNext').onclick = () => this.go(this.i + 1);
    $('tutBack').onclick = () => this.go(this.i - 1);
    $('tutSkip').onclick = () => this.end(true);
  }
  start() { this.active = true; document.getElementById('tutorial')!.classList.remove('hidden'); this.go(0); }
  private clearHi() { for (const e of this.hi) e.classList.remove('tutHi'); this.hi = []; }
  private go(i: number) {
    if (i >= this.steps.length) { this.end(false); return; }
    this.i = Math.max(0, i); this.doneShown = false;
    const s = this.steps[this.i], $ = (id: string) => document.getElementById(id)!;
    $('tutStep').textContent = 'STEP ' + (this.i + 1) + ' OF ' + this.steps.length;
    $('tutTitle').textContent = s.title;
    $('tutText').textContent = this.touch && s.touchText ? s.touchText : s.text;
    const keys = this.touch ? s.touchKeys : s.keys;
    $('tutKeys').innerHTML = (keys || []).map(k => `<span class="kc">${k}</span>`).join('');
    $('tutCheck').textContent = s.done ? 'Try it now…' : '';
    ($('tutCheck') as HTMLElement).style.color = '#aab0bb';
    $('tutBack').style.visibility = this.i === 0 ? 'hidden' : 'visible';
    $('tutNext').innerHTML = this.i === this.steps.length - 1 ? 'Start playing!' : 'Next &rarr;';
    this.clearHi();
    for (const sel of (this.touch ? s.touchHighlight : s.highlight) || []) {
      document.querySelectorAll<HTMLElement>(sel).forEach(e => { e.classList.add('tutHi'); this.hi.push(e); });
    }
    const card = $('tutCard'); card.style.animation = 'none'; void card.offsetWidth; card.style.animation = '';
  }
  /** call every frame: ticks the step once the player has done it */
  update() {
    if (!this.active || this.doneShown) return;
    const s = this.steps[this.i];
    if (s.done && s.done()) {
      this.doneShown = true;
      const c = document.getElementById('tutCheck')!; c.textContent = '✔ Well done! Press Next.'; (c as HTMLElement).style.color = '#6ef07f';
    }
  }
  private end(skipped: boolean) {
    this.active = false; this.clearHi();
    document.getElementById('tutorial')!.classList.add('hidden');
    this.onEnd(skipped);
  }
  get step() { return this.i; }
}
