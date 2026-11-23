import { describe, expect, it } from 'vitest';
import { EventBus } from '../src/core/bus/EventBus.ts';
import type { GameEvent, GameSnapshot } from '../src/core/contracts/messages.ts';
import { GameRuntime } from '../src/core/GameRuntime.ts';
import { GRID_PROFILE } from '../src/core/profiles/gridProfile.ts';
import { advanceSimulation } from '../src/core/processors/SimulationProcessor.ts';

function stepOnce(state: GameSnapshot): { state: GameSnapshot; events: readonly GameEvent[] } {
  const dt = 1 / state.effectiveSpeed + 0.001;
  // advanceSimulation ограничивает dt до 0.1с за тик, поэтому прокручиваем мелкими порциями
  let cur = state;
  const allEvents: GameEvent[] = [];
  let remaining = dt;
  while (remaining > 0 && cur.phase === 'playing') {
    const chunk = Math.min(0.05, remaining);
    const out = advanceSimulation(cur, chunk);
    cur = out.state;
    allEvents.push(...out.events);
    remaining -= chunk;
  }
  return { state: cur, events: allEvents };
}

describe('SimulationProcessor + GameRuntime (стыки ядра)', () => {
  it('запускает партию, блокирует разворот на 180° и телепортирует через стену', () => {
    const bus = new EventBus();
    const events: GameEvent[] = [];
    bus.subscribeAll((e) => events.push(e));

    const runtime = new GameRuntime(bus, 'normal', 12345);
    runtime.dispatch({ type: 'START_NEW_RUN', difficulty: 'normal', seed: 12345 });
    expect(runtime.getSnapshot().phase).toBe('playing');

    // Попытка разворота на 180° (из RIGHT в LEFT) должна игнорироваться
    runtime.dispatch({ type: 'CHANGE_DIRECTION', direction: 'LEFT' });
    expect(runtime.getSnapshot().snake.directionQueue).toEqual([]);

    // Двойной поворот UP -> LEFT буферизуется корректно
    runtime.dispatch({ type: 'CHANGE_DIRECTION', direction: 'UP' });
    runtime.dispatch({ type: 'CHANGE_DIRECTION', direction: 'LEFT' });
    expect(runtime.getSnapshot().snake.directionQueue).toEqual(['UP', 'LEFT']);

    // Ставим голову у правого края без препятствий и шагаем вправо → телепорт на x=0
    const snap = runtime.getSnapshot();
    const edgeState: GameSnapshot = {
      ...snap,
      goodApples: [{ id: 1, pos: { x: 10, y: 10 } }],
      badApples: [],
      stones: [],
      snake: {
        segments: [
          { x: GRID_PROFILE.width - 1, y: 5 },
          { x: GRID_PROFILE.width - 2, y: 5 },
          { x: GRID_PROFILE.width - 3, y: 5 },
        ],
        previousSegments: [
          { x: GRID_PROFILE.width - 1, y: 5 },
          { x: GRID_PROFILE.width - 2, y: 5 },
          { x: GRID_PROFILE.width - 3, y: 5 },
        ],
        direction: 'RIGHT',
        directionQueue: [],
      },
    };

    const moved = stepOnce(edgeState);
    expect(moved.state.snake.segments[0]).toEqual({ x: 0, y: 5 });
    expect(moved.events.some((e) => e.type === 'SNAKE_STEPPED' && e.wrapped)).toBe(true);
  });

  it('съедение последнего хорошего яблока сбрасывает бешенство и завершает уровень', () => {
    const bus = new EventBus();
    const runtime = new GameRuntime(bus, 'normal', 777);
    runtime.dispatch({ type: 'START_NEW_RUN', difficulty: 'normal', seed: 777 });

    const snap = runtime.getSnapshot();
    const custom: GameSnapshot = {
      ...snap,
      frenzy: {
        hungerSec: 9,
        level: 0.6,
        active: true,
        peakTriggered: false,
        starveTimerSec: 0,
      },
      goodApples: [{ id: 1, pos: { x: 13, y: 9 } }],
      badApples: [],
      stones: [],
      snake: {
        segments: [
          { x: 12, y: 9 },
          { x: 11, y: 9 },
          { x: 10, y: 9 },
        ],
        previousSegments: [
          { x: 12, y: 9 },
          { x: 11, y: 9 },
          { x: 10, y: 9 },
        ],
        direction: 'RIGHT',
        directionQueue: [],
      },
    };
    runtime.store.setState(custom);

    const out = stepOnce(runtime.getSnapshot());
    runtime.store.setState(out.state);

    expect(out.state.phase).toBe('level_complete');
    expect(out.state.goodApples).toHaveLength(0);
    expect(out.state.frenzy.level).toBe(0);
    expect(out.state.frenzy.active).toBe(false);
    expect(out.state.lastLevelSummary).not.toBeNull();
    expect(out.events.some((e) => e.type === 'FRENZY_CALMED')).toBe(true);
    expect(out.events.some((e) => e.type === 'LEVEL_COMPLETED')).toBe(true);

    // Переход на уровень 2
    const next = runtime.dispatch({ type: 'NEXT_LEVEL', seed: 888 });
    expect(next.phase).toBe('playing');
    expect(next.levelStats.level).toBe(2);
    expect(next.baseSpeed).toBeGreaterThan(snap.baseSpeed);
  });

  it('плохое яблоко уменьшает длину, штрафует счёт и записывает ошибку', () => {
    const bus = new EventBus();
    const runtime = new GameRuntime(bus, 'normal', 111);
    runtime.dispatch({ type: 'START_NEW_RUN', difficulty: 'normal', seed: 111 });

    const snap = runtime.getSnapshot();
    const state: GameSnapshot = {
      ...snap,
      score: 100,
      goodApples: [{ id: 1, pos: { x: 0, y: 0 } }],
      badApples: [{ id: 2, pos: { x: 13, y: 9 } }],
      stones: [],
      snake: {
        segments: [
          { x: 12, y: 9 },
          { x: 11, y: 9 },
          { x: 10, y: 9 },
        ],
        previousSegments: [
          { x: 12, y: 9 },
          { x: 11, y: 9 },
          { x: 10, y: 9 },
        ],
        direction: 'RIGHT',
        directionQueue: [],
      },
    };

    const out = stepOnce(state);
    expect(out.state.snake.segments).toHaveLength(2);
    expect(out.state.score).toBe(85);
    expect(out.state.badApples).toHaveLength(0);
    expect(out.state.levelStats.mistakes).toBe(1);
    expect(out.events.some((e) => e.type === 'BAD_APPLE_EATEN')).toBe(true);
  });

  it('толкает камень при длине > веса и теряет жизнь при длине <= веса с перезапуском уровня', () => {
    const bus = new EventBus();
    const runtime = new GameRuntime(bus, 'easy', 222);
    runtime.dispatch({ type: 'START_NEW_RUN', difficulty: 'easy', seed: 222 });
    const base = runtime.getSnapshot();

    // Случай 1: длина 4 > веса 3 → успешный толчок камня
    const pushState: GameSnapshot = {
      ...base,
      goodApples: [{ id: 1, pos: { x: 0, y: 0 } }],
      badApples: [],
      stones: [{ id: 5, pos: { x: 13, y: 9 }, weight: 3 }],
      snake: {
        segments: [
          { x: 12, y: 9 },
          { x: 11, y: 9 },
          { x: 10, y: 9 },
          { x: 9, y: 9 },
        ],
        previousSegments: [
          { x: 12, y: 9 },
          { x: 11, y: 9 },
          { x: 10, y: 9 },
          { x: 9, y: 9 },
        ],
        direction: 'RIGHT',
        directionQueue: [],
      },
    };

    const pushed = stepOnce(pushState);
    expect(pushed.state.phase).toBe('playing');
    expect(pushed.state.snake.segments).toHaveLength(1);
    expect(pushed.state.stones[0]?.pos).toEqual({ x: 15, y: 9 });
    expect(pushed.state.score).toBeGreaterThan(0);
    expect(pushed.events.some((e) => e.type === 'STONE_PUSHED')).toBe(true);

    // Случай 2: длина 3 <= веса 3 → потеря жизни, но остаются жизни → life_lost → RETRY_LEVEL
    const heavyState: GameSnapshot = {
      ...base,
      score: 350,
      lives: 2,
      goodApples: [{ id: 1, pos: { x: 0, y: 0 } }],
      badApples: [],
      stones: [{ id: 5, pos: { x: 13, y: 9 }, weight: 3 }],
      snake: {
        segments: [
          { x: 12, y: 9 },
          { x: 11, y: 9 },
          { x: 10, y: 9 },
        ],
        previousSegments: [
          { x: 12, y: 9 },
          { x: 11, y: 9 },
          { x: 10, y: 9 },
        ],
        direction: 'RIGHT',
        directionQueue: [],
      },
    };

    const died = stepOnce(heavyState);
    expect(died.state.phase).toBe('life_lost');
    expect(died.state.lives).toBe(1);
    expect(died.state.lastDeathReason).toBe('stone_too_heavy');

    runtime.store.setState(died.state);
    const retried = runtime.dispatch({ type: 'RETRY_LEVEL', seed: 333 });
    expect(retried.phase).toBe('playing');
    expect(retried.levelStats.level).toBe(1);
    expect(retried.score).toBe(350);
    expect(retried.lives).toBe(1);
    expect(retried.goodApples.length).toBeGreaterThan(1);
  });

  it('переходит в game_over при потере последней жизни', () => {
    const bus = new EventBus();
    const runtime = new GameRuntime(bus, 'normal', 444);
    runtime.dispatch({ type: 'START_NEW_RUN', difficulty: 'normal', seed: 444 });
    const base = runtime.getSnapshot();

    const lastLifeState: GameSnapshot = {
      ...base,
      lives: 1,
      goodApples: [{ id: 1, pos: { x: 0, y: 0 } }],
      badApples: [],
      stones: [{ id: 5, pos: { x: 13, y: 9 }, weight: 4 }],
      snake: {
        segments: [
          { x: 12, y: 9 },
          { x: 11, y: 9 },
          { x: 10, y: 9 },
        ],
        previousSegments: [
          { x: 12, y: 9 },
          { x: 11, y: 9 },
          { x: 10, y: 9 },
        ],
        direction: 'RIGHT',
        directionQueue: [],
      },
    };

    const out = stepOnce(lastLifeState);
    expect(out.state.phase).toBe('game_over');
    expect(out.state.lives).toBe(0);
    expect(out.state.deathAnimSec).toBeGreaterThan(0);
    expect(out.events.some((e) => e.type === 'GAME_OVER')).toBe(true);

    // Анимация гибели плавно доходит до 0
    let animating = out.state;
    for (let i = 0; i < 25; i += 1) {
      animating = advanceSimulation(animating, 0.1).state;
    }
    expect(animating.deathAnimSec).toBe(0);
  });

  it('при долгом бешенстве змейка худеет, испускает SNAKE_SHRUNK и гибнет при длине 0 (starvation)', () => {
    const bus = new EventBus();
    const events: GameEvent[] = [];
    bus.subscribeAll((e) => events.push(e));

    const runtime = new GameRuntime(bus, 'hard', 505);
    runtime.dispatch({ type: 'START_NEW_RUN', difficulty: 'hard', seed: 505 });
    const base = runtime.getSnapshot();

    // Пустое поле с одним далёким яблоком, чтобы змейка ни во что не врезалась и проголодалась
    const openField: GameSnapshot = {
      ...base,
      lives: 2,
      goodApples: [{ id: 1, pos: { x: 0, y: 0 } }],
      badApples: [],
      stones: [],
      snake: {
        segments: [
          { x: 10, y: 9 },
          { x: 9, y: 9 },
          { x: 8, y: 9 },
        ],
        previousSegments: [
          { x: 10, y: 9 },
          { x: 9, y: 9 },
          { x: 8, y: 9 },
        ],
        direction: 'RIGHT',
        directionQueue: [],
      },
    };
    runtime.store.setState(openField);

    // Прокручиваем время до голодной гибели (hard: calm 3.5s + delay 2.0s + 3 * 2.1s ≈ 11.8s)
    for (let i = 0; i < 160; i += 1) {
      if (runtime.getSnapshot().phase !== 'playing') break;
      runtime.tick(0.1);
    }

    const finalSnap = runtime.getSnapshot();
    const shrunkEvents = events.filter((e) => e.type === 'SNAKE_SHRUNK');
    expect(shrunkEvents.length).toBe(3);
    expect(shrunkEvents.map((e) => e.newLength)).toEqual([2, 1, 0]);
    expect(finalSnap.phase).toBe('life_lost');
    expect(finalSnap.lastDeathReason).toBe('starvation');
    expect(finalSnap.deathAnimSec).toBeGreaterThan(0);
  });
});
