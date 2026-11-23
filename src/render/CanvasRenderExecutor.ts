/**
 * Роль: Исполнитель (Executor).
 * 100% процедурный Canvas 2D рендер The Snake 2:
 * - High-DPI адаптивное поле 24×18
 * - Плавная интерполяция змейки 60/120 FPS с корректной отрисовкой телепорта через стены
 * - Живая голова змейки (следящие глаза, язычок, аура и брови при бешенстве)
 * - Процедурные хорошие/плохие яблоки, гранёные камни с индикатором веса и готовности к толчку
 * - Система частиц, ударных волн и всплывающих очков
 * Авторитетного состояния не хранит, игровых решений не принимает.
 */

import type { IRenderExecutor } from '../core/contracts/actions.ts';
import type {
  GameEvent,
  GameSnapshot,
  GridPoint,
} from '../core/contracts/messages.ts';
import { DIRECTION_VECTORS, GRID_PROFILE } from '../core/profiles/gridProfile.ts';
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

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Не удалось инициализировать 2D-контекст Canvas');
    }
    this.ctx = context;
    this.resize();
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
  }

  handleEvent(event: GameEvent): void {
    switch (event.type) {
      case 'LEVEL_STARTED':
        this.particles.clear();
        break;
      case 'GOOD_APPLE_EATEN':
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
        if (event.calmedFrenzy) {
          this.particles.spawnShockwave(event.pos.x, event.pos.y, '#38bdf8', 3.4);
          this.particles.spawnText(
            event.pos.x,
            Math.max(0.6, event.pos.y - 0.8),
            'УСПОКОИЛАСЬ!',
            '#38bdf8',
            0.9
          );
        }
        break;
      case 'BAD_APPLE_EATEN':
        this.particles.spawnBurst(event.pos.x, event.pos.y, '#a855f7', 16, 4.8, true);
        this.particles.spawnBurst(event.pos.x, event.pos.y, '#fb923c', 10, 3.5, true);
        this.particles.spawnShockwave(event.pos.x, event.pos.y, '#a855f7', 2.1);
        this.particles.spawnText(
          event.pos.x,
          event.pos.y,
          event.penalty > 0 ? `-${event.penalty}` : '-1 ДЛИНА',
          '#f472b6',
          1.05
        );
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
        this.particles.addShake(0.25);
        break;
      case 'FRENZY_PEAK':
        this.particles.addShake(0.6);
        break;
      case 'LIFE_GAINED':
        this.particles.spawnBurst(event.pos.x, event.pos.y, '#fde047', 22, 6.5, true);
        this.particles.spawnShockwave(event.pos.x, event.pos.y, '#fde047', 3.6);
        this.particles.spawnText(event.pos.x, event.pos.y, '+1 ЖИЗНЬ!', '#fde047', 1.3);
        break;
      case 'LIFE_LOST':
        this.particles.spawnBurst(event.pos.x, event.pos.y, '#f43f5e', 28, 6.8, true);
        this.particles.spawnShockwave(event.pos.x, event.pos.y, '#f43f5e', 3.5);
        this.particles.addShake(0.95);
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
    this.particles.update(dtSec);

    // Искры бешенства из головы змейки во время игры
    if (snapshot.phase === 'playing' && snapshot.frenzy.level > 0.12) {
      this.emberCooldown -= dtSec;
      if (this.emberCooldown <= 0) {
        const head = snapshot.snake.segments[0];
        if (head) {
          this.particles.spawnEmber(head.x, head.y, snapshot.frenzy.level);
        }
        this.emberCooldown = lerp(0.14, 0.03, snapshot.frenzy.level);
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
    this.drawSnake(ctx, bx, by, snapshot, nowSec);

    this.particles.draw(ctx, bx, by, this.cellSize);

    if (snapshot.frenzy.level > 0.05) {
      this.drawFrenzyVignette(ctx, bx, by, boardW, boardH, snapshot.frenzy.level, nowSec);
    }

    if (snapshot.phase === 'playing' && snapshot.resumeCountdownSec > 0) {
      this.drawResumeCountdown(ctx, bx, by, boardW, boardH, snapshot.resumeCountdownSec);
    }
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
    const step = Math.max(1, Math.min(3, Math.ceil((remainingSec / 1.2) * 3)));
    const r = Math.max(36, this.cellSize * 1.45);

    ctx.save();
    ctx.fillStyle = 'rgba(7, 14, 22, 0.72)';
    ctx.strokeStyle = 'rgba(52, 211, 153, 0.85)';
    ctx.lineWidth = 3;
    ctx.shadowColor = 'rgba(16, 185, 129, 0.55)';
    ctx.shadowBlur = 22;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ecfdf5';
    ctx.font = `900 ${Math.round(r * 0.95)}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(step), cx, cy + 2);
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

    // Внешнее мягкое свечение арены
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

    // Клип по границам поля
    ctx.save();
    this.roundRect(ctx, bx, by, bw, bh, radius);
    ctx.clip();

    // Шахматная мягкая сетка
    const tileA = '#0a141d';
    const tileB = '#0d1924';
    for (let y = 0; y < GRID_PROFILE.height; y += 1) {
      for (let x = 0; x < GRID_PROFILE.width; x += 1) {
        ctx.fillStyle = (x + y) % 2 === 0 ? tileA : tileB;
        ctx.fillRect(bx + x * cs, by + y * cs, cs, cs);
      }
    }

    // Лёгкий радиальный свет в центре поля
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

    // Тонкая пунктирная портальная кайма (напоминает, что стены телепортируют)
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
    // Живой декоративный «призрак» змейки, плавно скользящий по фону меню
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

      // Тёплое свечение
      ctx.save();
      const glow = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 1.85);
      glow.addColorStop(0, 'rgba(251, 113, 133, 0.38)');
      glow.addColorStop(1, 'rgba(251, 113, 133, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.85, 0, Math.PI * 2);
      ctx.fill();

      // Объёмное яблоко
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

      // Блик
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

      // Черенок
      ctx.strokeStyle = '#92400e';
      ctx.lineWidth = Math.max(1.5, cs * 0.07);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx, cy - r * 0.78);
      ctx.quadraticCurveTo(cx + r * 0.12, cy - r * 1.25, cx + r * 0.28, cy - r * 1.22);
      ctx.stroke();

      // Листик
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
      // Токсичный ореол
      const aura = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 1.7);
      aura.addColorStop(0, 'rgba(168, 85, 247, 0.36)');
      aura.addColorStop(1, 'rgba(168, 85, 247, 0)');
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.7, 0, Math.PI * 2);
      ctx.fill();

      // Ядовитое яблоко
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

      // Предупреждающий крест
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

      // Всплывающий мини-пузырёк
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
      // Полигональная форма камня
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

      // Подсветка кромки: бирюзовая если змейка может толкнуть камень, красная иначе
      const pulse = canPush ? 0.55 + 0.3 * Math.sin(nowSec * 3.5 + stone.id) : 0.45;
      ctx.strokeStyle = canPush
        ? `rgba(56, 189, 248, ${pulse})`
        : `rgba(148, 163, 184, ${pulse * 0.65})`;
      ctx.lineWidth = canPush ? 2 : 1.3;
      ctx.stroke();

      // Цифра веса камня
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
  ): void {
    const cs = this.cellSize;
    const segments = snapshot.snake.segments;
    const prev = snapshot.snake.previousSegments;
    const t = snapshot.phase === 'playing' ? snapshot.moveProgress : 1;
    const frenzy = snapshot.frenzy.level;

    // Вычисляем плавные интерполированные координаты всех сегментов
    const pts: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < segments.length; i += 1) {
      const curSeg = segments[i]!;
      const prevSeg = prev[Math.min(i, prev.length - 1)] ?? curSeg;
      const ix = interpolateWrapped(prevSeg.x, curSeg.x, GRID_PROFILE.width, t);
      const iy = interpolateWrapped(prevSeg.y, curSeg.y, GRID_PROFILE.height, t);
      pts.push({ x: ix, y: iy });
    }

    const headColor =
      frenzy <= 0.5
        ? lerpColor(COLOR_CALM_HEAD, COLOR_WARN_HEAD, frenzy * 2)
        : lerpColor(COLOR_WARN_HEAD, COLOR_RAGE_HEAD, (frenzy - 0.5) * 2);
    const tailColor = lerpColor(COLOR_CALM_TAIL, COLOR_RAGE_TAIL, frenzy);

    // 1. Сначала соединительные гладкие сегменты тела от хвоста к голове
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = pts.length - 1; i >= 1; i -= 1) {
      const a = pts[i]!;
      const b = pts[i - 1]!;
      // Не рисуем соединительную линию через всё поле при телепорте через границу
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

    // 2. Чешуйчатые узлы и мягкий хребтовой блик
    for (let i = pts.length - 1; i >= 1; i -= 1) {
      const p = pts[i]!;
      const ratio = 1 - i / Math.max(1, pts.length);
      const r = cs * (0.21 + ratio * 0.17);
      const cx = bx + (p.x + 0.5) * cs;
      const cy = by + (p.y + 0.5) * cs;

      ctx.save();
      ctx.fillStyle = i === pts.length - 1 ? tailColor : lerpColor(
        frenzy > 0.2 ? COLOR_RAGE_TAIL : COLOR_CALM_TAIL,
        frenzy > 0.5 ? COLOR_RAGE_HEAD : COLOR_CALM_HEAD,
        ratio
      );
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      // Деликатный светлый ромбик-чешуйка
      if (i % 2 === 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${0.14 + frenzy * 0.12})`;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.42, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 3. Выразительная голова
    const headPt = pts[0];
    if (!headPt) return;

    const hx = bx + (headPt.x + 0.5) * cs;
    const hy = by + (headPt.y + 0.5) * cs;
    const dirVec = DIRECTION_VECTORS[snapshot.snake.direction];
    const angle = Math.atan2(dirVec.y, dirVec.x);
    const headR = cs * 0.44;

    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(angle);

    // Аура головы (усиливается при бешенстве)
    ctx.shadowColor = headColor;
    ctx.shadowBlur = 10 + frenzy * 18;

    // Раздвоенный язычок
    const tongueFreq = 4.5 + frenzy * 11;
    const tongueWave = Math.sin(nowSec * tongueFreq);
    if (tongueWave > 0.15 || frenzy > 0.4) {
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

    // Скульптурная форма головы
    const headGrad = ctx.createRadialGradient(-headR * 0.2, -headR * 0.2, 1, 0, 0, headR * 1.1);
    headGrad.addColorStop(0, '#ecfdf5');
    headGrad.addColorStop(0.28, headColor);
    headGrad.addColorStop(1, tailColor);
    ctx.fillStyle = headGrad;
    ctx.beginPath();
    ctx.ellipse(headR * 0.08, 0, headR * 1.08, headR * 0.92, 0, 0, Math.PI * 2);
    ctx.fill();

    // Находим направление к ближайшему хорошему яблоку, чтобы глаза следили за ним
    const lookOffset = this.computeEyeLook(headPt, snapshot.goodApples, angle);

    const eyeX = headR * 0.26;
    const eyeY = headR * 0.42;
    const eyeR = headR * 0.29;

    for (const side of [-1, 1]) {
      ctx.shadowBlur = 0;
      ctx.fillStyle = frenzy > 0.65 ? '#fef08a' : '#ffffff';
      ctx.beginPath();
      ctx.arc(eyeX, side * eyeY, eyeR, 0, Math.PI * 2);
      ctx.fill();

      // Зрачок
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

      // Блик в глазу
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(eyeX + eyeR * 0.16, side * eyeY - eyeR * 0.18, eyeR * 0.2, 0, Math.PI * 2);
      ctx.fill();

      // Хмурые «злые» брови при бешенстве
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
