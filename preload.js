const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('boardAPI', {
  loadState: () => ipcRenderer.invoke('state:load'),
  saveState: (state) => ipcRenderer.invoke('state:save', state),
  openCsvFolder: () => ipcRenderer.invoke('csv:open')
});
