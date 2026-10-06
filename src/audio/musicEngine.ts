/**
 * MusicEngine: motor de audio 100 % WebAudio (osciladores, filtros, envolventes,
 * delay con feedback) + scheduler lookahead "tale of two clocks": un setInterval
 * solo programa notas con `AudioContext.currentTime` por delante; nunca es el
 * reloj del audio. Los cambios de intensidad/tempo se aplican al inicio del
 * compás siguiente con rampas, para que ninguna transición suene brusca.
 */
import {
  ARP_GAIN, BARS_PER_CHORD, BASS_GAIN, CUTOFF_MIN_HZ, DELAY_FEEDBACK, DELAY_FILTER_HZ,
  DELAY_TIME_S, DRUM_GAIN, FADE_IN_S, LOOKAHEAD_S, MASTER_PEAK, PAD_ATTACK_S,
  PAD_DETUNE_CENTS, PAD_GAIN, PAD_RELEASE_S, STEPS_PER_BAR, TICK_MS,
} from './musicConstants.js';
import {
  barPattern, chordForBar, clamp01, cutoffFor, freqForDegree,
  layersForIntensity, maskDensityFor, tempoFor,
} from './musicPatterns.js';
import type { BarPattern, LayerGates } from './musicPatterns.js';
import { mulberry32 } from './musicRng.js';

/* Envolventes de las voces de percusión/ataque (segundos / Hz). */
const KICK_START_HZ = 120;
const KICK_END_HZ = 45;
const KICK_DECAY_S = 0.18;
const KICK_LEVEL = 0.8;
const HAT_HP_HZ = 6500;
const HAT_DECAY_S = 0.05;
const HAT_LEVEL = 0.35;
const BASS_LEVEL = 0.9;
const ARP_LEVEL = 0.7;
const PAD_BODY_LEVEL = 0.14;
const PAD_AIR_LEVEL = 0.08;
const SEND_LEVEL = 0.35;
const NOISE_SECONDS = 1;

export class MusicEngine {
  private readonly ctx: AudioContext;
  private readonly master: GainNode;
  private readonly compressor: DynamicsCompressorNode;
  private readonly padBus: GainNode;
  private readonly bassBus: GainNode;
  private readonly arpBus: GainNode;
  private readonly drumBus: GainNode;
  private readonly brightness: BiquadFilterNode[] = [];
  private readonly noise: AudioBuffer;
  private readonly sources = new Set<AudioScheduledSourceNode>();
  private timer = 0;
  private nextStepTime = 0;
  private step = 0;
  private seed = 1;
  private intensity = 0;
  private stepDur = 60 / tempoFor(0) / 4;
  private gates: LayerGates = { bass: false, arpeggio: false, drums: false };
  private density = maskDensityFor(0);
  private pattern: BarPattern | null = null;
  private padUntil = 0;
  private hatCount = 0;
  private _running = false;

  constructor() {
    const AC = window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AC();
    /* Salida: master gain (volumen moderado) + compresor como limitador. */
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.0001;
    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -18;
    this.compressor.knee.value = 12;
    this.compressor.ratio.value = 6;
    this.compressor.attack.value = 0.005;
    this.compressor.release.value = 0.25;
    this.master.connect(this.compressor);
    this.compressor.connect(this.ctx.destination);

    this.padBus = this.createBus(PAD_GAIN);
    this.bassBus = this.createBus(BASS_GAIN);
    this.arpBus = this.createBus(ARP_GAIN);
    this.drumBus = this.ctx.createGain();
    this.drumBus.gain.value = DRUM_GAIN;
    this.drumBus.connect(this.master);

    /* "Reverb" simple: delay con feedback filtrado sobre el arpegio. */
    const send = this.ctx.createGain();
    send.gain.value = SEND_LEVEL;
    const delay = this.ctx.createDelay(1);
    delay.delayTime.value = DELAY_TIME_S;
    const fb = this.ctx.createGain();
    fb.gain.value = DELAY_FEEDBACK;
    const dfilter = this.ctx.createBiquadFilter();
    dfilter.type = 'lowpass';
    dfilter.frequency.value = DELAY_FILTER_HZ;
    this.arpBus.connect(send);
    send.connect(delay);
    delay.connect(dfilter);
    dfilter.connect(fb);
    fb.connect(delay);
    dfilter.connect(this.master);

    this.noise = this.createNoise();
  }

  get running(): boolean {
    return this._running;
  }
  /** Arranca la canción desde el compás 0 con una semilla dada. */
  start(seed: number, intensity: number): void {
    this.seed = seed >>> 0;
    this.intensity = clamp01(intensity);
    this.step = 0;
    this.pattern = null;
    this.padUntil = 0;
    this.stepDur = 60 / tempoFor(this.intensity) / 4;
    void this.ctx.resume();
    const t = this.ctx.currentTime;
    this.nextStepTime = t + 0.08;
    this.fadeMaster(MASTER_PEAK, FADE_IN_S, t);
    this._running = true;
    this.startScheduler();
  }

  /** Continúa donde quedó (toggle/pausa/pestaña): fade-in y reenganche del pad. */
  resumePlayback(): void {
    void this.ctx.resume();
    const t = this.ctx.currentTime;
    this.nextStepTime = t + 0.08;
    this.fadeMaster(MASTER_PEAK, FADE_IN_S, t);
    this._running = true;
    const barDur = this.stepDur * STEPS_PER_BAR;
    this.ensurePad(t, chordForBar(Math.floor(this.step / STEPS_PER_BAR)), barDur * BARS_PER_CHORD * 0.9);
    this.startScheduler();
  }

  /** Fade-out y parada del scheduler (conserva el punto de reanudación). */
  stop(fadeSeconds: number): void {
    this._running = false;
    this.fadeMaster(0.0001, fadeSeconds, this.ctx.currentTime);
    this.stopScheduler();
  }

  /**
   * Cierre suave: tríada de tónica + arpegio descendente + fundido largo.
   * Se usa al terminar la partida (ganar o perder) en lugar de cortar en seco.
   */
  resolveEnding(): void {
    if (!this._running) return;
    this._running = false;
    this.stopScheduler();
    const barDur = this.stepDur * STEPS_PER_BAR;
    const t = this.ctx.currentTime + 0.05;
    const chord = chordForBar(Math.floor(this.step / STEPS_PER_BAR));
    this.schedulePad(t, barDur * 1.4, chord);
    this.scheduleBass(t, barDur, chord[0] ?? 0);
    this.scheduleArp(t + barDur * 0.25, barDur * 0.9, (chord[2] ?? 0) + 7, 0.5);
    this.scheduleArp(t + barDur * 0.8, barDur * 0.9, chord[0] ?? 0, 0.45);
    this.fadeMaster(0.0001, FADE_IN_S * 3, t + barDur * 1.2);
  }

  /** Nueva intensidad objetivo: se aplica con rampas al inicio del compás. */
  setIntensity(value: number): void {
    this.intensity = clamp01(value);
  }

  /** Pestaña oculta: suspende el contexto y ahorra CPU de verdad. */
  setHidden(hidden: boolean): void {
    if (hidden) {
      this.stopScheduler();
      this.fadeMaster(0.0001, 0.15, this.ctx.currentTime);
      void this.ctx.suspend();
    } else {
      void this.ctx.resume();
      if (this._running) this.resumePlayback();
    }
  }

  /** Libera todo: para fuentes, desconecta nodos y cierra el contexto. */
  dispose(): void {
    this.stopScheduler();
    for (const src of this.sources) {
      try { src.onended = null; src.stop(); } catch { /* ya detenida */ }
      try { src.disconnect(); } catch { /* ignore */ }
    }
    this.sources.clear();
    for (const n of [this.padBus, this.bassBus, this.arpBus, this.drumBus,
      this.master, this.compressor, ...this.brightness]) {
      try { n.disconnect(); } catch { /* ignore */ }
    }
    this.brightness.length = 0;
    void this.ctx.close().catch(() => { /* ignore */ });
  }

  /* ---------------- scheduler (reloj de control + lookahead) ---------------- */

  private readonly tick = (): void => {
    const horizon = this.ctx.currentTime + LOOKAHEAD_S;
    while (this.nextStepTime < horizon) {
      this.scheduleStep(this.step, this.nextStepTime);
      this.step += 1;
      this.nextStepTime += this.stepDur;
    }
  };

  private startScheduler(): void {
    if (this.timer) return;
    this.tick();
    this.timer = window.setInterval(this.tick, TICK_MS);
  }

  private stopScheduler(): void {
    if (!this.timer) return;
    window.clearInterval(this.timer);
    this.timer = 0;
  }

  /** Al inicio de cada compás: patrón nuevo + ajuste cuantizado de intensidad. */
  private beginBar(bar: number, at: number): void {
    this.pattern = barPattern(this.seed, bar);
    this.applyIntensity(at);
    this.stepDur = 60 / tempoFor(this.intensity) / 4;
    if (bar % BARS_PER_CHORD === 0) {
      const barDur = this.stepDur * STEPS_PER_BAR;
      this.ensurePad(at, this.pattern.chord, barDur * BARS_PER_CHORD * 0.9);
    }
  }

  private scheduleStep(step: number, at: number): void {
    const inStep = step % STEPS_PER_BAR;
    if (inStep === 0) this.beginBar(Math.floor(step / STEPS_PER_BAR), at);
    const p = this.pattern;
    if (!p) return;
    const stepDur = this.stepDur;
    if (this.gates.bass) {
      for (const b of p.bass) {
        if (b.step === inStep && b.threshold < this.density) {
          this.scheduleBass(at, stepDur * 3.5, p.chord[0] ?? 0);
        }
      }
    }
    if (this.gates.arpeggio) {
      for (const a of p.arpeggio) {
        if (a.step === inStep && a.threshold < this.density) {
          this.scheduleArp(at, stepDur * 2.2, a.degree, a.velocity);
        }
      }
    }
    if (this.gates.drums) {
      for (const k of p.kick) {
        if (k.step === inStep && k.threshold < this.density) this.scheduleKick(at);
      }
      for (const h of p.hat) {
        if (h.step === inStep && h.threshold < this.density) this.scheduleHat(at);
      }
    }
  }

  /** Aplica intensidad → tempo, brillo y ganancias de capa, todo con rampas. */
  private applyIntensity(at: number): void {
    const v = this.intensity;
    const cutoff = cutoffFor(v);
    for (const f of this.brightness) f.frequency.setTargetAtTime(cutoff, at, 0.4);
    this.gates = layersForIntensity(v);
    this.density = maskDensityFor(v);
    this.padBus.gain.setTargetAtTime(PAD_GAIN * (0.75 + 0.25 * v), at, 0.6);
    this.bassBus.gain.setTargetAtTime(this.gates.bass ? BASS_GAIN : 0.0001, at, 0.6);
    this.arpBus.gain.setTargetAtTime(this.gates.arpeggio ? ARP_GAIN : 0.0001, at, 0.6);
    this.drumBus.gain.setTargetAtTime(this.gates.drums ? DRUM_GAIN : 0.0001, at, 0.6);
  }
  /* ------------------------------- voces ---------------------------------- */

  private ensurePad(at: number, chord: number[], dur: number): void {
    // El pad es continuo: no reenganchar si aún está sonando el actual.
    if (at < this.padUntil - 0.3) return;
    this.schedulePad(at, dur, chord);
  }

  private schedulePad(at: number, dur: number, chord: number[]): void {
    this.padUntil = at + dur;
    for (const degree of chord) {
      for (const octave of [0, 7]) {
        const freq = freqForDegree(degree + octave);
        const level = octave === 0 ? PAD_BODY_LEVEL : PAD_AIR_LEVEL;
        for (const detune of [-PAD_DETUNE_CENTS, PAD_DETUNE_CENTS]) {
          const osc = this.ctx.createOscillator();
          const g = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = freq;
          osc.detune.value = detune;
          g.gain.setValueAtTime(0.0001, at);
          g.gain.linearRampToValueAtTime(level, at + PAD_ATTACK_S);
          g.gain.setTargetAtTime(0.0001, at + dur, PAD_RELEASE_S / 3);
          osc.connect(g);
          g.connect(this.padBus);
          osc.start(at);
          osc.stop(at + dur + PAD_RELEASE_S * 1.5);
          this.trackVoice(osc, g);
        }
      }
    }
  }

  private scheduleBass(at: number, dur: number, degree: number): void {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freqForDegree(degree);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(BASS_LEVEL, at + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(g);
    g.connect(this.bassBus);
    osc.start(at);
    osc.stop(at + dur + 0.05);
    this.trackVoice(osc, g);
  }

  private scheduleArp(at: number, dur: number, degree: number, velocity: number): void {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freqForDegree(degree + 7);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(0.02, velocity * ARP_LEVEL), at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(g);
    g.connect(this.arpBus);
    osc.start(at);
    osc.stop(at + dur + 0.05);
    this.trackVoice(osc, g);
  }

  private scheduleKick(at: number): void {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(KICK_START_HZ, at);
    osc.frequency.exponentialRampToValueAtTime(KICK_END_HZ, at + 0.12);
    g.gain.setValueAtTime(KICK_LEVEL, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + KICK_DECAY_S);
    osc.connect(g);
    g.connect(this.drumBus);
    osc.start(at);
    osc.stop(at + KICK_DECAY_S + 0.05);
    this.trackVoice(osc, g);
  }

  private scheduleHat(at: number): void {
    const src = this.ctx.createBufferSource();
    const hp = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();
    src.buffer = this.noise;
    hp.type = 'highpass';
    hp.frequency.value = HAT_HP_HZ;
    g.gain.setValueAtTime(HAT_LEVEL, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + HAT_DECAY_S);
    src.connect(hp);
    hp.connect(g);
    g.connect(this.drumBus);
    // Offset variable dentro del buffer de ruido: menos mecánico (solo timbre).
    const offset = (this.hatCount % 7) * 0.11;
    this.hatCount += 1;
    src.start(at, offset);
    src.stop(at + HAT_DECAY_S + 0.05);
    this.trackVoice(src, g, hp);
  }

  /* ------------------------------ utilidades ------------------------------ */

  private createBus(gainValue: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = gainValue;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = CUTOFF_MIN_HZ;
    filter.Q.value = 0.7;
    g.connect(filter);
    filter.connect(this.master);
    this.brightness.push(filter);
    return g;
  }

  /** Ruido blanco generado una vez con el RNG (no es un sample externo). */
  private createNoise(): AudioBuffer {
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * NOISE_SECONDS));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    const rng = mulberry32(0x5eed);
    for (let i = 0; i < len; i++) data[i] = rng() * 2 - 1;
    return buf;
  }

  private fadeMaster(target: number, seconds: number, at: number): void {
    const g = this.master.gain;
    const from = Math.max(0.0001, g.value);
    g.cancelScheduledValues(at);
    g.setValueAtTime(from, at);
    g.linearRampToValueAtTime(Math.max(0.0001, target), at + Math.max(0.02, seconds));
  }

  /** Registra una fuente y libera sus nodos al terminar (sin fugas). */
  private trackVoice(src: AudioScheduledSourceNode, ...nodes: AudioNode[]): void {
    this.sources.add(src);
    src.onended = () => {
      this.sources.delete(src);
      for (const n of nodes) {
        try { n.disconnect(); } catch { /* ignore */ }
      }
      try { src.disconnect(); } catch { /* ignore */ }
    };
  }
}