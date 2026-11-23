import { describe, expect, it } from 'vitest';
import { EventBus } from '../src/core/bus/EventBus.ts';
import type { IStorageAdapter } from '../src/core/contracts/actions.ts';
import type { GameSnapshot } from '../src/core/contracts/messages.ts';
import { GameRuntime } from '../src/core/GameRuntime.ts';
import { LeaderboardStore } from '../src/core/stores/LeaderboardStore.ts';
import { SavedRunStore } from '../src/core/stores/SavedRunStore.ts';

function createMemoryStorage(): IStorageAdapter {
  const map = new Map<string, unknown>();
  return {
    platformName: 'web',
    async getItem<T>(key: string): Promise<T | null> {
      return map.has(key) ? (map.get(key) as T) : null;
    },
    async setItem<T>(key: string, value: T): Promise<void> {
      map.set(key, value);
    },
  };
}

describe('SavedRunStore, RESUME_SAVED_RUN и запись рекорда в середине партии', () => {
  it('сохраняет активную партию, восстанавливает её с того же уровня и даёт безопасный отсчёт', async () => {
    const storage = createMemoryStorage();
    const savedStore1 = new SavedRunStore(storage);
    const bus = new EventBus();
    const runtime = new GameRuntime(bus, 'hard', 555);

    runtime.dispatch({ type: 'START_NEW_RUN', difficulty: 'hard', seed: 555 });
    const midRun: GameSnapshot = {
      ...runtime.getSnapshot(),
      score: 640,
      lives: 2,
      highestLevel: 4,
      levelStats: {
        ...runtime.getSnapshot().levelStats,
        level: 4,
      },
    };
    runtime.store.setState(midRun);

    // Сохраняем незавершённую партию и эмулируем перезапуск приложения
    savedStore1.save(runtime.getSnapshot());

    const savedStore2 = new SavedRunStore(storage);
    const loaded = await savedStore2.load();
    expect(loaded).not.toBeNull();
    expect(loaded?.phase).toBe('paused');
    expect(loaded?.levelStats.level).toBe(4);
    expect(loaded?.score).toBe(640);
    expect(loaded?.lives).toBe(2);

    // Возвращаемся в меню и нажимаем «Продолжить»
    const runtime2 = new GameRuntime(new EventBus(), 'normal', 100);
    const resumed = runtime2.dispatch({
      type: 'RESUME_SAVED_RUN',
      savedSnapshot: loaded!,
    });

    expect(resumed.phase).toBe('playing');
    expect(resumed.difficulty).toBe('hard');
    expect(resumed.levelStats.level).toBe(4);
    expect(resumed.score).toBe(640);
    expect(resumed.lives).toBe(2);
    expect(resumed.resumeCountdownSec).toBeGreaterThan(0);

    // Пока идёт отсчёт — змейка не сдвигается
    const headBefore = resumed.snake.segments[0]!;
    const duringCountdown = runtime2.tick(0.08);
    expect(duringCountdown.snake.segments[0]).toEqual(headBefore);
    expect(duringCountdown.resumeCountdownSec).toBeLessThan(resumed.resumeCountdownSec);

    // Очистка после завершения игры
    savedStore2.clear();
    expect(savedStore2.getSnapshot()).toBeNull();
  });

  it('обновляет рекорд по runId без дубликатов при сохранении на промежуточном уровне и далее', () => {
    const storage = createMemoryStorage();
    const lb = new LeaderboardStore(storage);

    const first = lb.addRecord({
      runId: 'run-normal-999',
      playerName: 'Алекс',
      score: 420,
      level: 3,
      apples: 18,
      maxLength: 9,
      difficulty: 'normal',
    });
    expect(first.rank).toBe(1);
    expect(lb.hasSavedScore('run-normal-999', 420)).toBe(true);
    expect(lb.hasSavedScore('run-normal-999', 700)).toBe(false);

    // Игрок продолжил ту же партию, дошёл до 5 уровня и снова сохранил рекорд
    const updated = lb.addRecord({
      runId: 'run-normal-999',
      playerName: 'Алекс',
      score: 980,
      level: 5,
      apples: 34,
      maxLength: 14,
      difficulty: 'normal',
    });

    expect(lb.getEntries()).toHaveLength(1);
    expect(updated.entry.score).toBe(980);
    expect(updated.entry.level).toBe(5);
    expect(lb.hasSavedScore('run-normal-999', 980)).toBe(true);
  });
});
