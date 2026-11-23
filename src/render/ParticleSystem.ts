/**
 * Вспомогательный модуль визуальных эффектов исполнителя рендера:
 * частицы, ударные волны, всплывающие подписи очков, комикс-облачка реплик и микро-тряска камеры.
 */

import { GRID_PROFILE } from '../core/profiles/gridProfile.ts';

export type SpeechTone = 'yum' | 'ew' | 'eat' | 'thin';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
  color: string;
  glow: boolean;
}

export interface Shockwave {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  life: number;
  maxLife: number;
  color: string;
}

export interface FloatingText {
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
  scale: number;
}

export interface SpeechBubble {
  text: string;
  tone: SpeechTone;
  life: number;
  maxLife: number;
  fallbackX: number;
  fallbackY: number;
}

const SPEECH_PALETTE: Readonly<
  Record<SpeechTone, { bg: string; border: string; fg: string; jitter: boolean }>
> = {
  yum: {
    bg: 'rgba(236, 253, 245, 0.96)',
    border: '#10b981',
    fg: '#065f46',
    jitter: false,
  },
  ew: {
    bg: 'rgba(254, 249, 195, 0.96)',
    border: '#a855f7',
    fg: '#6b21a8',
    jitter: true,
  },
  eat: {
    bg: 'rgba(255, 241, 242, 0.96)',
    border: '#f43f5e',
    fg: '#be123c',
    jitter: true,
  },
  thin: {
    bg: 'rgba(255, 247, 237, 0.96)',
    border: '#f97316',
    fg: '#c2410c',
    jitter: true,
  },
};

export class ParticleSystem {
  private readonly particles: Particle[] = [];
  private readonly shockwaves: Shockwave[] = [];
  private readonly texts: FloatingText[] = [];
  private speech: SpeechBubble | null = null;
  private shakeIntensity = 0;

  spawnBurst(
    gridX: number,
    gridY: number,
    color: string,
    count: number,
    speed = 4.5,
    glow = true
  ): void {
    for (let i = 0; i < count; i += 1) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const mag = speed * (0.45 + Math.random() * 0.85);
      const maxLife = 0.35 + Math.random() * 0.35;
      this.particles.push({
        x: gridX + 0.5,
        y: gridY + 0.5,
        vx: Math.cos(angle) * mag,
        vy: Math.sin(angle) * mag,
        size: 0.1 + Math.random() * 0.14,
        life: maxLife,
        maxLife,
        color,
        glow,
      });
    }
    if (this.particles.length > 260) {
      this.particles.splice(0, this.particles.length - 260);
    }
  }

  spawnEmber(gridX: number, gridY: number, intensity: number): void {
    const maxLife = 0.25 + Math.random() * 0.25;
    this.particles.push({
      x: gridX + 0.5 + (Math.random() - 0.5) * 0.5,
      y: gridY + 0.5 + (Math.random() - 0.5) * 0.5,
      vx: (Math.random() - 0.5) * 1.8,
      vy: -0.8 - Math.random() * 1.8,
      size: 0.08 + intensity * 0.1,
      life: maxLife,
      maxLife,
      color: Math.random() > 0.4 ? '#fb923c' : '#f43f5e',
      glow: true,
    });
  }

  spawnSoulSpark(gridX: number, gridY: number): void {
    const maxLife = 0.4 + Math.random() * 0.35;
    this.particles.push({
      x: gridX + (Math.random() - 0.5) * 0.5,
      y: gridY + (Math.random() - 0.5) * 0.4,
      vx: (Math.random() - 0.5) * 0.8,
      vy: -0.5 - Math.random() * 0.9,
      size: 0.08 + Math.random() * 0.09,
      life: maxLife,
      maxLife,
      color: Math.random() > 0.35 ? '#bae6fd' : '#fef08a',
      glow: true,
    });
  }

  spawnShockwave(gridX: number, gridY: number, color: string, maxRadius = 2.4): void {
    this.shockwaves.push({
      x: gridX + 0.5,
      y: gridY + 0.5,
      radius: 0.2,
      maxRadius,
      life: 0.42,
      maxLife: 0.42,
      color,
    });
  }

  spawnText(
    gridX: number,
    gridY: number,
    text: string,
    color: string,
    scale = 1
  ): void {
    this.texts.push({
      x: gridX + 0.5,
      y: gridY + 0.25,
      vy: -1.45,
      text,
      color,
      life: 0.95,
      maxLife: 0.95,
      scale,
    });
  }

  showSpeech(
    text: string,
    tone: SpeechTone,
    durationSec: number,
    fallbackX = GRID_PROFILE.width / 2,
    fallbackY = GRID_PROFILE.height / 2
  ): void {
    this.speech = {
      text,
      tone,
      life: durationSec,
      maxLife: durationSec,
      fallbackX,
      fallbackY,
    };
  }

  hasActiveSpeech(): boolean {
    return this.speech !== null && this.speech.life > 0.12;
  }

  addShake(amount: number): void {
    this.shakeIntensity = Math.min(1, Math.max(this.shakeIntensity, amount));
  }

  clear(): void {
    this.particles.length = 0;
    this.shockwaves.length = 0;
    this.texts.length = 0;
    this.speech = null;
    this.shakeIntensity = 0;
  }

  update(dtSec: number): void {
    const dt = Math.min(0.05, Math.max(0, dtSec));

    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const p = this.particles[i]!;
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy *= 0.94;
    }

    for (let i = this.shockwaves.length - 1; i >= 0; i -= 1) {
      const s = this.shockwaves[i]!;
      s.life -= dt;
      if (s.life <= 0) {
        this.shockwaves.splice(i, 1);
        continue;
      }
      const progress = 1 - s.life / s.maxLife;
      const eased = 1 - Math.pow(1 - progress, 3);
      s.radius = 0.2 + (s.maxRadius - 0.2) * eased;
    }

    for (let i = this.texts.length - 1; i >= 0; i -= 1) {
      const t = this.texts[i]!;
      t.life -= dt;
      if (t.life <= 0) {
        this.texts.splice(i, 1);
        continue;
      }
      t.y += t.vy * dt;
      t.vy *= 0.95;
    }

    if (this.speech) {
      this.speech.life -= dt;
      if (this.speech.life <= 0) {
        this.speech = null;
      }
    }

    this.shakeIntensity = Math.max(0, this.shakeIntensity - dt * 2.8);
  }

  getShakeOffset(cellSize: number): { readonly dx: number; readonly dy: number } {
    if (this.shakeIntensity <= 0.005) {
      return { dx: 0, dy: 0 };
    }
    const amp = this.shakeIntensity * cellSize * 0.28;
    return {
      dx: (Math.random() - 0.5) * 2 * amp,
      dy: (Math.random() - 0.5) * 2 * amp,
    };
  }

  draw(
    ctx: CanvasRenderingContext2D,
    boardX: number,
    boardY: number,
    cellSize: number,
    headGridPos?: { readonly x: number; readonly y: number }
  ): void {
    // Ударные волны
    for (const s of this.shockwaves) {
      const alpha = Math.max(0, s.life / s.maxLife) * 0.75;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = Math.max(1.5, cellSize * 0.09 * (s.life / s.maxLife));
      ctx.beginPath();
      ctx.arc(
        boardX + s.x * cellSize,
        boardY + s.y * cellSize,
        s.radius * cellSize,
        0,
        Math.PI * 2
      );
      ctx.stroke();
      ctx.restore();
    }

    // Частицы
    for (const p of this.particles) {
      const alpha = Math.max(0, p.life / p.maxLife);
      const px = boardX + p.x * cellSize;
      const py = boardY + p.y * cellSize;
      const r = Math.max(1.5, p.size * cellSize * alpha);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      if (p.glow) {
        ctx.shadowColor = p.color;
        ctx.shadowBlur = cellSize * 0.35;
      }
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Всплывающие тексты очков
    for (const t of this.texts) {
      const ratio = Math.max(0, t.life / t.maxLife);
      const alpha = ratio > 0.25 ? 1 : ratio / 0.25;
      const px = boardX + t.x * cellSize;
      const py = boardY + t.y * cellSize;
      const fontSize = Math.round(cellSize * 0.52 * t.scale);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = `800 ${fontSize}px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(5, 10, 15, 0.75)';
      ctx.fillText(t.text, px + 1.5, py + 1.5);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, px, py);
      ctx.restore();
    }

    // Комикс-облачко реплики змейки («Ням!», «Фу!», «ЕСТЬ!», «Худею!»)
    if (this.speech) {
      this.drawSpeechBubble(ctx, boardX, boardY, cellSize, this.speech, headGridPos);
    }
  }

  private drawSpeechBubble(
    ctx: CanvasRenderingContext2D,
    boardX: number,
    boardY: number,
    cs: number,
    bubble: SpeechBubble,
    headPos?: { readonly x: number; readonly y: number }
  ): void {
    const palette = SPEECH_PALETTE[bubble.tone];
    const ratio = Math.max(0, bubble.life / bubble.maxLife);
    const elapsed = 1 - ratio;
    // Пружинистое появление и мягкое исчезновение
    const popScale =
      elapsed < 0.14 ? 0.65 + (elapsed / 0.14) * 0.45 : elapsed < 0.26 ? 1.1 - ((elapsed - 0.14) / 0.12) * 0.1 : 1;
    const alpha = ratio > 0.2 ? 1 : ratio / 0.2;

    const anchorX = headPos ? headPos.x : bubble.fallbackX;
    const anchorY = headPos ? headPos.y : bubble.fallbackY;

    const fontSize = Math.max(12, Math.round(cs * 0.48));
    ctx.save();
    ctx.font = `900 ${fontSize}px system-ui, -apple-system, sans-serif`;
    const textW = ctx.measureText(bubble.text).width;
    const padX = Math.max(10, cs * 0.34);
    const pillW = textW + padX * 2;
    const pillH = Math.max(24, cs * 0.84);

    const boardW = cs * GRID_PROFILE.width;
    const rawCx = boardX + (anchorX + 0.5) * cs;
    const placeBelow = anchorY < 1.8;
    const rawCy = placeBelow
      ? boardY + (anchorY + 1.45) * cs
      : boardY + (anchorY - 0.72) * cs;

    const cx = Math.max(
      boardX + pillW / 2 + 6,
      Math.min(boardX + boardW - pillW / 2 - 6, rawCx)
    );
    const cy = rawCy;

    const jx = palette.jitter ? (Math.random() - 0.5) * 3 : 0;
    const jy = palette.jitter ? (Math.random() - 0.5) * 2.5 : 0;

    ctx.globalAlpha = alpha;
    ctx.translate(cx + jx, cy + jy);
    ctx.scale(popScale, popScale);

    // Тень облачка
    ctx.shadowColor = 'rgba(0, 0, 0, 0.42)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;

    const r = pillH / 2;
    const x0 = -pillW / 2;
    const y0 = -pillH / 2;

    ctx.fillStyle = palette.bg;
    ctx.strokeStyle = palette.border;
    ctx.lineWidth = 2.2;

    // Скруглённая капсула
    ctx.beginPath();
    ctx.moveTo(x0 + r, y0);
    ctx.arcTo(x0 + pillW, y0, x0 + pillW, y0 + pillH, r);
    ctx.arcTo(x0 + pillW, y0 + pillH, x0, y0 + pillH, r);
    ctx.arcTo(x0, y0 + pillH, x0, y0, r);
    ctx.arcTo(x0, y0, x0 + pillW, y0, r);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Хвостик облачка к голове змейки
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    const tailTipX = Math.max(-pillW * 0.32, Math.min(pillW * 0.32, rawCx - cx));
    const tailBaseY = placeBelow ? y0 + 1 : y0 + pillH - 1;
    const tailTipY = placeBelow ? y0 - 7 : y0 + pillH + 7;
    ctx.beginPath();
    ctx.moveTo(tailTipX - 5, tailBaseY);
    ctx.lineTo(tailTipX, tailTipY);
    ctx.lineTo(tailTipX + 5, tailBaseY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Перекрываем шов хвостика
    ctx.fillStyle = palette.bg;
    ctx.fillRect(tailTipX - 4.5, tailBaseY - 2, 9, 4);

    // Текст реплики
    ctx.fillStyle = palette.fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(bubble.text, 0, 1);

    ctx.restore();
  }
}
