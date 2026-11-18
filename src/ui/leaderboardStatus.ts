/**
 * Estado visual de la clasificación en la tarjeta de inicio/pausa. Nunca
 * oculta ni deshabilita los botones: solo muestra un aviso y enriquece sus
 * etiquetas accesibles mientras dura la caída del API.
 */
export interface LeaderboardStatusOptions {
  warning: HTMLElement;
  buttons: readonly HTMLButtonElement[];
}

export class LeaderboardStatus {
  private readonly warning: HTMLElement;
  private readonly buttons: readonly HTMLButtonElement[];
  private readonly labels = new Map<HTMLButtonElement, { title: string; aria: string }>();
  private shown = false;

  constructor(options: LeaderboardStatusOptions) {
    this.warning = options.warning;
    this.buttons = options.buttons;
    for (const button of this.buttons) {
      this.labels.set(button, {
        title: button.title,
        aria: button.getAttribute('aria-label') ?? (button.title || 'Top de Puntajes')
      });
    }
  }

  isShown(): boolean { return this.shown; }

  show(message: string): void {
    this.warning.textContent = '⚠️ ' + message;
    this.warning.classList.remove('hidden');
    this.shown = true;
    for (const button of this.buttons) {
      const label = this.labels.get(button);
      if (!label) continue;
      button.classList.add('offline');
      button.title = label.title + ' · clasificación no disponible';
      button.setAttribute('aria-label', label.aria + ' (clasificación no disponible)');
    }
  }

  hide(): void {
    this.warning.classList.add('hidden');
    this.warning.textContent = '';
    this.shown = false;
    for (const button of this.buttons) {
      const label = this.labels.get(button);
      if (!label) continue;
      button.classList.remove('offline');
      button.title = label.title;
      button.setAttribute('aria-label', label.aria);
    }
  }
}
