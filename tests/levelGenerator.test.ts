import { describe, expect, it } from 'vitest';
import { DIFFICULTY_PROFILES } from '../src/core/profiles/difficultyProfiles.ts';
import { GRID_PROFILE } from '../src/core/profiles/gridProfile.ts';
import {
  computeLevelQuota,
  generateLevel,
  pointKey,
} from '../src/core/processors/LevelGeneratorProcessor.ts';

describe('LevelGeneratorProcessor', () => {
  it('генерирует детерминированную раскладку по одинаковому сиду', () => {
    const a = generateLevel(2, DIFFICULTY_PROFILES.normal, 4242);
    const b = generateLevel(2, DIFFICULTY_PROFILES.normal, 4242);
    expect(a).toEqual(b);
  });

  it('увеличивает фиксированное число объектов с ростом уровня и сложности', () => {
    const easyL1 = computeLevelQuota(1, DIFFICULTY_PROFILES.easy);
    const easyL5 = computeLevelQuota(5, DIFFICULTY_PROFILES.easy);
    const hardL1 = computeLevelQuota(1, DIFFICULTY_PROFILES.hard);

    expect(easyL5.goodApples).toBeGreaterThan(easyL1.goodApples);
    expect(easyL5.stones).toBeGreaterThan(easyL1.stones);
    expect(hardL1.stones).toBeGreaterThan(easyL1.stones);
    expect(hardL1.badApples).toBeGreaterThan(easyL1.badApples);
    expect(hardL1.stoneWeight).toBeGreaterThan(easyL1.stoneWeight);
  });

  it('не допускает наложений объектов и держит безопасную зону вокруг змейки', () => {
    const generated = generateLevel(4, DIFFICULTY_PROFILES.hard, 9999);
    const occupied = new Set<string>();

    for (const seg of generated.snake.segments) {
      const k = pointKey(seg);
      expect(occupied.has(k)).toBe(false);
      occupied.add(k);
    }

    const head = generated.snake.segments[0]!;
    const checkHazardSafe = (x: number, y: number) => {
      const dx = Math.abs(x - head.x);
      const dy = Math.abs(y - head.y);
      const wrappedDx = Math.min(dx, GRID_PROFILE.width - dx);
      const wrappedDy = Math.min(dy, GRID_PROFILE.height - dy);
      expect(
        wrappedDx <= GRID_PROFILE.safeSpawnRadius &&
          wrappedDy <= GRID_PROFILE.safeSpawnRadius
      ).toBe(false);
    };

    for (const s of generated.stones) {
      const k = pointKey(s.pos);
      expect(occupied.has(k)).toBe(false);
      occupied.add(k);
      checkHazardSafe(s.pos.x, s.pos.y);
    }

    for (const b of generated.badApples) {
      const k = pointKey(b.pos);
      expect(occupied.has(k)).toBe(false);
      occupied.add(k);
      checkHazardSafe(b.pos.x, b.pos.y);
    }

    for (const g of generated.goodApples) {
      const k = pointKey(g.pos);
      expect(occupied.has(k)).toBe(false);
      occupied.add(k);
    }
  });
});
