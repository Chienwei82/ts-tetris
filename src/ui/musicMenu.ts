/** Menu de musica: toggle + selector de genero (accesible, tactil, sin dependencias). */
import type { GenreId } from '../audio/genreProfiles.js';
import { GENRE_IDS, GENRE_META } from '../audio/genreProfiles.js';
export interface MusicMenuOptions {
  readonly button: HTMLButtonElement;
  readonly enabled: boolean;
  readonly genre: GenreId;
  readonly onToggle: (on: boolean) => void;
  readonly onGenre: (genre: GenreId) => void;
}
export class MusicMenu {
  private readonly button: HTMLButtonElement;
  private readonly onToggle: (on: boolean) => void;
  private readonly onGenre: (genre: GenreId) => void;
  private enabled: boolean;
  private genre: GenreId;
  private panel: HTMLDivElement | null = null;
  private items: HTMLButtonElement[] = [];
  private focusIdx = 0;
  private readonly onDocPointer = (e: PointerEvent): void => { this.onOutside(e); };
  private readonly onDocKey = (e: KeyboardEvent): void => { this.onKey(e); };
  constructor(opts: MusicMenuOptions) {
    this.button = opts.button;
    this.enabled = opts.enabled;
    this.genre = opts.genre;
    this.onToggle = opts.onToggle;
    this.onGenre = opts.onGenre;
    this.button.setAttribute('aria-haspopup', 'menu');
    this.button.setAttribute('aria-expanded', 'false');
    this.button.addEventListener('click', () => { this.toggle(); });
  }
  isOpen(): boolean { return this.panel !== null; }
  setEnabled(on: boolean): void { this.enabled = on; this.refresh(); }
  setGenre(genre: GenreId): void { this.genre = genre; this.refresh(); }
  open(): void {
    if (this.panel) return;
    const panel = document.createElement('div');
    panel.id = 'music-menu';
    panel.setAttribute('role', 'menu');
    panel.setAttribute('aria-label', 'Musica procedural');
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.setAttribute('role', 'menuitemcheckbox');
    toggle.className = 'music-toggle';
    toggle.addEventListener('click', () => { this.onToggle(!this.enabled); });
    panel.appendChild(toggle);
    const sep = document.createElement('div');
    sep.className = 'music-sep';
    sep.setAttribute('aria-hidden', 'true');
    panel.appendChild(sep);
    const list = document.createElement('div');
    list.className = 'music-genres';
    list.setAttribute('role', 'group');
    list.setAttribute('aria-label', 'Genero musical');
    this.items = [];
    for (const id of GENRE_IDS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.genre = id;
      b.setAttribute('role', 'menuitemradio');
      b.addEventListener('click', () => { this.onGenre(id); });
      list.appendChild(b);
      this.items.push(b);
    }
    panel.appendChild(list);
    // Anclar junto a la bottom-bar, sin tapar controles: encima del boton.
    const host = this.button.parentElement ?? document.body;
    host.appendChild(panel);
    this.panel = panel;
    this.button.setAttribute('aria-expanded', 'true');
    this.refresh();
    this.focusIdx = this.enabled ? Math.max(0, GENRE_IDS.indexOf(this.genre)) : -1;
    document.addEventListener('pointerdown', this.onDocPointer, true);
    document.addEventListener('keydown', this.onDocKey, true);
    this.focusCurrent();
  }
  close(focusButton = false): void {
    if (!this.panel) return;
    this.panel.remove();
    this.panel = null;
    this.items = [];
    this.button.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', this.onDocPointer, true);
    document.removeEventListener('keydown', this.onDocKey, true);
    if (focusButton) this.button.focus();
  }
  toggle(): void { if (this.panel) this.close(); else this.open(); }
  private refresh(): void {
    if (!this.panel) return;
    const toggle = this.panel.querySelector('.music-toggle');
    if (toggle instanceof HTMLButtonElement) {
      toggle.textContent = (this.enabled ? 'Silenciar' : 'Activar') + ' musica';
      toggle.setAttribute('aria-checked', String(this.enabled));
    }
    for (const b of this.items) {
      const id = b.dataset.genre as GenreId;
      const meta = GENRE_META[id];
      const selected = id === this.genre;
      b.innerHTML = '';
      const dot = document.createElement('span');
      dot.className = 'music-dot';
      dot.setAttribute('aria-hidden', 'true');
      dot.textContent = selected ? '\u25CF' : '\u25CB';
      const name = document.createElement('span');
      name.textContent = meta.icon + ' ' + meta.label;
      b.append(dot, name);
      b.setAttribute('aria-checked', String(selected));
      b.classList.toggle('selected', selected);
      b.tabIndex = -1;
    }
  }
  private focusCurrent(): void {
    if (!this.panel) return;
    const toggle = this.panel.querySelector('.music-toggle');
    if (this.focusIdx < 0 && toggle instanceof HTMLButtonElement) { toggle.focus(); return; }
    const item = this.items[this.focusIdx];
    if (item) item.focus();
    else if (toggle instanceof HTMLButtonElement) toggle.focus();
  }
  private onOutside(e: PointerEvent): void {
    const t = e.target;
    if (!(t instanceof Node)) return;
    if (this.panel?.contains(t)) return;
    if (this.button.contains(t)) return;
    this.close();
  }
  private onKey(e: KeyboardEvent): void {
    if (!this.panel) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(true); return; }
    const count = this.items.length + 1; // toggle + generos
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); e.stopPropagation();
      const dir = e.key === 'ArrowDown' ? 1 : -1;
      this.focusIdx = ((this.focusIdx + 1 + dir + count) % count) - 1;
      this.focusCurrent();
    } else if (e.key === 'Home') { e.preventDefault(); this.focusIdx = -1; this.focusCurrent(); }
    else if (e.key === 'End') { e.preventDefault(); this.focusIdx = this.items.length - 1; this.focusCurrent(); }
    else if (e.key === 'Tab') { this.close(); }
  }
}
