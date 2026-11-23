/**
 * Склейка цепочки ядра: команды/тики → SimulationProcessor → GameStore → EventBus.
 * Предметных правил не содержит: только передача сообщений по контрактам.
 */

import type { IEventBus } from './contracts/actions.ts';
import type {
  DifficultyKey,
  GameCommand,
  GameSnapshot,
} from './contracts/messages.ts';
import {
  advanceSimulation,
  applyCommand,
  createInitialSnapshot,
} from './processors/SimulationProcessor.ts';
import { GameStore } from './stores/GameStore.ts';

export class GameRuntime {
  readonly store: GameStore;
  readonly bus: IEventBus;

  constructor(bus: IEventBus, initialDifficulty: DifficultyKey = 'normal', seed = 104729) {
    this.bus = bus;
    this.store = new GameStore(createInitialSnapshot(initialDifficulty, seed));
  }

  getSnapshot(): GameSnapshot {
    return this.store.getSnapshot();
  }

  dispatch(command: GameCommand): GameSnapshot {
    const outcome = applyCommand(this.store.getSnapshot(), command);
    this.store.setState(outcome.state);
    for (const event of outcome.events) {
      this.bus.publish(event);
    }
    return outcome.state;
  }

  tick(dtSec: number): GameSnapshot {
    const outcome = advanceSimulation(this.store.getSnapshot(), dtSec);
    this.store.setState(outcome.state);
    for (const event of outcome.events) {
      this.bus.publish(event);
    }
    return outcome.state;
  }
}
