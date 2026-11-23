import { describe, expect, it } from 'vitest';
import type { IStorageAdapter } from '../src/core/contracts/actions.ts';
import {
  LeaderboardStore,
  sanitizePlayerName,
} from '../src/core/stores/LeaderboardStore.ts';
import { SettingsStore } from '../src/core/stores/SettingsStore.ts';

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

describe('SettingsStore и LeaderboardStore', () => {
  it('сохраняет, загружает и валидирует настройки громкости и сложности', async () => {
    const storage = createMemoryStorage();
    const store1 = new SettingsStore(storage);
    store1.update({ difficulty: 'hard' });
    store1.updateAudio({ masterVolume: 1.5, musicVolume: -0.2, sfxVolume: 0.4, muted: true });

    const store2 = new SettingsStore(storage);
    const loaded = await store2.load();
    expect(loaded.difficulty).toBe('hard');
    expect(loaded.audio.masterVolume).toBe(1);
    expect(loaded.audio.musicVolume).toBe(0);
    expect(loaded.audio.sfxVolume).toBe(0.4);
    expect(loaded.audio.muted).toBe(true);
  });

  it('сортирует рекорды, фильтрует по сложности и санитизирует имена', async () => {
    const storage = createMemoryStorage();
    const lb = new LeaderboardStore(storage);

    expect(sanitizePlayerName('   ')).toBe('Игрок');
    expect(sanitizePlayerName('  Алекс\t\nСоколов  ')).toBe('Алекс Соколов');

    lb.addRecord({
      playerName: 'Игрок А',
      score: 500,
      level: 3,
      apples: 21,
      maxLength: 10,
      difficulty: 'easy',
    });
    const best = lb.addRecord({
      playerName: 'Мастер',
      score: 1800,
      level: 6,
      apples: 50,
      maxLength: 16,
      difficulty: 'hard',
    });

    expect(best.rank).toBe(1);
    expect(lb.getBestScore()).toBe(1800);
    expect(lb.getEntries('easy')).toHaveLength(1);
    expect(lb.getEntries('hard')).toHaveLength(1);

    const lb2 = new LeaderboardStore(storage);
    await lb2.load();
    expect(lb2.getEntries()).toHaveLength(2);
    expect(lb2.getEntries()[0]?.playerName).toBe('Мастер');
  });
});
