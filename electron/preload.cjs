const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('motorControlDesktop', {
  getMetadata: () => ipcRenderer.invoke('desktop:get-metadata'),
});
