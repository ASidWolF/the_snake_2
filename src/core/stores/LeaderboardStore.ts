/**
 * Роль: Хранилище (Store).
 * Держит локальную таблицу рекордов, санитизирует имена и сохраняет через IStorageAdapter.
 */

import type { IStorageAdapter, Unsubscribe } from '../contracts/actions.ts';
import type { DifficultyKey, LeaderboardEntry } from '../contracts/messages.ts';
import { DIFFICULTY_PROFILES } from '../profiles/difficultyProfiles.ts';
import { SCORING_PROFILE } from '../profiles/scoringProfile.ts';

const STORAGE_KEY = 'the_snake_2:leaderboard:v1';

export function sanitizePlayerName(
  raw: string,
  fallbackName: string = SCORING_PROFILE.defaultPlayerName
): string {
  const cleaned = raw
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, SCORING_PROFILE.maxPlayerNameLength);
  return cleaned || fallbackName;
}

function isValidEntry(value: unknown): value is LeaderboardEntry {
  if (!value || typeof value !== 'object') return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.id === 'string' &&
    typeof e.playerName === 'string' &&
    typeof e.score === 'number' &&
    Number.isFinite(e.score) &&
    typeof e.level === 'number' &&
    typeof e.apples === 'number' &&
    typeof e.maxLength === 'number' &&
    typeof e.difficulty === 'string' &&
    e.difficulty in DIFFICULTY_PROFILES &&
    typeof e.createdAt === 'string'
  );
}

function sortEntries(entries: readonly LeaderboardEntry[]): LeaderboardEntry[] {
  return [...entries]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.level !== a.level) return b.level - a.level;
      return b.apples - a.apples;
    })
    .slice(0, SCORING_PROFILE.maxLeaderboardEntries);
}

export class LeaderboardStore {
  private entries: LeaderboardEntry[] = [];
  private readonly listeners = new Set<(entries: readonly LeaderboardEntry[]) => void>();
  private readonly storage: IStorageAdapter;

  constructor(storage: IStorageAdapter) {
    this.storage = storage;
  }

  async load(): Promise<readonly LeaderboardEntry[]> {
    try {
      const raw = await this.storage.getItem<unknown>(STORAGE_KEY);
      if (Array.isArray(raw)) {
        this.entries = sortEntries(raw.filter(isValidEntry));
        this.notify();
      }
    } catch {
      this.entries = [];
    }
    return this.entries;
  }

  getEntries(filter: DifficultyKey | 'all' = 'all'): readonly LeaderboardEntry[] {
    if (filter === 'all') return this.entries;
    return this.entries.filter((e) => e.difficulty === filter);
  }

  getBestScore(difficulty?: DifficultyKey): number {
    const list = difficulty ? this.getEntries(difficulty) : this.entries;
    return list[0]?.score ?? 0;
  }

  hasSavedScore(runId: string, score: number): boolean {
    if (!runId) return false;
    const existing = this.entries.find((e) => e.runId === runId);
    return existing ? existing.score >= Math.round(score) : false;
  }

  addRecord(input: {
    readonly runId?: string;
    readonly playerName: string;
    readonly defaultPlayerName?: string;
    readonly score: number;
    readonly level: number;
    readonly apples: number;
    readonly maxLength: number;
    readonly difficulty: DifficultyKey;
  }): { readonly entry: LeaderboardEntry; readonly rank: number } {
    const cleanScore = Math.max(0, Math.round(input.score));
    const cleanLevel = Math.max(1, Math.floor(input.level));
    const cleanApples = Math.max(0, Math.floor(input.apples));
    const cleanMaxLen = Math.max(1, Math.floor(input.maxLength));
    const cleanName = sanitizePlayerName(
      input.playerName,
      input.defaultPlayerName
    );

    const existing = input.runId
      ? this.entries.find((e) => e.runId === input.runId)
      : undefined;

    const entry: LeaderboardEntry = existing
      ? {
          ...existing,
          playerName: cleanName,
          score: Math.max(existing.score, cleanScore),
          level: Math.max(existing.level, cleanLevel),
          apples: Math.max(existing.apples, cleanApples),
          maxLength: Math.max(existing.maxLength, cleanMaxLen),
          createdAt: new Date().toISOString(),
        }
      : {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          runId: input.runId,
          playerName: cleanName,
          score: cleanScore,
          level: cleanLevel,
          apples: cleanApples,
          maxLength: cleanMaxLen,
          difficulty: input.difficulty,
          createdAt: new Date().toISOString(),
        };

    const rest = existing
      ? this.entries.filter((e) => e.id !== existing.id)
      : this.entries;
    this.entries = sortEntries([...rest, entry]);
    const rank = this.entries.findIndex((e) => e.id === entry.id) + 1;
    this.notify();
    void this.storage.setItem(STORAGE_KEY, this.entries);

    return { entry, rank };
  }

  canClear(): boolean {
    return this.storage.platformName === 'desktop';
  }

  clear(): boolean {
    // Очистка таблицы рекордов разрешена только в локальном скомпилированном ПК-приложении
    if (this.storage.platformName !== 'desktop') {
      return false;
    }
    this.entries = [];
    this.notify();
    void this.storage.setItem(STORAGE_KEY, this.entries);
    return true;
  }

  subscribe(listener: (entries: readonly LeaderboardEntry[]) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of Array.from(this.listeners)) {
      listener(this.entries);
    }
  }
}
