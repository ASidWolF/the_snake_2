const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const DATA_FILENAME = 'the_snake_2_data.json';

function getDataFilePath() {
  return path.join(app.getPath('userData'), DATA_FILENAME);
}

function readStorageFile() {
  const filePath = getDataFilePath();
  try {
    if (!fs.existsSync(filePath)) {
      return {};
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeStorageFile(data) {
  const filePath = getDataFilePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 760,
    minHeight: 600,
    backgroundColor: '#070d12',
    title: 'The Snake 2',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    win.loadURL(devUrl);
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

ipcMain.handle('storage:get', (_event, key) => {
  if (typeof key !== 'string' || !key) return null;
  const all = readStorageFile();
  return Object.prototype.hasOwnProperty.call(all, key) ? all[key] : null;
});

ipcMain.handle('storage:set', (_event, key, value) => {
  if (typeof key !== 'string' || !key) return false;
  const all = readStorageFile();
  all[key] = value;
  writeStorageFile(all);
  return true;
});

ipcMain.handle('app:quit', () => {
  app.quit();
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Корректный выход при остановке из консоли по Ctrl+C (SIGINT) или SIGTERM
process.on('SIGINT', () => {
  app.quit();
});

process.on('SIGTERM', () => {
  app.quit();
});
