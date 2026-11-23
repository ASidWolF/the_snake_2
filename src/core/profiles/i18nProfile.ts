/**
 * Профиль локализации (Русский / English). Только данные без логики.
 */

import type {
  DeathReason,
  DifficultyKey,
  LanguageKey,
} from '../contracts/messages.ts';

export interface I18nStrings {
  readonly defaultPlayerName: string;
  readonly modeDesktop: string;
  readonly modeWeb: string;
  readonly badgeProcedural: string;
  readonly menuSubtitle: string;
  readonly menuBestScore: string;
  readonly menuDifficultyLabel: string;
  readonly btnContinue: string;
  readonly btnNewGameFromL1: string;
  readonly btnStartGame: string;
  readonly btnLeaderboard: string;
  readonly btnSettings: string;
  readonly btnRules: string;
  readonly btnQuit: string;
  readonly menuFooter: string;

  readonly difficultyLabels: Readonly<Record<DifficultyKey, string>>;
  readonly difficultyDescs: Readonly<Record<DifficultyKey, string>>;

  readonly hudLevel: string;
  readonly hudLength: string;
  readonly hudScore: string;
  readonly hudMaxLives: string;
  readonly hudBonusLifeReady: string;
  readonly hudNextLifeTooltip: string;
  readonly hudSpeedUnit: string;
  readonly hudCalm: string;
  readonly hudFrenzyRising: string;
  readonly hudFrenzyPeak: string;
  readonly hudMuteTitle: string;
  readonly hudSettingsTitle: string;
  readonly hudPauseTitle: string;
  readonly hudLevelShort: string;
  readonly hudPointsWord: string;

  readonly pauseTitle: string;
  readonly pauseRemainingApples: string;
  readonly btnResume: string;
  readonly btnPauseSettings: string;
  readonly btnReturnToMenuKeep: string;
  readonly btnSaveRecord: string;
  readonly btnRecordSaved: string;

  readonly lifeLostTitle: string;
  readonly lifeLostRemaining: string;
  readonly lifeLostScore: string;
  readonly btnRetryLevel: string;
  readonly deathReasons: Readonly<Record<DeathReason, string>>;

  readonly levelCompleteTitle: string;
  readonly levelCompleteSub: string;
  readonly statMoves: string;
  readonly statPar: string;
  readonly statMistakes: string;
  readonly statLevelBonus: string;
  readonly statTotalScore: string;
  readonly levelBonusLifeBanner: string;
  readonly btnNextLevel: string;

  readonly exitTitle: string;
  readonly saveRecordTitle: string;
  readonly exitSubPrefix: string;
  readonly exitSubSuffix: string;
  readonly saveRecordSub: string;
  readonly statCurrentScore: string;
  readonly statReachedLevel: string;
  readonly savedBannerRank: string;
  readonly namePlaceholder: string;
  readonly btnSaveAndExit: string;
  readonly btnSave: string;
  readonly btnExitWithoutRecord: string;
  readonly btnCancel: string;
  readonly btnBack: string;

  readonly gameOverTitle: string;
  readonly gameOverDefaultReason: string;
  readonly statFinalScore: string;
  readonly statApplesCollected: string;
  readonly statMaxLength: string;
  readonly btnPlayAgain: string;
  readonly btnToMenu: string;

  readonly settingsTitle: string;
  readonly settingsSub: string;
  readonly settingLanguage: string;
  readonly settingMaster: string;
  readonly settingMusic: string;
  readonly settingSfx: string;
  readonly settingTouch: string;
  readonly touchAuto: string;
  readonly touchAlways: string;
  readonly touchSwipeOnly: string;
  readonly btnSoundOff: string;
  readonly btnSoundOn: string;
  readonly btnDone: string;

  readonly lbTitle: string;
  readonly lbStorageDesktop: string;
  readonly lbStorageWeb: string;
  readonly lbStoragePrefix: string;
  readonly lbTabAll: string;
  readonly lbEmpty: string;
  readonly lbColPlayer: string;
  readonly lbColScore: string;
  readonly lbColLevel: string;
  readonly lbColDifficulty: string;
  readonly btnClear: string;
  readonly btnClose: string;

  readonly rulesTitle: string;
  readonly rulesSub: string;
  readonly ruleGoodTitle: string;
  readonly ruleGoodBody: string;
  readonly ruleFrenzyTitle: string;
  readonly ruleFrenzyBody: string;
  readonly ruleStoneTitle: string;
  readonly ruleStoneBody: string;
  readonly ruleBadTitle: string;
  readonly ruleBadBody: string;
  readonly ruleLivesTitle: string;
  readonly ruleLivesBody: string;
  readonly btnGotIt: string;

  readonly speechYum: string;
  readonly speechEw: string;
  readonly speechEat: string;
  readonly speechEatPeak: string;
  readonly speechShrinking: string;
  readonly floatExtraLife: string;
  readonly floatMinusLength: string;
  readonly countdownReady: string;
  readonly countdownGo: string;
}

export const I18N_PROFILES: Readonly<Record<LanguageKey, I18nStrings>> = {
  ru: {
    defaultPlayerName: 'Игрок',
    modeDesktop: 'ПК-приложение',
    modeWeb: 'Веб-версия',
    badgeProcedural: '100% процедурно',
    menuSubtitle:
      'Уровневая прогрессия, змеиное бешенство, толкаемые камни и адаптивный саундтрек.',
    menuBestScore: 'Лучший счёт',
    menuDifficultyLabel: 'Уровень сложности (для новой игры)',
    btnContinue: '▶ Продолжить игру',
    btnNewGameFromL1: '✨ Новая игра (с 1 уровня)',
    btnStartGame: '▶ Начать игру',
    btnLeaderboard: '🏆 Рекорды',
    btnSettings: '⚙️ Настройки',
    btnRules: '📖 Правила',
    btnQuit: 'Выход',
    menuFooter:
      'ПК: WASD / Стрелки, Space — пауза, M — звук · Телефоны и планшеты: свайпы или D-pad',

    difficultyLabels: {
      easy: 'Легко',
      normal: 'Нормально',
      hard: 'Сложно',
    },
    difficultyDescs: {
      easy: 'Спокойный темп, меньше ловушек, мягкое бешенство',
      normal: 'Сбалансированный вызов, множитель очков ×1.5',
      hard: 'Высокая скорость, частое бешенство, множитель ×2.0',
    },

    hudLevel: 'Ур.',
    hudLength: 'Длина',
    hudScore: 'Очки',
    hudMaxLives: '· МАКС ♥',
    hudBonusLifeReady: '· +♥ на финише!',
    hudNextLifeTooltip: 'Очков до бонусной жизни (начисляется при прохождении уровня)',
    hudSpeedUnit: 'ш/с',
    hudCalm: 'Спокойна',
    hudFrenzyRising: '⚡ Звереет',
    hudFrenzyPeak: '🔥 БЕШЕНСТВО!',
    hudMuteTitle: 'Звук (M)',
    hudSettingsTitle: 'Настройки',
    hudPauseTitle: 'Пауза (Space / P)',
    hudLevelShort: 'Уровень',
    hudPointsWord: 'Очки',

    pauseTitle: 'Пауза',
    pauseRemainingApples: 'Осталось яблок',
    btnResume: '▶ Продолжить',
    btnPauseSettings: '⚙️ Громкость, язык и управление',
    btnReturnToMenuKeep: '⬅ В главное меню (прогресс сохранится)',
    btnSaveRecord: '🏆 Сохранить рекорд',
    btnRecordSaved: '✓ Рекорд записан',

    lifeLostTitle: 'Потеряна жизнь',
    lifeLostRemaining: 'Осталось жизней',
    lifeLostScore: 'Текущий счёт',
    btnRetryLevel: '↻ Повторить уровень',
    deathReasons: {
      self_collision: 'Змейка врезалась в собственный хвост.',
      stone_too_heavy:
        'Камень оказался слишком тяжёлым — длина змейки должна быть больше веса камня.',
      stone_hit_snake: 'Отлетевший камень задел тело змейки.',
      starvation: 'Змейка похудела до нуля от голода во время бешенства!',
    },

    levelCompleteTitle: 'пройден!',
    levelCompleteSub: 'Все хорошие яблоки собраны. Готовься к ускорению на уровне',
    statMoves: 'Ходы',
    statPar: 'эталон',
    statMistakes: 'Ошибки',
    statLevelBonus: 'Бонус уровня',
    statTotalScore: 'Общий счёт',
    levelBonusLifeBanner: '♥ Бонусная жизнь получена:',
    btnNextLevel: '➡ Уровень',

    exitTitle: 'Выход в главное меню',
    saveRecordTitle: 'Сохранить рекорд',
    exitSubPrefix: 'Прогресс (Ур.',
    exitSubSuffix:
      ') сохранён — вы сможете нажать «Продолжить». Хотите также записать текущий счёт в таблицу рекордов?',
    saveRecordSub:
      'При продолжении партии рекорд автоматически обновится без дубликатов.',
    statCurrentScore: 'Текущий счёт',
    statReachedLevel: 'Достигнут уровень',
    savedBannerRank: 'Рекорд сохранён! Место в таблице:',
    namePlaceholder: 'Ваше имя для таблицы рекордов',
    btnSaveAndExit: 'Сохранить и выйти',
    btnSave: 'Сохранить',
    btnExitWithoutRecord: '💾 Выйти без записи рекорда (прогресс сохранён)',
    btnCancel: 'Отмена',
    btnBack: 'Назад',

    gameOverTitle: 'Игра окончена',
    gameOverDefaultReason: 'Жизни закончились.',
    statFinalScore: 'Итоговый счёт',
    statApplesCollected: 'Собрано яблок',
    statMaxLength: 'Макс. длина',
    btnPlayAgain: '↻ Играть снова',
    btnToMenu: 'В меню',

    settingsTitle: 'Настройки',
    settingsSub: 'Язык, процедурный звук Web Audio и управление',
    settingLanguage: 'Язык / Language',
    settingMaster: 'Общая громкость',
    settingMusic: 'Музыка',
    settingSfx: 'Звуковые эффекты (SFX)',
    settingTouch: 'Сенсорный D-pad (телефоны / планшеты)',
    touchAuto: 'Авто',
    touchAlways: 'Всегда',
    touchSwipeOnly: 'Только свайп',
    btnSoundOff: '🔇 Звук выкл.',
    btnSoundOn: '🔊 Звук вкл.',
    btnDone: 'Готово',

    lbTitle: '🏆 Таблица рекордов',
    lbStorageDesktop: 'файл ПК',
    lbStorageWeb: 'браузер',
    lbStoragePrefix: 'Локальное хранилище',
    lbTabAll: 'Все',
    lbEmpty: 'Рекордов пока нет — сыграйте первую партию!',
    lbColPlayer: 'Игрок',
    lbColScore: 'Очки',
    lbColLevel: 'Ур.',
    lbColDifficulty: 'Сложность',
    btnClear: 'Очистить',
    btnClose: 'Закрыть',

    rulesTitle: '📖 Правила The Snake 2',
    rulesSub: 'Уровни, бешенство, камни с весом и пополняемые жизни',
    ruleGoodTitle: 'Хорошие яблоки:',
    ruleGoodBody:
      'количество на уровне фиксировано. Соберите все, чтобы пройти уровень! Чем меньше ходов и ошибок — тем выше бонус эффективности.',
    ruleFrenzyTitle: 'Змеиное бешенство и похудение:',
    ruleFrenzyBody:
      'без хороших яблок змейка кричит «ЕСТЬ!», ускоряется, а затем начинает худеть («Худею!») — если длина дойдёт до нуля, змейка погибнет от голода! Съешьте хорошее яблоко, чтобы успокоить её.',
    ruleStoneTitle: 'Камни с весом:',
    ruleStoneBody:
      'число на камне — его вес. Если длина змейки больше веса (камень светится бирюзовым), его можно толкнуть за бонус, потеряв хвост. Иначе — потеря жизни.',
    ruleBadTitle: 'Плохие яблоки:',
    ruleBadBody:
      'фиолетовые с крестом — отнимают 1 сегмент длины, штрафуют счёт и добавляют ошибку уровня.',
    ruleLivesTitle: 'Жизни, пауза и рекорды:',
    ruleLivesBody:
      'при ошибке вы теряете жизнь и переигрываете уровень (очки неудачной попытки откатываются). Набирайте очки и проходите уровни, чтобы получать бонусные жизни (до 5, порог растёт). Прогресс сохраняется автоматически.',
    btnGotIt: 'Понятно',

    speechYum: 'Ням!',
    speechEw: 'Фу!',
    speechEat: 'ЕСТЬ!',
    speechEatPeak: 'ЕСТЬ!!',
    speechShrinking: 'Худею!',
    floatExtraLife: '+1 ЖИЗНЬ!',
    floatMinusLength: '-1 ДЛИНА',
    countdownReady: 'Приготовься',
    countdownGo: 'СТАРТ!',
  },

  en: {
    defaultPlayerName: 'Player',
    modeDesktop: 'Desktop App',
    modeWeb: 'Web Version',
    badgeProcedural: '100% Procedural',
    menuSubtitle:
      'Level progression, snake frenzy, pushable weighted stones, and adaptive soundtrack.',
    menuBestScore: 'Best Score',
    menuDifficultyLabel: 'Difficulty (for New Game)',
    btnContinue: '▶ Continue Game',
    btnNewGameFromL1: '✨ New Game (Level 1)',
    btnStartGame: '▶ Start Game',
    btnLeaderboard: '🏆 Leaderboard',
    btnSettings: '⚙️ Settings',
    btnRules: '📖 Rules',
    btnQuit: 'Quit',
    menuFooter:
      'PC: WASD / Arrows, Space — Pause, M — Mute · Mobile & Tablets: Swipes or D-pad',

    difficultyLabels: {
      easy: 'Easy',
      normal: 'Normal',
      hard: 'Hard',
    },
    difficultyDescs: {
      easy: 'Relaxed pace, fewer hazards, gentle frenzy',
      normal: 'Balanced challenge, ×1.5 score multiplier',
      hard: 'Fast pace, rapid frenzy, ×2.0 score multiplier',
    },

    hudLevel: 'Lv.',
    hudLength: 'Len',
    hudScore: 'Score',
    hudMaxLives: '· MAX ♥',
    hudBonusLifeReady: '· +♥ on clear!',
    hudNextLifeTooltip: 'Points until bonus life (awarded on level clear)',
    hudSpeedUnit: 'c/s',
    hudCalm: 'Calm',
    hudFrenzyRising: '⚡ Hungry',
    hudFrenzyPeak: '🔥 FRENZY!',
    hudMuteTitle: 'Sound (M)',
    hudSettingsTitle: 'Settings',
    hudPauseTitle: 'Pause (Space / P)',
    hudLevelShort: 'Level',
    hudPointsWord: 'Score',

    pauseTitle: 'Paused',
    pauseRemainingApples: 'Apples left',
    btnResume: '▶ Resume',
    btnPauseSettings: '⚙️ Audio, Language & Controls',
    btnReturnToMenuKeep: '⬅ Main Menu (progress saved)',
    btnSaveRecord: '🏆 Save Score',
    btnRecordSaved: '✓ Score Saved',

    lifeLostTitle: 'Life Lost',
    lifeLostRemaining: 'Lives remaining',
    lifeLostScore: 'Current score',
    btnRetryLevel: '↻ Retry Level',
    deathReasons: {
      self_collision: 'The snake collided with its own tail.',
      stone_too_heavy:
        'The stone was too heavy — snake length must exceed the stone weight.',
      stone_hit_snake: 'A pushed stone struck the snake body.',
      starvation: 'The snake shrank to zero from starvation during frenzy!',
    },

    levelCompleteTitle: 'Cleared!',
    levelCompleteSub: 'All good apples collected. Get ready to speed up on Level',
    statMoves: 'Moves',
    statPar: 'par',
    statMistakes: 'Mistakes',
    statLevelBonus: 'Level Bonus',
    statTotalScore: 'Total Score',
    levelBonusLifeBanner: '♥ Bonus Life Earned:',
    btnNextLevel: '➡ Level',

    exitTitle: 'Return to Main Menu',
    saveRecordTitle: 'Save High Score',
    exitSubPrefix: 'Progress (Lv.',
    exitSubSuffix:
      ') is saved so you can hit Continue later. Would you also like to record your current score?',
    saveRecordSub:
      'If you continue this run later, your leaderboard entry will update without duplicates.',
    statCurrentScore: 'Current Score',
    statReachedLevel: 'Level Reached',
    savedBannerRank: 'Score saved! Leaderboard rank:',
    namePlaceholder: 'Your name for the leaderboard',
    btnSaveAndExit: 'Save & Exit',
    btnSave: 'Save',
    btnExitWithoutRecord: '💾 Exit without saving score (progress kept)',
    btnCancel: 'Cancel',
    btnBack: 'Back',

    gameOverTitle: 'Game Over',
    gameOverDefaultReason: 'Out of lives.',
    statFinalScore: 'Final Score',
    statApplesCollected: 'Apples Collected',
    statMaxLength: 'Max Length',
    btnPlayAgain: '↻ Play Again',
    btnToMenu: 'Main Menu',

    settingsTitle: 'Settings',
    settingsSub: 'Language, procedural Web Audio & controls',
    settingLanguage: 'Language / Язык',
    settingMaster: 'Master Volume',
    settingMusic: 'Music',
    settingSfx: 'Sound Effects (SFX)',
    settingTouch: 'Touch D-pad (phones / tablets)',
    touchAuto: 'Auto',
    touchAlways: 'Always',
    touchSwipeOnly: 'Swipe Only',
    btnSoundOff: '🔇 Muted',
    btnSoundOn: '🔊 Sound On',
    btnDone: 'Done',

    lbTitle: '🏆 Leaderboard',
    lbStorageDesktop: 'PC file',
    lbStorageWeb: 'browser',
    lbStoragePrefix: 'Local storage',
    lbTabAll: 'All',
    lbEmpty: 'No records yet — play your first run!',
    lbColPlayer: 'Player',
    lbColScore: 'Score',
    lbColLevel: 'Lv.',
    lbColDifficulty: 'Difficulty',
    btnClear: 'Clear',
    btnClose: 'Close',

    rulesTitle: '📖 The Snake 2 Rules',
    rulesSub: 'Levels, snake frenzy, weighted stones & refillable lives',
    ruleGoodTitle: 'Good Apples:',
    ruleGoodBody:
      'each level spawns a fixed count. Eat them all to clear the level! Fewer moves and zero mistakes grant a bigger efficiency bonus.',
    ruleFrenzyTitle: 'Snake Frenzy & Starvation:',
    ruleFrenzyBody:
      'without good apples the snake yells "FOOD!", speeds up, and starts shrinking ("Shrinking!") — reaching length 0 is fatal! Eat a good apple to calm it down.',
    ruleStoneTitle: 'Weighted Stones:',
    ruleStoneBody:
      'the number is its weight. When snake length exceeds the weight (cyan glow), you can push it for bonus points at the cost of tail segments. Otherwise you lose a life.',
    ruleBadTitle: 'Bad Apples:',
    ruleBadBody:
      'purple apples with an X shrink length by 1, deduct points, and count as a level mistake.',
    ruleLivesTitle: 'Lives, Resume & Scores:',
    ruleLivesBody:
      'losing a life restarts the current level (points from the failed attempt are rolled back). Clear levels past progressive score milestones to earn bonus lives (up to 5). Progress auto-saves.',
    btnGotIt: 'Got it',

    speechYum: 'Yum!',
    speechEw: 'Yuck!',
    speechEat: 'FOOD!',
    speechEatPeak: 'FOOD!!',
    speechShrinking: 'Shrinking!',
    floatExtraLife: '+1 LIFE!',
    floatMinusLength: '-1 LEN',
    countdownReady: 'Get Ready',
    countdownGo: 'GO!',
  },
};
