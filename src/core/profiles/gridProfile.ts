/**
 * Профиль логической сетки и направлений. Только данные, без логики.
 */

import type { Direction, GridPoint } from '../contracts/messages.ts';

export const GRID_PROFILE = {
  width: 24,
  height: 18,
  initialSnakeLength: 3,
  maxDirectionQueue: 2,
  safeSpawnRadius: 3,
  stonePushDistance: 2,
} as const;

export const DIRECTION_VECTORS: Readonly<Record<Direction, GridPoint>> = {
  UP: { x: 0, y: -1 },
  DOWN: { x: 0, y: 1 },
  LEFT: { x: -1, y: 0 },
  RIGHT: { x: 1, y: 0 },
};

export const OPPOSITE_DIRECTION: Readonly<Record<Direction, Direction>> = {
  UP: 'DOWN',
  DOWN: 'UP',
  LEFT: 'RIGHT',
  RIGHT: 'LEFT',
};

export const ALL_DIRECTIONS: readonly Direction[] = ['RIGHT', 'LEFT', 'UP', 'DOWN'];
