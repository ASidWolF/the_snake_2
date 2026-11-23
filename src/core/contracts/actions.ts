/**
 * Адресные действия (интерфейсы) — вторая форма контракта архитектуры «чёрные ящики».
 */

import type { AudioSettings, GameEvent, GameSnapshot } from './messages.ts';

export type Unsubscribe = () => void;

export interface IEventBus {
  subscribe<T extends GameEvent['type']>(
    type: T,
    listener: (event: Extract<GameEvent, { readonly type: T }>) => void
  ): Unsubscribe;
  subscribeAll(listener: (event: GameEvent) => void): Unsubscribe;
  publish(event: GameEvent): void;
  reset(): void;
}

export interface IStorageAdapter {
  readonly platformName: 'web' | 'desktop';
  getItem<T>(key: string): Promise<T | null>;
  setItem<T>(key: string, value: T): Promise<void>;
  quitApp?: () => Promise<void>;
}

export interface IAudioExecutor {
  unlock(): void;
  applySettings(settings: AudioSettings): void;
  updateMusicContext(snapshot: GameSnapshot): void;
  handleEvent(event: GameEvent): void;
  dispose(): void;
}

export interface IRenderExecutor {
  render(snapshot: GameSnapshot, nowSec: number, dtSec: number): void;
  handleEvent(event: GameEvent): void;
  resize(): void;
  dispose(): void;
}
