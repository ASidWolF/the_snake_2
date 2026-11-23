/**
 * Роль: Обработчик (Processor).
 * Генерирует детерминированную раскладку уровня по номеру, профилю сложности и сиду:
 * фиксированное число хороших яблок, плохих яблок и камней с безопасной зоной старта.
 */

import type {
  BadApple,
  GoodApple,
  GridPoint,
  LevelStats,
  SnakeState,
  Stone,
} from '../contracts/messages.ts';
import type { DifficultyProfile } from '../profiles/difficultyProfiles.ts';
import { GRID_PROFILE } from '../profiles/gridProfile.ts';
import { SCORING_PROFILE } from '../profiles/scoringProfile.ts';
import { SeededRng } from './SeededRng.ts';

export interface LevelQuota {
  readonly goodApples: number;
  readonly badApples: number;
  readonly stones: number;
  readonly stoneWeight: number;
  readonly parMoves: number;
}

export interface GeneratedLevel {
  readonly snake: SnakeState;
  readonly goodApples: readonly GoodApple[];
  readonly badApples: readonly BadApple[];
  readonly stones: readonly Stone[];
  readonly levelStats: LevelStats;
}

export function computeLevelQuota(
  level: number,
  profile: DifficultyProfile
): LevelQuota {
  const safeLevel = Math.max(1, Math.floor(level));
  const stepIndex = safeLevel - 1;

  const goodApples = Math.min(
    profile.goodApplesMax,
    profile.goodApplesBase + stepIndex * profile.goodApplesPerLevel
  );
  const badApples = Math.min(
    profile.badApplesMax,
    profile.badApplesBase + Math.floor(stepIndex / profile.badApplesEveryLevels)
  );
  const stones = Math.min(
    profile.stonesMax,
    profile.stonesBase + Math.floor(stepIndex / profile.stonesEveryLevels)
  );

  const parMoves = Math.max(24, goodApples * SCORING_PROFILE.movesPerApplePar);

  return {
    goodApples,
    badApples,
    stones,
    stoneWeight: profile.stoneWeight,
    parMoves,
  };
}

export function pointKey(p: GridPoint): string {
  return `${p.x},${p.y}`;
}

export function generateLevel(
  level: number,
  profile: DifficultyProfile,
  seed: number
): GeneratedLevel {
  const quota = computeLevelQuota(level, profile);
  const rng = new SeededRng(seed);

  const centerX = Math.floor(GRID_PROFILE.width / 2);
  const centerY = Math.floor(GRID_PROFILE.height / 2);

  // Змейка стартует в центре, смотрит вправо
  const segments: GridPoint[] = [];
  for (let i = 0; i < GRID_PROFILE.initialSnakeLength; i += 1) {
    segments.push({ x: centerX - i, y: centerY });
  }

  const snake: SnakeState = {
    segments,
    previousSegments: segments.map((s) => ({ ...s })),
    direction: 'RIGHT',
    directionQueue: [],
  };

  // Занятые клетки: змейка + безопасный коридор перед головой, чтобы игрок не врезался мгновенно
  const occupied = new Set<string>(segments.map(pointKey));
  const hazardForbidden = new Set<string>(occupied);

  for (let dx = -GRID_PROFILE.safeSpawnRadius; dx <= GRID_PROFILE.safeSpawnRadius + 2; dx += 1) {
    for (let dy = -GRID_PROFILE.safeSpawnRadius; dy <= GRID_PROFILE.safeSpawnRadius; dy += 1) {
      const x = (centerX + dx + GRID_PROFILE.width) % GRID_PROFILE.width;
      const y = (centerY + dy + GRID_PROFILE.height) % GRID_PROFILE.height;
      hazardForbidden.add(pointKey({ x, y }));
    }
  }

  const allCells: GridPoint[] = [];
  for (let y = 0; y < GRID_PROFILE.height; y += 1) {
    for (let x = 0; x < GRID_PROFILE.width; x += 1) {
      allCells.push({ x, y });
    }
  }

  const shuffled = rng.shuffle(allCells);
  const safeForHazards = shuffled.filter((c) => !hazardForbidden.has(pointKey(c)));
  const safeForGoodApples = shuffled.filter((c) => !occupied.has(pointKey(c)));

  const stones: Stone[] = [];
  const badApples: BadApple[] = [];
  const goodApples: GoodApple[] = [];

  let nextId = 1;

  for (const cell of safeForHazards) {
    if (stones.length >= quota.stones) break;
    const key = pointKey(cell);
    if (occupied.has(key)) continue;
    occupied.add(key);
    stones.push({ id: nextId++, pos: cell, weight: quota.stoneWeight });
  }

  for (const cell of safeForHazards) {
    if (badApples.length >= quota.badApples) break;
    const key = pointKey(cell);
    if (occupied.has(key)) continue;
    occupied.add(key);
    badApples.push({ id: nextId++, pos: cell });
  }

  for (const cell of safeForGoodApples) {
    if (goodApples.length >= quota.goodApples) break;
    const key = pointKey(cell);
    if (occupied.has(key)) continue;
    occupied.add(key);
    goodApples.push({ id: nextId++, pos: cell });
  }

  const levelStats: LevelStats = {
    level: Math.max(1, Math.floor(level)),
    initialGoodApples: goodApples.length,
    initialBadApples: badApples.length,
    initialStones: stones.length,
    moves: 0,
    parMoves: quota.parMoves,
    mistakes: 0,
    stonesPushed: 0,
    elapsedSec: 0,
  };

  return {
    snake,
    goodApples,
    badApples,
    stones,
    levelStats,
  };
}
