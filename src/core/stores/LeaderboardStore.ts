/**
 * Роль: Хранилище (Store).
 * Держит локальную таблицу рекордов, санитизирует имена и сохраняет через IStorageAdapter.
 */

import type { IStorageAdapter, Unsubscribe } from '../contracts/actions.ts';
import type { DifficultyKey, LeaderboardEntry } from '../contracts/messages.ts';
import { DIFFICULTY_PROFILES } from '../profiles/difficultyProfiles.ts';
import { SCORING_PROFILE } from '../profiles/scoringProfile.ts';

const STORAGE_KEY = 'the_snake_2:leaderboard:v1';

export function sanitizePlayerName(raw: string): string {
  const cleaned = raw
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, SCORING_PROFILE.maxPlayerNameLength);
  return cleaned || SCORING_PROFILE.defaultPlayerName;
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

  addRecord(input: {
    readonly playerName: string;
    readonly score: number;
    readonly level: number;
    readonly apples: number;
    readonly maxLength: number;
    readonly difficulty: DifficultyKey;
  }): { readonly entry: LeaderboardEntry; readonly rank: number } {
    const entry: LeaderboardEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      playerName: sanitizePlayerName(input.playerName),
      score: Math.max(0, Math.round(input.score)),
      level: Math.max(1, Math.floor(input.level)),
      apples: Math.max(0, Math.floor(input.apples)),
      maxLength: Math.max(1, Math.floor(input.maxLength)),
      difficulty: input.difficulty,
      createdAt: new Date().toISOString(),
    };

    this.entries = sortEntries([...this.entries, entry]);
    const rank = this.entries.findIndex((e) => e.id === entry.id) + 1;
    this.notify();
    void this.storage.setItem(STORAGE_KEY, this.entries);

    return { entry, rank };
  }

  clear(): void {
    this.entries = [];
    this.notify();
    void this.storage.setItem(STORAGE_KEY, this.entries);
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
