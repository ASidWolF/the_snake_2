/**
 * Роль: Обработчик (Processor).
 * Чистый расчёт очков, штрафов, бонусов эффективности уровня и пополнения жизней.
 */

import type { LevelStats, LevelSummary } from '../contracts/messages.ts';
import type { DifficultyProfile } from '../profiles/difficultyProfiles.ts';
import { SCORING_PROFILE } from '../profiles/scoringProfile.ts';

export interface LifeRewardResult {
  readonly lives: number;
  readonly nextLifeScore: number;
  readonly gainedCount: number;
}

export function computeGoodApplePoints(
  combo: number,
  profile: DifficultyProfile
): number {
  const stack = Math.max(0, Math.min(SCORING_PROFILE.maxComboStack, combo));
  const raw =
    SCORING_PROFILE.goodAppleBasePoints + stack * SCORING_PROFILE.comboBonusPerStack;
  return Math.round(raw * profile.scoreMultiplier);
}

export function computeStonePushPoints(profile: DifficultyProfile): number {
  return Math.round(SCORING_PROFILE.stonePushBasePoints * profile.scoreMultiplier);
}

export function applyBadApplePenalty(currentScore: number): {
  readonly nextScore: number;
  readonly appliedPenalty: number;
} {
  const appliedPenalty = Math.min(currentScore, SCORING_PROFILE.badApplePenalty);
  return {
    nextScore: Math.max(0, currentScore - SCORING_PROFILE.badApplePenalty),
    appliedPenalty,
  };
}

export function computeLevelSummary(
  stats: LevelStats,
  profile: DifficultyProfile
): LevelSummary {
  const baseBonus =
    SCORING_PROFILE.levelClearBasePoints +
    stats.level * SCORING_PROFILE.levelClearPerLevel;

  const moveRatio = stats.parMoves > 0 ? stats.moves / stats.parMoves : 1;
  let efficiencyFactor = 1;
  if (moveRatio <= 0.85) {
    efficiencyFactor = 1;
  } else if (moveRatio >= 2.0) {
    efficiencyFactor = 0;
  } else {
    efficiencyFactor = Math.max(0, 1 - (moveRatio - 0.85) / 1.15);
  }
  const efficiencyBonus = Math.round(
    SCORING_PROFILE.maxEfficiencyBonus * efficiencyFactor
  );

  const perfectBonus =
    stats.mistakes === 0 ? SCORING_PROFILE.perfectNoMistakeBonus : 0;
  const mistakePenalty = stats.mistakes * SCORING_PROFILE.mistakePenaltyInBonus;

  const preMultiplier = Math.max(
    SCORING_PROFILE.levelClearBasePoints,
    baseBonus + efficiencyBonus + perfectBonus - mistakePenalty
  );
  const totalBonus = Math.round(preMultiplier * profile.scoreMultiplier);

  let efficiencyRating: 1 | 2 | 3 = 1;
  if (stats.mistakes === 0 && moveRatio <= 1.15) {
    efficiencyRating = 3;
  } else if (stats.mistakes <= 1 && moveRatio <= 1.5) {
    efficiencyRating = 2;
  }

  return {
    level: stats.level,
    moves: stats.moves,
    parMoves: stats.parMoves,
    mistakes: stats.mistakes,
    baseBonus,
    efficiencyBonus,
    perfectBonus,
    mistakePenalty,
    totalBonus,
    efficiencyRating,
  };
}

export function evaluateExtraLives(
  score: number,
  currentLives: number,
  maxLives: number,
  nextLifeScore: number
): LifeRewardResult {
  let lives = currentLives;
  let threshold = nextLifeScore;
  let gainedCount = 0;

  while (score >= threshold) {
    threshold += SCORING_PROFILE.extraLifeScoreStep;
    if (lives < maxLives) {
      lives += 1;
      gainedCount += 1;
    }
  }

  return { lives, nextLifeScore: threshold, gainedCount };
}
