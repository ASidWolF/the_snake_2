/**
 * Роль: Исполнитель UI + Датчик кнопок интерфейса.
 * Отображает состояние из GameStore, SettingsStore, LeaderboardStore и SavedRunStore
 * с полной поддержкой переключения языка (Русский / English).
 * Не хранит авторитетного игрового состояния и не содержит игровой логики.
 */

import type { IStorageAdapter } from '../core/contracts/actions.ts';
import type {
  DifficultyKey,
  Direction,
  GameCommand,
  GameSnapshot,
  LanguageKey,
  TouchControlMode,
  UserSettings,
} from '../core/contracts/messages.ts';
import {
  DIFFICULTY_ORDER,
  DIFFICULTY_PROFILES,
} from '../core/profiles/difficultyProfiles.ts';
import { I18N_PROFILES } from '../core/profiles/i18nProfile.ts';
import type { LeaderboardStore } from '../core/stores/LeaderboardStore.ts';
import type { SavedRunStore } from '../core/stores/SavedRunStore.ts';
import type { SettingsStore } from '../core/stores/SettingsStore.ts';

type ModalKind =
  | 'none'
  | 'settings'
  | 'leaderboard'
  | 'rules'
  | 'save_record'
  | 'exit_confirm';

export interface GameUiCallbacks {
  readonly onCommand: (command: GameCommand) => void;
  readonly onUiClick: () => void;
  readonly onUserGesture: () => void;
  readonly onSaveCurrentRun: () => void;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function isCoarsePointerDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(pointer: coarse)').matches ||
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0
  );
}

export class GameUiExecutor {
  readonly stageEl: HTMLElement;
  readonly canvasEl: HTMLCanvasElement;

  private readonly hudEl: HTMLElement;
  private readonly overlayEl: HTMLElement;
  private readonly dpadEl: HTMLElement;

  // Элементы живого HUD (обновляются без перестройки DOM)
  private readonly hudLevelLabelEl: HTMLElement;
  private readonly hudLevelEl: HTMLElement;
  private readonly hudApplesEl: HTMLElement;
  private readonly hudLengthLabelEl: HTMLElement;
  private readonly hudLengthEl: HTMLElement;
  private readonly hudScoreLabelEl: HTMLElement;
  private readonly hudScoreEl: HTMLElement;
  private readonly hudNextLifeEl: HTMLElement;
  private readonly hudSpeedEl: HTMLElement;
  private readonly hudFrenzyStatusEl: HTMLElement;
  private readonly hudFrenzyFillEl: HTMLElement;
  private readonly hudLivesEl: HTMLElement;
  private readonly hudMuteBtn: HTMLButtonElement;
  private readonly hudSettingsBtn: HTMLButtonElement;
  private readonly hudPauseBtn: HTMLButtonElement;

  private readonly settingsStore: SettingsStore;
  private readonly leaderboardStore: LeaderboardStore;
  private readonly savedRunStore: SavedRunStore;
  private readonly storage: IStorageAdapter;
  private readonly callbacks: GameUiCallbacks;

  private lastSnapshot: GameSnapshot;
  private activeModal: ModalKind = 'none';
  private leaderboardFilter: DifficultyKey | 'all' = 'all';
  private savedRecordRank: number | null = null;
  private renderedOverlayKey = '';

  constructor(
    root: HTMLElement,
    initialSnapshot: GameSnapshot,
    settingsStore: SettingsStore,
    leaderboardStore: LeaderboardStore,
    savedRunStore: SavedRunStore,
    storage: IStorageAdapter,
    callbacks: GameUiCallbacks
  ) {
    this.lastSnapshot = initialSnapshot;
    this.settingsStore = settingsStore;
    this.leaderboardStore = leaderboardStore;
    this.savedRunStore = savedRunStore;
    this.storage = storage;
    this.callbacks = callbacks;

    root.innerHTML = `
      <div class="app-shell">
        <header class="hud hidden" id="hud">
          <div class="hud-group">
            <div class="hud-pill level-pill"><span class="label" id="hud-level-label">Ур.</span><span class="value" id="hud-level">1</span></div>
            <div class="hud-pill apples-pill"><span>🍎</span><span class="value" id="hud-apples">0/0</span></div>
            <div class="hud-pill"><span class="label" id="hud-length-label">Длина</span><span class="value" id="hud-length">3</span></div>
          </div>

          <div class="frenzy-box">
            <div class="frenzy-header">
              <span class="frenzy-status" id="hud-frenzy-status">Спокойна</span>
              <span id="hud-speed">6.5 ш/с</span>
            </div>
            <div class="frenzy-track">
              <div class="frenzy-fill" id="hud-frenzy-fill"></div>
            </div>
          </div>

          <div class="hud-group">
            <div class="hud-pill score-pill">
              <span class="label" id="hud-score-label">Очки</span>
              <span class="value" id="hud-score">0</span>
              <span class="label" id="hud-next-life">· +♥ 1200</span>
            </div>
            <div class="hud-pill">
              <div class="lives-row" id="hud-lives"></div>
            </div>
            <button class="hud-icon-btn" id="hud-mute-btn">🔊</button>
            <button class="hud-icon-btn" id="hud-settings-btn">⚙️</button>
            <button class="hud-icon-btn" id="hud-pause-btn">⏸</button>
          </div>
        </header>

        <main class="stage-wrap" id="stage-wrap">
          <canvas id="game-canvas"></canvas>
          <div class="overlay-layer" id="overlay-layer"></div>
        </main>

        <section class="touch-dpad" id="touch-dpad">
          <div class="dpad-grid">
            <button class="dpad-btn dpad-up" data-dir="UP">▲</button>
            <button class="dpad-btn dpad-left" data-dir="LEFT">◀</button>
            <button class="dpad-btn dpad-center" data-action="pause">⏸</button>
            <button class="dpad-btn dpad-right" data-dir="RIGHT">▶</button>
            <button class="dpad-btn dpad-down" data-dir="DOWN">▼</button>
          </div>
        </section>
      </div>
    `;

    this.stageEl = root.querySelector('#stage-wrap')!;
    this.canvasEl = root.querySelector('#game-canvas')!;
    this.hudEl = root.querySelector('#hud')!;
    this.overlayEl = root.querySelector('#overlay-layer')!;
    this.dpadEl = root.querySelector('#touch-dpad')!;

    this.hudLevelLabelEl = root.querySelector('#hud-level-label')!;
    this.hudLevelEl = root.querySelector('#hud-level')!;
    this.hudApplesEl = root.querySelector('#hud-apples')!;
    this.hudLengthLabelEl = root.querySelector('#hud-length-label')!;
    this.hudLengthEl = root.querySelector('#hud-length')!;
    this.hudScoreLabelEl = root.querySelector('#hud-score-label')!;
    this.hudScoreEl = root.querySelector('#hud-score')!;
    this.hudNextLifeEl = root.querySelector('#hud-next-life')!;
    this.hudSpeedEl = root.querySelector('#hud-speed')!;
    this.hudFrenzyStatusEl = root.querySelector('#hud-frenzy-status')!;
    this.hudFrenzyFillEl = root.querySelector('#hud-frenzy-fill')!;
    this.hudLivesEl = root.querySelector('#hud-lives')!;
    this.hudMuteBtn = root.querySelector('#hud-mute-btn')!;
    this.hudSettingsBtn = root.querySelector('#hud-settings-btn')!;
    this.hudPauseBtn = root.querySelector('#hud-pause-btn')!;

    this.bindStaticControls();
    this.syncAll(initialSnapshot, settingsStore.getSnapshot());
  }

  private bindStaticControls(): void {
    this.hudMuteBtn.addEventListener('click', () => {
      this.callbacks.onUserGesture();
      const audio = this.settingsStore.getSnapshot().audio;
      this.settingsStore.updateAudio({ muted: !audio.muted });
      this.callbacks.onUiClick();
    });

    this.hudSettingsBtn.addEventListener('click', () => {
      this.callbacks.onUserGesture();
      this.callbacks.onUiClick();
      if (this.lastSnapshot.phase === 'playing') {
        this.callbacks.onCommand({ type: 'SET_PAUSED', paused: true });
      }
      this.activeModal = 'settings';
      this.forceOverlayRender();
    });

    this.hudPauseBtn.addEventListener('click', () => {
      this.callbacks.onUserGesture();
      this.callbacks.onUiClick();
      this.callbacks.onCommand({ type: 'TOGGLE_PAUSE' });
    });

    this.dpadEl.addEventListener('pointerdown', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.dpad-btn');
      if (!btn) return;
      e.preventDefault();
      this.callbacks.onUserGesture();
      const dir = btn.dataset.dir as Direction | undefined;
      if (dir) {
        this.callbacks.onCommand({ type: 'CHANGE_DIRECTION', direction: dir });
      } else if (btn.dataset.action === 'pause') {
        this.callbacks.onUiClick();
        this.callbacks.onCommand({ type: 'TOGGLE_PAUSE' });
      }
    });
  }

  syncAll(snapshot: GameSnapshot, settings: UserSettings): void {
    const prevPhase = this.lastSnapshot.phase;
    const prevRunId = this.lastSnapshot.runId;
    this.lastSnapshot = snapshot;

    if (typeof document !== 'undefined') {
      document.documentElement.lang = settings.language;
    }

    if (
      prevRunId !== snapshot.runId ||
      (prevPhase !== 'game_over' && snapshot.phase === 'game_over')
    ) {
      this.savedRecordRank = null;
    }

    this.updateHud(snapshot, settings);
    this.updateTouchDpadVisibility(snapshot, settings.touchControls);

    const savedRun = this.savedRunStore.getSnapshot();
    const savedKey = savedRun
      ? `${savedRun.runId}:${savedRun.levelStats.level}:${savedRun.score}:${savedRun.phase}`
      : 'none';

    const isDeathAnimating =
      (snapshot.phase === 'life_lost' || snapshot.phase === 'game_over') &&
      snapshot.deathAnimSec > 0;

    const key = [
      settings.language,
      snapshot.phase,
      isDeathAnimating ? 'dying' : 'idle',
      this.activeModal,
      settings.difficulty,
      this.leaderboardFilter,
      this.savedRecordRank ?? '',
      snapshot.levelStats.level,
      snapshot.lives,
      snapshot.score,
      savedKey,
    ].join('|');

    if (key !== this.renderedOverlayKey) {
      this.renderedOverlayKey = key;
      this.renderOverlay(snapshot, settings);
    }
  }

  forceOverlayRender(): void {
    this.renderedOverlayKey = '';
    this.syncAll(this.lastSnapshot, this.settingsStore.getSnapshot());
  }

  private requestReturnToMenu(snapshot: GameSnapshot): void {
    this.callbacks.onUiClick();
    this.callbacks.onSaveCurrentRun();

    const needsRecordPrompt =
      snapshot.score > 0 &&
      !this.leaderboardStore.hasSavedScore(snapshot.runId, snapshot.score);

    if (needsRecordPrompt) {
      this.activeModal = 'exit_confirm';
      this.forceOverlayRender();
      return;
    }

    this.activeModal = 'none';
    this.callbacks.onCommand({ type: 'RETURN_TO_MENU' });
  }

  private saveRecordForSnapshot(
    snapshot: GameSnapshot,
    rawName: string,
    language: LanguageKey
  ): number {
    const t = I18N_PROFILES[language];
    const { entry, rank } = this.leaderboardStore.addRecord({
      runId: snapshot.runId,
      playerName: rawName,
      defaultPlayerName: t.defaultPlayerName,
      score: snapshot.score,
      level: snapshot.highestLevel,
      apples: snapshot.totalApplesEaten,
      maxLength: snapshot.maxLength,
      difficulty: snapshot.difficulty,
    });
    this.settingsStore.update({ lastPlayerName: entry.playerName });
    this.savedRecordRank = rank;
    return rank;
  }

  private updateHud(snapshot: GameSnapshot, settings: UserSettings): void {
    const inRun = snapshot.phase !== 'menu';
    this.hudEl.classList.toggle('hidden', !inRun);
    if (!inRun) return;

    const t = I18N_PROFILES[settings.language];
    this.hudLevelLabelEl.textContent = t.hudLevel;
    this.hudLengthLabelEl.textContent = t.hudLength;
    this.hudScoreLabelEl.textContent = t.hudScore;
    this.hudNextLifeEl.title = t.hudNextLifeTooltip;
    this.hudMuteBtn.title = t.hudMuteTitle;
    this.hudMuteBtn.setAttribute('aria-label', t.hudMuteTitle);
    this.hudSettingsBtn.title = t.hudSettingsTitle;
    this.hudSettingsBtn.setAttribute('aria-label', t.hudSettingsTitle);
    this.hudPauseBtn.title = t.hudPauseTitle;
    this.hudPauseBtn.setAttribute('aria-label', t.hudPauseTitle);

    this.hudLevelEl.textContent = String(snapshot.levelStats.level);
    const collected =
      snapshot.levelStats.initialGoodApples - snapshot.goodApples.length;
    this.hudApplesEl.textContent = `${collected}/${snapshot.levelStats.initialGoodApples}`;
    this.hudLengthEl.textContent = String(snapshot.snake.segments.length);
    this.hudScoreEl.textContent = String(snapshot.score);

    const toNextLife = Math.max(0, snapshot.nextLifeScore - snapshot.score);
    this.hudNextLifeEl.textContent =
      snapshot.lives >= snapshot.maxLives ? t.hudMaxLives : `· +♥ ${toNextLife}`;

    this.hudSpeedEl.textContent = `${snapshot.effectiveSpeed.toFixed(1)} ${t.hudSpeedUnit}`;
    const frenzyPct = Math.round(snapshot.frenzy.level * 100);
    this.hudFrenzyFillEl.style.width = `${frenzyPct}%`;

    this.hudFrenzyStatusEl.classList.remove('active', 'peak');
    if (snapshot.frenzy.level >= 0.98) {
      this.hudFrenzyStatusEl.textContent = t.hudFrenzyPeak;
      this.hudFrenzyStatusEl.classList.add('peak');
    } else if (snapshot.frenzy.active) {
      this.hudFrenzyStatusEl.textContent = `${t.hudFrenzyRising} ${frenzyPct}%`;
      this.hudFrenzyStatusEl.classList.add('active');
    } else {
      this.hudFrenzyStatusEl.textContent = t.hudCalm;
    }

    let heartsHtml = '';
    for (let i = 0; i < snapshot.maxLives; i += 1) {
      heartsHtml += `<span class="heart ${i < snapshot.lives ? 'full' : 'empty'}">♥</span>`;
    }
    this.hudLivesEl.innerHTML = heartsHtml;
    this.hudMuteBtn.textContent = settings.audio.muted ? '🔇' : '🔊';
  }

  private updateTouchDpadVisibility(
    snapshot: GameSnapshot,
    mode: TouchControlMode
  ): void {
    const show =
      snapshot.phase === 'playing' &&
      (mode === 'dpad' || (mode === 'auto' && isCoarsePointerDevice()));
    this.dpadEl.classList.toggle('visible', show);
  }

  private renderOverlay(snapshot: GameSnapshot, settings: UserSettings): void {
    if (this.activeModal !== 'none') {
      this.overlayEl.classList.remove('hidden');
      if (this.activeModal === 'settings') {
        this.renderSettingsModal(settings);
      } else if (this.activeModal === 'leaderboard') {
        this.renderLeaderboardModal(settings);
      } else if (this.activeModal === 'rules') {
        this.renderRulesModal(settings);
      } else if (this.activeModal === 'save_record') {
        this.renderSaveRecordModal(snapshot, settings, false);
      } else {
        this.renderSaveRecordModal(snapshot, settings, true);
      }
      return;
    }

    const isDeathAnimating =
      (snapshot.phase === 'life_lost' || snapshot.phase === 'game_over') &&
      snapshot.deathAnimSec > 0;

    if (snapshot.phase === 'playing' || isDeathAnimating) {
      this.overlayEl.classList.add('hidden');
      this.overlayEl.innerHTML = '';
      return;
    }

    this.overlayEl.classList.remove('hidden');

    switch (snapshot.phase) {
      case 'menu':
        this.renderMainMenu(settings);
        break;
      case 'paused':
        this.renderPauseOverlay(snapshot, settings);
        break;
      case 'life_lost':
        this.renderLifeLostOverlay(snapshot, settings);
        break;
      case 'level_complete':
        this.renderLevelCompleteOverlay(snapshot, settings);
        break;
      case 'game_over':
        this.renderGameOverOverlay(snapshot, settings);
        break;
    }
  }

  private renderMainMenu(settings: UserSettings): void {
    const t = I18N_PROFILES[settings.language];
    const modeLabel =
      this.storage.platformName === 'desktop' ? t.modeDesktop : t.modeWeb;
    const bestScore = this.leaderboardStore.getBestScore(settings.difficulty);
    const savedRun = this.savedRunStore.getSnapshot();

    const diffCards = DIFFICULTY_ORDER.map((key) => {
      const p = DIFFICULTY_PROFILES[key];
      const selected = key === settings.difficulty ? 'selected' : '';
      return `
        <button class="diff-card ${selected}" data-difficulty="${key}" style="--diff-accent: ${p.accentColor}">
          <div class="diff-top">
            <span class="diff-name">${t.difficultyLabels[key]}</span>
            <span class="diff-mult">×${p.scoreMultiplier.toFixed(1)}</span>
          </div>
          <div class="diff-desc">${t.difficultyDescs[key]}</div>
        </button>
      `;
    }).join('');

    const continueBtn = savedRun
      ? `
        <button class="btn btn-continue" id="btn-continue">
          <span>${t.btnContinue}</span>
          <span class="btn-meta">${t.hudLevelShort} ${savedRun.levelStats.level} • ${t.hudPointsWord}: ${savedRun.score} • ${t.difficultyLabels[savedRun.difficulty]} • ${'♥'.repeat(savedRun.lives)}</span>
        </button>
      `
      : '';

    const quitBtn = this.storage.quitApp
      ? `<button class="btn btn-ghost" id="btn-quit">${t.btnQuit}</button>`
      : '';

    this.overlayEl.innerHTML = `
      <div class="card">
        <div class="brand-header">
          <div class="menu-topbar">
            <div class="brand-badge">🐍 ${modeLabel} • ${t.badgeProcedural}</div>
            <div class="lang-switch" role="group" aria-label="${t.settingLanguage}">
              <button class="lang-btn ${settings.language === 'ru' ? 'active' : ''}" data-lang="ru">RU</button>
              <button class="lang-btn ${settings.language === 'en' ? 'active' : ''}" data-lang="en">EN</button>
            </div>
          </div>
          <h1 class="brand-title">THE SNAKE 2</h1>
          <p class="brand-subtitle">
            ${t.menuSubtitle}
            ${bestScore > 0 ? `${t.menuBestScore} (${t.difficultyLabels[settings.difficulty]}): <strong>${bestScore}</strong>` : ''}
          </p>
        </div>

        <div class="section-label">${t.menuDifficultyLabel}</div>
        <div class="difficulty-grid">${diffCards}</div>

        <div class="btn-stack">
          ${continueBtn}
          <button class="btn btn-primary" id="btn-play">${savedRun ? t.btnNewGameFromL1 : t.btnStartGame}</button>
          <div class="btn-row">
            <button class="btn" id="btn-leaderboard">${t.btnLeaderboard}</button>
            <button class="btn" id="btn-settings">${t.btnSettings}</button>
            <button class="btn" id="btn-rules">${t.btnRules}</button>
          </div>
          ${quitBtn}
        </div>

        <div class="menu-footer">${t.menuFooter}</div>
      </div>
    `;

    this.overlayEl.querySelectorAll<HTMLButtonElement>('.lang-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.callbacks.onUserGesture();
        this.callbacks.onUiClick();
        const lang = btn.dataset.lang as LanguageKey;
        this.settingsStore.update({ language: lang });
      });
    });

    this.overlayEl.querySelectorAll<HTMLButtonElement>('.diff-card').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.callbacks.onUserGesture();
        this.callbacks.onUiClick();
        const key = btn.dataset.difficulty as DifficultyKey;
        this.settingsStore.update({ difficulty: key });
      });
    });

    this.overlayEl.querySelector('#btn-continue')?.addEventListener('click', () => {
      const latestSaved = this.savedRunStore.getSnapshot();
      if (!latestSaved) return;
      this.callbacks.onUserGesture();
      this.callbacks.onUiClick();
      this.callbacks.onCommand({
        type: 'RESUME_SAVED_RUN',
        savedSnapshot: latestSaved,
      });
    });

    this.overlayEl.querySelector('#btn-play')!.addEventListener('click', () => {
      this.callbacks.onUserGesture();
      this.callbacks.onUiClick();
      this.callbacks.onCommand({
        type: 'START_NEW_RUN',
        difficulty: this.settingsStore.getSnapshot().difficulty,
        seed: Date.now() & 0x7fffffff,
      });
    });

    this.overlayEl.querySelector('#btn-leaderboard')!.addEventListener('click', () => {
      this.callbacks.onUserGesture();
      this.callbacks.onUiClick();
      this.activeModal = 'leaderboard';
      this.forceOverlayRender();
    });

    this.overlayEl.querySelector('#btn-settings')!.addEventListener('click', () => {
      this.callbacks.onUserGesture();
      this.callbacks.onUiClick();
      this.activeModal = 'settings';
      this.forceOverlayRender();
    });

    this.overlayEl.querySelector('#btn-rules')!.addEventListener('click', () => {
      this.callbacks.onUserGesture();
      this.callbacks.onUiClick();
      this.activeModal = 'rules';
      this.forceOverlayRender();
    });

    this.overlayEl.querySelector('#btn-quit')?.addEventListener('click', () => {
      void this.storage.quitApp?.();
    });
  }

  private renderSaveRecordActionButton(
    snapshot: GameSnapshot,
    language: LanguageKey
  ): string {
    if (snapshot.score <= 0) return '';
    const t = I18N_PROFILES[language];
    const alreadySaved = this.leaderboardStore.hasSavedScore(
      snapshot.runId,
      snapshot.score
    );
    const label = alreadySaved
      ? `${t.btnRecordSaved} (${snapshot.score})`
      : `${t.btnSaveRecord} (${snapshot.score})`;
    return `<button class="btn btn-gold" id="btn-mid-save-record">${label}</button>`;
  }

  private renderPauseOverlay(snapshot: GameSnapshot, settings: UserSettings): void {
    const t = I18N_PROFILES[settings.language];
    const diff = DIFFICULTY_PROFILES[snapshot.difficulty];
    this.overlayEl.innerHTML = `
      <div class="card">
        <h2 class="modal-title">${t.pauseTitle}</h2>
        <p class="modal-sub">${t.hudLevelShort} ${snapshot.levelStats.level} • ${t.difficultyLabels[snapshot.difficulty]} (×${diff.scoreMultiplier.toFixed(1)})</p>
        <div class="stats-grid">
          <div class="stat-box"><span class="k">${t.hudScore}</span><span class="v gold">${snapshot.score}</span></div>
          <div class="stat-box"><span class="k">${t.pauseRemainingApples}</span><span class="v emerald">${snapshot.goodApples.length}</span></div>
        </div>
        <div class="btn-stack">
          <button class="btn btn-primary" id="btn-resume">${t.btnResume}</button>
          ${this.renderSaveRecordActionButton(snapshot, settings.language)}
          <button class="btn" id="btn-pause-settings">${t.btnPauseSettings}</button>
          <button class="btn btn-ghost" id="btn-pause-menu">${t.btnReturnToMenuKeep}</button>
        </div>
      </div>
    `;

    this.overlayEl.querySelector('#btn-resume')!.addEventListener('click', () => {
      this.callbacks.onUserGesture();
      this.callbacks.onUiClick();
      this.callbacks.onCommand({ type: 'SET_PAUSED', paused: false });
    });

    this.overlayEl.querySelector('#btn-mid-save-record')?.addEventListener('click', () => {
      this.callbacks.onUiClick();
      this.activeModal = 'save_record';
      this.forceOverlayRender();
    });

    this.overlayEl.querySelector('#btn-pause-settings')!.addEventListener('click', () => {
      this.callbacks.onUiClick();
      this.activeModal = 'settings';
      this.forceOverlayRender();
    });

    this.overlayEl.querySelector('#btn-pause-menu')!.addEventListener('click', () => {
      this.requestReturnToMenu(snapshot);
    });
  }

  private renderLifeLostOverlay(snapshot: GameSnapshot, settings: UserSettings): void {
    const t = I18N_PROFILES[settings.language];
    const reasonText = snapshot.lastDeathReason
      ? t.deathReasons[snapshot.lastDeathReason]
      : t.deathReasons.self_collision;

    this.overlayEl.innerHTML = `
      <div class="card">
        <h2 class="modal-title" style="color: #fb7185;">${t.lifeLostTitle}</h2>
        <p class="modal-sub">${reasonText}</p>
        <div class="stats-grid">
          <div class="stat-box"><span class="k">${t.lifeLostRemaining}</span><span class="v crimson">${'♥ '.repeat(snapshot.lives).trim()}</span></div>
          <div class="stat-box"><span class="k">${t.lifeLostScore}</span><span class="v gold">${snapshot.score}</span></div>
        </div>
        <div class="btn-stack">
          <button class="btn btn-primary" id="btn-retry">${t.btnRetryLevel} ${snapshot.levelStats.level}</button>
          ${this.renderSaveRecordActionButton(snapshot, settings.language)}
          <button class="btn btn-ghost" id="btn-lost-menu">${t.btnReturnToMenuKeep}</button>
        </div>
      </div>
    `;

    this.overlayEl.querySelector('#btn-retry')!.addEventListener('click', () => {
      this.callbacks.onUserGesture();
      this.callbacks.onUiClick();
      this.callbacks.onCommand({
        type: 'RETRY_LEVEL',
        seed: Date.now() & 0x7fffffff,
      });
    });

    this.overlayEl.querySelector('#btn-mid-save-record')?.addEventListener('click', () => {
      this.callbacks.onUiClick();
      this.activeModal = 'save_record';
      this.forceOverlayRender();
    });

    this.overlayEl.querySelector('#btn-lost-menu')!.addEventListener('click', () => {
      this.requestReturnToMenu(snapshot);
    });
  }

  private renderLevelCompleteOverlay(
    snapshot: GameSnapshot,
    settings: UserSettings
  ): void {
    const t = I18N_PROFILES[settings.language];
    const s = snapshot.lastLevelSummary;
    const stars = s ? s.efficiencyRating : 1;
    const starsHtml = [1, 2, 3]
      .map((i) => `<span class="star ${i <= stars ? 'lit' : 'dim'}">★</span>`)
      .join('');

    this.overlayEl.innerHTML = `
      <div class="card">
        <div class="stars-row">${starsHtml}</div>
        <h2 class="modal-title" style="color: #34d399;">${t.hudLevelShort} ${snapshot.levelStats.level} ${t.levelCompleteTitle}</h2>
        <p class="modal-sub">${t.levelCompleteSub} ${snapshot.levelStats.level + 1}!</p>

        <div class="stats-grid">
          <div class="stat-box"><span class="k">${t.statMoves} (${t.statPar} ${s?.parMoves ?? 0})</span><span class="v">${s?.moves ?? 0}</span></div>
          <div class="stat-box"><span class="k">${t.statMistakes}</span><span class="v ${(s?.mistakes ?? 0) === 0 ? 'emerald' : 'crimson'}">${s?.mistakes ?? 0}</span></div>
          <div class="stat-box"><span class="k">${t.statLevelBonus}</span><span class="v gold">+${s?.totalBonus ?? 0}</span></div>
          <div class="stat-box"><span class="k">${t.statTotalScore}</span><span class="v gold">${snapshot.score}</span></div>
        </div>

        <div class="btn-stack">
          <button class="btn btn-primary" id="btn-next-level">${t.btnNextLevel} ${snapshot.levelStats.level + 1}</button>
          ${this.renderSaveRecordActionButton(snapshot, settings.language)}
          <button class="btn btn-ghost" id="btn-clear-menu">${t.btnReturnToMenuKeep}</button>
        </div>
      </div>
    `;

    this.overlayEl.querySelector('#btn-next-level')!.addEventListener('click', () => {
      this.callbacks.onUserGesture();
      this.callbacks.onUiClick();
      this.callbacks.onCommand({
        type: 'NEXT_LEVEL',
        seed: Date.now() & 0x7fffffff,
      });
    });

    this.overlayEl.querySelector('#btn-mid-save-record')?.addEventListener('click', () => {
      this.callbacks.onUiClick();
      this.activeModal = 'save_record';
      this.forceOverlayRender();
    });

    this.overlayEl.querySelector('#btn-clear-menu')!.addEventListener('click', () => {
      this.requestReturnToMenu(snapshot);
    });
  }

  private renderSaveRecordModal(
    snapshot: GameSnapshot,
    settings: UserSettings,
    exitAfter: boolean
  ): void {
    const t = I18N_PROFILES[settings.language];
    const title = exitAfter ? t.exitTitle : t.saveRecordTitle;
    const sub = exitAfter
      ? `${t.exitSubPrefix} ${snapshot.levelStats.level}${t.exitSubSuffix}`
      : `${t.hudLevelShort} ${snapshot.levelStats.level} • ${t.difficultyLabels[snapshot.difficulty]}. ${t.saveRecordSub}`;

    const alreadySaved = this.leaderboardStore.hasSavedScore(
      snapshot.runId,
      snapshot.score
    );

    this.overlayEl.innerHTML = `
      <div class="card">
        <h2 class="modal-title">🏆 ${title}</h2>
        <p class="modal-sub">${sub}</p>

        <div class="stats-grid">
          <div class="stat-box"><span class="k">${t.statCurrentScore}</span><span class="v gold">${snapshot.score}</span></div>
          <div class="stat-box"><span class="k">${t.statReachedLevel}</span><span class="v emerald">${snapshot.highestLevel}</span></div>
        </div>

        ${
          alreadySaved && this.savedRecordRank !== null && !exitAfter
            ? `<div class="saved-banner">${t.savedBannerRank} #${this.savedRecordRank}</div>`
            : `
              <form class="record-form" id="mid-record-form">
                <input
                  class="text-input"
                  id="mid-player-name-input"
                  type="text"
                  maxlength="18"
                  placeholder="${t.namePlaceholder}"
                  value="${escapeHtml(settings.lastPlayerName)}"
                />
                <button class="btn btn-primary" type="submit" style="padding: 10px 16px; font-size: 14px;">
                  ${exitAfter ? t.btnSaveAndExit : t.btnSave}
                </button>
              </form>
            `
        }

        <div class="btn-stack">
          ${
            exitAfter
              ? `<button class="btn" id="btn-exit-without-record">${t.btnExitWithoutRecord}</button>`
              : ''
          }
          <button class="btn btn-ghost" id="btn-cancel-save-record">${exitAfter ? t.btnCancel : t.btnBack}</button>
        </div>
      </div>
    `;

    const form = this.overlayEl.querySelector<HTMLFormElement>('#mid-record-form');
    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.callbacks.onUiClick();
      const input = this.overlayEl.querySelector<HTMLInputElement>('#mid-player-name-input');
      this.saveRecordForSnapshot(snapshot, input?.value ?? '', settings.language);
      if (exitAfter) {
        this.callbacks.onSaveCurrentRun();
        this.activeModal = 'none';
        this.callbacks.onCommand({ type: 'RETURN_TO_MENU' });
      } else {
        this.forceOverlayRender();
      }
    });

    this.overlayEl.querySelector('#btn-exit-without-record')?.addEventListener('click', () => {
      this.callbacks.onUiClick();
      this.callbacks.onSaveCurrentRun();
      this.activeModal = 'none';
      this.callbacks.onCommand({ type: 'RETURN_TO_MENU' });
    });

    this.overlayEl.querySelector('#btn-cancel-save-record')!.addEventListener('click', () => {
      this.callbacks.onUiClick();
      this.activeModal = 'none';
      this.forceOverlayRender();
    });
  }

  private renderGameOverOverlay(snapshot: GameSnapshot, settings: UserSettings): void {
    const t = I18N_PROFILES[settings.language];
    const reasonText = snapshot.lastDeathReason
      ? t.deathReasons[snapshot.lastDeathReason]
      : t.gameOverDefaultReason;

    const alreadySaved = this.leaderboardStore.hasSavedScore(
      snapshot.runId,
      snapshot.score
    );

    const recordBlock =
      snapshot.score <= 0
        ? ''
        : alreadySaved && this.savedRecordRank !== null
          ? `<div class="saved-banner">${t.savedBannerRank} #${this.savedRecordRank}</div>`
          : `
            <form class="record-form" id="record-form">
              <input
                class="text-input"
                id="player-name-input"
                type="text"
                maxlength="18"
                placeholder="${t.namePlaceholder}"
                value="${escapeHtml(settings.lastPlayerName)}"
              />
              <button class="btn btn-primary" type="submit" style="padding: 10px 16px; font-size: 14px;">${t.btnSave}</button>
            </form>
          `;

    this.overlayEl.innerHTML = `
      <div class="card">
        <h2 class="modal-title" style="color: #f43f5e;">${t.gameOverTitle}</h2>
        <p class="modal-sub">${reasonText} • ${t.difficultyLabels[snapshot.difficulty]}</p>

        <div class="stats-grid">
          <div class="stat-box"><span class="k">${t.statFinalScore}</span><span class="v gold">${snapshot.score}</span></div>
          <div class="stat-box"><span class="k">${t.statReachedLevel}</span><span class="v emerald">${snapshot.highestLevel}</span></div>
          <div class="stat-box"><span class="k">${t.statApplesCollected}</span><span class="v">${snapshot.totalApplesEaten}</span></div>
          <div class="stat-box"><span class="k">${t.statMaxLength}</span><span class="v">${snapshot.maxLength}</span></div>
        </div>

        ${recordBlock}

        <div class="btn-stack">
          <button class="btn btn-primary" id="btn-play-again">${t.btnPlayAgain}</button>
          <div class="btn-row">
            <button class="btn" id="btn-go-lb">${t.btnLeaderboard}</button>
            <button class="btn btn-ghost" id="btn-go-menu">${t.btnToMenu}</button>
          </div>
        </div>
      </div>
    `;

    const form = this.overlayEl.querySelector<HTMLFormElement>('#record-form');
    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.callbacks.onUiClick();
      const input = this.overlayEl.querySelector<HTMLInputElement>('#player-name-input');
      this.saveRecordForSnapshot(snapshot, input?.value ?? '', settings.language);
      this.forceOverlayRender();
    });

    this.overlayEl.querySelector('#btn-play-again')!.addEventListener('click', () => {
      this.callbacks.onUserGesture();
      this.callbacks.onUiClick();
      this.callbacks.onCommand({
        type: 'START_NEW_RUN',
        difficulty: snapshot.difficulty,
        seed: Date.now() & 0x7fffffff,
      });
    });

    this.overlayEl.querySelector('#btn-go-lb')!.addEventListener('click', () => {
      this.callbacks.onUiClick();
      this.activeModal = 'leaderboard';
      this.forceOverlayRender();
    });

    this.overlayEl.querySelector('#btn-go-menu')!.addEventListener('click', () => {
      this.callbacks.onUiClick();
      this.callbacks.onCommand({ type: 'RETURN_TO_MENU' });
    });
  }

  private renderSettingsModal(settings: UserSettings): void {
    const t = I18N_PROFILES[settings.language];
    const a = settings.audio;
    const masterPct = Math.round(a.masterVolume * 100);
    const musicPct = Math.round(a.musicVolume * 100);
    const sfxPct = Math.round(a.sfxVolume * 100);

    this.overlayEl.innerHTML = `
      <div class="card">
        <h2 class="modal-title">${t.settingsTitle}</h2>
        <p class="modal-sub">${t.settingsSub}</p>

        <div class="setting-row">
          <div class="setting-top">
            <span>${t.settingLanguage}</span>
          </div>
          <div class="segmented" style="grid-template-columns: repeat(2, 1fr);">
            <button class="seg-btn ${settings.language === 'ru' ? 'active' : ''}" data-lang="ru">🇷🇺 Русский</button>
            <button class="seg-btn ${settings.language === 'en' ? 'active' : ''}" data-lang="en">🇬🇧 English</button>
          </div>
        </div>

        <div class="setting-row">
          <div class="setting-top">
            <span>${t.settingMaster}</span>
            <span class="pct" id="val-master">${masterPct}%</span>
          </div>
          <input type="range" id="rng-master" min="0" max="100" value="${masterPct}" />
        </div>

        <div class="setting-row">
          <div class="setting-top">
            <span>${t.settingMusic}</span>
            <span class="pct" id="val-music">${musicPct}%</span>
          </div>
          <input type="range" id="rng-music" min="0" max="100" value="${musicPct}" />
        </div>

        <div class="setting-row">
          <div class="setting-top">
            <span>${t.settingSfx}</span>
            <span class="pct" id="val-sfx">${sfxPct}%</span>
          </div>
          <input type="range" id="rng-sfx" min="0" max="100" value="${sfxPct}" />
        </div>

        <div class="setting-row">
          <div class="setting-top">
            <span>${t.settingTouch}</span>
          </div>
          <div class="segmented">
            <button class="seg-btn ${settings.touchControls === 'auto' ? 'active' : ''}" data-touch="auto">${t.touchAuto}</button>
            <button class="seg-btn ${settings.touchControls === 'dpad' ? 'active' : ''}" data-touch="dpad">${t.touchAlways}</button>
            <button class="seg-btn ${settings.touchControls === 'swipe' ? 'active' : ''}" data-touch="swipe">${t.touchSwipeOnly}</button>
          </div>
        </div>

        <div class="btn-row" style="margin-top: 14px;">
          <button class="btn" id="btn-mute-toggle">${a.muted ? t.btnSoundOff : t.btnSoundOn}</button>
          <button class="btn btn-primary" id="btn-close-modal">${t.btnDone}</button>
        </div>
      </div>
    `;

    this.overlayEl.querySelectorAll<HTMLButtonElement>('[data-lang]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.callbacks.onUiClick();
        const lang = btn.dataset.lang as LanguageKey;
        this.settingsStore.update({ language: lang });
      });
    });

    const bindSlider = (
      id: string,
      valId: string,
      field: 'masterVolume' | 'musicVolume' | 'sfxVolume'
    ) => {
      const slider = this.overlayEl.querySelector<HTMLInputElement>(`#${id}`)!;
      const label = this.overlayEl.querySelector<HTMLElement>(`#${valId}`)!;
      slider.addEventListener('input', () => {
        this.callbacks.onUserGesture();
        const num = Number(slider.value);
        label.textContent = `${num}%`;
        this.settingsStore.updateAudio({ [field]: num / 100, muted: false });
      });
      slider.addEventListener('change', () => {
        this.callbacks.onUiClick();
      });
    };

    bindSlider('rng-master', 'val-master', 'masterVolume');
    bindSlider('rng-music', 'val-music', 'musicVolume');
    bindSlider('rng-sfx', 'val-sfx', 'sfxVolume');

    this.overlayEl.querySelectorAll<HTMLButtonElement>('[data-touch]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.callbacks.onUiClick();
        const mode = btn.dataset.touch as TouchControlMode;
        this.settingsStore.update({ touchControls: mode });
        this.forceOverlayRender();
      });
    });

    this.overlayEl.querySelector('#btn-mute-toggle')!.addEventListener('click', () => {
      this.callbacks.onUserGesture();
      const cur = this.settingsStore.getSnapshot().audio.muted;
      this.settingsStore.updateAudio({ muted: !cur });
      if (cur) this.callbacks.onUiClick();
      this.forceOverlayRender();
    });

    this.overlayEl.querySelector('#btn-close-modal')!.addEventListener('click', () => {
      this.callbacks.onUiClick();
      this.activeModal = 'none';
      this.forceOverlayRender();
    });
  }

  private renderLeaderboardModal(settings: UserSettings): void {
    const t = I18N_PROFILES[settings.language];
    const entries = this.leaderboardStore.getEntries(this.leaderboardFilter);
    const tabs: Array<{ key: DifficultyKey | 'all'; label: string }> = [
      { key: 'all', label: t.lbTabAll },
      { key: 'easy', label: t.difficultyLabels.easy },
      { key: 'normal', label: t.difficultyLabels.normal },
      { key: 'hard', label: t.difficultyLabels.hard },
    ];

    const tabsHtml = tabs
      .map(
        (tab) =>
          `<button class="tab-btn ${this.leaderboardFilter === tab.key ? 'active' : ''}" data-filter="${tab.key}">${tab.label}</button>`
      )
      .join('');

    const bodyHtml =
      entries.length === 0
        ? `<div class="empty-note">${t.lbEmpty}</div>`
        : `
          <table class="lb-table">
            <thead>
              <tr>
                <th>#</th>
                <th>${t.lbColPlayer}</th>
                <th>${t.lbColScore}</th>
                <th>${t.lbColLevel}</th>
                <th>${t.lbColDifficulty}</th>
              </tr>
            </thead>
            <tbody>
              ${entries
                .slice(0, 12)
                .map((e, idx) => {
                  const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : String(idx + 1);
                  return `
                    <tr>
                      <td>${medal}</td>
                      <td>${escapeHtml(e.playerName)}</td>
                      <td>${e.score}</td>
                      <td>${e.level}</td>
                      <td>${t.difficultyLabels[e.difficulty]}</td>
                    </tr>
                  `;
                })
                .join('')}
            </tbody>
          </table>
        `;

    const storageText =
      this.storage.platformName === 'desktop' ? t.lbStorageDesktop : t.lbStorageWeb;

    this.overlayEl.innerHTML = `
      <div class="card wide">
        <h2 class="modal-title">${t.lbTitle}</h2>
        <p class="modal-sub">${t.lbStoragePrefix} (${storageText})</p>
        <div class="tabs-row">${tabsHtml}</div>
        ${bodyHtml}
        <div class="btn-row">
          ${entries.length > 0 ? `<button class="btn btn-danger" id="btn-clear-lb">${t.btnClear}</button>` : ''}
          <button class="btn btn-primary" id="btn-close-lb">${t.btnClose}</button>
        </div>
      </div>
    `;

    this.overlayEl.querySelectorAll<HTMLButtonElement>('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.callbacks.onUiClick();
        this.leaderboardFilter = btn.dataset.filter as DifficultyKey | 'all';
        this.forceOverlayRender();
      });
    });

    this.overlayEl.querySelector('#btn-clear-lb')?.addEventListener('click', () => {
      this.callbacks.onUiClick();
      this.leaderboardStore.clear();
      this.forceOverlayRender();
    });

    this.overlayEl.querySelector('#btn-close-lb')!.addEventListener('click', () => {
      this.callbacks.onUiClick();
      this.activeModal = 'none';
      this.forceOverlayRender();
    });
  }

  private renderRulesModal(settings: UserSettings): void {
    const t = I18N_PROFILES[settings.language];
    this.overlayEl.innerHTML = `
      <div class="card wide">
        <h2 class="modal-title">${t.rulesTitle}</h2>
        <p class="modal-sub">${t.rulesSub}</p>

        <div class="rules-list">
          <div class="rule-item">
            <span class="rule-icon">🍎</span>
            <div><strong>${t.ruleGoodTitle}</strong> ${t.ruleGoodBody}</div>
          </div>
          <div class="rule-item">
            <span class="rule-icon">🔥</span>
            <div><strong>${t.ruleFrenzyTitle}</strong> ${t.ruleFrenzyBody}</div>
          </div>
          <div class="rule-item">
            <span class="rule-icon">🪨</span>
            <div><strong>${t.ruleStoneTitle}</strong> ${t.ruleStoneBody}</div>
          </div>
          <div class="rule-item">
            <span class="rule-icon">☠️</span>
            <div><strong>${t.ruleBadTitle}</strong> ${t.ruleBadBody}</div>
          </div>
          <div class="rule-item">
            <span class="rule-icon">♥</span>
            <div><strong>${t.ruleLivesTitle}</strong> ${t.ruleLivesBody}</div>
          </div>
        </div>

        <button class="btn btn-primary" id="btn-close-rules" style="width: 100%;">${t.btnGotIt}</button>
      </div>
    `;

    this.overlayEl.querySelector('#btn-close-rules')!.addEventListener('click', () => {
      this.callbacks.onUiClick();
      this.activeModal = 'none';
      this.forceOverlayRender();
    });
  }
}
