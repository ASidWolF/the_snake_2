import { describe, expect, it } from 'vitest';
import { DIFFICULTY_PROFILES } from '../src/core/profiles/difficultyProfiles.ts';
import { SCORING_PROFILE } from '../src/core/profiles/scoringProfile.ts';
import {
  advanceFrenzy,
  computeBaseSpeed,
  computeEffectiveSpeed,
  createInitialFrenzy,
} from '../src/core/processors/FrenzyProcessor.ts';
import {
  computeGoodApplePoints,
  computeLevelSummary,
  evaluateExtraLives,
} from '../src/core/processors/ScoreProcessor.ts';

describe('FrenzyProcessor и ScoreProcessor', () => {
  it('плавно увеличивает базовую скорость по уровням и на высокой сложности быстрее', () => {
    const easy1 = computeBaseSpeed(1, DIFFICULTY_PROFILES.easy);
    const easy4 = computeBaseSpeed(4, DIFFICULTY_PROFILES.easy);
    const hard1 = computeBaseSpeed(1, DIFFICULTY_PROFILES.hard);

    expect(easy4).toBeGreaterThan(easy1);
    expect(hard1).toBeGreaterThan(easy1);
    expect(computeBaseSpeed(99, DIFFICULTY_PROFILES.hard)).toBe(
      DIFFICULTY_PROFILES.hard.maxBaseSpeed
    );
  });

  it('разгоняет бешенство после спокойного окна и достигает пика 1.0', () => {
    const profile = DIFFICULTY_PROFILES.hard;
    let state = createInitialFrenzy();

    // В пределах спокойного окна бешенства нет
    const calm = advanceFrenzy(state, profile.frenzyCalmSec - 0.1, profile);
    expect(calm.nextFrenzy.active).toBe(false);
    expect(calm.nextFrenzy.level).toBe(0);

    // Вход в бешенство
    const entered = advanceFrenzy(calm.nextFrenzy, 1.0, profile);
    expect(entered.startedNow).toBe(true);
    expect(entered.nextFrenzy.active).toBe(true);
    expect(entered.nextFrenzy.level).toBeGreaterThan(0);

    // Выход на пик
    const peak = advanceFrenzy(entered.nextFrenzy, profile.frenzyRampSec + 1, profile);
    expect(peak.peakReachedNow).toBe(true);
    expect(peak.nextFrenzy.level).toBe(1);

    const baseSpeed = computeBaseSpeed(1, profile);
    const peakSpeed = computeEffectiveSpeed(baseSpeed, peak.nextFrenzy.level, profile);
    expect(peakSpeed).toBeCloseTo(baseSpeed * profile.frenzyMaxMultiplier, 2);
  });

  it('начисляет больше бонуса при меньшем числе ходов и без ошибок + учитывает сложность', () => {
    const cleanFast = computeLevelSummary(
      {
        level: 2,
        initialGoodApples: 8,
        initialBadApples: 5,
        initialStones: 5,
        moves: 60,
        parMoves: 112,
        mistakes: 0,
        stonesPushed: 0,
        elapsedSec: 12,
      },
      DIFFICULTY_PROFILES.normal
    );

    const messySlow = computeLevelSummary(
      {
        level: 2,
        initialGoodApples: 8,
        initialBadApples: 5,
        initialStones: 5,
        moves: 210,
        parMoves: 112,
        mistakes: 3,
        stonesPushed: 0,
        elapsedSec: 40,
      },
      DIFFICULTY_PROFILES.normal
    );

    expect(cleanFast.totalBonus).toBeGreaterThan(messySlow.totalBonus);
    expect(cleanFast.perfectBonus).toBe(SCORING_PROFILE.perfectNoMistakeBonus);
    expect(cleanFast.efficiencyRating).toBe(3);
    expect(messySlow.efficiencyRating).toBe(1);

    const easyPts = computeGoodApplePoints(0, DIFFICULTY_PROFILES.easy);
    const hardPts = computeGoodApplePoints(0, DIFFICULTY_PROFILES.hard);
    expect(hardPts).toBe(easyPts * 2);
  });

  it('выдаёт дополнительные жизни за очки с ограничением maxLives', () => {
    const r1 = evaluateExtraLives(1250, 3, 5, 1200);
    expect(r1.lives).toBe(4);
    expect(r1.gainedCount).toBe(1);
    expect(r1.nextLifeScore).toBe(2400);

    const capped = evaluateExtraLives(5000, 5, 5, 1200);
    expect(capped.lives).toBe(5);
    expect(capped.gainedCount).toBe(0);
  });
});
