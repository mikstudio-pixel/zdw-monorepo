const { contextBridge, ipcRenderer, webUtils } = require('electron');
const invoke = (name, ...args) => ipcRenderer.invoke(name, ...args);
contextBridge.exposeInMainWorld('liquid', {
  chooseVideo: () => invoke('video:choose'),
  importFile: file => invoke('video:import', webUtils.getPathForFile(file)),
  exportVideo: settings => invoke('video:export', settings),
  exportImage: dataUrl => invoke('image:export', dataUrl),
  cancel: () => invoke('job:cancel'),
  saveSettings: settings => invoke('settings:save', settings),
  loadSettings: () => invoke('settings:load'),
  revealExport: () => invoke('export:reveal'),
  onProgress: callback => {
    const handler = (_event, value) => callback(value);
    ipcRenderer.on('job:progress', handler);
    return () => ipcRenderer.removeListener('job:progress', handler);
  },
});
