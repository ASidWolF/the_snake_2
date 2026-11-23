/**
 * Роль: Хранилище (Store).
 * Держит пользовательские настройки (сложность, громкость, тач-управление, имя)
 * и синхронизирует их через платформенный адаптер IStorageAdapter.
 */

import type { IStorageAdapter, Unsubscribe } from '../contracts/actions.ts';
import type {
  AudioSettings,
  DifficultyKey,
  LanguageKey,
  TouchControlMode,
  UserSettings,
} from '../contracts/messages.ts';
import { DIFFICULTY_PROFILES } from '../profiles/difficultyProfiles.ts';
import {
  DEFAULT_USER_SETTINGS,
  SCORING_PROFILE,
} from '../profiles/scoringProfile.ts';

const STORAGE_KEY = 'the_snake_2:settings:v1';

function clampVolume(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(1, value));
}

function sanitizeSettings(raw: unknown): UserSettings {
  if (!raw || typeof raw !== 'object') {
    return DEFAULT_USER_SETTINGS;
  }
  const obj = raw as Record<string, unknown>;
  const language: LanguageKey =
    obj.language === 'ru' || obj.language === 'en'
      ? obj.language
      : DEFAULT_USER_SETTINGS.language;

  const difficulty: DifficultyKey =
    typeof obj.difficulty === 'string' && obj.difficulty in DIFFICULTY_PROFILES
      ? (obj.difficulty as DifficultyKey)
      : DEFAULT_USER_SETTINGS.difficulty;

  const rawAudio =
    obj.audio && typeof obj.audio === 'object'
      ? (obj.audio as Record<string, unknown>)
      : {};

  const audio: AudioSettings = {
    masterVolume: clampVolume(
      rawAudio.masterVolume,
      DEFAULT_USER_SETTINGS.audio.masterVolume
    ),
    musicVolume: clampVolume(
      rawAudio.musicVolume,
      DEFAULT_USER_SETTINGS.audio.musicVolume
    ),
    sfxVolume: clampVolume(
      rawAudio.sfxVolume,
      DEFAULT_USER_SETTINGS.audio.sfxVolume
    ),
    muted:
      typeof rawAudio.muted === 'boolean'
        ? rawAudio.muted
        : DEFAULT_USER_SETTINGS.audio.muted,
  };

  const touchControls: TouchControlMode =
    obj.touchControls === 'auto' ||
    obj.touchControls === 'dpad' ||
    obj.touchControls === 'swipe'
      ? obj.touchControls
      : DEFAULT_USER_SETTINGS.touchControls;

  const lastPlayerName =
    typeof obj.lastPlayerName === 'string'
      ? obj.lastPlayerName.trim().slice(0, SCORING_PROFILE.maxPlayerNameLength)
      : '';

  return { language, difficulty, audio, touchControls, lastPlayerName };
}

export class SettingsStore {
  private settings: UserSettings = DEFAULT_USER_SETTINGS;
  private readonly listeners = new Set<(settings: UserSettings) => void>();
  private readonly storage: IStorageAdapter;

  constructor(storage: IStorageAdapter) {
    this.storage = storage;
  }

  async load(): Promise<UserSettings> {
    try {
      const stored = await this.storage.getItem<unknown>(STORAGE_KEY);
      this.settings = sanitizeSettings(stored);
      this.notify();
    } catch {
      this.settings = DEFAULT_USER_SETTINGS;
    }
    return this.settings;
  }

  getSnapshot(): UserSettings {
    return this.settings;
  }

  update(patch: Partial<UserSettings>): UserSettings {
    this.settings = sanitizeSettings({
      ...this.settings,
      ...patch,
      audio: patch.audio
        ? { ...this.settings.audio, ...patch.audio }
        : this.settings.audio,
    });
    this.notify();
    void this.storage.setItem(STORAGE_KEY, this.settings);
    return this.settings;
  }

  updateAudio(patch: Partial<AudioSettings>): UserSettings {
    return this.update({
      audio: { ...this.settings.audio, ...patch },
    });
  }

  subscribe(listener: (settings: UserSettings) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of Array.from(this.listeners)) {
      listener(this.settings);
    }
  }
}
