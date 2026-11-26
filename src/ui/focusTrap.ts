/** Selector de elementos que pueden recibir foco por teclado. */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export interface FocusTrap {
  /** Quita la trampa y devuelve el foco al elemento que abrió el diálogo. */
  release(): void;
}

/**
 * Atrapa el foco dentro de un diálogo modal mientras está abierto:
 * - mueve el foco al primer control (o al preferido),
 * - hace que Tab/Shift+Tab ciclen sin salir del diálogo,
 * - al cerrar, devuelve el foco a donde estaba.
 *
 * Sin esto, con el teclado se podía tabular por detrás del modal y el foco se
 * perdía al cerrarlo. Es independiente del framework: solo usa DOM.
 */
export function trapFocus(root: HTMLElement, prefer?: HTMLElement | null): FocusTrap {
  const active = document.activeElement;
  const previous = active instanceof HTMLElement && active !== document.body ? active : null;
  if (root.tabIndex < 0) root.tabIndex = -1;

  const items = (): HTMLElement[] =>
    Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.getClientRects().length > 0
    );

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Tab') return;
    const list = items();
    if (list.length === 0) {
      event.preventDefault();
      root.focus();
      return;
    }
    const first = list[0]!;
    const last = list[list.length - 1]!;
    const current = document.activeElement;
    const outside = !(current instanceof HTMLElement) || !root.contains(current);
    if (event.shiftKey && (current === first || outside)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (current === last || outside)) {
      event.preventDefault();
      first.focus();
    }
  };

  root.addEventListener('keydown', onKeyDown);
  (prefer ?? items()[0] ?? root).focus();

  return {
    release(): void {
      root.removeEventListener('keydown', onKeyDown);
      if (previous && document.contains(previous)) previous.focus();
    },
  };
}
