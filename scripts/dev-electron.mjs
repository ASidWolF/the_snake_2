import { spawn } from 'node:child_process';

const vite = spawn('npx', ['vite', '--port', '5173', '--strictPort'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

const url = 'http://127.0.0.1:5173';

async function waitForServer(timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // ждём запуска Vite
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Vite dev server did not start in time');
}

waitForServer()
  .then(() => {
    const electronProc = spawn('npx', ['electron', '.'], {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: { ...process.env, VITE_DEV_SERVER_URL: url },
    });

    electronProc.on('close', (code) => {
      vite.kill();
      process.exit(code ?? 0);
    });
  })
  .catch((err) => {
    console.error(err);
    vite.kill();
    process.exit(1);
  });

process.on('SIGINT', () => {
  vite.kill();
  process.exit(0);
});
