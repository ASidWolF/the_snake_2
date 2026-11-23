/**
 * Роль: Исполнитель (Executor).
 * 100% процедурный Canvas 2D рендер The Snake 2:
 * - High-DPI адаптивное поле 24×18
 * - Плавная интерполяция змейки 60/120 FPS с корректной отрисовкой телепорта через стены
 * - Выразительная голова (следящие глаза, язычок, пожелтение при плохом яблоке, аура бешенства)
 * - Комикс-реплики змейки («Ням!», «Фу!», «ЕСТЬ!», «Худею!»)
 * - 3-фазная анимация гибели (подпрыгивает → переворачивается пузом кверху → душа с нимбом улетает вверх)
 * Авторитетного состояния не хранит, игровых решений не принимает.
 */

import type { IRenderExecutor } from '../core/contracts/actions.ts';
import type {
  GameEvent,
  GameSnapshot,
  GridPoint,
  LanguageKey,
} from '../core/contracts/messages.ts';
import {
  DEATH_ANIM_DURATION_SEC,
  ROUND_COUNTDOWN_SEC,
} from '../core/processors/SimulationProcessor.ts';
import { DIRECTION_VECTORS, GRID_PROFILE } from '../core/profiles/gridProfile.ts';
import { I18N_PROFILES } from '../core/profiles/i18nProfile.ts';
import { ParticleSystem } from './ParticleSystem.ts';

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpColor(
  c1: readonly [number, number, number],
  c2: readonly [number, number, number],
  t: number
): string {
  const clamped = Math.max(0, Math.min(1, t));
  const r = Math.round(lerp(c1[0], c2[0], clamped));
  const g = Math.round(lerp(c1[1], c2[1], clamped));
  const b = Math.round(lerp(c1[2], c2[2], clamped));
  return `rgb(${r}, ${g}, ${b})`;
}

function interpolateWrapped(prev: number, next: number, size: number, t: number): number {
  let delta = next - prev;
  if (delta > size / 2) delta -= size;
  if (delta < -size / 2) delta += size;
  const raw = prev + delta * t;
  return ((raw % size) + size) % size;
}

const COLOR_CALM_HEAD: readonly [number, number, number] = [52, 211, 153];
const COLOR_CALM_TAIL: readonly [number, number, number] = [6, 182, 212];
const COLOR_WARN_HEAD: readonly [number, number, number] = [251, 146, 60];
const COLOR_RAGE_HEAD: readonly [number, number, number] = [244, 63, 94];
const COLOR_RAGE_TAIL: readonly [number, number, number] = [234, 88, 12];
const COLOR_SICK_HEAD: readonly [number, number, number] = [250, 204, 21];
const COLOR_SICK_EDGE: readonly [number, number, number] = [163, 230, 53];

export class CanvasRenderExecutor implements IRenderExecutor {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly particles = new ParticleSystem();

  private cssWidth = 800;
  private cssHeight = 600;
  private boardX = 0;
  private boardY = 0;
  private cellSize = 30;
  private emberCooldown = 0;
  private sickFlashSec = 0;
  private frenzyShoutCooldown = 0;
  private soulSparkCooldown = 0;
  private goBannerSec = 0;
  private language: LanguageKey = 'ru';
  private boardCacheCanvas: HTMLCanvasElement | null = null;
  private boardCacheW = 0;
  private boardCacheH = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Не удалось инициализировать 2D-контекст Canvas');
    }
    this.ctx = context;
    this.resize();
  }

  setLanguage(language: LanguageKey): void {
    this.language = language;
  }

  resize(): void {
    const parent = this.canvas.parentElement;
    const rect = parent
      ? parent.getBoundingClientRect()
      : this.canvas.getBoundingClientRect();

    this.cssWidth = Math.max(320, Math.floor(rect.width));
    this.cssHeight = Math.max(240, Math.floor(rect.height));

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.floor(this.cssWidth * dpr);
    this.canvas.height = Math.floor(this.cssHeight * dpr);
    this.canvas.style.width = `${this.cssWidth}px`;
    this.canvas.style.height = `${this.cssHeight}px`;

    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const pad = Math.min(18, Math.min(this.cssWidth, this.cssHeight) * 0.025);
    const availW = this.cssWidth - pad * 2;
    const availH = this.cssHeight - pad * 2;

    this.cellSize = Math.floor(
      Math.min(availW / GRID_PROFILE.width, availH / GRID_PROFILE.height)
    );
    const boardW = this.cellSize * GRID_PROFILE.width;
    const boardH = this.cellSize * GRID_PROFILE.height;
    this.boardX = Math.floor((this.cssWidth - boardW) / 2);
    this.boardY = Math.floor((this.cssHeight - boardH) / 2);
    this.rebuildBoardCache(boardW, boardH);
  }

  private rebuildBoardCache(bw: number, bh: number): void {
    if (typeof document === 'undefined' || bw <= 0 || bh <= 0) return;
    if (!this.boardCacheCanvas) {
      this.boardCacheCanvas = document.createElement('canvas');
    }
    this.boardCacheCanvas.width = bw;
    this.boardCacheCanvas.height = bh;
    this.boardCacheW = bw;
    this.boardCacheH = bh;

    const c = this.boardCacheCanvas.getContext('2d');
    if (!c) return;
    const cs = this.cellSize;
    const tileA = '#0a141d';
    const tileB = '#0d1924';
    for (let y = 0; y < GRID_PROFILE.height; y += 1) {
      for (let x = 0; x < GRID_PROFILE.width; x += 1) {
        c.fillStyle = (x + y) % 2 === 0 ? tileA : tileB;
        c.fillRect(x * cs, y * cs, cs, cs);
      }
    }
  }

  handleEvent(event: GameEvent): void {
    const t = I18N_PROFILES[this.language];
    switch (event.type) {
      case 'LEVEL_STARTED':
        this.particles.clear();
        this.sickFlashSec = 0;
        this.frenzyShoutCooldown = 0;
        this.goBannerSec = 0;
        break;
      case 'COUNTDOWN_TICK':
        if (event.value === 0) {
          this.goBannerSec = 0.65;
          this.particles.spawnShockwave(
            GRID_PROFILE.width / 2 - 0.5,
            GRID_PROFILE.height / 2 - 0.5,
            '#34d399',
            4.2
          );
        }
        break;
      case 'GOOD_APPLE_EATEN':
        this.sickFlashSec = 0;
        this.frenzyShoutCooldown = 0;
        this.particles.spawnBurst(event.pos.x, event.pos.y, '#fb7185', 14, 5.2, true);
        this.particles.spawnBurst(event.pos.x, event.pos.y, '#34d399', 6, 3.2, true);
        this.particles.spawnShockwave(event.pos.x, event.pos.y, '#34d399', 2.2);
        this.particles.spawnText(
          event.pos.x,
          event.pos.y,
          event.combo > 1 ? `+${event.points} ×${event.combo}` : `+${event.points}`,
          event.combo > 2 ? '#fde047' : '#6ee7b7',
          event.combo > 2 ? 1.15 : 1
        );
        this.particles.showSpeech(t.speechYum, 'yum', 0.9, event.pos.x, event.pos.y);
        if (event.calmedFrenzy) {
          this.particles.spawnShockwave(event.pos.x, event.pos.y, '#38bdf8', 3.4);
        }
        break;
      case 'BAD_APPLE_EATEN':
        this.sickFlashSec = 0.85;
        this.particles.spawnBurst(event.pos.x, event.pos.y, '#a855f7', 16, 4.8, true);
        this.particles.spawnBurst(event.pos.x, event.pos.y, '#facc15', 10, 3.5, true);
        this.particles.spawnShockwave(event.pos.x, event.pos.y, '#a855f7', 2.1);
        this.particles.spawnText(
          event.pos.x,
          event.pos.y,
          event.penalty > 0 ? `-${event.penalty}` : t.floatMinusLength,
          '#f472b6',
          1.05
        );
        this.particles.showSpeech(t.speechEw, 'ew', 1.0, event.pos.x, event.pos.y);
        this.particles.addShake(0.45);
        break;
      case 'STONE_PUSHED':
        this.particles.spawnBurst(event.from.x, event.from.y, '#cbd5e1', 12, 4.2, false);
        this.particles.spawnBurst(event.to.x, event.to.y, '#38bdf8', 12, 5.2, true);
        this.particles.spawnShockwave(event.to.x, event.to.y, '#38bdf8', 2.6);
        this.particles.spawnText(
          event.to.x,
          event.to.y,
          `+${event.points}`,
          '#7dd3fc',
          1.15
        );
        this.particles.addShake(0.5);
        break;
      case 'FRENZY_STARTED':
        this.particles.showSpeech(t.speechEat, 'eat', 1.15);
        this.frenzyShoutCooldown = 2.3;
        this.particles.addShake(0.25);
        break;
      case 'FRENZY_PEAK':
        this.particles.showSpeech(t.speechEatPeak, 'eat', 1.2);
        this.frenzyShoutCooldown = 2.0;
        this.particles.addShake(0.6);
        break;
      case 'SNAKE_SHRUNK':
        this.particles.spawnBurst(event.tailLost.x, event.tailLost.y, '#fed7aa', 12, 3.6, true);
        this.particles.spawnShockwave(event.tailLost.x, event.tailLost.y, '#fb923c', 1.6);
        this.particles.showSpeech(t.speechShrinking, 'thin', 1.1, event.head.x, event.head.y);
        this.frenzyShoutCooldown = 1.6;
        this.particles.addShake(0.3);
        break;
      case 'LIFE_GAINED':
        this.particles.spawnBurst(event.pos.x, event.pos.y, '#fde047', 22, 6.5, true);
        this.particles.spawnShockwave(event.pos.x, event.pos.y, '#fde047', 3.6);
        this.particles.spawnText(event.pos.x, event.pos.y, t.floatExtraLife, '#fde047', 1.3);
        break;
      case 'LIFE_LOST':
        this.sickFlashSec = 0;
        this.particles.spawnBurst(event.pos.x, event.pos.y, '#f43f5e', 24, 6.2, true);
        this.particles.spawnShockwave(event.pos.x, event.pos.y, '#f43f5e', 3.4);
        this.particles.addShake(0.85);
        break;
      case 'LEVEL_COMPLETED':
        this.particles.spawnBurst(
          GRID_PROFILE.width / 2 - 0.5,
          GRID_PROFILE.height / 2 - 0.5,
          '#fde047',
          36,
          7.5,
          true
        );
        this.particles.spawnShockwave(
          GRID_PROFILE.width / 2 - 0.5,
          GRID_PROFILE.height / 2 - 0.5,
          '#34d399',
          6
        );
        break;
      default:
        break;
    }
  }

  render(snapshot: GameSnapshot, nowSec: number, dtSec: number): void {
    const safeDt = Math.min(0.05, Math.max(0, dtSec));
    this.particles.update(safeDt);

    if (this.sickFlashSec > 0) {
      this.sickFlashSec = Math.max(0, this.sickFlashSec - safeDt);
    }
    if (this.goBannerSec > 0) {
      this.goBannerSec = Math.max(0, this.goBannerSec - safeDt);
    }

    // Периодические выкрики «ЕСТЬ!» и искры во время бешенства
    if (snapshot.phase === 'playing' && snapshot.frenzy.active) {
      if (snapshot.frenzy.level > 0.12) {
        this.emberCooldown -= safeDt;
        if (this.emberCooldown <= 0) {
          const head = snapshot.snake.segments[0];
          if (head) {
            this.particles.spawnEmber(head.x, head.y, snapshot.frenzy.level);
          }
          this.emberCooldown = lerp(0.14, 0.03, snapshot.frenzy.level);
        }
      }

      this.frenzyShoutCooldown -= safeDt;
      if (this.frenzyShoutCooldown <= 0 && !this.particles.hasActiveSpeech()) {
        const head = snapshot.snake.segments[0];
        const t = I18N_PROFILES[this.language];
        this.particles.showSpeech(
          snapshot.frenzy.level > 0.8 ? t.speechEatPeak : t.speechEat,
          'eat',
          1.0,
          head?.x,
          head?.y
        );
        this.frenzyShoutCooldown = lerp(2.5, 1.5, snapshot.frenzy.level);
      }
    }

    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);

    const shake = this.particles.getShakeOffset(this.cellSize);
    const frenzyShake =
      snapshot.phase === 'playing' && snapshot.frenzy.level > 0.78
        ? (snapshot.frenzy.level - 0.78) * 3.5
        : 0;
    const fx = frenzyShake > 0 ? (Math.random() - 0.5) * frenzyShake : 0;
    const fy = frenzyShake > 0 ? (Math.random() - 0.5) * frenzyShake : 0;

    const bx = this.boardX + shake.dx + fx;
    const by = this.boardY + shake.dy + fy;
    const boardW = this.cellSize * GRID_PROFILE.width;
    const boardH = this.cellSize * GRID_PROFILE.height;

    this.drawBoard(ctx, bx, by, boardW, boardH, snapshot.frenzy.level, nowSec);

    if (snapshot.phase === 'menu') {
      this.drawMenuShowcase(ctx, bx, by, boardW, boardH, nowSec);
      return;
    }

    const snakeLen = snapshot.snake.segments.length;
    this.drawStones(ctx, bx, by, snapshot, snakeLen, nowSec);
    this.drawBadApples(ctx, bx, by, snapshot, nowSec);
    this.drawGoodApples(ctx, bx, by, snapshot, nowSec);

    const isDying =
      (snapshot.phase === 'life_lost' || snapshot.phase === 'game_over') &&
      snapshot.deathAnimSec > 0;

    let headGridPos: { readonly x: number; readonly y: number } | undefined;

    if (isDying) {
      headGridPos = this.drawDyingSnake(ctx, bx, by, snapshot, nowSec, safeDt);
    } else {
      headGridPos = this.drawSnake(ctx, bx, by, snapshot, nowSec);
    }

    this.particles.draw(ctx, bx, by, this.cellSize, headGridPos);

    if (snapshot.frenzy.level > 0.05 && !isDying) {
      this.drawFrenzyVignette(ctx, bx, by, boardW, boardH, snapshot.frenzy.level, nowSec);
    }

    if (snapshot.phase === 'playing' && snapshot.resumeCountdownSec > 0) {
      this.drawResumeCountdown(ctx, bx, by, boardW, boardH, snapshot.resumeCountdownSec);
    } else if (snapshot.phase === 'playing' && this.goBannerSec > 0) {
      this.drawGoBanner(ctx, bx, by, boardW, boardH, this.goBannerSec);
    }
  }

  /**
   * 3-фазная анимация гибели:
   * 1) 0.00..0.34 — подпрыгивание от шока;
   * 2) 0.34..1.00 — падение и переворот пузом кверху (полосатое пузо + глаза × ×);
   * 3) 0.42..1.00 — из тела отделяется светящаяся душа-змейка с крылышками и нимбом и улетает вверх.
   */
  private drawDyingSnake(
    ctx: CanvasRenderingContext2D,
    bx: number,
    by: number,
    snapshot: GameSnapshot,
    nowSec: number,
    dtSec: number
  ): { readonly x: number; readonly y: number } | undefined {
    const cs = this.cellSize;
    const segments = snapshot.snake.segments;
    if (segments.length === 0) return undefined;

    const progress = Math.max(
      0,
      Math.min(1, 1 - snapshot.deathAnimSec / DEATH_ANIM_DURATION_SEC)
    );

    // Фаза прыжка (0..0.34) + маленький отскок (0.34..0.46)
    let jumpPx = 0;
    if (progress < 0.34) {
      const p = progress / 0.34;
      jumpPx = Math.sin(p * Math.PI) * cs * 1.65;
    } else if (progress < 0.46) {
      const p = (progress - 0.34) / 0.12;
      jumpPx = Math.sin(p * Math.PI) * cs * 0.28;
    }

    // Плавный переворот пузом кверху (начинается на пике прыжка 0.18..0.42)
    const bellyUp = Math.max(0, Math.min(1, (progress - 0.18) / 0.24));

    // 1. Тень на полу под подпрыгнувшей змейкой
    ctx.save();
    for (let i = segments.length - 1; i >= 0; i -= 1) {
      const seg = segments[i]!;
      const ratio = 1 - i / Math.max(1, segments.length);
      const shadowScale = Math.max(0.45, 1 - jumpPx / (cs * 3.2));
      const sx = bx + (seg.x + 0.5) * cs;
      const sy = by + (seg.y + 0.68) * cs;
      ctx.fillStyle = `rgba(0, 0, 0, ${0.36 * shadowScale})`;
      ctx.beginPath();
      ctx.ellipse(
        sx,
        sy,
        cs * (0.28 + ratio * 0.16) * shadowScale,
        cs * 0.18 * shadowScale,
        0,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
    ctx.restore();

    // 2. Тело змейки: при перевороте становится бледно-кремовым пузом с поперечными полосками
    const bodyOuter = bellyUp > 0.5 ? '#fde68a' : '#34d399';
    const bodyInner = bellyUp > 0.5 ? '#fef9c3' : '#10b981';

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = segments.length - 1; i >= 1; i -= 1) {
      const a = segments[i]!;
      const b = segments[i - 1]!;
      if (Math.abs(a.x - b.x) > 1.5 || Math.abs(a.y - b.y) > 1.5) continue;

      const waveJumpA = jumpPx * (0.75 + 0.25 * Math.cos(i * 0.55));
      const waveJumpB = jumpPx * (0.75 + 0.25 * Math.cos((i - 1) * 0.55));
      const ratio = 1 - i / Math.max(1, segments.length);

      ctx.strokeStyle = bodyOuter;
      ctx.lineWidth = cs * (0.42 + ratio * 0.34);
      ctx.beginPath();
      ctx.moveTo(bx + (a.x + 0.5) * cs, by + (a.y + 0.5) * cs - waveJumpA);
      ctx.lineTo(bx + (b.x + 0.5) * cs, by + (b.y + 0.5) * cs - waveJumpB);
      ctx.stroke();
    }

    // Сегменты и полоски «пуза кверху»
    for (let i = segments.length - 1; i >= 1; i -= 1) {
      const seg = segments[i]!;
      const waveJump = jumpPx * (0.75 + 0.25 * Math.cos(i * 0.55));
      const ratio = 1 - i / Math.max(1, segments.length);
      const r = cs * (0.22 + ratio * 0.17);
      const sx = bx + (seg.x + 0.5) * cs;
      const sy = by + (seg.y + 0.5) * cs - waveJump;

      ctx.fillStyle = bodyInner;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();

      // Поперечные щитки пуза, когда лежит кверху пузом
      if (bellyUp > 0.45) {
        ctx.strokeStyle = 'rgba(180, 83, 9, 0.42)';
        ctx.lineWidth = Math.max(1.2, cs * 0.055);
        ctx.beginPath();
        ctx.moveTo(sx - r * 0.65, sy);
        ctx.lineTo(sx + r * 0.65, sy);
        ctx.stroke();
      }
    }
    ctx.restore();

    // 3. Голова (подпрыгивает, переворачивается на спину с крестиками × × вместо глаз и высунутым набок языком)
    const head = segments[0]!;
    const hx = bx + (head.x + 0.5) * cs;
    const hy = by + (head.y + 0.5) * cs - jumpPx;
    const dirVec = DIRECTION_VECTORS[snapshot.snake.direction];
    const baseAngle = Math.atan2(dirVec.y, dirVec.x);
    const headR = cs * 0.45;

    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(baseAngle + bellyUp * Math.PI);
    // Сплющивание при перевороте
    const flipScaleY = Math.max(0.28, Math.abs(Math.cos(bellyUp * Math.PI)));
    ctx.scale(1, flipScaleY < 0.9 ? Math.max(0.88, flipScaleY) : 1);

    // Высунутый безвольный язычок набок
    ctx.strokeStyle = '#fb7185';
    ctx.lineWidth = Math.max(1.8, cs * 0.08);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(headR * 0.72, headR * 0.12);
    ctx.quadraticCurveTo(headR * 1.25, headR * 0.42, headR * 1.15, headR * 0.82);
    ctx.stroke();

    // Голова (при пузе кверху видна светло-кремовая нижняя челюсть)
    ctx.fillStyle = bellyUp > 0.5 ? '#fef3c7' : '#34d399';
    ctx.strokeStyle = bellyUp > 0.5 ? '#10b981' : '#059669';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(headR * 0.08, 0, headR * 1.08, headR * 0.92, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Глаза: в прыжке — испуганные кругляши O_O, на спине — мультяшные крестики × ×
    const eyeX = headR * 0.24;
    const eyeY = headR * 0.42;
    const eyeR = headR * 0.28;
    for (const side of [-1, 1]) {
      if (bellyUp < 0.45) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(eyeX, side * eyeY, eyeR * 1.15, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(eyeX, side * eyeY, eyeR * 0.35, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = Math.max(1.8, cs * 0.075);
        ctx.lineCap = 'round';
        const d = eyeR * 0.75;
        ctx.beginPath();
        ctx.moveTo(eyeX - d, side * eyeY - d);
        ctx.lineTo(eyeX + d, side * eyeY + d);
        ctx.moveTo(eyeX + d, side * eyeY - d);
        ctx.lineTo(eyeX - d, side * eyeY + d);
        ctx.stroke();
      }
    }
    ctx.restore();

    // 4. Улетающая душа (0.42..1.00) с крылышками и золотым нимбом
    if (progress > 0.42) {
      const sp = (progress - 0.42) / 0.58; // 0..1
      const soulAlpha =
        sp < 0.18 ? (sp / 0.18) * 0.88 : (1 - (sp - 0.18) / 0.82) * 0.88;
      const swayX = Math.sin(sp * Math.PI * 3.5) * cs * 0.65;
      const riseY = Math.pow(sp, 1.15) * cs * 4.8;

      const soulX = hx + swayX;
      const soulY = by + (head.y + 0.5) * cs - riseY;

      this.soulSparkCooldown -= dtSec;
      if (this.soulSparkCooldown <= 0 && sp < 0.85) {
        this.particles.spawnSoulSpark(
          (soulX - bx) / cs,
          (soulY - by) / cs
        );
        this.soulSparkCooldown = 0.065;
      }

      ctx.save();
      ctx.globalAlpha = Math.max(0, soulAlpha);
      ctx.translate(soulX, soulY);

      // Прозрачное эфирное свечение души
      const aura = ctx.createRadialGradient(0, 0, cs * 0.1, 0, 0, cs * 1.4);
      aura.addColorStop(0, 'rgba(224, 242, 254, 0.85)');
      aura.addColorStop(0.5, 'rgba(56, 189, 248, 0.32)');
      aura.addColorStop(1, 'rgba(56, 189, 248, 0)');
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(0, 0, cs * 1.4, 0, Math.PI * 2);
      ctx.fill();

      // Маленькие хлопающие крылышки по бокам
      const flap = Math.sin(nowSec * 18) * 0.32;
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.scale(side, 1);
        ctx.rotate(-0.35 + flap);
        ctx.fillStyle = 'rgba(240, 249, 255, 0.82)';
        ctx.beginPath();
        ctx.ellipse(cs * 0.52, -cs * 0.05, cs * 0.42, cs * 0.2, -0.25, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Призрачный волнистый хвостик души
      ctx.fillStyle = 'rgba(224, 242, 254, 0.86)';
      ctx.beginPath();
      ctx.arc(0, 0, cs * 0.38, Math.PI, 0);
      ctx.quadraticCurveTo(
        cs * 0.36,
        cs * 0.42,
        Math.sin(nowSec * 10) * cs * 0.18,
        cs * 0.88
      );
      ctx.quadraticCurveTo(-cs * 0.36, cs * 0.42, -cs * 0.38, 0);
      ctx.closePath();
      ctx.fill();

      // Спокойные закрытые глазки-дуги у души
      ctx.strokeStyle = '#0369a1';
      ctx.lineWidth = Math.max(1.5, cs * 0.06);
      ctx.lineCap = 'round';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(side * cs * 0.14, -cs * 0.04, cs * 0.08, 0.15 * Math.PI, 0.85 * Math.PI);
        ctx.stroke();
      }

      // Золотой светящийся нимб над головой души
      ctx.strokeStyle = '#fde047';
      ctx.shadowColor = '#fde047';
      ctx.shadowBlur = 10;
      ctx.lineWidth = Math.max(2, cs * 0.085);
      ctx.beginPath();
      ctx.ellipse(0, -cs * 0.58, cs * 0.32, cs * 0.11, 0, 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();
    }

    return head;
  }

  private drawResumeCountdown(
    ctx: CanvasRenderingContext2D,
    bx: number,
    by: number,
    bw: number,
    bh: number,
    remainingSec: number
  ): void {
    const cx = bx + bw * 0.5;
    const cy = by + bh * 0.5;
    const stepDuration = ROUND_COUNTDOWN_SEC / 3;
    const step = Math.max(1, Math.min(3, Math.ceil(remainingSec / stepDuration)));
    const beatRemaining = remainingSec - (step - 1) * stepDuration;
    const beatProgress = Math.max(0, Math.min(1, beatRemaining / stepDuration));
    const popScale = 1 + Math.pow(beatProgress, 2) * 0.16;

    const r = Math.max(42, this.cellSize * 1.6);
    const t = I18N_PROFILES[this.language];

    ctx.save();
    ctx.translate(cx, cy);

    // Подложка кольца
    ctx.fillStyle = 'rgba(7, 14, 22, 0.78)';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    // Фоновая окружность
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();

    // Убывающая дуга прогресса для текущего такта
    ctx.strokeStyle = step === 1 ? '#fde047' : '#34d399';
    ctx.shadowColor = step === 1 ? 'rgba(253, 224, 71, 0.7)' : 'rgba(52, 211, 153, 0.7)';
    ctx.shadowBlur = 18;
    ctx.lineWidth = 4.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(
      0,
      0,
      r,
      -Math.PI / 2,
      -Math.PI / 2 + Math.PI * 2 * beatProgress
    );
    ctx.stroke();

    // Пульсирующая цифра 3 / 2 / 1
    ctx.save();
    ctx.scale(popScale, popScale);
    ctx.shadowBlur = 12;
    ctx.fillStyle = step === 1 ? '#fef08a' : '#ecfdf5';
    ctx.font = `900 ${Math.round(r * 0.92)}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(step), 0, 2);
    ctx.restore();

    // Подпись «Приготовься» / «Get Ready» под кольцом
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(226, 232, 240, 0.92)';
    ctx.font = `800 ${Math.max(12, Math.round(this.cellSize * 0.45))}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(t.countdownReady, 0, r + 10);

    ctx.restore();
  }

  private drawGoBanner(
    ctx: CanvasRenderingContext2D,
    bx: number,
    by: number,
    bw: number,
    bh: number,
    remainingSec: number
  ): void {
    const t = I18N_PROFILES[this.language];
    const progress = 1 - Math.max(0, Math.min(1, remainingSec / 0.65));
    const alpha = progress < 0.2 ? progress / 0.2 : Math.max(0, 1 - (progress - 0.2) / 0.8);
    const scale = 0.78 + Math.sin(Math.min(1, progress * 1.4) * (Math.PI / 2)) * 0.34;

    const cx = bx + bw * 0.5;
    const cy = by + bh * 0.5;
    const fontSize = Math.max(30, Math.round(this.cellSize * 1.45));

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.font = `900 ${fontSize}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(16, 185, 129, 0.85)';
    ctx.shadowBlur = 24;
    ctx.fillStyle = 'rgba(5, 10, 15, 0.8)';
    ctx.fillText(t.countdownGo, 2, 3);
    ctx.fillStyle = '#34d399';
    ctx.fillText(t.countdownGo, 0, 0);
    ctx.restore();
  }

  private drawBoard(
    ctx: CanvasRenderingContext2D,
    bx: number,
    by: number,
    bw: number,
    bh: number,
    frenzyLevel: number,
    nowSec: number
  ): void {
    const cs = this.cellSize;
    const radius = Math.max(10, cs * 0.45);

    ctx.save();
    const borderGlowColor =
      frenzyLevel > 0.05
        ? lerpColor([16, 185, 129], [244, 63, 94], frenzyLevel)
        : 'rgba(16, 185, 129, 0.45)';
    ctx.shadowColor = borderGlowColor;
    ctx.shadowBlur = 18 + frenzyLevel * 22;
    ctx.fillStyle = '#081119';
    this.roundRect(ctx, bx, by, bw, bh, radius);
    ctx.fill();
    ctx.restore();

    ctx.save();
    this.roundRect(ctx, bx, by, bw, bh, radius);
    ctx.clip();

    if (
      this.boardCacheCanvas &&
      this.boardCacheW === bw &&
      this.boardCacheH === bh
    ) {
      ctx.drawImage(this.boardCacheCanvas, bx, by);
    } else {
      ctx.fillStyle = '#0b1620';
      ctx.fillRect(bx, by, bw, bh);
    }

    const grad = ctx.createRadialGradient(
      bx + bw * 0.5,
      by + bh * 0.5,
      cs * 1.5,
      bx + bw * 0.5,
      by + bh * 0.5,
      Math.max(bw, bh) * 0.65
    );
    if (frenzyLevel > 0.1) {
      grad.addColorStop(0, `rgba(244, 63, 94, ${0.06 + frenzyLevel * 0.08})`);
      grad.addColorStop(1, 'rgba(4, 8, 13, 0.36)');
    } else {
      grad.addColorStop(0, 'rgba(16, 185, 129, 0.055)');
      grad.addColorStop(1, 'rgba(4, 8, 13, 0.34)');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(bx, by, bw, bh);

    const shimmer = 0.25 + 0.15 * Math.sin(nowSec * 2.2);
    ctx.strokeStyle =
      frenzyLevel > 0.1
        ? `rgba(244, 63, 94, ${shimmer + frenzyLevel * 0.35})`
        : `rgba(56, 189, 248, ${shimmer})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);
    ctx.lineDashOffset = -nowSec * (16 + frenzyLevel * 38);
    this.roundRect(ctx, bx + 1, by + 1, bw - 2, bh - 2, radius - 1);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.restore();
  }

  private drawMenuShowcase(
    ctx: CanvasRenderingContext2D,
    bx: number,
    by: number,
    bw: number,
    bh: number,
    nowSec: number
  ): void {
    const cs = this.cellSize;
    const count = 14;
    ctx.save();
    for (let i = count - 1; i >= 0; i -= 1) {
      const phase = nowSec * 1.35 - i * 0.16;
      const nx = 0.5 + 0.34 * Math.sin(phase * 0.9);
      const ny = 0.5 + 0.3 * Math.sin(phase * 1.8);
      const px = bx + nx * bw;
      const py = by + ny * bh;
      const ratio = 1 - i / count;
      const r = cs * (0.22 + ratio * 0.22);

      ctx.fillStyle = lerpColor(COLOR_CALM_TAIL, COLOR_CALM_HEAD, ratio);
      ctx.globalAlpha = 0.16 + ratio * 0.28;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawGoodApples(
    ctx: CanvasRenderingContext2D,
    bx: number,
    by: number,
    snapshot: GameSnapshot,
    nowSec: number
  ): void {
    const cs = this.cellSize;
    for (const apple of snapshot.goodApples) {
      const bob = Math.sin(nowSec * 3.8 + apple.id * 1.3) * cs * 0.05;
      const pulse = 1 + Math.sin(nowSec * 4.2 + apple.id) * 0.055;
      const cx = bx + (apple.pos.x + 0.5) * cs;
      const cy = by + (apple.pos.y + 0.5) * cs + bob;
      const r = cs * 0.36 * pulse;

      ctx.save();
      const glow = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 1.85);
      glow.addColorStop(0, 'rgba(251, 113, 133, 0.38)');
      glow.addColorStop(1, 'rgba(251, 113, 133, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.85, 0, Math.PI * 2);
      ctx.fill();

      const bodyGrad = ctx.createRadialGradient(
        cx - r * 0.32,
        cy - r * 0.32,
        r * 0.12,
        cx,
        cy,
        r
      );
      bodyGrad.addColorStop(0, '#fda4af');
      bodyGrad.addColorStop(0.35, '#f43f5e');
      bodyGrad.addColorStop(1, '#9f1239');
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
      ctx.beginPath();
      ctx.ellipse(
        cx - r * 0.32,
        cy - r * 0.3,
        r * 0.24,
        r * 0.14,
        -0.55,
        0,
        Math.PI * 2
      );
      ctx.fill();

      ctx.strokeStyle = '#92400e';
      ctx.lineWidth = Math.max(1.5, cs * 0.07);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx, cy - r * 0.78);
      ctx.quadraticCurveTo(cx + r * 0.12, cy - r * 1.25, cx + r * 0.28, cy - r * 1.22);
      ctx.stroke();

      ctx.fillStyle = '#34d399';
      ctx.beginPath();
      ctx.ellipse(
        cx + r * 0.34,
        cy - r * 0.96,
        r * 0.3,
        r * 0.15,
        -0.45,
        0,
        Math.PI * 2
      );
      ctx.fill();
      ctx.restore();
    }
  }

  private drawBadApples(
    ctx: CanvasRenderingContext2D,
    bx: number,
    by: number,
    snapshot: GameSnapshot,
    nowSec: number
  ): void {
    const cs = this.cellSize;
    for (const bad of snapshot.badApples) {
      const wobble = Math.sin(nowSec * 5.2 + bad.id * 2.1) * cs * 0.035;
      const cx = bx + (bad.pos.x + 0.5) * cs + wobble;
      const cy = by + (bad.pos.y + 0.5) * cs;
      const r = cs * 0.34;

      ctx.save();
      const aura = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 1.7);
      aura.addColorStop(0, 'rgba(168, 85, 247, 0.36)');
      aura.addColorStop(1, 'rgba(168, 85, 247, 0)');
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.7, 0, Math.PI * 2);
      ctx.fill();

      const grad = ctx.createRadialGradient(
        cx - r * 0.25,
        cy - r * 0.25,
        r * 0.1,
        cx,
        cy,
        r
      );
      grad.addColorStop(0, '#e879f9');
      grad.addColorStop(0.45, '#9333ea');
      grad.addColorStop(1, '#3b0764');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = Math.max(1.6, cs * 0.08);
      ctx.lineCap = 'round';
      const d = r * 0.42;
      ctx.beginPath();
      ctx.moveTo(cx - d, cy - d);
      ctx.lineTo(cx + d, cy + d);
      ctx.moveTo(cx + d, cy - d);
      ctx.lineTo(cx - d, cy + d);
      ctx.stroke();

      const bPhase = (nowSec * 1.1 + bad.id * 0.37) % 1;
      ctx.fillStyle = `rgba(216, 180, 254, ${1 - bPhase})`;
      ctx.beginPath();
      ctx.arc(
        cx + Math.sin(bPhase * 6) * r * 0.35,
        cy - r * (0.6 + bPhase * 0.9),
        Math.max(1.5, cs * 0.06 * (1 - bPhase * 0.5)),
        0,
        Math.PI * 2
      );
      ctx.fill();
      ctx.restore();
    }
  }

  private drawStones(
    ctx: CanvasRenderingContext2D,
    bx: number,
    by: number,
    snapshot: GameSnapshot,
    snakeLength: number,
    nowSec: number
  ): void {
    const cs = this.cellSize;
    for (const stone of snapshot.stones) {
      const canPush = snakeLength > stone.weight;
      const cx = bx + (stone.pos.x + 0.5) * cs;
      const cy = by + (stone.pos.y + 0.5) * cs;
      const r = cs * 0.42;

      ctx.save();
      ctx.beginPath();
      const verts = 7;
      for (let i = 0; i < verts; i += 1) {
        const ang = (Math.PI * 2 * i) / verts - Math.PI / 2;
        const jitter = 0.88 + 0.14 * Math.sin(stone.id * 3.1 + i * 2.4);
        const vx = cx + Math.cos(ang) * r * jitter;
        const vy = cy + Math.sin(ang) * r * jitter;
        if (i === 0) ctx.moveTo(vx, vy);
        else ctx.lineTo(vx, vy);
      }
      ctx.closePath();

      const grad = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
      grad.addColorStop(0, canPush ? '#64748b' : '#475569');
      grad.addColorStop(0.5, '#334155');
      grad.addColorStop(1, '#1e293b');
      ctx.fillStyle = grad;
      ctx.fill();

      const pulse = canPush ? 0.55 + 0.3 * Math.sin(nowSec * 3.5 + stone.id) : 0.45;
      ctx.strokeStyle = canPush
        ? `rgba(56, 189, 248, ${pulse})`
        : `rgba(148, 163, 184, ${pulse * 0.65})`;
      ctx.lineWidth = canPush ? 2 : 1.3;
      ctx.stroke();

      ctx.font = `800 ${Math.max(10, Math.round(cs * 0.4))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = canPush ? '#7dd3fc' : '#fca5a5';
      ctx.fillText(String(stone.weight), cx, cy + 0.5);
      ctx.restore();
    }
  }

  private drawSnake(
    ctx: CanvasRenderingContext2D,
    bx: number,
    by: number,
    snapshot: GameSnapshot,
    nowSec: number
  ): { readonly x: number; readonly y: number } | undefined {
    const cs = this.cellSize;
    const segments = snapshot.snake.segments;
    if (segments.length === 0) return undefined;

    const isGliding =
      snapshot.phase === 'playing' && snapshot.resumeCountdownSec <= 0;
    const t = isGliding ? snapshot.moveProgress : 0;
    const frenzy = snapshot.frenzy.level;
    const sickT = Math.min(1, this.sickFlashSec / 0.85);

    // Синхронное скольжение вперёд (cur -> next):
    // голова визуально касается яблока/камня ровно в момент логического события (t -> 1),
    // без отставания на 1 клетку!
    const head = segments[0]!;
    const dirVec = DIRECTION_VECTORS[snapshot.snake.direction];
    const nextHead: GridPoint = {
      x: (head.x + dirVec.x + GRID_PROFILE.width) % GRID_PROFILE.width,
      y: (head.y + dirVec.y + GRID_PROFILE.height) % GRID_PROFILE.height,
    };
    const willGrow =
      isGliding &&
      snapshot.goodApples.some((a) => a.pos.x === nextHead.x && a.pos.y === nextHead.y);

    const pts: Array<{ x: number; y: number }> = [];
    // Голова скользит от segments[0] к nextHead
    pts.push({
      x: interpolateWrapped(head.x, nextHead.x, GRID_PROFILE.width, t),
      y: interpolateWrapped(head.y, nextHead.y, GRID_PROFILE.height, t),
    });

    if (willGrow && t > 0.01) {
      // При росте на хорошем яблоке тело остаётся на месте, а голова плавно вытягивается из segments[0]
      for (let i = 0; i < segments.length; i += 1) {
        const seg = segments[i]!;
        pts.push({ x: seg.x, y: seg.y });
      }
    } else {
      for (let i = 1; i < segments.length; i += 1) {
        const curSeg = segments[i]!;
        const targetSeg = segments[i - 1]!;
        pts.push({
          x: interpolateWrapped(curSeg.x, targetSeg.x, GRID_PROFILE.width, t),
          y: interpolateWrapped(curSeg.y, targetSeg.y, GRID_PROFILE.height, t),
        });
      }
    }

    const baseHeadRgb: readonly [number, number, number] =
      frenzy <= 0.5
        ? [
            Math.round(lerp(COLOR_CALM_HEAD[0], COLOR_WARN_HEAD[0], frenzy * 2)),
            Math.round(lerp(COLOR_CALM_HEAD[1], COLOR_WARN_HEAD[1], frenzy * 2)),
            Math.round(lerp(COLOR_CALM_HEAD[2], COLOR_WARN_HEAD[2], frenzy * 2)),
          ]
        : [
            Math.round(lerp(COLOR_WARN_HEAD[0], COLOR_RAGE_HEAD[0], (frenzy - 0.5) * 2)),
            Math.round(lerp(COLOR_WARN_HEAD[1], COLOR_RAGE_HEAD[1], (frenzy - 0.5) * 2)),
            Math.round(lerp(COLOR_WARN_HEAD[2], COLOR_RAGE_HEAD[2], (frenzy - 0.5) * 2)),
          ];

    // При плохом яблоке голова заметно желтеет!
    const headColor =
      sickT > 0.02
        ? lerpColor(baseHeadRgb, COLOR_SICK_HEAD, Math.min(1, sickT * 1.25))
        : `rgb(${baseHeadRgb[0]}, ${baseHeadRgb[1]}, ${baseHeadRgb[2]})`;
    const headEdgeColor =
      sickT > 0.02
        ? lerpColor(COLOR_CALM_TAIL, COLOR_SICK_EDGE, sickT)
        : lerpColor(COLOR_CALM_TAIL, COLOR_RAGE_TAIL, frenzy);
    const tailColor = lerpColor(COLOR_CALM_TAIL, COLOR_RAGE_TAIL, frenzy);

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = pts.length - 1; i >= 1; i -= 1) {
      const a = pts[i]!;
      const b = pts[i - 1]!;
      if (Math.abs(a.x - b.x) > 1.5 || Math.abs(a.y - b.y) > 1.5) {
        continue;
      }
      const ratio = 1 - i / Math.max(1, pts.length);
      const thickness = cs * (0.42 + ratio * 0.34);

      ctx.strokeStyle = lerpColor(
        frenzy > 0.2 ? COLOR_RAGE_TAIL : COLOR_CALM_TAIL,
        frenzy > 0.5 ? COLOR_RAGE_HEAD : COLOR_CALM_HEAD,
        ratio
      );
      ctx.lineWidth = thickness;
      ctx.beginPath();
      ctx.moveTo(bx + (a.x + 0.5) * cs, by + (a.y + 0.5) * cs);
      ctx.lineTo(bx + (b.x + 0.5) * cs, by + (b.y + 0.5) * cs);
      ctx.stroke();
    }
    ctx.restore();

    for (let i = pts.length - 1; i >= 1; i -= 1) {
      const p = pts[i]!;
      const ratio = 1 - i / Math.max(1, pts.length);
      const r = cs * (0.21 + ratio * 0.17);
      const cx = bx + (p.x + 0.5) * cs;
      const cy = by + (p.y + 0.5) * cs;

      ctx.save();
      ctx.fillStyle =
        i === pts.length - 1
          ? tailColor
          : lerpColor(
              frenzy > 0.2 ? COLOR_RAGE_TAIL : COLOR_CALM_TAIL,
              frenzy > 0.5 ? COLOR_RAGE_HEAD : COLOR_CALM_HEAD,
              ratio
            );
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      if (i % 2 === 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${0.14 + frenzy * 0.12})`;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.42, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    const headPt = pts[0];
    if (!headPt) return undefined;

    const hx = bx + (headPt.x + 0.5) * cs;
    const hy = by + (headPt.y + 0.5) * cs;
    // Если игрок уже нажал следующий поворот (в очереди), голова чуть-чуть начинает поворачиваться
    // к будущему направлению в конце клетки — мгновенная визуальная обратная связь!
    let angle = Math.atan2(dirVec.y, dirVec.x);
    const queuedDir = snapshot.snake.directionQueue[0];
    if (queuedDir && isGliding && t > 0.35) {
      const qVec = DIRECTION_VECTORS[queuedDir];
      const qAngle = Math.atan2(qVec.y, qVec.x);
      let diff = qAngle - angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const previewWeight = ((t - 0.35) / 0.65) * 0.42;
      angle += diff * previewWeight;
    }
    const headR = cs * 0.44;

    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(angle);

    ctx.shadowColor = sickT > 0.05 ? '#facc15' : headColor;
    ctx.shadowBlur = 10 + frenzy * 18 + sickT * 14;

    // Язычок (прячется, когда змейке плохо)
    const tongueFreq = 4.5 + frenzy * 11;
    const tongueWave = Math.sin(nowSec * tongueFreq);
    if (sickT <= 0.1 && (tongueWave > 0.15 || frenzy > 0.4)) {
      const ext = headR * (0.55 + Math.max(0, tongueWave) * 0.45);
      ctx.strokeStyle = '#fb7185';
      ctx.lineWidth = Math.max(1.5, cs * 0.065);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(headR * 0.75, 0);
      ctx.lineTo(headR * 0.75 + ext, 0);
      ctx.lineTo(headR * 0.75 + ext + headR * 0.28, -headR * 0.22);
      ctx.moveTo(headR * 0.75 + ext, 0);
      ctx.lineTo(headR * 0.75 + ext + headR * 0.28, headR * 0.22);
      ctx.stroke();
    }

    const headGrad = ctx.createRadialGradient(-headR * 0.2, -headR * 0.2, 1, 0, 0, headR * 1.1);
    headGrad.addColorStop(0, sickT > 0.1 ? '#fef9c3' : '#ecfdf5');
    headGrad.addColorStop(0.28, headColor);
    headGrad.addColorStop(1, headEdgeColor);
    ctx.fillStyle = headGrad;
    ctx.beginPath();
    ctx.ellipse(headR * 0.08, 0, headR * 1.08, headR * 0.92, 0, 0, Math.PI * 2);
    ctx.fill();

    const lookOffset = this.computeEyeLook(headPt, snapshot.goodApples, angle);
    const eyeX = headR * 0.26;
    const eyeY = headR * 0.42;
    const eyeR = headR * 0.29;

    for (const side of [-1, 1]) {
      ctx.shadowBlur = 0;

      if (sickT > 0.12) {
        // Жмурящиеся «тошнит» глаза > < при плохом яблоке
        ctx.strokeStyle = '#422006';
        ctx.lineWidth = Math.max(1.8, cs * 0.075);
        ctx.lineCap = 'round';
        const d = eyeR * 0.75;
        ctx.beginPath();
        ctx.moveTo(eyeX - d, side * eyeY - side * d * 0.6);
        ctx.lineTo(eyeX + d * 0.5, side * eyeY);
        ctx.lineTo(eyeX - d, side * eyeY + side * d * 0.6);
        ctx.stroke();
        continue;
      }

      ctx.fillStyle = frenzy > 0.65 ? '#fef08a' : '#ffffff';
      ctx.beginPath();
      ctx.arc(eyeX, side * eyeY, eyeR, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = frenzy > 0.75 ? '#991b1b' : '#0f172a';
      ctx.beginPath();
      ctx.arc(
        eyeX + lookOffset.x * eyeR * 0.38,
        side * eyeY + lookOffset.y * eyeR * 0.38,
        eyeR * 0.54,
        0,
        Math.PI * 2
      );
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(eyeX + eyeR * 0.16, side * eyeY - eyeR * 0.18, eyeR * 0.2, 0, Math.PI * 2);
      ctx.fill();

      if (frenzy > 0.18) {
        ctx.strokeStyle = '#450a0a';
        ctx.lineWidth = Math.max(1.5, cs * 0.075);
        ctx.lineCap = 'round';
        const tilt = frenzy * eyeR * 0.75;
        ctx.beginPath();
        ctx.moveTo(eyeX - eyeR * 0.85, side * (eyeY + eyeR * 0.45));
        ctx.lineTo(eyeX + eyeR * 0.75, side * (eyeY - eyeR * 0.35 - tilt * 0.3));
        ctx.stroke();
      }
    }

    ctx.restore();
    return headPt;
  }

  private computeEyeLook(
    head: { readonly x: number; readonly y: number },
    apples: readonly { readonly pos: GridPoint }[],
    headAngle: number
  ): { readonly x: number; readonly y: number } {
    if (apples.length === 0) return { x: 0.4, y: 0 };
    let bestDist = Infinity;
    let dx = 1;
    let dy = 0;

    for (const a of apples) {
      const rx = a.pos.x - head.x;
      const ry = a.pos.y - head.y;
      const d = rx * rx + ry * ry;
      if (d < bestDist) {
        bestDist = d;
        dx = rx;
        dy = ry;
      }
    }

    const worldAngle = Math.atan2(dy, dx);
    const localAngle = worldAngle - headAngle;
    return {
      x: Math.cos(localAngle),
      y: Math.sin(localAngle),
    };
  }

  private drawFrenzyVignette(
    ctx: CanvasRenderingContext2D,
    bx: number,
    by: number,
    bw: number,
    bh: number,
    frenzyLevel: number,
    nowSec: number
  ): void {
    const pulse = 0.72 + 0.28 * Math.sin(nowSec * (6 + frenzyLevel * 10));
    const alpha = frenzyLevel * 0.38 * pulse;
    const grad = ctx.createRadialGradient(
      bx + bw * 0.5,
      by + bh * 0.5,
      Math.min(bw, bh) * 0.32,
      bx + bw * 0.5,
      by + bh * 0.5,
      Math.max(bw, bh) * 0.65
    );
    grad.addColorStop(0, 'rgba(244, 63, 94, 0)');
    grad.addColorStop(1, `rgba(225, 29, 72, ${alpha})`);

    ctx.save();
    const radius = Math.max(10, this.cellSize * 0.45);
    this.roundRect(ctx, bx, by, bw, bh, radius);
    ctx.clip();
    ctx.fillStyle = grad;
    ctx.fillRect(bx, by, bw, bh);
    ctx.restore();
  }

  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ): void {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  dispose(): void {
    this.particles.clear();
  }
}
