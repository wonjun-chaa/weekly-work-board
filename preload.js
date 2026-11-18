const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('boardAPI', {
  loadState: () => ipcRenderer.invoke('state:load'),
  saveState: (state) => ipcRenderer.invoke('state:save', state),
  openCsvFolder: () => ipcRenderer.invoke('csv:open'),
  loadHolidays: () => ipcRenderer.invoke('holidays:load'),
  onHolidaysUpdated: (cb) => ipcRenderer.on('holidays:updated', (e, data) => cb(data))
});
