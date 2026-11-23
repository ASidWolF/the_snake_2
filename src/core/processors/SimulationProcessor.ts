/**
 * Роль: Обработчик (Processor).
 * Чистая детерминированная симуляция правил The Snake 2:
 * команды → переходы фаз, шаг змейки, столкновения, камни, яблоки, бешенство, жизни, уровни.
 * Не обращается к DOM, таймерам браузера или внешнему состоянию.
 */

import type {
  BadApple,
  DeathReason,
  Direction,
  DifficultyKey,
  GameCommand,
  GameEvent,
  GameSnapshot,
  GoodApple,
  GridPoint,
  Stone,
} from '../contracts/messages.ts';
import { DIFFICULTY_PROFILES } from '../profiles/difficultyProfiles.ts';
import {
  DIRECTION_VECTORS,
  GRID_PROFILE,
  OPPOSITE_DIRECTION,
} from '../profiles/gridProfile.ts';
import { SCORING_PROFILE } from '../profiles/scoringProfile.ts';
import {
  advanceFrenzy,
  computeBaseSpeed,
  computeEffectiveSpeed,
  createInitialFrenzy,
} from './FrenzyProcessor.ts';
import { generateLevel, pointKey } from './LevelGeneratorProcessor.ts';
import {
  applyBadApplePenalty,
  computeGoodApplePoints,
  computeLevelSummary,
  computeStonePushPoints,
  evaluateExtraLives,
} from './ScoreProcessor.ts';
import { SeededRng } from './SeededRng.ts';

export const DEATH_ANIM_DURATION_SEC = 1.85;

export interface SimulationOutcome {
  readonly state: GameSnapshot;
  readonly events: readonly GameEvent[];
}

function wrapPoint(x: number, y: number): GridPoint {
  return {
    x: ((x % GRID_PROFILE.width) + GRID_PROFILE.width) % GRID_PROFILE.width,
    y: ((y % GRID_PROFILE.height) + GRID_PROFILE.height) % GRID_PROFILE.height,
  };
}

function samePoint(a: GridPoint, b: GridPoint): boolean {
  return a.x === b.x && a.y === b.y;
}

function deriveNextSeed(currentSeed: number, salt: number): number {
  const rng = new SeededRng(currentSeed ^ Math.imul(salt + 1, 0x9e3779b1));
  return Math.max(1, Math.floor(rng.nextFloat() * 0x7fffffff));
}

function findFreeCell(
  occupied: ReadonlySet<string>,
  seed: number
): GridPoint | null {
  const free: GridPoint[] = [];
  for (let y = 0; y < GRID_PROFILE.height; y += 1) {
    for (let x = 0; x < GRID_PROFILE.width; x += 1) {
      const p = { x, y };
      if (!occupied.has(pointKey(p))) {
        free.push(p);
      }
    }
  }
  if (free.length === 0) return null;
  const rng = new SeededRng(seed);
  return free[rng.nextInt(free.length)] ?? null;
}

function buildLevelSnapshot(
  base: {
    runId: string;
    difficulty: DifficultyKey;
    level: number;
    score: number;
    lives: number;
    maxLives: number;
    nextLifeScore: number;
    totalApplesEaten: number;
    totalStonesPushed: number;
    maxLength: number;
    highestLevel: number;
    phase: GameSnapshot['phase'];
  },
  seed: number
): GameSnapshot {
  const profile = DIFFICULTY_PROFILES[base.difficulty];
  const generated = generateLevel(base.level, profile, seed);
  const baseSpeed = computeBaseSpeed(base.level, profile);

  return {
    runId: base.runId,
    phase: base.phase,
    difficulty: base.difficulty,
    score: base.score,
    lives: base.lives,
    maxLives: base.maxLives,
    nextLifeScore: base.nextLifeScore,
    combo: 0,
    baseSpeed,
    effectiveSpeed: baseSpeed,
    moveProgress: 0,
    stepAccumulator: 0,
    resumeCountdownSec: 0,
    deathAnimSec: 0,
    snake: generated.snake,
    goodApples: generated.goodApples,
    badApples: generated.badApples,
    stones: generated.stones,
    frenzy: createInitialFrenzy(),
    levelStats: generated.levelStats,
    lastLevelSummary: null,
    lastDeathReason: null,
    totalApplesEaten: base.totalApplesEaten,
    totalStonesPushed: base.totalStonesPushed,
    maxLength: Math.max(base.maxLength, generated.snake.segments.length),
    highestLevel: Math.max(base.highestLevel, base.level),
    levelSeed: seed,
  };
}

export function createInitialSnapshot(
  difficulty: DifficultyKey = 'normal',
  seed = 104729
): GameSnapshot {
  return buildLevelSnapshot(
    {
      runId: `menu-${seed}`,
      difficulty,
      level: 1,
      score: 0,
      lives: SCORING_PROFILE.startingLives,
      maxLives: SCORING_PROFILE.maxLives,
      nextLifeScore: SCORING_PROFILE.extraLifeScoreStep,
      totalApplesEaten: 0,
      totalStonesPushed: 0,
      maxLength: GRID_PROFILE.initialSnakeLength,
      highestLevel: 1,
      phase: 'menu',
    },
    seed
  );
}

function enqueueDirection(
  state: GameSnapshot,
  direction: Direction
): SimulationOutcome {
  if (state.phase !== 'playing') {
    return { state, events: [] };
  }

  const queue = state.snake.directionQueue;
  if (queue.length >= GRID_PROFILE.maxDirectionQueue) {
    return { state, events: [] };
  }

  const lastPlanned = queue[queue.length - 1] ?? state.snake.direction;
  if (direction === lastPlanned || direction === OPPOSITE_DIRECTION[lastPlanned]) {
    return { state, events: [] };
  }

  return {
    state: {
      ...state,
      snake: {
        ...state.snake,
        directionQueue: [...queue, direction],
      },
    },
    events: [],
  };
}

export function applyCommand(
  state: GameSnapshot,
  command: GameCommand
): SimulationOutcome {
  switch (command.type) {
    case 'START_NEW_RUN': {
      const seed = command.seed ?? deriveNextSeed(state.levelSeed, 7);
      const runId = `run-${command.difficulty}-${seed}`;
      const next = buildLevelSnapshot(
        {
          runId,
          difficulty: command.difficulty,
          level: 1,
          score: 0,
          lives: SCORING_PROFILE.startingLives,
          maxLives: SCORING_PROFILE.maxLives,
          nextLifeScore: SCORING_PROFILE.extraLifeScoreStep,
          totalApplesEaten: 0,
          totalStonesPushed: 0,
          maxLength: GRID_PROFILE.initialSnakeLength,
          highestLevel: 1,
          phase: 'playing',
        },
        seed
      );
      return {
        state: next,
        events: [
          { type: 'PHASE_CHANGED', from: state.phase, to: 'playing' },
          { type: 'RUN_STARTED', difficulty: command.difficulty, level: 1 },
          { type: 'LEVEL_STARTED', level: 1, retry: false },
        ],
      };
    }

    case 'RESUME_SAVED_RUN': {
      const saved = command.savedSnapshot;
      if (saved.lives <= 0 || saved.snake.segments.length === 0) {
        return { state, events: [] };
      }
      const restoringToPlay = saved.phase === 'playing' || saved.phase === 'paused';
      const targetPhase = restoringToPlay ? 'playing' : saved.phase;
      const next: GameSnapshot = {
        ...saved,
        phase: targetPhase,
        moveProgress: 0,
        stepAccumulator: 0,
        resumeCountdownSec: restoringToPlay ? 1.2 : 0,
        deathAnimSec: 0,
        snake: {
          ...saved.snake,
          previousSegments: saved.snake.segments.map((s) => ({ ...s })),
          directionQueue: [],
        },
      };
      return {
        state: next,
        events: [
          { type: 'PHASE_CHANGED', from: state.phase, to: targetPhase },
          {
            type: 'RUN_RESUMED',
            difficulty: next.difficulty,
            level: next.levelStats.level,
          },
        ],
      };
    }

    case 'CHANGE_DIRECTION':
      return enqueueDirection(state, command.direction);

    case 'TOGGLE_PAUSE': {
      if (state.phase === 'playing') {
        return {
          state: { ...state, phase: 'paused' },
          events: [{ type: 'PHASE_CHANGED', from: 'playing', to: 'paused' }],
        };
      }
      if (state.phase === 'paused') {
        return {
          state: { ...state, phase: 'playing' },
          events: [{ type: 'PHASE_CHANGED', from: 'paused', to: 'playing' }],
        };
      }
      return { state, events: [] };
    }

    case 'SET_PAUSED': {
      if (command.paused && state.phase === 'playing') {
        return {
          state: { ...state, phase: 'paused' },
          events: [{ type: 'PHASE_CHANGED', from: 'playing', to: 'paused' }],
        };
      }
      if (!command.paused && state.phase === 'paused') {
        return {
          state: { ...state, phase: 'playing' },
          events: [{ type: 'PHASE_CHANGED', from: 'paused', to: 'playing' }],
        };
      }
      return { state, events: [] };
    }

    case 'RETRY_LEVEL': {
      if (state.phase !== 'life_lost' || state.lives <= 0) {
        return { state, events: [] };
      }
      const seed = command.seed ?? deriveNextSeed(state.levelSeed, 19);
      const next = buildLevelSnapshot(
        {
          runId: state.runId,
          difficulty: state.difficulty,
          level: state.levelStats.level,
          score: state.score,
          lives: state.lives,
          maxLives: state.maxLives,
          nextLifeScore: state.nextLifeScore,
          totalApplesEaten: state.totalApplesEaten,
          totalStonesPushed: state.totalStonesPushed,
          maxLength: state.maxLength,
          highestLevel: state.highestLevel,
          phase: 'playing',
        },
        seed
      );
      return {
        state: next,
        events: [
          { type: 'PHASE_CHANGED', from: state.phase, to: 'playing' },
          { type: 'LEVEL_STARTED', level: next.levelStats.level, retry: true },
        ],
      };
    }

    case 'NEXT_LEVEL': {
      if (state.phase !== 'level_complete') {
        return { state, events: [] };
      }
      const nextLevel = state.levelStats.level + 1;
      const seed = command.seed ?? deriveNextSeed(state.levelSeed, nextLevel * 13);
      const next = buildLevelSnapshot(
        {
          runId: state.runId,
          difficulty: state.difficulty,
          level: nextLevel,
          score: state.score,
          lives: state.lives,
          maxLives: state.maxLives,
          nextLifeScore: state.nextLifeScore,
          totalApplesEaten: state.totalApplesEaten,
          totalStonesPushed: state.totalStonesPushed,
          maxLength: state.maxLength,
          highestLevel: Math.max(state.highestLevel, nextLevel),
          phase: 'playing',
        },
        seed
      );
      return {
        state: next,
        events: [
          { type: 'PHASE_CHANGED', from: state.phase, to: 'playing' },
          { type: 'LEVEL_STARTED', level: nextLevel, retry: false },
        ],
      };
    }

    case 'RETURN_TO_MENU': {
      if (state.phase === 'menu') {
        return { state, events: [] };
      }
      const next = createInitialSnapshot(state.difficulty, deriveNextSeed(state.levelSeed, 3));
      return {
        state: next,
        events: [{ type: 'PHASE_CHANGED', from: state.phase, to: 'menu' }],
      };
    }
  }
}

function triggerLifeLoss(
  state: GameSnapshot,
  reason: DeathReason,
  impactPos: GridPoint,
  events: GameEvent[]
): GameSnapshot {
  const livesRemaining = Math.max(0, state.lives - 1);
  const nextPhase = livesRemaining > 0 ? 'life_lost' : 'game_over';

  events.push({
    type: 'LIFE_LOST',
    reason,
    pos: impactPos,
    livesRemaining,
  });
  events.push({
    type: 'PHASE_CHANGED',
    from: state.phase,
    to: nextPhase,
  });

  if (nextPhase === 'game_over') {
    events.push({
      type: 'GAME_OVER',
      score: state.score,
      level: state.levelStats.level,
      difficulty: state.difficulty,
    });
  }

  return {
    ...state,
    phase: nextPhase,
    lives: livesRemaining,
    lastDeathReason: reason,
    moveProgress: 0,
    stepAccumulator: 0,
    resumeCountdownSec: 0,
    deathAnimSec: DEATH_ANIM_DURATION_SEC,
  };
}

function executeSingleStep(state: GameSnapshot, events: GameEvent[]): GameSnapshot {
  const profile = DIFFICULTY_PROFILES[state.difficulty];
  const prevSegments = state.snake.segments;
  const head = prevSegments[0]!;

  // Извлекаем следующее направление из буфера ввода
  let direction = state.snake.direction;
  let directionQueue = state.snake.directionQueue;
  if (directionQueue.length > 0) {
    const queued = directionQueue[0]!;
    directionQueue = directionQueue.slice(1);
    if (queued !== OPPOSITE_DIRECTION[direction]) {
      direction = queued;
    }
  }

  const vec = DIRECTION_VECTORS[direction];
  const nextHead = wrapPoint(head.x + vec.x, head.y + vec.y);
  const wrapped =
    Math.abs(nextHead.x - head.x) > 1 || Math.abs(nextHead.y - head.y) > 1;

  const goodAppleIdx = state.goodApples.findIndex((a) => samePoint(a.pos, nextHead));
  const badAppleIdx = state.badApples.findIndex((a) => samePoint(a.pos, nextHead));
  const stoneIdx = state.stones.findIndex((s) => samePoint(s.pos, nextHead));

  // Проверка самостолкновения (хвост освобождается, если не растём)
  const bodyToCheck =
    goodAppleIdx >= 0 ? prevSegments : prevSegments.slice(0, prevSegments.length - 1);
  const hitSelf = bodyToCheck.some((seg) => samePoint(seg, nextHead));
  if (hitSelf) {
    return triggerLifeLoss(state, 'self_collision', nextHead, events);
  }

  let score = state.score;
  let lives = state.lives;
  let nextLifeScore = state.nextLifeScore;
  let combo = state.combo;
  let frenzy = state.frenzy;
  let totalApplesEaten = state.totalApplesEaten;
  let totalStonesPushed = state.totalStonesPushed;
  let maxLength = state.maxLength;
  let goodApples: readonly GoodApple[] = state.goodApples;
  let badApples: readonly BadApple[] = state.badApples;
  let stones: readonly Stone[] = state.stones;
  let mistakes = state.levelStats.mistakes;
  let stonesPushed = state.levelStats.stonesPushed;
  const moves = state.levelStats.moves + 1;

  const grantExtraLivesIfEarned = (pos: GridPoint) => {
    const reward = evaluateExtraLives(score, lives, state.maxLives, nextLifeScore);
    lives = reward.lives;
    nextLifeScore = reward.nextLifeScore;
    for (let i = 0; i < reward.gainedCount; i += 1) {
      events.push({ type: 'LIFE_GAINED', lives, pos });
    }
  };

  let newSegments: GridPoint[];

  if (stoneIdx >= 0) {
    const stone = stones[stoneIdx]!;
    if (prevSegments.length <= stone.weight) {
      return triggerLifeLoss(state, 'stone_too_heavy', nextHead, events);
    }

    // Толкаем камень: змейка входит в клетку камня и теряет weight сегментов с хвоста
    const advanced = [nextHead, ...prevSegments.slice(0, -1)];
    const targetLen = Math.max(1, advanced.length - stone.weight);
    newSegments = advanced.slice(0, targetLen);

    // Проверяем траекторию полёта камня на столкновение с оставшимся телом змейки
    let landing = stone.pos;
    for (let step = 1; step <= GRID_PROFILE.stonePushDistance; step += 1) {
      landing = wrapPoint(landing.x + vec.x, landing.y + vec.y);
      if (newSegments.some((seg) => samePoint(seg, landing))) {
        return triggerLifeLoss(state, 'stone_hit_snake', landing, events);
      }
    }

    // Собираем занятые клетки для безопасного переноса вытесненных объектов
    const occupied = new Set<string>(newSegments.map(pointKey));
    occupied.add(pointKey(landing));
    for (const s of stones) {
      if (s.id !== stone.id && !samePoint(s.pos, landing)) occupied.add(pointKey(s.pos));
    }
    for (const a of goodApples) {
      if (!samePoint(a.pos, landing)) occupied.add(pointKey(a.pos));
    }
    for (const b of badApples) {
      if (!samePoint(b.pos, landing)) occupied.add(pointKey(b.pos));
    }

    const relocateSeedBase = state.levelSeed + moves * 37 + stone.id * 17;
    const nextStones = stones.map((s) => {
      if (s.id === stone.id) {
        return { ...s, pos: landing };
      }
      if (samePoint(s.pos, landing)) {
        const free = findFreeCell(occupied, relocateSeedBase + s.id);
        if (free) {
          occupied.add(pointKey(free));
          return { ...s, pos: free };
        }
      }
      return s;
    });

    const nextGoodApples = goodApples.map((a) => {
      if (samePoint(a.pos, landing)) {
        const free = findFreeCell(occupied, relocateSeedBase + 101 + a.id);
        if (free) {
          occupied.add(pointKey(free));
          return { ...a, pos: free };
        }
      }
      return a;
    });

    const nextBadApples = badApples.map((b) => {
      if (samePoint(b.pos, landing)) {
        const free = findFreeCell(occupied, relocateSeedBase + 211 + b.id);
        if (free) {
          occupied.add(pointKey(free));
          return { ...b, pos: free };
        }
      }
      return b;
    });

    stones = nextStones;
    goodApples = nextGoodApples;
    badApples = nextBadApples;

    const pushPoints = computeStonePushPoints(profile);
    score += pushPoints;
    stonesPushed += 1;
    totalStonesPushed += 1;

    events.push({ type: 'SNAKE_STEPPED', head: nextHead, wrapped });
    events.push({
      type: 'STONE_PUSHED',
      from: stone.pos,
      to: landing,
      points: pushPoints,
      weight: stone.weight,
    });
    grantExtraLivesIfEarned(landing);
  } else if (goodAppleIdx >= 0) {
    newSegments = [nextHead, ...prevSegments];
    goodApples = [
      ...goodApples.slice(0, goodAppleIdx),
      ...goodApples.slice(goodAppleIdx + 1),
    ];

    const wasFrenzy = frenzy.active;
    frenzy = createInitialFrenzy();
    combo = wasFrenzy ? 1 : Math.min(SCORING_PROFILE.maxComboStack, combo + 1);

    const points = computeGoodApplePoints(combo - 1, profile);
    score += points;
    totalApplesEaten += 1;
    maxLength = Math.max(maxLength, newSegments.length);

    events.push({ type: 'SNAKE_STEPPED', head: nextHead, wrapped });
    events.push({
      type: 'GOOD_APPLE_EATEN',
      pos: nextHead,
      points,
      combo,
      calmedFrenzy: wasFrenzy,
      remainingApples: goodApples.length,
    });
    if (wasFrenzy) {
      events.push({ type: 'FRENZY_CALMED' });
    }
    grantExtraLivesIfEarned(nextHead);
  } else if (badAppleIdx >= 0) {
    const advanced = [nextHead, ...prevSegments.slice(0, -1)];
    newSegments = advanced.length > 1 ? advanced.slice(0, -1) : advanced;
    badApples = [
      ...badApples.slice(0, badAppleIdx),
      ...badApples.slice(badAppleIdx + 1),
    ];

    const penaltyResult = applyBadApplePenalty(score);
    score = penaltyResult.nextScore;
    combo = 0;
    mistakes += 1;

    events.push({ type: 'SNAKE_STEPPED', head: nextHead, wrapped });
    events.push({
      type: 'BAD_APPLE_EATEN',
      pos: nextHead,
      penalty: penaltyResult.appliedPenalty,
      newLength: newSegments.length,
    });
  } else {
    newSegments = [nextHead, ...prevSegments.slice(0, -1)];
    events.push({ type: 'SNAKE_STEPPED', head: nextHead, wrapped });
  }

  const nextLevelStats = {
    ...state.levelStats,
    moves,
    mistakes,
    stonesPushed,
  };

  const effectiveSpeed = computeEffectiveSpeed(state.baseSpeed, frenzy.level, profile);

  // Проверка завершения уровня (все хорошие яблоки уровня собраны)
  if (goodApples.length === 0) {
    const summary = computeLevelSummary(nextLevelStats, profile);
    score += summary.totalBonus;
    grantExtraLivesIfEarned(nextHead);

    events.push({ type: 'LEVEL_COMPLETED', summary });
    events.push({ type: 'PHASE_CHANGED', from: state.phase, to: 'level_complete' });

    return {
      ...state,
      phase: 'level_complete',
      score,
      lives,
      nextLifeScore,
      combo,
      effectiveSpeed,
      moveProgress: 1,
      stepAccumulator: 0,
      snake: {
        segments: newSegments,
        previousSegments: prevSegments,
        direction,
        directionQueue: [],
      },
      goodApples,
      badApples,
      stones,
      frenzy,
      levelStats: nextLevelStats,
      lastLevelSummary: summary,
      totalApplesEaten,
      totalStonesPushed,
      maxLength,
    };
  }

  return {
    ...state,
    score,
    lives,
    nextLifeScore,
    combo,
    effectiveSpeed,
    snake: {
      segments: newSegments,
      previousSegments: prevSegments,
      direction,
      directionQueue,
    },
    goodApples,
    badApples,
    stones,
    frenzy,
    levelStats: nextLevelStats,
    totalApplesEaten,
    totalStonesPushed,
    maxLength,
  };
}

/**
 * Продвигает симуляцию на dtSec (секунды).
 * Защита от скачков при сворачивании вкладки: dt ограничивается 0.1 с.
 */
export function advanceSimulation(
  state: GameSnapshot,
  dtSec: number
): SimulationOutcome {
  if (dtSec <= 0) {
    return { state, events: [] };
  }

  const safeDt = Math.min(0.1, dtSec);

  // Проигрываем анимацию гибели перед появлением окна итогов
  if (
    (state.phase === 'life_lost' || state.phase === 'game_over') &&
    state.deathAnimSec > 0
  ) {
    return {
      state: {
        ...state,
        deathAnimSec: Math.max(0, state.deathAnimSec - safeDt),
      },
      events: [],
    };
  }

  if (state.phase !== 'playing') {
    return { state, events: [] };
  }

  // Короткий безопасный отсчёт при возврате из сохранённой партии
  if (state.resumeCountdownSec > 0) {
    return {
      state: {
        ...state,
        resumeCountdownSec: Math.max(0, state.resumeCountdownSec - safeDt),
        moveProgress: 0,
      },
      events: [],
    };
  }

  const profile = DIFFICULTY_PROFILES[state.difficulty];
  const events: GameEvent[] = [];

  // 1. Обновляем бешенство, голодное похудение и время уровня
  const frenzyTick = advanceFrenzy(state.frenzy, safeDt, profile);
  let mistakes = state.levelStats.mistakes;

  if (frenzyTick.startedNow) {
    events.push({ type: 'FRENZY_STARTED', level: state.levelStats.level });
  }
  if (frenzyTick.peakReachedNow) {
    mistakes += 1;
    events.push({ type: 'FRENZY_PEAK', level: state.levelStats.level });
  }

  let working: GameSnapshot = {
    ...state,
    frenzy: frenzyTick.nextFrenzy,
    effectiveSpeed: computeEffectiveSpeed(
      state.baseSpeed,
      frenzyTick.nextFrenzy.level,
      profile
    ),
    levelStats: {
      ...state.levelStats,
      mistakes,
      elapsedSec: state.levelStats.elapsedSec + safeDt,
    },
    stepAccumulator: state.stepAccumulator + safeDt,
  };

  // Голодное похудение в бешенстве: змейка теряет по 1 сегменту и может погибнуть на 0
  for (let i = 0; i < frenzyTick.shrinkCount; i += 1) {
    const segs = working.snake.segments;
    const head = segs[0]!;
    const tailLost = segs[segs.length - 1]!;

    if (segs.length <= 1) {
      events.push({
        type: 'SNAKE_SHRUNK',
        head,
        tailLost,
        newLength: 0,
      });
      const starved = triggerLifeLoss(working, 'starvation', head, events);
      return { state: starved, events };
    }

    const nextSegments = segs.slice(0, -1);
    const nextPrev = working.snake.previousSegments.slice(0, nextSegments.length);
    events.push({
      type: 'SNAKE_SHRUNK',
      head,
      tailLost,
      newLength: nextSegments.length,
    });
    working = {
      ...working,
      snake: {
        ...working.snake,
        segments: nextSegments,
        previousSegments: nextPrev,
      },
    };
  }

  // 2. Выполняем накопленные логические шаги сетки
  let guardSteps = 0;
  while (working.phase === 'playing' && guardSteps < 4) {
    const stepInterval = 1 / Math.max(0.5, working.effectiveSpeed);
    if (working.stepAccumulator < stepInterval) {
      break;
    }
    working = {
      ...working,
      stepAccumulator: working.stepAccumulator - stepInterval,
    };
    working = executeSingleStep(working, events);
    guardSteps += 1;
  }

  if (working.phase === 'playing') {
    const stepInterval = 1 / Math.max(0.5, working.effectiveSpeed);
    const moveProgress = Math.max(
      0,
      Math.min(1, working.stepAccumulator / stepInterval)
    );
    working = { ...working, moveProgress };
  }

  return { state: working, events };
}
