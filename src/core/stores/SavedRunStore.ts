/**
 * Роль: Хранилище (Store).
 * Держит незавершённую сохранённую партию (GameSnapshot), чтобы игрок мог
 * вернуться в игру с того же уровня через кнопку «Продолжить».
 * Игровых правил не содержит.
 */

import type { IStorageAdapter, Unsubscribe } from '../contracts/actions.ts';
import type { GamePhase, GameSnapshot } from '../contracts/messages.ts';
import { DIFFICULTY_PROFILES } from '../profiles/difficultyProfiles.ts';

const STORAGE_KEY = 'the_snake_2:saved_run:v1';

const RESUMABLE_PHASES: ReadonlySet<GamePhase> = new Set([
  'playing',
  'paused',
  'level_complete',
  'life_lost',
]);

export function isResumableSnapshot(snapshot: GameSnapshot | null): snapshot is GameSnapshot {
  if (!snapshot) return false;
  if (!RESUMABLE_PHASES.has(snapshot.phase)) return false;
  if (snapshot.lives <= 0) return false;
  if (snapshot.snake.segments.length === 0) return false;
  return true;
}

function isValidStoredSnapshot(raw: unknown): raw is GameSnapshot {
  if (!raw || typeof raw !== 'object') return false;
  const s = raw as Record<string, unknown>;
  if (typeof s.runId !== 'string' || !s.runId) return false;
  if (typeof s.phase !== 'string' || !RESUMABLE_PHASES.has(s.phase as GamePhase)) return false;
  if (typeof s.difficulty !== 'string' || !(s.difficulty in DIFFICULTY_PROFILES)) return false;
  if (typeof s.score !== 'number' || !Number.isFinite(s.score)) return false;
  if (typeof s.lives !== 'number' || s.lives <= 0) return false;
  if (!s.snake || typeof s.snake !== 'object') return false;
  const snake = s.snake as Record<string, unknown>;
  if (!Array.isArray(snake.segments) || snake.segments.length === 0) return false;
  if (!Array.isArray(s.goodApples) || !Array.isArray(s.badApples) || !Array.isArray(s.stones)) {
    return false;
  }
  if (!s.levelStats || typeof s.levelStats !== 'object') return false;
  return true;
}

export class SavedRunStore {
  private saved: GameSnapshot | null = null;
  private readonly listeners = new Set<(saved: GameSnapshot | null) => void>();
  private readonly storage: IStorageAdapter;

  constructor(storage: IStorageAdapter) {
    this.storage = storage;
  }

  async load(): Promise<GameSnapshot | null> {
    try {
      const raw = await this.storage.getItem<unknown>(STORAGE_KEY);
      if (isValidStoredSnapshot(raw)) {
        this.saved = {
          ...raw,
          deathAnimSec: 0,
          frenzy: {
            ...raw.frenzy,
            starveTimerSec:
              typeof raw.frenzy?.starveTimerSec === 'number'
                ? raw.frenzy.starveTimerSec
                : 0,
          },
        };
      } else {
        this.saved = null;
      }
      this.notify();
    } catch {
      this.saved = null;
    }
    return this.saved;
  }

  getSnapshot(): GameSnapshot | null {
    return this.saved;
  }

  save(snapshot: GameSnapshot): void {
    if (!isResumableSnapshot(snapshot)) {
      return;
    }
    // Если партия сохраняется во время активного движения, фиксируем фазу как paused
    const normalized: GameSnapshot =
      snapshot.phase === 'playing'
        ? {
            ...snapshot,
            phase: 'paused',
            moveProgress: 0,
            stepAccumulator: 0,
            resumeCountdownSec: 0,
            deathAnimSec: 0,
            snake: {
              ...snapshot.snake,
              previousSegments: snapshot.snake.segments.map((p) => ({ ...p })),
            },
          }
        : {
            ...snapshot,
            moveProgress: 0,
            stepAccumulator: 0,
            resumeCountdownSec: 0,
            deathAnimSec: 0,
          };

    this.saved = normalized;
    this.notify();
    void this.storage.setItem(STORAGE_KEY, normalized);
  }

  clear(): void {
    if (this.saved === null) return;
    this.saved = null;
    this.notify();
    void this.storage.setItem(STORAGE_KEY, null);
  }

  subscribe(listener: (saved: GameSnapshot | null) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of Array.from(this.listeners)) {
      listener(this.saved);
    }
  }
}
