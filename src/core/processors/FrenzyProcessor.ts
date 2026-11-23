/**
 * Роль: Обработчик (Processor).
 * Чистый расчёт базовой скорости уровня, «змеиного бешенства» и итоговой скорости.
 */

import type { FrenzyState } from '../contracts/messages.ts';
import type { DifficultyProfile } from '../profiles/difficultyProfiles.ts';

export interface FrenzyTickResult {
  readonly nextFrenzy: FrenzyState;
  readonly startedNow: boolean;
  readonly peakReachedNow: boolean;
}

export function createInitialFrenzy(): FrenzyState {
  return {
    hungerSec: 0,
    level: 0,
    active: false,
    peakTriggered: false,
  };
}

export function computeBaseSpeed(level: number, profile: DifficultyProfile): number {
  const safeLevel = Math.max(1, Math.floor(level));
  const raw = profile.startBaseSpeed + (safeLevel - 1) * profile.speedStepPerLevel;
  return Math.min(profile.maxBaseSpeed, Number(raw.toFixed(3)));
}

export function computeEffectiveSpeed(
  baseSpeed: number,
  frenzyLevel: number,
  profile: DifficultyProfile
): number {
  const clamped = Math.max(0, Math.min(1, frenzyLevel));
  const mult = 1 + clamped * (profile.frenzyMaxMultiplier - 1);
  return Number((baseSpeed * mult).toFixed(3));
}

export function advanceFrenzy(
  current: FrenzyState,
  dtSec: number,
  profile: DifficultyProfile
): FrenzyTickResult {
  if (dtSec <= 0) {
    return { nextFrenzy: current, startedNow: false, peakReachedNow: false };
  }

  const hungerSec = current.hungerSec + dtSec;
  if (hungerSec <= profile.frenzyCalmSec) {
    return {
      nextFrenzy: {
        hungerSec,
        level: 0,
        active: false,
        peakTriggered: false,
      },
      startedNow: false,
      peakReachedNow: false,
    };
  }

  const overSec = hungerSec - profile.frenzyCalmSec;
  const level = Math.max(0, Math.min(1, overSec / profile.frenzyRampSec));
  const startedNow = !current.active && level > 0;
  const peakReachedNow = !current.peakTriggered && level >= 1;

  return {
    nextFrenzy: {
      hungerSec,
      level,
      active: true,
      peakTriggered: current.peakTriggered || level >= 1,
    },
    startedNow,
    peakReachedNow,
  };
}
