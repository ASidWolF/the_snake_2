/**
 * Профили трёх уровней сложности. Только данные без логики.
 */

import type { DifficultyKey } from '../contracts/messages.ts';

export interface DifficultyProfile {
  readonly key: DifficultyKey;
  readonly label: string;
  readonly shortDesc: string;
  readonly accentColor: string;
  readonly scoreMultiplier: number;
  readonly startBaseSpeed: number; // шагов/сек на уровне 1
  readonly speedStepPerLevel: number;
  readonly maxBaseSpeed: number;
  readonly frenzyCalmSec: number; // секунд спокойствия до начала бешенства
  readonly frenzyRampSec: number; // секунд до пика бешенства
  readonly frenzyMaxMultiplier: number; // во сколько раз ускоряется на пике
  readonly stoneWeight: number;
  readonly goodApplesBase: number;
  readonly goodApplesPerLevel: number;
  readonly goodApplesMax: number;
  readonly badApplesBase: number;
  readonly badApplesEveryLevels: number;
  readonly badApplesMax: number;
  readonly stonesBase: number;
  readonly stonesEveryLevels: number;
  readonly stonesMax: number;
}

export const DIFFICULTY_PROFILES: Readonly<Record<DifficultyKey, DifficultyProfile>> = {
  easy: {
    key: 'easy',
    label: 'Легко',
    shortDesc: 'Спокойный темп, меньше ловушек, мягкое бешенство',
    accentColor: '#34d399',
    scoreMultiplier: 1.0,
    startBaseSpeed: 5.2,
    speedStepPerLevel: 0.28,
    maxBaseSpeed: 11.5,
    frenzyCalmSec: 7.0,
    frenzyRampSec: 9.0,
    frenzyMaxMultiplier: 1.45,
    stoneWeight: 3,
    goodApplesBase: 6,
    goodApplesPerLevel: 1,
    goodApplesMax: 20,
    badApplesBase: 2,
    badApplesEveryLevels: 2,
    badApplesMax: 14,
    stonesBase: 2,
    stonesEveryLevels: 2,
    stonesMax: 16,
  },
  normal: {
    key: 'normal',
    label: 'Нормально',
    shortDesc: 'Сбалансированный вызов, множитель очков ×1.5',
    accentColor: '#38bdf8',
    scoreMultiplier: 1.5,
    startBaseSpeed: 6.5,
    speedStepPerLevel: 0.38,
    maxBaseSpeed: 14.0,
    frenzyCalmSec: 5.0,
    frenzyRampSec: 7.0,
    frenzyMaxMultiplier: 1.65,
    stoneWeight: 4,
    goodApplesBase: 7,
    goodApplesPerLevel: 1,
    goodApplesMax: 22,
    badApplesBase: 4,
    badApplesEveryLevels: 1,
    badApplesMax: 20,
    stonesBase: 4,
    stonesEveryLevels: 1,
    stonesMax: 22,
  },
  hard: {
    key: 'hard',
    label: 'Сложно',
    shortDesc: 'Высокая скорость, частое бешенство, множитель ×2.0',
    accentColor: '#f43f5e',
    scoreMultiplier: 2.0,
    startBaseSpeed: 8.0,
    speedStepPerLevel: 0.48,
    maxBaseSpeed: 16.5,
    frenzyCalmSec: 3.5,
    frenzyRampSec: 5.0,
    frenzyMaxMultiplier: 1.9,
    stoneWeight: 5,
    goodApplesBase: 8,
    goodApplesPerLevel: 1,
    goodApplesMax: 24,
    badApplesBase: 6,
    badApplesEveryLevels: 1,
    badApplesMax: 26,
    stonesBase: 6,
    stonesEveryLevels: 1,
    stonesMax: 28,
  },
};

export const DIFFICULTY_ORDER: readonly DifficultyKey[] = ['easy', 'normal', 'hard'];
