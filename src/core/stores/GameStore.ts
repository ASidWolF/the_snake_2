/**
 * Роль: Хранилище (Store).
 * Держит текущее авторитетное состояние игры и сообщает подписчикам об изменении.
 * Игровых правил не содержит.
 */

import type { Unsubscribe } from '../contracts/actions.ts';
import type { GameSnapshot } from '../contracts/messages.ts';

export class GameStore {
  private snapshot: GameSnapshot;
  private readonly listeners = new Set<(snapshot: GameSnapshot) => void>();

  constructor(initial: GameSnapshot) {
    this.snapshot = initial;
  }

  getSnapshot(): GameSnapshot {
    return this.snapshot;
  }

  setState(next: GameSnapshot): void {
    if (next === this.snapshot) return;
    this.snapshot = next;
    for (const listener of Array.from(this.listeners)) {
      listener(this.snapshot);
    }
  }

  subscribe(listener: (snapshot: GameSnapshot) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
