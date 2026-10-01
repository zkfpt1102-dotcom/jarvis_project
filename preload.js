const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('jarvisAPI', {
  // Window controls
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  toggleAlwaysOnTop: () => ipcRenderer.invoke('window:toggleAlwaysOnTop'),
  setUIMode: (mode) => ipcRenderer.invoke('window:setMode', mode),
  moveWindowBy: (deltaX, deltaY) => ipcRenderer.invoke('window:moveBy', deltaX, deltaY),
  saveWindowPosition: (mode, x, y) => ipcRenderer.invoke('window:savePosition', mode, x, y),

  // Brain & Learning
  processInput: (text) => ipcRenderer.invoke('brain:processInput', text),
  getProfile: () => ipcRenderer.invoke('brain:getProfile'),

  // OS & Hardware
  getHardwareStats: () => ipcRenderer.invoke('system:getHardwareStats'),
  saveFileToDesktop: (data) => ipcRenderer.invoke('desktop:saveFile', data),
  openExternal: (url) => ipcRenderer.invoke('system:openExternal', url),
  selectImageFile: () => ipcRenderer.invoke('system:selectImageFile'),

  // Dedicated CAD Studio Window
  openCADWindow: (blueprintData) => ipcRenderer.invoke('cad:openStudioWindow', blueprintData),
  closeCADWindow: () => ipcRenderer.invoke('cad:closeStudioWindow'),
  onCADDataUpdate: (callback) => {
    ipcRenderer.on('cad:updateData', (e, data) => callback(data));
  },

  // Dedicated Simulation & Generated App Window
  openSimulationWindow: (opts) => ipcRenderer.invoke('window:openSimulationWindow', opts)
});
