/**
 * Роль: Коммутатор (Bus).
 * Доставляет неизменяемые события n-n подписчикам.
 * Политика доставки: синхронная с FIFO-очередью при реентрантной публикации.
 * Предметных вычислений и игрового состояния не содержит.
 */

import type { IEventBus, Unsubscribe } from '../contracts/actions.ts';
import type { GameEvent } from '../contracts/messages.ts';

type TypedListener = (event: GameEvent) => void;

export class EventBus implements IEventBus {
  private readonly byType = new Map<GameEvent['type'], Set<TypedListener>>();
  private readonly wildcard = new Set<TypedListener>();
  private readonly queue: GameEvent[] = [];
  private delivering = false;

  subscribe<T extends GameEvent['type']>(
    type: T,
    listener: (event: Extract<GameEvent, { readonly type: T }>) => void
  ): Unsubscribe {
    let bucket = this.byType.get(type);
    if (!bucket) {
      bucket = new Set<TypedListener>();
      this.byType.set(type, bucket);
    }
    const wrapped = listener as TypedListener;
    bucket.add(wrapped);
    return () => {
      bucket?.delete(wrapped);
      if (bucket && bucket.size === 0) {
        this.byType.delete(type);
      }
    };
  }

  subscribeAll(listener: (event: GameEvent) => void): Unsubscribe {
    this.wildcard.add(listener);
    return () => {
      this.wildcard.delete(listener);
    };
  }

  publish(event: GameEvent): void {
    this.queue.push(event);
    if (this.delivering) {
      return;
    }

    this.delivering = true;
    try {
      while (this.queue.length > 0) {
        const next = this.queue.shift()!;
        const typedListeners = this.byType.get(next.type);
        if (typedListeners) {
          for (const listener of Array.from(typedListeners)) {
            listener(next);
          }
        }
        for (const listener of Array.from(this.wildcard)) {
          listener(next);
        }
      }
    } finally {
      this.delivering = false;
    }
  }

  reset(): void {
    this.byType.clear();
    this.wildcard.clear();
    this.queue.length = 0;
    this.delivering = false;
  }
}
