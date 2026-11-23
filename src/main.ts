/**
 * Точка сборки приложения (Composition Root).
 * Соединяет чёрные ящики по контрактам:
 * InputSensor / UI -> GameRuntime -> EventBus / GameStore -> CanvasRenderExecutor + WebAudioExecutor + GameUiExecutor + SavedRunStore.
 */

import './styles/main.css';
import { WebAudioExecutor } from './audio/WebAudioExecutor.ts';
import { EventBus } from './core/bus/EventBus.ts';
import { GameRuntime } from './core/GameRuntime.ts';
import { LeaderboardStore } from './core/stores/LeaderboardStore.ts';
import { SavedRunStore, isResumableSnapshot } from './core/stores/SavedRunStore.ts';
import { SettingsStore } from './core/stores/SettingsStore.ts';
import { InputSensor } from './input/InputSensor.ts';
import { createStorageAdapter } from './platform/storageAdapter.ts';
import { CanvasRenderExecutor } from './render/CanvasRenderExecutor.ts';
import { GameUiExecutor } from './ui/GameUiExecutor.ts';

async function bootstrap(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) {
    throw new Error('Контейнер #app не найден');
  }

  // 1. Платформенный адаптер и хранилища настроек/рекордов/сохранённой партии
  const storage = createStorageAdapter();
  const settingsStore = new SettingsStore(storage);
  const leaderboardStore = new LeaderboardStore(storage);
  const savedRunStore = new SavedRunStore(storage);

  await Promise.all([
    settingsStore.load(),
    leaderboardStore.load(),
    savedRunStore.load(),
  ]);

  // 2. Коммутатор и чистое игровое ядро
  const bus = new EventBus();
  const runtime = new GameRuntime(
    bus,
    settingsStore.getSnapshot().difficulty,
    Date.now() & 0x7fffffff
  );

  // 3. Исполнители: звук, UI, Canvas 2D рендер
  const audio = new WebAudioExecutor();
  audio.applySettings(settingsStore.getSnapshot().audio);

  const persistActiveRun = () => {
    const snap = runtime.getSnapshot();
    if (isResumableSnapshot(snap)) {
      savedRunStore.save(snap);
    }
  };

  const ui = new GameUiExecutor(
    root,
    runtime.getSnapshot(),
    settingsStore,
    leaderboardStore,
    savedRunStore,
    storage,
    {
      onCommand: (cmd) => {
        runtime.dispatch(cmd);
      },
      onUiClick: () => {
        bus.publish({ type: 'UI_CLICK' });
      },
      onUserGesture: () => {
        audio.unlock();
      },
      onSaveCurrentRun: persistActiveRun,
    }
  );

  const renderer = new CanvasRenderExecutor(ui.canvasEl);
  renderer.setLanguage(settingsStore.getSnapshot().language);

  // 4. Датчик ввода (клавиатура + свайпы)
  const input = new InputSensor(ui.stageEl, {
    onCommand: (cmd) => {
      runtime.dispatch(cmd);
    },
    onUserGesture: () => {
      audio.unlock();
    },
    onQuickMute: () => {
      const cur = settingsStore.getSnapshot().audio.muted;
      settingsStore.updateAudio({ muted: !cur });
    },
  });

  // 5. Подписки по контрактам (однонаправленный поток данных)
  bus.subscribeAll((event) => {
    renderer.handleEvent(event);
    audio.handleEvent(event);

    if (event.type === 'GAME_OVER') {
      savedRunStore.clear();
    } else if (
      event.type === 'RUN_STARTED' ||
      event.type === 'LEVEL_STARTED' ||
      event.type === 'GOOD_APPLE_EATEN' ||
      event.type === 'BAD_APPLE_EATEN' ||
      event.type === 'STONE_PUSHED' ||
      event.type === 'LEVEL_COMPLETED' ||
      event.type === 'LIFE_LOST'
    ) {
      persistActiveRun();
    } else if (event.type === 'PHASE_CHANGED' && event.to === 'paused') {
      persistActiveRun();
    }
  });

  runtime.store.subscribe((snapshot) => {
    audio.updateMusicContext(snapshot);
    ui.syncAll(snapshot, settingsStore.getSnapshot());
  });

  settingsStore.subscribe((settings) => {
    audio.applySettings(settings.audio);
    renderer.setLanguage(settings.language);
    ui.syncAll(runtime.getSnapshot(), settings);
  });

  leaderboardStore.subscribe(() => {
    ui.forceOverlayRender();
  });

  savedRunStore.subscribe(() => {
    ui.forceOverlayRender();
  });

  // 6. Адаптивный ресайз и автопауза + автосохранение при сворачивании вкладки
  const onResize = () => renderer.resize();
  window.addEventListener('resize', onResize);
  const resizeObserver = new ResizeObserver(() => renderer.resize());
  resizeObserver.observe(ui.stageEl);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && runtime.getSnapshot().phase === 'playing') {
      runtime.dispatch({ type: 'SET_PAUSED', paused: true });
      persistActiveRun();
    }
  });

  // 7. Главный цикл 60/120 FPS (requestAnimationFrame)
  let lastTs = performance.now();
  const frame = (ts: number) => {
    const dtSec = Math.max(0, (ts - lastTs) / 1000);
    lastTs = ts;

    const snapshot = runtime.tick(dtSec);
    renderer.render(snapshot, ts / 1000, dtSec);
    window.requestAnimationFrame(frame);
  };
  window.requestAnimationFrame(frame);

  // Корректная очистка и автосохранение при закрытии окна/вкладки
  window.addEventListener('beforeunload', () => {
    persistActiveRun();
    input.dispose();
    renderer.dispose();
    audio.dispose();
    resizeObserver.disconnect();
    window.removeEventListener('resize', onResize);
  });
}

void bootstrap();
