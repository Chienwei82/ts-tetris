import { fetchLeaderboard, LeaderboardError } from '../leaderboard/client.js';
import type { GameMode, LeaderboardResponse, ScoreEntry } from '../leaderboard/types.js';

export interface ScoreboardOptions {
  root: HTMLElement;
  playerId: string;
  onOpenChange?: (open: boolean) => void;
}

function element<T extends HTMLElement>(root: HTMLElement, id: string): T {
  const found = root.querySelector<T>('#' + id);
  if (!found) throw new Error('missing #' + id);
  return found;
}

function span(className: string, text: string): HTMLSpanElement {
  const node = document.createElement('span');
  node.className = className;
  node.textContent = text;
  return node;
}

function dateLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function errorMessage(error: unknown): string {
  if (error instanceof LeaderboardError) {
    if (error.code === 'network') return 'Sin conexión con la clasificación.';
    if (error.code === 'timeout') return 'El servidor tardó demasiado. Prueba a actualizar.';
    if (error.code === 'rate_limited') return error.message;
    return error.message || 'No se pudo cargar la clasificación.';
  }
  return 'No se pudo cargar la clasificación.';
}

/**
 * Overlay del ranking. Las pestañas Tradicional y Caos consultan tableros
 * distintos y nunca se mezclan. Los fallos de red se muestran en el propio
 * panel: jugar nunca depende de esta vista.
 */
export class Scoreboard {
  private readonly root: HTMLElement;
  private readonly playerId: string;
  private readonly onOpenChange: (open: boolean) => void;
  private readonly tabClassic: HTMLButtonElement;
  private readonly tabChaos: HTMLButtonElement;
  private readonly list: HTMLOListElement;
  private readonly statusEl: HTMLElement;
  private readonly meEl: HTMLElement;
  private readonly refreshBtn: HTMLButtonElement;
  private readonly closeBtn: HTMLButtonElement;
  private readonly onKeyDown: (event: KeyboardEvent) => void;

  private mode: GameMode = 'classic';
  private open = false;
  private requestSeq = 0;

  constructor(options: ScoreboardOptions) {
    this.root = options.root;
    this.playerId = options.playerId;
    this.onOpenChange = options.onOpenChange ?? (() => {});
    this.tabClassic = element<HTMLButtonElement>(this.root, 'sb-tab-classic');
    this.tabChaos = element<HTMLButtonElement>(this.root, 'sb-tab-chaos');
    this.list = element<HTMLOListElement>(this.root, 'sb-list');
    this.statusEl = element<HTMLElement>(this.root, 'sb-status');
    this.meEl = element<HTMLElement>(this.root, 'sb-me');
    this.refreshBtn = element<HTMLButtonElement>(this.root, 'btn-sb-refresh');
    this.closeBtn = element<HTMLButtonElement>(this.root, 'btn-sb-close');

    this.tabClassic.addEventListener('click', () => this.choose('classic'));
    this.tabChaos.addEventListener('click', () => this.choose('chaos'));
    this.refreshBtn.addEventListener('click', () => { void this.load(); });
    this.closeBtn.addEventListener('click', () => this.close());

    this.onKeyDown = (event) => {
      if (!this.open || event.key !== 'Escape') return;
      event.preventDefault();
      this.close();
    };
    window.addEventListener('keydown', this.onKeyDown);
  }

  isOpen(): boolean { return this.open; }

  openAt(mode?: GameMode): void {
    if (mode) this.mode = mode;
    this.open = true;
    this.root.classList.remove('hidden-overlay');
    this.syncTabs();
    this.onOpenChange(true);
    void this.load();
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    this.requestSeq++;
    this.root.classList.add('hidden-overlay');
    this.onOpenChange(false);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
  }

  private choose(mode: GameMode): void {
    this.mode = mode;
    this.syncTabs();
    void this.load();
  }

  private syncTabs(): void {
    const classic = this.mode === 'classic';
    this.tabClassic.setAttribute('aria-selected', String(classic));
    this.tabChaos.setAttribute('aria-selected', String(!classic));
    this.tabClassic.classList.toggle('active', classic);
    this.tabChaos.classList.toggle('active', !classic);
  }

  private async load(): Promise<void> {
    const seq = ++this.requestSeq;
    this.list.replaceChildren();
    this.meEl.textContent = '';
    this.statusEl.textContent = 'Cargando clasificación…';
    this.statusEl.classList.remove('error');
    try {
      const data = await fetchLeaderboard(this.mode, { playerId: this.playerId });
      if (seq !== this.requestSeq || !this.open) return;
      this.render(data);
    } catch (error) {
      if (seq !== this.requestSeq || !this.open) return;
      this.statusEl.textContent = errorMessage(error);
      this.statusEl.classList.add('error');
    }
  }

  private render(data: LeaderboardResponse): void {
    const rows = data.entries.map((entry, index) => this.renderRow(entry, index + 1, data));
    this.list.replaceChildren(...rows);
    if (data.entries.length === 0) {
      this.statusEl.textContent = 'Aún no hay marcas en este modo. ¡Sé el primero!';
    } else {
      this.statusEl.textContent = data.total + (data.total === 1 ? ' partida guardada' : ' partidas guardadas');
    }
    this.statusEl.classList.remove('error');
    if (data.me && data.me.rank !== null) {
      this.meEl.textContent = 'Tu mejor: #' + data.me.rank + ' · ' + data.me.entry.score.toLocaleString('es') + ' pts';
    } else if (data.me) {
      this.meEl.textContent = 'Tu mejor: ' + data.me.entry.score.toLocaleString('es') + ' pts (fuera de la tabla)';
    } else {
      this.meEl.textContent = '';
    }
  }

  private renderRow(entry: ScoreEntry, rank: number, data: LeaderboardResponse): HTMLLIElement {
    const row = document.createElement('li');
    const isMe = data.me !== undefined && data.me.entry.id === entry.id;
    row.className = 'sb-row' + (isMe ? ' me' : '');
    row.append(
      span('sb-rank', '#' + rank),
      span('sb-nick', entry.nickname),
      span('sb-score', entry.score.toLocaleString('es')),
      span('sb-level', 'Nv.' + entry.level),
      span('sb-lines', entry.lines + ' l'),
      span('sb-date', dateLabel(entry.createdAt))
    );
    return row;
  }
}
