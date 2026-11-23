/**
 * Запуск ПК-приложения (Electron) из консоли с чистой остановкой по Ctrl+C (SIGINT / SIGTERM).
 */

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import readline from 'node:readline';

const require = createRequire(import.meta.url);
const electronBinary = require('electron');

let shuttingDown = false;
const child = spawn(electronBinary, ['.'], {
  stdio: 'inherit',
});

console.log(
  '\n[The Snake 2 — ПК] Запущено окно Electron. Для выхода закройте окно (Cmd+Q / Alt+F4) или нажмите Ctrl+C в консоли.\n'
);

function shutdown(signalName) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\nПолучен сигнал ${signalName}. Закрываю приложение The Snake 2...`);
  if (!child.killed) {
    child.kill('SIGTERM');
    setTimeout(() => {
      if (!child.killed) child.kill('SIGKILL');
      process.exit(0);
    }, 1500).unref();
  } else {
    process.exit(0);
  }
}

if (process.platform === 'win32' && process.stdin.isTTY) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.on('SIGINT', () => shutdown('SIGINT'));
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGHUP', () => shutdown('SIGHUP'));

child.on('exit', () => {
  console.log('Приложение The Snake 2 закрыто.');
  process.exit(0);
});
