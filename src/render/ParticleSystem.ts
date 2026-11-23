/**
 * Вспомогательный модуль визуальных эффектов исполнителя рендера:
 * частицы, ударные волны, всплывающие подписи очков и микро-тряска камеры.
 */

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

export class ParticleSystem {
  private readonly particles: Particle[] = [];
  private readonly shockwaves: Shockwave[] = [];
  private readonly texts: FloatingText[] = [];
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

  addShake(amount: number): void {
    this.shakeIntensity = Math.min(1, Math.max(this.shakeIntensity, amount));
  }

  clear(): void {
    this.particles.length = 0;
    this.shockwaves.length = 0;
    this.texts.length = 0;
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
    cellSize: number
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

    // Всплывающие тексты
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
  }
}
