const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopBridge', {
  isDesktop: true,
  getItem: (key) => ipcRenderer.invoke('storage:get', key),
  setItem: (key, value) => ipcRenderer.invoke('storage:set', key, value),
  quit: () => ipcRenderer.invoke('app:quit'),
});
