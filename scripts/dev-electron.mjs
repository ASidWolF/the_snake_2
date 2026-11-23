/**
 * Запуск режима разработки ПК (Vite + Electron) с чистой остановкой обоих процессов по Ctrl+C.
 */

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import readline from 'node:readline';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const electronBinary = require('electron');

let server = null;
let electronProc = null;
let shuttingDown = false;

async function shutdown(signalName) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\nПолучен сигнал ${signalName}. Останавливаю Vite и Electron...`);

  if (electronProc && !electronProc.killed) {
    electronProc.kill('SIGTERM');
  }
  if (server) {
    try {
      await server.close();
    } catch {
      // игнорируем
    }
  }
  console.log('Сервер и приложение The Snake 2 остановлены.');
  process.exit(0);
}

if (process.platform === 'win32' && process.stdin.isTTY) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.on('SIGINT', () => void shutdown('SIGINT'));
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGHUP', () => void shutdown('SIGHUP'));

async function start() {
  server = await createServer();
  await server.listen();
  const address = server.httpServer?.address();
  const port = typeof address === 'object' && address ? address.port : 5173;
  const url = `http://127.0.0.1:${port}`;

  console.log(
    `\n[The Snake 2 — Dev ПК] Сервер запущен на ${url}. Для остановки нажмите Ctrl+C в консоли или закройте окно.\n`
  );

  electronProc = spawn(electronBinary, ['.'], {
    stdio: 'inherit',
    env: { ...process.env, VITE_DEV_SERVER_URL: url },
  });

  electronProc.on('exit', () => {
    void shutdown('WINDOW_CLOSED');
  });
}

start().catch((err) => {
  console.error('Ошибка запуска desktop:dev:', err);
  process.exit(1);
});
