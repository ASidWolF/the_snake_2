import { describe, expect, it } from 'vitest';
import type { IStorageAdapter } from '../src/core/contracts/actions.ts';
import { I18N_PROFILES } from '../src/core/profiles/i18nProfile.ts';
import {
  LeaderboardStore,
  sanitizePlayerName,
} from '../src/core/stores/LeaderboardStore.ts';
import { SettingsStore } from '../src/core/stores/SettingsStore.ts';
import { formatPlayButtonLabel } from '../src/ui/GameUiExecutor.ts';

function createMemoryStorage(platformName: 'web' | 'desktop' = 'web'): IStorageAdapter {
  const map = new Map<string, unknown>();
  return {
    platformName,
    async getItem<T>(key: string): Promise<T | null> {
      return map.has(key) ? (map.get(key) as T) : null;
    },
    async setItem<T>(key: string, value: T): Promise<void> {
      map.set(key, value);
    },
  };
}

describe('SettingsStore и LeaderboardStore', () => {
  it('сохраняет, загружает и валидирует настройки языка, громкости и сложности', async () => {
    const storage = createMemoryStorage();
    const store1 = new SettingsStore(storage);
    store1.update({ language: 'en', difficulty: 'hard' });
    store1.updateAudio({ masterVolume: 1.5, musicVolume: -0.2, sfxVolume: 0.4, muted: true });

    const store2 = new SettingsStore(storage);
    const loaded = await store2.load();
    expect(loaded.language).toBe('en');
    expect(loaded.difficulty).toBe('hard');
    expect(loaded.audio.masterVolume).toBe(1);
    expect(loaded.audio.musicVolume).toBe(0);
    expect(loaded.audio.sfxVolume).toBe(0.4);
    expect(loaded.audio.muted).toBe(true);
  });

  it('содержит полные словари RU и EN с одинаковым набором ключей', () => {
    const ruKeys = Object.keys(I18N_PROFILES.ru).sort();
    const enKeys = Object.keys(I18N_PROFILES.en).sort();
    expect(enKeys).toEqual(ruKeys);
    expect(I18N_PROFILES.ru.speechYum).toBe('Ням!');
    expect(I18N_PROFILES.en.speechYum).toBe('Yum!');
    expect(I18N_PROFILES.ru.speechShrinking).toBe('Худею!');
    expect(I18N_PROFILES.en.speechShrinking).toBe('Shrinking!');
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

    // В веб-режиме очистка таблицы рекордов запрещена
    expect(lb2.canClear()).toBe(false);
    expect(lb2.clear()).toBe(false);
    expect(lb2.getEntries()).toHaveLength(2);

    // В локальном ПК-приложении (desktop) очистка разрешена
    const desktopLb = new LeaderboardStore(createMemoryStorage('desktop'));
    desktopLb.addRecord({
      playerName: 'Локальный',
      score: 900,
      level: 4,
      apples: 30,
      maxLength: 12,
      difficulty: 'normal',
    });
    expect(desktopLb.canClear()).toBe(true);
    expect(desktopLb.clear()).toBe(true);
    expect(desktopLb.getEntries()).toHaveLength(0);
  });

  it('интуитивно подписывает кнопку старта/новой игры при смене сложности (RU и EN)', () => {
    // Первый запуск на базовой «Нормально» без клика — без скобок сложности
    expect(
      formatPlayButtonLabel({
        language: 'ru',
        selectedDifficulty: 'normal',
        hasSavedRun: false,
        savedDifficulty: null,
        difficultyExplicitlyPicked: false,
      })
    ).toBe('▶ Начать игру');

    // Первый запуск — игрок переключил на «Сложно» -> добавляем в скобках
    expect(
      formatPlayButtonLabel({
        language: 'ru',
        selectedDifficulty: 'hard',
        hasSavedRun: false,
        savedDifficulty: null,
        difficultyExplicitlyPicked: true,
      })
    ).toBe('▶ Начать игру (Сложно)');

    // Активная сохранённая игра на «Нормально», выбрана «Сложно» -> явно видно на кнопке «Новая игра»
    expect(
      formatPlayButtonLabel({
        language: 'ru',
        selectedDifficulty: 'hard',
        hasSavedRun: true,
        savedDifficulty: 'normal',
        difficultyExplicitlyPicked: true,
      })
    ).toBe('✨ Новая игра (с 1 уровня • Сложно)');

    // Тот же сценарий на английском
    expect(
      formatPlayButtonLabel({
        language: 'en',
        selectedDifficulty: 'easy',
        hasSavedRun: true,
        savedDifficulty: 'normal',
        difficultyExplicitlyPicked: false,
      })
    ).toBe('✨ New Game (Level 1 • Easy)');
  });
});
