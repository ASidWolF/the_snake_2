/**
 * Роль: Платформенный исполнитель (Platform Storage Adapter).
 * Автоматически выбирает Electron IPC-мост (ПК-режим) или localStorage (Веб-режим).
 */

import type { IStorageAdapter } from '../core/contracts/actions.ts';

interface DesktopBridgeApi {
  readonly isDesktop: true;
  getItem(key: string): Promise<unknown>;
  setItem(key: string, value: unknown): Promise<boolean>;
  quit(): Promise<void>;
}

declare global {
  interface Window {
    desktopBridge?: DesktopBridgeApi;
  }
}

export function createStorageAdapter(): IStorageAdapter {
  const bridge = typeof window !== 'undefined' ? window.desktopBridge : undefined;

  if (bridge?.isDesktop) {
    return {
      platformName: 'desktop',
      async getItem<T>(key: string): Promise<T | null> {
        const res = await bridge.getItem(key);
        return (res as T | null) ?? null;
      },
      async setItem<T>(key: string, value: T): Promise<void> {
        await bridge.setItem(key, value);
      },
      async quitApp(): Promise<void> {
        await bridge.quit();
      },
    };
  }

  return {
    platformName: 'web',
    async getItem<T>(key: string): Promise<T | null> {
      try {
        const raw = window.localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as T) : null;
      } catch {
        return null;
      }
    },
    async setItem<T>(key: string, value: T): Promise<void> {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch {
        // игнорируем квоту приватного режима
      }
    },
  };
}
