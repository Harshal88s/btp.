// WebAudio synthesis: engine tone that follows speed, horns (car / auto / bike / bus), crash thump, UI chime.
export class Audio {
  ctx: AudioContext | null = null;
  private eng?: OscillatorNode; private eng2?: OscillatorNode; private engGain?: GainNode; private filt?: BiquadFilterNode;
  private hornUntil = 0; master?: GainNode;
  volume = 0.6;

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = (window.AudioContext || (window as any).webkitAudioContext);
    if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = this.volume; this.master.connect(c.destination);
    this.filt = c.createBiquadFilter(); this.filt.type = 'lowpass'; this.filt.frequency.value = 600;
    this.engGain = c.createGain(); this.engGain.gain.value = 0;
    this.eng = c.createOscillator(); this.eng.type = 'sawtooth'; this.eng.frequency.value = 40;
    this.eng2 = c.createOscillator(); this.eng2.type = 'square'; this.eng2.frequency.value = 20;
    const g2 = c.createGain(); g2.gain.value = 0.35;
    this.eng.connect(this.filt); this.eng2.connect(g2); g2.connect(this.filt); this.filt.connect(this.engGain); this.engGain.connect(this.master);
    this.eng.start(); this.eng2.start();
  }

  engine(on: boolean, rpm01: number, kind: string) {
    if (!this.ctx || !this.eng) return;
    const t = this.ctx.currentTime, base = kind === 'heli' ? 11 : kind === 'auto' ? 24 : kind === 'two' ? 34 : kind === 'heavy' ? 28 : 45;
    const f = base * (1 + rpm01 * 2.4);
    this.eng.frequency.setTargetAtTime(f, t, 0.05); this.eng2!.frequency.setTargetAtTime(f / 2, t, 0.05);
    this.filt!.frequency.setTargetAtTime(300 + rpm01 * 1400, t, 0.05);
    this.engGain!.gain.setTargetAtTime(on ? 0.12 + rpm01 * 0.1 : 0, t, 0.1);
  }

  horn(freq: number, gain = 0.18) {
    if (!this.ctx || this.ctx.currentTime < this.hornUntil) return;
    const c = this.ctx, t = c.currentTime; this.hornUntil = t + 0.35;
    const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.02); g.gain.setValueAtTime(gain, t + 0.32); g.gain.linearRampToValueAtTime(0, t + 0.4);
    g.connect(this.master!);
    for (const f of [freq, freq * 1.19]) { const o = c.createOscillator(); o.type = 'square'; o.frequency.value = f; o.connect(g); o.start(t); o.stop(t + 0.42); }
  }

  thump(strength: number) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime, len = 0.35, buf = c.createBuffer(1, Math.floor(c.sampleRate * len), c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / d.length * 6);
    const s = c.createBufferSource(); s.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
    const g = c.createGain(); g.gain.value = Math.min(0.6, strength * 0.05);
    s.connect(f); f.connect(g); g.connect(this.master!); s.start(t);
  }

  chime(ok = true) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime, notes = ok ? [523, 659, 784, 1047] : [392, 349, 311, 262];
    notes.forEach((f, i) => {
      const o = c.createOscillator(), g = c.createGain(); o.frequency.value = f;
      g.gain.setValueAtTime(0.15, t + i * 0.15); g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.15 + 0.4);
      o.connect(g); g.connect(this.master!); o.start(t + i * 0.15); o.stop(t + i * 0.15 + 0.45);
    });
  }
}
