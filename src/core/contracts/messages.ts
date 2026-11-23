/**
 * Неизменяемые типы данных и сообщения-контракты ядра The Snake 2.
 * Принцип: закрытый список форм контрактов — только readonly структуры.
 */

export type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

export type DifficultyKey = 'easy' | 'normal' | 'hard';

export type GamePhase =
  | 'menu'
  | 'playing'
  | 'paused'
  | 'life_lost'
  | 'level_complete'
  | 'game_over';

export type DeathReason =
  | 'self_collision'
  | 'stone_too_heavy'
  | 'stone_hit_snake';

export interface GridPoint {
  readonly x: number;
  readonly y: number;
}

export interface GoodApple {
  readonly id: number;
  readonly pos: GridPoint;
}

export interface BadApple {
  readonly id: number;
  readonly pos: GridPoint;
}

export interface Stone {
  readonly id: number;
  readonly pos: GridPoint;
  readonly weight: number;
}

export interface SnakeState {
  readonly segments: readonly GridPoint[];
  readonly previousSegments: readonly GridPoint[];
  readonly direction: Direction;
  readonly directionQueue: readonly Direction[];
}

export interface FrenzyState {
  readonly hungerSec: number;
  readonly level: number; // 0..1
  readonly active: boolean;
  readonly peakTriggered: boolean;
}

export interface LevelStats {
  readonly level: number;
  readonly initialGoodApples: number;
  readonly initialBadApples: number;
  readonly initialStones: number;
  readonly moves: number;
  readonly parMoves: number;
  readonly mistakes: number;
  readonly stonesPushed: number;
  readonly elapsedSec: number;
}

export interface LevelSummary {
  readonly level: number;
  readonly moves: number;
  readonly parMoves: number;
  readonly mistakes: number;
  readonly baseBonus: number;
  readonly efficiencyBonus: number;
  readonly perfectBonus: number;
  readonly mistakePenalty: number;
  readonly totalBonus: number;
  readonly efficiencyRating: 1 | 2 | 3;
}

export interface GameSnapshot {
  readonly phase: GamePhase;
  readonly difficulty: DifficultyKey;
  readonly score: number;
  readonly lives: number;
  readonly maxLives: number;
  readonly nextLifeScore: number;
  readonly combo: number;
  readonly baseSpeed: number;
  readonly effectiveSpeed: number;
  readonly moveProgress: number; // 0..1 для плавной интерполяции
  readonly stepAccumulator: number;
  readonly snake: SnakeState;
  readonly goodApples: readonly GoodApple[];
  readonly badApples: readonly BadApple[];
  readonly stones: readonly Stone[];
  readonly frenzy: FrenzyState;
  readonly levelStats: LevelStats;
  readonly lastLevelSummary: LevelSummary | null;
  readonly lastDeathReason: DeathReason | null;
  readonly totalApplesEaten: number;
  readonly totalStonesPushed: number;
  readonly maxLength: number;
  readonly highestLevel: number;
  readonly levelSeed: number;
}

export interface AudioSettings {
  readonly masterVolume: number; // 0..1
  readonly musicVolume: number; // 0..1
  readonly sfxVolume: number; // 0..1
  readonly muted: boolean;
}

export type TouchControlMode = 'auto' | 'dpad' | 'swipe';

export interface UserSettings {
  readonly difficulty: DifficultyKey;
  readonly audio: AudioSettings;
  readonly touchControls: TouchControlMode;
  readonly lastPlayerName: string;
}

export interface LeaderboardEntry {
  readonly id: string;
  readonly playerName: string;
  readonly score: number;
  readonly level: number;
  readonly apples: number;
  readonly maxLength: number;
  readonly difficulty: DifficultyKey;
  readonly createdAt: string;
}

/** Входные команды от датчиков (клавиатура, тач, UI) */
export type GameCommand =
  | { readonly type: 'START_NEW_RUN'; readonly difficulty: DifficultyKey; readonly seed?: number }
  | { readonly type: 'CHANGE_DIRECTION'; readonly direction: Direction }
  | { readonly type: 'TOGGLE_PAUSE' }
  | { readonly type: 'SET_PAUSED'; readonly paused: boolean }
  | { readonly type: 'RETRY_LEVEL'; readonly seed?: number }
  | { readonly type: 'NEXT_LEVEL'; readonly seed?: number }
  | { readonly type: 'RETURN_TO_MENU' };

/** Исходящие доменные события (публикуются через EventBus исполнителям) */
export type GameEvent =
  | { readonly type: 'RUN_STARTED'; readonly difficulty: DifficultyKey; readonly level: number }
  | { readonly type: 'LEVEL_STARTED'; readonly level: number; readonly retry: boolean }
  | { readonly type: 'SNAKE_STEPPED'; readonly head: GridPoint; readonly wrapped: boolean }
  | {
      readonly type: 'GOOD_APPLE_EATEN';
      readonly pos: GridPoint;
      readonly points: number;
      readonly combo: number;
      readonly calmedFrenzy: boolean;
      readonly remainingApples: number;
    }
  | {
      readonly type: 'BAD_APPLE_EATEN';
      readonly pos: GridPoint;
      readonly penalty: number;
      readonly newLength: number;
    }
  | {
      readonly type: 'STONE_PUSHED';
      readonly from: GridPoint;
      readonly to: GridPoint;
      readonly points: number;
      readonly weight: number;
    }
  | { readonly type: 'FRENZY_STARTED'; readonly level: number }
  | { readonly type: 'FRENZY_PEAK'; readonly level: number }
  | { readonly type: 'FRENZY_CALMED' }
  | { readonly type: 'LIFE_GAINED'; readonly lives: number; readonly pos: GridPoint }
  | {
      readonly type: 'LIFE_LOST';
      readonly reason: DeathReason;
      readonly pos: GridPoint;
      readonly livesRemaining: number;
    }
  | { readonly type: 'LEVEL_COMPLETED'; readonly summary: LevelSummary }
  | {
      readonly type: 'GAME_OVER';
      readonly score: number;
      readonly level: number;
      readonly difficulty: DifficultyKey;
    }
  | { readonly type: 'PHASE_CHANGED'; readonly from: GamePhase; readonly to: GamePhase }
  | { readonly type: 'UI_CLICK' };
