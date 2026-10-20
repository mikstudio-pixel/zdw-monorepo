const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('renderBridge', {
  ready: error => ipcRenderer.send('render:ready', error),
  onFrame: callback => ipcRenderer.on('render:frame', (_event, data) => callback(data)),
  result: result => ipcRenderer.send('render:result', result),
});
