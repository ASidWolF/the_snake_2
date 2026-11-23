/**
 * Роль: Датчик (Sensor).
 * Преобразует события клавиатуры (WASD / стрелки / Space / Esc / M) и свайпы
 * по сенсорному экрану в неизменяемые команды GameCommand.
 * Не содержит игровых правил и не меняет состояние напрямую.
 */

import type { Direction, GameCommand } from '../core/contracts/messages.ts';

export interface InputSensorCallbacks {
  readonly onCommand: (cmd: GameCommand) => void;
  readonly onUserGesture: () => void;
  readonly onQuickMute: () => void;
}

const KEY_TO_DIRECTION: Readonly<Record<string, Direction>> = {
  ArrowUp: 'UP',
  KeyW: 'UP',
  ArrowDown: 'DOWN',
  KeyS: 'DOWN',
  ArrowLeft: 'LEFT',
  KeyA: 'LEFT',
  ArrowRight: 'RIGHT',
  KeyD: 'RIGHT',
};

const SWIPE_THRESHOLD_PX = 22;

export class InputSensor {
  private readonly surface: HTMLElement;
  private readonly callbacks: InputSensorCallbacks;

  private touchStartX: number | null = null;
  private touchStartY: number | null = null;

  constructor(surface: HTMLElement, callbacks: InputSensorCallbacks) {
    this.surface = surface;
    this.callbacks = callbacks;

    window.addEventListener('keydown', this.handleKeyDown, { passive: false });
    this.surface.addEventListener('touchstart', this.handleTouchStart, {
      passive: false,
    });
    this.surface.addEventListener('touchmove', this.handleTouchMove, {
      passive: false,
    });
    this.surface.addEventListener('touchend', this.handleTouchEnd, {
      passive: true,
    });
  }

  private readonly handleKeyDown = (e: KeyboardEvent): void => {
    // Не перехватываем ввод в текстовых полях (например, имя игрока для рекорда)
    const target = e.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable)
    ) {
      return;
    }

    this.callbacks.onUserGesture();

    const dir = KEY_TO_DIRECTION[e.code];
    if (dir) {
      e.preventDefault();
      this.callbacks.onCommand({ type: 'CHANGE_DIRECTION', direction: dir });
      return;
    }

    if (e.code === 'Space' || e.code === 'KeyP' || e.code === 'Escape') {
      e.preventDefault();
      this.callbacks.onCommand({ type: 'TOGGLE_PAUSE' });
      return;
    }

    if (e.code === 'KeyM') {
      e.preventDefault();
      this.callbacks.onQuickMute();
    }
  };

  private readonly handleTouchStart = (e: TouchEvent): void => {
    this.callbacks.onUserGesture();
    const touch = e.touches[0];
    if (!touch) return;
    this.touchStartX = touch.clientX;
    this.touchStartY = touch.clientY;
  };

  private readonly handleTouchMove = (e: TouchEvent): void => {
    if (this.touchStartX === null || this.touchStartY === null) return;
    const touch = e.touches[0];
    if (!touch) return;

    const dx = touch.clientX - this.touchStartX;
    const dy = touch.clientY - this.touchStartY;
    if (Math.hypot(dx, dy) < SWIPE_THRESHOLD_PX) {
      return;
    }

    e.preventDefault();
    const direction: Direction =
      Math.abs(dx) > Math.abs(dy)
        ? dx > 0
          ? 'RIGHT'
          : 'LEFT'
        : dy > 0
          ? 'DOWN'
          : 'UP';

    this.callbacks.onCommand({ type: 'CHANGE_DIRECTION', direction });
    // Сбрасываем якорь в текущую точку, чтобы непрерывные свайпы работали без отрыва пальца
    this.touchStartX = touch.clientX;
    this.touchStartY = touch.clientY;
  };

  private readonly handleTouchEnd = (): void => {
    this.touchStartX = null;
    this.touchStartY = null;
  };

  dispose(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    this.surface.removeEventListener('touchstart', this.handleTouchStart);
    this.surface.removeEventListener('touchmove', this.handleTouchMove);
    this.surface.removeEventListener('touchend', this.handleTouchEnd);
  }
}
