// Minimal, explicit bridge between the game page and the phone-link server.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('latentLink', {
  info: () => ipcRenderer.invoke('link-info'),
  setCollection: (json) => ipcRenderer.send('link-collection', json),
  onRoll: (cb) => ipcRenderer.on('phone-roll', (_e, roll) => cb(roll)),
  rollDone: (id, ok, message) => ipcRenderer.send('phone-roll-done', { id, ok, message }),
  onSeen: (cb) => ipcRenderer.on('phone-seen', (_e, info) => cb(info)),
});
