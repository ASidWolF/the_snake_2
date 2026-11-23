/**
 * Роль: Исполнитель UI + Датчик кнопок интерфейса.
 * Отображает состояние из GameStore, SettingsStore, LeaderboardStore и SavedRunStore.
 * Не хранит авторитетного игрового состояния и не содержит игровой логики:
 * все действия отправляются через GameCommand и методы хранилищ.
 */

import type { IStorageAdapter } from '../core/contracts/actions.ts';
import type {
  DeathReason,
  DifficultyKey,
  Direction,
  GameCommand,
  GameSnapshot,
  TouchControlMode,
  UserSettings,
} from '../core/contracts/messages.ts';
import {
  DIFFICULTY_ORDER,
  DIFFICULTY_PROFILES,
} from '../core/profiles/difficultyProfiles.ts';
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

const DEATH_REASON_TEXT: Readonly<Record<DeathReason, string>> = {
  self_collision: 'Змейка врезалась в собственный хвост.',
  stone_too_heavy: 'Камень оказался слишком тяжёлым — длина змейки должна быть больше веса камня.',
  stone_hit_snake: 'Отлетевший камень задел тело змейки.',
};

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
  private readonly hudLevelEl: HTMLElement;
  private readonly hudApplesEl: HTMLElement;
  private readonly hudLengthEl: HTMLElement;
  private readonly hudScoreEl: HTMLElement;
  private readonly hudNextLifeEl: HTMLElement;
  private readonly hudSpeedEl: HTMLElement;
  private readonly hudFrenzyStatusEl: HTMLElement;
  private readonly hudFrenzyFillEl: HTMLElement;
  private readonly hudLivesEl: HTMLElement;
  private readonly hudMuteBtn: HTMLButtonElement;

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
            <div class="hud-pill level-pill"><span class="label">Ур.</span><span class="value" id="hud-level">1</span></div>
            <div class="hud-pill apples-pill"><span>🍎</span><span class="value" id="hud-apples">0/0</span></div>
            <div class="hud-pill"><span class="label">Длина</span><span class="value" id="hud-length">3</span></div>
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
              <span class="label">Очки</span>
              <span class="value" id="hud-score">0</span>
              <span class="label" id="hud-next-life" title="До дополнительной жизни">· +♥ 1200</span>
            </div>
            <div class="hud-pill">
              <div class="lives-row" id="hud-lives"></div>
            </div>
            <button class="hud-icon-btn" id="hud-mute-btn" title="Звук (M)" aria-label="Звук">🔊</button>
            <button class="hud-icon-btn" id="hud-settings-btn" title="Настройки" aria-label="Настройки">⚙️</button>
            <button class="hud-icon-btn" id="hud-pause-btn" title="Пауза (Space / P)" aria-label="Пауза">⏸</button>
          </div>
        </header>

        <main class="stage-wrap" id="stage-wrap">
          <canvas id="game-canvas"></canvas>
          <div class="overlay-layer" id="overlay-layer"></div>
        </main>

        <section class="touch-dpad" id="touch-dpad" aria-label="Сенсорное управление">
          <div class="dpad-grid">
            <button class="dpad-btn dpad-up" data-dir="UP" aria-label="Вверх">▲</button>
            <button class="dpad-btn dpad-left" data-dir="LEFT" aria-label="Влево">◀</button>
            <button class="dpad-btn dpad-center" data-action="pause" aria-label="Пауза">⏸</button>
            <button class="dpad-btn dpad-right" data-dir="RIGHT" aria-label="Вправо">▶</button>
            <button class="dpad-btn dpad-down" data-dir="DOWN" aria-label="Вниз">▼</button>
          </div>
        </section>
      </div>
    `;

    this.stageEl = root.querySelector('#stage-wrap')!;
    this.canvasEl = root.querySelector('#game-canvas')!;
    this.hudEl = root.querySelector('#hud')!;
    this.overlayEl = root.querySelector('#overlay-layer')!;
    this.dpadEl = root.querySelector('#touch-dpad')!;

    this.hudLevelEl = root.querySelector('#hud-level')!;
    this.hudApplesEl = root.querySelector('#hud-apples')!;
    this.hudLengthEl = root.querySelector('#hud-length')!;
    this.hudScoreEl = root.querySelector('#hud-score')!;
    this.hudNextLifeEl = root.querySelector('#hud-next-life')!;
    this.hudSpeedEl = root.querySelector('#hud-speed')!;
    this.hudFrenzyStatusEl = root.querySelector('#hud-frenzy-status')!;
    this.hudFrenzyFillEl = root.querySelector('#hud-frenzy-fill')!;
    this.hudLivesEl = root.querySelector('#hud-lives')!;
    this.hudMuteBtn = root.querySelector('#hud-mute-btn')!;

    this.bindStaticControls(root);
    this.syncAll(initialSnapshot, settingsStore.getSnapshot());
  }

  private bindStaticControls(root: HTMLElement): void {
    this.hudMuteBtn.addEventListener('click', () => {
      this.callbacks.onUserGesture();
      const audio = this.settingsStore.getSnapshot().audio;
      this.settingsStore.updateAudio({ muted: !audio.muted });
      this.callbacks.onUiClick();
    });

    root.querySelector('#hud-settings-btn')!.addEventListener('click', () => {
      this.callbacks.onUserGesture();
      this.callbacks.onUiClick();
      if (this.lastSnapshot.phase === 'playing') {
        this.callbacks.onCommand({ type: 'SET_PAUSED', paused: true });
      }
      this.activeModal = 'settings';
      this.forceOverlayRender();
    });

    root.querySelector('#hud-pause-btn')!.addEventListener('click', () => {
      this.callbacks.onUserGesture();
      this.callbacks.onUiClick();
      this.callbacks.onCommand({ type: 'TOGGLE_PAUSE' });
    });

    // Сенсорный D-pad: срабатывает на pointerdown для минимальной задержки
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

    if (prevRunId !== snapshot.runId || (prevPhase !== 'game_over' && snapshot.phase === 'game_over')) {
      this.savedRecordRank = null;
    }

    this.updateHud(snapshot, settings);
    this.updateTouchDpadVisibility(snapshot, settings.touchControls);

    const savedRun = this.savedRunStore.getSnapshot();
    const savedKey = savedRun
      ? `${savedRun.runId}:${savedRun.levelStats.level}:${savedRun.score}:${savedRun.phase}`
      : 'none';

    const key = [
      snapshot.phase,
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
    // Всегда сохраняем текущий прогресс партии, чтобы работала кнопка «Продолжить»
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

  private saveRecordForSnapshot(snapshot: GameSnapshot, rawName: string): number {
    const { entry, rank } = this.leaderboardStore.addRecord({
      runId: snapshot.runId,
      playerName: rawName,
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

    this.hudLevelEl.textContent = String(snapshot.levelStats.level);
    const collected =
      snapshot.levelStats.initialGoodApples - snapshot.goodApples.length;
    this.hudApplesEl.textContent = `${collected}/${snapshot.levelStats.initialGoodApples}`;
    this.hudLengthEl.textContent = String(snapshot.snake.segments.length);
    this.hudScoreEl.textContent = String(snapshot.score);

    const toNextLife = Math.max(0, snapshot.nextLifeScore - snapshot.score);
    this.hudNextLifeEl.textContent =
      snapshot.lives >= snapshot.maxLives ? '· МАКС ♥' : `· +♥ ${toNextLife}`;

    this.hudSpeedEl.textContent = `${snapshot.effectiveSpeed.toFixed(1)} ш/с`;
    const frenzyPct = Math.round(snapshot.frenzy.level * 100);
    this.hudFrenzyFillEl.style.width = `${frenzyPct}%`;

    this.hudFrenzyStatusEl.classList.remove('active', 'peak');
    if (snapshot.frenzy.level >= 0.98) {
      this.hudFrenzyStatusEl.textContent = '🔥 БЕШЕНСТВО!';
      this.hudFrenzyStatusEl.classList.add('peak');
    } else if (snapshot.frenzy.active) {
      this.hudFrenzyStatusEl.textContent = `⚡ Звереет ${frenzyPct}%`;
      this.hudFrenzyStatusEl.classList.add('active');
    } else {
      this.hudFrenzyStatusEl.textContent = 'Спокойна';
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
        this.renderLeaderboardModal();
      } else if (this.activeModal === 'rules') {
        this.renderRulesModal();
      } else if (this.activeModal === 'save_record') {
        this.renderSaveRecordModal(snapshot, settings, false);
      } else {
        this.renderSaveRecordModal(snapshot, settings, true);
      }
      return;
    }

    if (snapshot.phase === 'playing') {
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
        this.renderPauseOverlay(snapshot);
        break;
      case 'life_lost':
        this.renderLifeLostOverlay(snapshot);
        break;
      case 'level_complete':
        this.renderLevelCompleteOverlay(snapshot);
        break;
      case 'game_over':
        this.renderGameOverOverlay(snapshot, settings);
        break;
    }
  }

  private renderMainMenu(settings: UserSettings): void {
    const modeLabel =
      this.storage.platformName === 'desktop' ? 'ПК-приложение' : 'Веб-версия';
    const bestScore = this.leaderboardStore.getBestScore(settings.difficulty);
    const savedRun = this.savedRunStore.getSnapshot();

    const diffCards = DIFFICULTY_ORDER.map((key) => {
      const p = DIFFICULTY_PROFILES[key];
      const selected = key === settings.difficulty ? 'selected' : '';
      return `
        <button class="diff-card ${selected}" data-difficulty="${key}" style="--diff-accent: ${p.accentColor}">
          <div class="diff-top">
            <span class="diff-name">${p.label}</span>
            <span class="diff-mult">×${p.scoreMultiplier.toFixed(1)}</span>
          </div>
          <div class="diff-desc">${p.shortDesc}</div>
        </button>
      `;
    }).join('');

    const continueBtn = savedRun
      ? `
        <button class="btn btn-continue" id="btn-continue">
          <span>▶ Продолжить игру</span>
          <span class="btn-meta">Уровень ${savedRun.levelStats.level} • Очки: ${savedRun.score} • ${DIFFICULTY_PROFILES[savedRun.difficulty].label} • ${'♥'.repeat(savedRun.lives)}</span>
        </button>
      `
      : '';

    const quitBtn = this.storage.quitApp
      ? `<button class="btn btn-ghost" id="btn-quit">Выход</button>`
      : '';

    this.overlayEl.innerHTML = `
      <div class="card">
        <div class="brand-header">
          <div class="brand-badge">🐍 ${modeLabel} • 100% процедурно</div>
          <h1 class="brand-title">THE SNAKE 2</h1>
          <p class="brand-subtitle">
            Уровневая прогрессия, змеиное бешенство, толкаемые камни и адаптивный саундтрек.
            ${bestScore > 0 ? `Лучший счёт (${DIFFICULTY_PROFILES[settings.difficulty].label}): <strong>${bestScore}</strong>` : ''}
          </p>
        </div>

        <div class="section-label">Уровень сложности (для новой игры)</div>
        <div class="difficulty-grid">${diffCards}</div>

        <div class="btn-stack">
          ${continueBtn}
          <button class="btn btn-primary" id="btn-play">${savedRun ? '✨ Новая игра (с 1 уровня)' : '▶ Начать игру'}</button>
          <div class="btn-row">
            <button class="btn" id="btn-leaderboard">🏆 Рекорды</button>
            <button class="btn" id="btn-settings">⚙️ Настройки</button>
            <button class="btn" id="btn-rules">📖 Правила</button>
          </div>
          ${quitBtn}
        </div>

        <div class="menu-footer">
          ПК: WASD / Стрелки, Space — пауза, M — звук · Телефоны и планшеты: свайпы или D-pad
        </div>
      </div>
    `;

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

  private renderSaveRecordActionButton(snapshot: GameSnapshot): string {
    if (snapshot.score <= 0) return '';
    const alreadySaved = this.leaderboardStore.hasSavedScore(
      snapshot.runId,
      snapshot.score
    );
    const label = alreadySaved
      ? `✓ Рекорд записан (${snapshot.score})`
      : `🏆 Сохранить рекорд (${snapshot.score})`;
    return `<button class="btn btn-gold" id="btn-mid-save-record">${label}</button>`;
  }

  private renderPauseOverlay(snapshot: GameSnapshot): void {
    const diff = DIFFICULTY_PROFILES[snapshot.difficulty];
    this.overlayEl.innerHTML = `
      <div class="card">
        <h2 class="modal-title">Пауза</h2>
        <p class="modal-sub">Уровень ${snapshot.levelStats.level} • ${diff.label} (×${diff.scoreMultiplier.toFixed(1)})</p>
        <div class="stats-grid">
          <div class="stat-box"><span class="k">Счёт</span><span class="v gold">${snapshot.score}</span></div>
          <div class="stat-box"><span class="k">Осталось яблок</span><span class="v emerald">${snapshot.goodApples.length}</span></div>
        </div>
        <div class="btn-stack">
          <button class="btn btn-primary" id="btn-resume">▶ Продолжить</button>
          ${this.renderSaveRecordActionButton(snapshot)}
          <button class="btn" id="btn-pause-settings">⚙️ Громкость и управление</button>
          <button class="btn btn-ghost" id="btn-pause-menu">⬅ В главное меню (прогресс сохранится)</button>
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

  private renderLifeLostOverlay(snapshot: GameSnapshot): void {
    const reasonText = snapshot.lastDeathReason
      ? DEATH_REASON_TEXT[snapshot.lastDeathReason]
      : 'Произошло столкновение.';

    this.overlayEl.innerHTML = `
      <div class="card">
        <h2 class="modal-title" style="color: #fb7185;">Потеряна жизнь</h2>
        <p class="modal-sub">${reasonText}</p>
        <div class="stats-grid">
          <div class="stat-box"><span class="k">Осталось жизней</span><span class="v crimson">${'♥ '.repeat(snapshot.lives).trim()}</span></div>
          <div class="stat-box"><span class="k">Текущий счёт</span><span class="v gold">${snapshot.score}</span></div>
        </div>
        <div class="btn-stack">
          <button class="btn btn-primary" id="btn-retry">↻ Повторить уровень ${snapshot.levelStats.level}</button>
          ${this.renderSaveRecordActionButton(snapshot)}
          <button class="btn btn-ghost" id="btn-lost-menu">⬅ В главное меню (прогресс сохранится)</button>
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

  private renderLevelCompleteOverlay(snapshot: GameSnapshot): void {
    const s = snapshot.lastLevelSummary;
    const stars = s ? s.efficiencyRating : 1;
    const starsHtml = [1, 2, 3]
      .map((i) => `<span class="star ${i <= stars ? 'lit' : 'dim'}">★</span>`)
      .join('');

    this.overlayEl.innerHTML = `
      <div class="card">
        <div class="stars-row">${starsHtml}</div>
        <h2 class="modal-title" style="color: #34d399;">Уровень ${snapshot.levelStats.level} пройден!</h2>
        <p class="modal-sub">Все хорошие яблоки собраны. Готовься к ускорению на уровне ${snapshot.levelStats.level + 1}!</p>

        <div class="stats-grid">
          <div class="stat-box"><span class="k">Ходы (эталон ${s?.parMoves ?? 0})</span><span class="v">${s?.moves ?? 0}</span></div>
          <div class="stat-box"><span class="k">Ошибки</span><span class="v ${(s?.mistakes ?? 0) === 0 ? 'emerald' : 'crimson'}">${s?.mistakes ?? 0}</span></div>
          <div class="stat-box"><span class="k">Бонус уровня</span><span class="v gold">+${s?.totalBonus ?? 0}</span></div>
          <div class="stat-box"><span class="k">Общий счёт</span><span class="v gold">${snapshot.score}</span></div>
        </div>

        <div class="btn-stack">
          <button class="btn btn-primary" id="btn-next-level">➡ Уровень ${snapshot.levelStats.level + 1}</button>
          ${this.renderSaveRecordActionButton(snapshot)}
          <button class="btn btn-ghost" id="btn-clear-menu">⬅ В главное меню (прогресс сохранится)</button>
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
    const diff = DIFFICULTY_PROFILES[snapshot.difficulty];
    const title = exitAfter ? 'Выход в главное меню' : 'Сохранить рекорд';
    const sub = exitAfter
      ? `Прогресс (Ур. ${snapshot.levelStats.level}) сохранён — вы сможете нажать «Продолжить». Хотите также записать текущий счёт в таблицу рекордов?`
      : `Уровень ${snapshot.levelStats.level} • ${diff.label}. При продолжении партии рекорд автоматически обновится без дубликатов.`;

    const alreadySaved = this.leaderboardStore.hasSavedScore(
      snapshot.runId,
      snapshot.score
    );

    this.overlayEl.innerHTML = `
      <div class="card">
        <h2 class="modal-title">🏆 ${title}</h2>
        <p class="modal-sub">${sub}</p>

        <div class="stats-grid">
          <div class="stat-box"><span class="k">Текущий счёт</span><span class="v gold">${snapshot.score}</span></div>
          <div class="stat-box"><span class="k">Достигнут уровень</span><span class="v emerald">${snapshot.highestLevel}</span></div>
        </div>

        ${
          alreadySaved && this.savedRecordRank !== null && !exitAfter
            ? `<div class="saved-banner">Рекорд сохранён! Текущее место: #${this.savedRecordRank}</div>`
            : `
              <form class="record-form" id="mid-record-form">
                <input
                  class="text-input"
                  id="mid-player-name-input"
                  type="text"
                  maxlength="18"
                  placeholder="Ваше имя для таблицы рекордов"
                  value="${escapeHtml(settings.lastPlayerName)}"
                />
                <button class="btn btn-primary" type="submit" style="padding: 10px 16px; font-size: 14px;">
                  ${exitAfter ? 'Сохранить и выйти' : 'Сохранить'}
                </button>
              </form>
            `
        }

        <div class="btn-stack">
          ${
            exitAfter
              ? `<button class="btn" id="btn-exit-without-record">💾 Выйти без записи рекорда (прогресс сохранён)</button>`
              : ''
          }
          <button class="btn btn-ghost" id="btn-cancel-save-record">${exitAfter ? 'Отмена' : 'Назад'}</button>
        </div>
      </div>
    `;

    const form = this.overlayEl.querySelector<HTMLFormElement>('#mid-record-form');
    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.callbacks.onUiClick();
      const input = this.overlayEl.querySelector<HTMLInputElement>('#mid-player-name-input');
      this.saveRecordForSnapshot(snapshot, input?.value ?? '');
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
    const diff = DIFFICULTY_PROFILES[snapshot.difficulty];
    const reasonText = snapshot.lastDeathReason
      ? DEATH_REASON_TEXT[snapshot.lastDeathReason]
      : 'Жизни закончились.';

    const alreadySaved = this.leaderboardStore.hasSavedScore(
      snapshot.runId,
      snapshot.score
    );

    const recordBlock =
      snapshot.score <= 0
        ? ''
        : alreadySaved && this.savedRecordRank !== null
          ? `<div class="saved-banner">Рекорд сохранён! Место в таблице: #${this.savedRecordRank}</div>`
          : `
            <form class="record-form" id="record-form">
              <input
                class="text-input"
                id="player-name-input"
                type="text"
                maxlength="18"
                placeholder="Ваше имя для таблицы рекордов"
                value="${escapeHtml(settings.lastPlayerName)}"
              />
              <button class="btn btn-primary" type="submit" style="padding: 10px 16px; font-size: 14px;">Сохранить</button>
            </form>
          `;

    this.overlayEl.innerHTML = `
      <div class="card">
        <h2 class="modal-title" style="color: #f43f5e;">Игра окончена</h2>
        <p class="modal-sub">${reasonText} • ${diff.label}</p>

        <div class="stats-grid">
          <div class="stat-box"><span class="k">Итоговый счёт</span><span class="v gold">${snapshot.score}</span></div>
          <div class="stat-box"><span class="k">Достигнут уровень</span><span class="v emerald">${snapshot.highestLevel}</span></div>
          <div class="stat-box"><span class="k">Собрано яблок</span><span class="v">${snapshot.totalApplesEaten}</span></div>
          <div class="stat-box"><span class="k">Макс. длина</span><span class="v">${snapshot.maxLength}</span></div>
        </div>

        ${recordBlock}

        <div class="btn-stack">
          <button class="btn btn-primary" id="btn-play-again">↻ Играть снова</button>
          <div class="btn-row">
            <button class="btn" id="btn-go-lb">🏆 Рекорды</button>
            <button class="btn btn-ghost" id="btn-go-menu">В меню</button>
          </div>
        </div>
      </div>
    `;

    const form = this.overlayEl.querySelector<HTMLFormElement>('#record-form');
    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.callbacks.onUiClick();
      const input = this.overlayEl.querySelector<HTMLInputElement>('#player-name-input');
      this.saveRecordForSnapshot(snapshot, input?.value ?? '');
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
    const a = settings.audio;
    const masterPct = Math.round(a.masterVolume * 100);
    const musicPct = Math.round(a.musicVolume * 100);
    const sfxPct = Math.round(a.sfxVolume * 100);

    this.overlayEl.innerHTML = `
      <div class="card">
        <h2 class="modal-title">Настройки</h2>
        <p class="modal-sub">Процедурный звук Web Audio и управление</p>

        <div class="setting-row">
          <div class="setting-top">
            <span>Общая громкость</span>
            <span class="pct" id="val-master">${masterPct}%</span>
          </div>
          <input type="range" id="rng-master" min="0" max="100" value="${masterPct}" />
        </div>

        <div class="setting-row">
          <div class="setting-top">
            <span>Музыка</span>
            <span class="pct" id="val-music">${musicPct}%</span>
          </div>
          <input type="range" id="rng-music" min="0" max="100" value="${musicPct}" />
        </div>

        <div class="setting-row">
          <div class="setting-top">
            <span>Звуковые эффекты (SFX)</span>
            <span class="pct" id="val-sfx">${sfxPct}%</span>
          </div>
          <input type="range" id="rng-sfx" min="0" max="100" value="${sfxPct}" />
        </div>

        <div class="setting-row">
          <div class="setting-top">
            <span>Сенсорный D-pad (телефоны / планшеты)</span>
          </div>
          <div class="segmented">
            <button class="seg-btn ${settings.touchControls === 'auto' ? 'active' : ''}" data-touch="auto">Авто</button>
            <button class="seg-btn ${settings.touchControls === 'dpad' ? 'active' : ''}" data-touch="dpad">Всегда</button>
            <button class="seg-btn ${settings.touchControls === 'swipe' ? 'active' : ''}" data-touch="swipe">Только свайп</button>
          </div>
        </div>

        <div class="btn-row" style="margin-top: 14px;">
          <button class="btn" id="btn-mute-toggle">${a.muted ? '🔇 Звук выкл.' : '🔊 Звук вкл.'}</button>
          <button class="btn btn-primary" id="btn-close-modal">Готово</button>
        </div>
      </div>
    `;

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

    this.overlayEl.querySelectorAll<HTMLButtonElement>('.seg-btn').forEach((btn) => {
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

  private renderLeaderboardModal(): void {
    const entries = this.leaderboardStore.getEntries(this.leaderboardFilter);
    const tabs: Array<{ key: DifficultyKey | 'all'; label: string }> = [
      { key: 'all', label: 'Все' },
      { key: 'easy', label: 'Легко' },
      { key: 'normal', label: 'Нормально' },
      { key: 'hard', label: 'Сложно' },
    ];

    const tabsHtml = tabs
      .map(
        (t) =>
          `<button class="tab-btn ${this.leaderboardFilter === t.key ? 'active' : ''}" data-filter="${t.key}">${t.label}</button>`
      )
      .join('');

    const bodyHtml =
      entries.length === 0
        ? `<div class="empty-note">Рекордов пока нет — сыграйте первую партию!</div>`
        : `
          <table class="lb-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Игрок</th>
                <th>Очки</th>
                <th>Ур.</th>
                <th>Сложность</th>
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
                      <td>${DIFFICULTY_PROFILES[e.difficulty].label}</td>
                    </tr>
                  `;
                })
                .join('')}
            </tbody>
          </table>
        `;

    this.overlayEl.innerHTML = `
      <div class="card wide">
        <h2 class="modal-title">🏆 Таблица рекордов</h2>
        <p class="modal-sub">Локальное хранилище (${this.storage.platformName === 'desktop' ? 'файл ПК' : 'браузер'})</p>
        <div class="tabs-row">${tabsHtml}</div>
        ${bodyHtml}
        <div class="btn-row">
          ${entries.length > 0 ? `<button class="btn btn-danger" id="btn-clear-lb">Очистить</button>` : ''}
          <button class="btn btn-primary" id="btn-close-lb">Закрыть</button>
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

  private renderRulesModal(): void {
    this.overlayEl.innerHTML = `
      <div class="card wide">
        <h2 class="modal-title">📖 Правила The Snake 2</h2>
        <p class="modal-sub">Уровни, бешенство, камни с весом и пополняемые жизни</p>

        <div class="rules-list">
          <div class="rule-item">
            <span class="rule-icon">🍎</span>
            <div><strong>Хорошие яблоки:</strong> количество на уровне фиксировано. Соберите все, чтобы пройти уровень! Чем меньше ходов и ошибок — тем выше бонус эффективности.</div>
          </div>
          <div class="rule-item">
            <span class="rule-icon">🔥</span>
            <div><strong>Змеиное бешенство:</strong> если долго не собирать хорошие яблоки, змейка начинает звереть и резко ускоряться, а музыка — нарастать. Съешьте яблоко, чтобы успокоить её.</div>
          </div>
          <div class="rule-item">
            <span class="rule-icon">🪨</span>
            <div><strong>Камни с весом:</strong> число на камне — его вес. Если длина змейки <em>больше</em> веса (камень светится бирюзовым), его можно толкнуть за бонус, потеряв хвост. Иначе — потеря жизни.</div>
          </div>
          <div class="rule-item">
            <span class="rule-icon">☠️</span>
            <div><strong>Плохие яблоки:</strong> фиолетовые с крестом — отнимают 1 сегмент длины, штрафуют счёт и добавляют ошибку уровня.</div>
          </div>
          <div class="rule-item">
            <span class="rule-icon">♥</span>
            <div><strong>Жизни, пауза и рекорды:</strong> при ошибке вы теряете жизнь и переигрываете уровень. Каждые 1200 очков дают +1 жизнь (до 5). Прогресс сохраняется автоматически — можно продолжить с любого уровня и записать рекорд при выходе в меню.</div>
          </div>
        </div>

        <button class="btn btn-primary" id="btn-close-rules" style="width: 100%;">Понятно</button>
      </div>
    `;

    this.overlayEl.querySelector('#btn-close-rules')!.addEventListener('click', () => {
      this.callbacks.onUiClick();
      this.activeModal = 'none';
      this.forceOverlayRender();
    });
  }
}
