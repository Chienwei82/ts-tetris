export class HUD {
  private scoreEl: HTMLElement;
  private levelEl: HTMLElement;
  private linesEl: HTMLElement;
  private toastEl: HTMLElement;
  private overlayEl: HTMLElement;
  private titleEl: HTMLElement;
  private subEl: HTMLElement;
  private statsEl: HTMLElement;
  private startOptionsEl: HTMLElement;
  private gaugeFillEl: HTMLElement;
  private gaugeCaptionEl: HTMLElement;
  private stageChipEl: HTMLElement;
  private bannerEl: HTMLElement;
  private bannerTitleEl: HTMLElement;
  private bannerSubEl: HTMLElement;
  private toastTimer = 0;
  private bannerTimer = 0;
  /* Last written values: the HUD is polled every frame, so identical updates skip the DOM. */
  private lastScore = Number.NaN;
  private lastLevel = Number.NaN;
  private lastLines = Number.NaN;
  private lastGaugeW = '';
  private lastGaugeClass = '';
  private lastGaugeCaption = '';
  constructor() {
    const q = (id: string): HTMLElement => {
      const el = document.getElementById(id);
      if (!el) throw new Error('missing #' + id);
      return el;
    };
    this.scoreEl = q('score'); this.levelEl = q('level'); this.linesEl = q('lines');
    this.toastEl = q('toast'); this.overlayEl = q('overlay');
    this.titleEl = q('overlay-title'); this.subEl = q('overlay-sub'); this.statsEl = q('overlay-stats');
    this.startOptionsEl = q('start-options');
    this.gaugeFillEl = q('gauge-fill'); this.gaugeCaptionEl = q('gauge-caption'); this.stageChipEl = q('stage-chip');
    this.bannerEl = q('level-banner'); this.bannerTitleEl = q('level-banner-title'); this.bannerSubEl = q('level-banner-sub');
  }
  setStats(score: number, level: number, lines: number): void {
    if (score !== this.lastScore) {
      this.lastScore = score;
      this.scoreEl.textContent = score.toLocaleString('es');
    }
    if (level !== this.lastLevel) {
      this.lastLevel = level;
      this.levelEl.textContent = String(level);
    }
    if (lines !== this.lastLines) {
      this.lastLines = lines;
      this.linesEl.textContent = String(lines);
    }
  }
  /** Difficulty gauge: fill ratio plus the rule that is currently ahead. */
  setLevelGauge(ratio: number, caption: string, source: 'lines' | 'time' | 'max'): void {
    // 0.1 % steps: identical strings are deduped below (sub-pixel width changes).
    const w = (Math.round(Math.max(0, Math.min(1, ratio)) * 1000) / 10).toFixed(1) + '%';
    if (w !== this.lastGaugeW) {
      this.lastGaugeW = w;
      this.gaugeFillEl.style.width = w;
    }
    if (source !== this.lastGaugeClass) {
      this.lastGaugeClass = source;
      this.gaugeFillEl.className = source;
    }
    if (caption !== this.lastGaugeCaption) {
      this.lastGaugeCaption = caption;
      this.gaugeCaptionEl.textContent = caption;
    }
  }
  setStageChip(text: string): void {
    if (this.stageChipEl.textContent !== text) this.stageChipEl.textContent = text;
  }
  /** Big paper banner shown on every level-up. */
  levelBanner(title: string, sub: string): void {
    this.bannerTitleEl.textContent = title;
    this.bannerSubEl.textContent = sub;
    this.bannerEl.classList.remove('hidden');
    this.bannerEl.classList.remove('show');
    void this.bannerEl.offsetWidth;
    this.bannerEl.classList.add('show');
    window.clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => {
      this.bannerEl.classList.add('hidden');
      this.bannerEl.classList.remove('show');
    }, 2500);
  }
  toast(msg: string, ms = 1600): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.remove('hidden');
    this.toastEl.classList.remove('pop');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('pop');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.add('hidden'), ms);
  }
  showOverlay(title: string, subHtml: string, statsHtml: string, showStartOptions = false): void {
    this.titleEl.textContent = title;
    this.subEl.innerHTML = subHtml;
    this.statsEl.innerHTML = statsHtml;
    this.startOptionsEl.classList.toggle('hidden', !showStartOptions);
    this.overlayEl.classList.remove('hidden-overlay');
  }
  hideOverlay(): void { this.overlayEl.classList.add('hidden-overlay'); }
}
