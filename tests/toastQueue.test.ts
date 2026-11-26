import { describe, expect, it } from 'vitest';
import { ToastQueue } from '../src/ui/toastQueue.js';

describe('ToastQueue', () => {
  it('devuelve los avisos en orden FIFO', () => {
    const q = new ToastQueue();
    q.push('primero', 1000);
    q.push('segundo', 2000);
    expect(q.size).toBe(2);
    expect(q.next()?.message).toBe('primero');
    expect(q.next()?.message).toBe('segundo');
    expect(q.next()).toBeNull();
  });

  it('conserva la duración de cada aviso (no la del primero)', () => {
    const q = new ToastQueue();
    q.push('crítico', 2200);
    q.push('rutina'); // por defecto 1600
    expect(q.next()).toEqual({ message: 'crítico', ms: 2200 });
    expect(q.next()).toEqual({ message: 'rutina', ms: 1600 });
  });

  it('clear vacía la cola pendiente', () => {
    const q = new ToastQueue();
    q.push('a', 500);
    q.push('b', 500);
    q.clear();
    expect(q.size).toBe(0);
    expect(q.next()).toBeNull();
  });

  it('normaliza duraciones negativas a 0', () => {
    const q = new ToastQueue();
    q.push('raro', -50);
    expect(q.next()?.ms).toBe(0);
  });
});
