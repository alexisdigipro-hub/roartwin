// What RoarTwin's page may ask of the Mac/Windows app: folders, a scan, the Trash, Finder/Explorer, updates.
const { contextBridge, ipcRenderer, webUtils } = require('electron')

const on = (channel) => (fn) => { const h = (_e, v) => fn(v); ipcRenderer.on(channel, h); return () => ipcRenderer.removeListener(channel, h) }
contextBridge.exposeInMainWorld('twin', {
  platform: process.platform,
  version: () => ipcRenderer.invoke('twin:version'),
  hasFfmpeg: () => ipcRenderer.invoke('twin:has-ffmpeg'),
  pick: () => ipcRenderer.invoke('twin:pick'),
  // a folder dropped on the window: its path on the disk
  pathOf: (file) => { try { return webUtils.getPathForFile(file) } catch { return '' } },
  isFolder: (p) => ipcRenderer.invoke('twin:is-folder', String(p)),
  scan: (opts) => ipcRenderer.invoke('twin:scan', opts),
  stop: () => ipcRenderer.invoke('twin:stop'),
  onProgress: on('twin:progress'),
  trash: (paths) => ipcRenderer.invoke('twin:trash', [...paths].map(String)),
  reveal: (p) => ipcRenderer.invoke('twin:reveal', String(p)),
  open: (p) => ipcRenderer.invoke('twin:open', String(p)),
  exportCSV: (text) => ipcRenderer.invoke('twin:export', String(text)),
  onMenu: on('twin:menu'),
  update: {
    state: () => ipcRenderer.invoke('twin:update-state'),
    check: () => ipcRenderer.invoke('twin:update-check'),
    install: () => ipcRenderer.invoke('twin:update-install'),
    on: on('twin:update'),
  },
})
