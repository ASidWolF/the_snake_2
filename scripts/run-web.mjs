/**
 * Кроссплатформенный запуск веб-сервера The Snake 2 (dev / preview)
 * с мгновенной и чистой остановкой по Ctrl+C (SIGINT / SIGTERM) на macOS, Windows и Linux.
 */

import readline from 'node:readline';
import { createServer, preview } from 'vite';

const mode = process.argv[2] === 'preview' ? 'preview' : 'dev';

let shuttingDown = false;
let closeServer = async () => {};

async function shutdown(signalName) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\nПолучен сигнал ${signalName}. Останавливаю сервер The Snake 2...`);
  try {
    await closeServer();
  } catch {
    // игнорируем повторное закрытие
  }
  console.log('Сервер The Snake 2 остановлен.');
  process.exit(0);
}

// На Windows в некоторых терминалах SIGINT приходит через readline
if (process.platform === 'win32' && process.stdin.isTTY) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGHUP', () => void shutdown('SIGHUP'));

async function start() {
  if (mode === 'preview') {
    const server = await preview({
      preview: { host: '127.0.0.1', port: 4173, strictPort: false },
    });
    closeServer = () =>
      new Promise((resolve) => {
        server.httpServer.close(() => resolve());
      });
    server.printUrls();
  } else {
    const server = await createServer();
    await server.listen();
    closeServer = () => server.close();
    server.printUrls();
  }

  console.log(
    '\n[The Snake 2] Для остановки сервера и выхода нажмите Ctrl+C (Control+C на macOS / Ctrl+C на Windows и Linux).\n'
  );
}

start().catch((err) => {
  console.error('Ошибка запуска веб-сервера:', err);
  process.exit(1);
});
