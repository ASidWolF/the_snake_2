import { describe, expect, it } from 'vitest';
import { EventBus } from '../src/core/bus/EventBus.ts';
import type { GameEvent } from '../src/core/contracts/messages.ts';

describe('EventBus (Коммутатор)', () => {
  it('доставляет события подписчикам по типу и через subscribeAll', () => {
    const bus = new EventBus();
    const received: string[] = [];

    const offTyped = bus.subscribe('UI_CLICK', () => received.push('typed'));
    const offAll = bus.subscribeAll((e) => received.push(`all:${e.type}`));

    bus.publish({ type: 'UI_CLICK' });
    expect(received).toEqual(['typed', 'all:UI_CLICK']);

    offTyped();
    bus.publish({ type: 'UI_CLICK' });
    expect(received).toEqual(['typed', 'all:UI_CLICK', 'all:UI_CLICK']);

    offAll();
    bus.publish({ type: 'UI_CLICK' });
    expect(received).toHaveLength(3);
  });

  it('сохраняет FIFO-порядок при реентрантной публикации внутри обработчика', () => {
    const bus = new EventBus();
    const order: string[] = [];

    bus.subscribe('FRENZY_STARTED', () => {
      order.push('start:1');
      bus.publish({ type: 'FRENZY_PEAK', level: 1 });
      order.push('start:2');
    });
    bus.subscribe('FRENZY_PEAK', () => {
      order.push('peak');
    });

    bus.publish({ type: 'FRENZY_STARTED', level: 1 });
    expect(order).toEqual(['start:1', 'start:2', 'peak']);
  });

  it('полностью очищает подписки через reset()', () => {
    const bus = new EventBus();
    const seen: GameEvent[] = [];
    bus.subscribeAll((e) => seen.push(e));
    bus.reset();
    bus.publish({ type: 'UI_CLICK' });
    expect(seen).toHaveLength(0);
  });
});
