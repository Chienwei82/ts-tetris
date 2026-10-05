export type SoundName = 'move' | 'rotate' | 'lock' | 'clear' | 'tetris' | 'levelup' | 'harddrop' | 'hold' | 'gameover' | 'pause' | 'thunder';
export class SoundFX {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  enabled = true;
  private ensure(): AudioContext | null {
    if (!this.enabled) return null;
    try {
      if (!this.ctx) {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.18;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    } catch { return null; }
  }
  unlock(): void { this.ensure(); }
  private tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 1, when = 0, slide = 0): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide !== 0) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(this.master);
    osc.start(t0); osc.stop(t0 + dur + 0.05);
  }
  play(name: SoundName, lines = 1): void {
    if (!this.enabled) return;
    switch (name) {
      case 'move': this.tone(220, 0.05, 'square', 0.35); break;
      case 'rotate': this.tone(330, 0.07, 'square', 0.4, 0, 120); break;
      case 'lock': this.tone(140, 0.09, 'triangle', 0.8, 0, -40); break;
      case 'harddrop': this.tone(480, 0.12, 'sawtooth', 0.5, 0, -320); this.tone(120, 0.14, 'triangle', 0.9, 0.02); break;
      case 'clear': { const base = 440 + lines * 110; this.tone(base, 0.12, 'square', 0.5); this.tone(base * 1.335, 0.14, 'square', 0.5, 0.08); break; }
      case 'tetris': { const seq = [523, 659, 784, 1046]; seq.forEach((f, i) => this.tone(f, 0.16, 'square', 0.55, i * 0.09)); break; }
      case 'levelup': { const seq = [392, 523, 659, 784, 1046, 1318]; seq.forEach((f, i) => this.tone(f, 0.14, 'triangle', 0.6, i * 0.07)); break; }
      case 'hold': this.tone(300, 0.08, 'sine', 0.6, 0, 150); break;
      case 'pause': this.tone(260, 0.1, 'sine', 0.5); break;
      // Synth rumble for the storm flashes (no assets, WebAudio only).
      case 'thunder': this.tone(92, 0.5, 'sawtooth', 0.5, 0, -55); this.tone(58, 0.75, 'triangle', 0.8, 0.06, -18); break;
      case 'gameover': { const seq = [400, 350, 300, 220, 150]; seq.forEach((f, i) => this.tone(f, 0.22, 'sawtooth', 0.45, i * 0.14, -30)); break; }
    }
  }
}
