/**
 * Профиль подсчёта очков, жизней и настроек по умолчанию. Только данные.
 */

import type { UserSettings } from '../contracts/messages.ts';

export const SCORING_PROFILE = {
  goodAppleBasePoints: 20,
  comboBonusPerStack: 4,
  maxComboStack: 8,
  stonePushBasePoints: 40,
  badApplePenalty: 15,
  levelClearBasePoints: 100,
  levelClearPerLevel: 25,
  maxEfficiencyBonus: 150,
  perfectNoMistakeBonus: 50,
  mistakePenaltyInBonus: 30,
  movesPerApplePar: 14,
  startingLives: 3,
  maxLives: 5,
  extraLifeScoreStep: 1200,
  maxLeaderboardEntries: 25,
  maxPlayerNameLength: 18,
  defaultPlayerName: 'Игрок',
} as const;

export const DEFAULT_USER_SETTINGS: UserSettings = {
  language: 'ru',
  difficulty: 'normal',
  audio: {
    masterVolume: 0.75,
    musicVolume: 0.5,
    sfxVolume: 0.85,
    muted: false,
  },
  touchControls: 'auto',
  lastPlayerName: '',
};
