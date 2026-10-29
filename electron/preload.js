// What RoarTwin's page may ask of the Mac/Windows app: folders, a scan, the Trash, Finder/Explorer, updates, Clean up.
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
  backup: (opts) => ipcRenderer.invoke('twin:backup', opts),
  copy: (opts) => ipcRenderer.invoke('twin:copy', opts),
  recheck: (opts) => ipcRenderer.invoke('twin:recheck', opts),
  onCard: on('twin:card'),
  onProgress: on('twin:progress'),
  trash: (paths) => ipcRenderer.invoke('twin:trash', [...paths].map(String)),
  reveal: (p) => ipcRenderer.invoke('twin:reveal', String(p)),
  open: (p) => ipcRenderer.invoke('twin:open', String(p)),
  exportCSV: (text) => ipcRenderer.invoke('twin:export', String(text)),
  onMenu: on('twin:menu'),
  // Clean up (Alex, 28 Oct): the caches measured, and the places chosen moved to the Trash
  cleanLook: () => ipcRenderer.invoke('twin:clean-look'),
  clean: (ids) => ipcRenderer.invoke('twin:clean', [...ids].map(String)),
  onCleanTick: on('twin:clean-tick'),
  // the other tools (electron/tools/*.js): one door each, by name ('space-scan', 'report-save'…); events the same way
  tool: (name, args) => ipcRenderer.invoke('tool:' + String(name), args ?? null),
  onTool: (name, fn) => on('tool:' + String(name))(fn),
  // Settings the Mac/Windows side needs (Alex, 28 Oct): the look of its own windows, the end-of-job notification, the company for the MHL
  prefs: (v) => ipcRenderer.invoke('twin:prefs', v),
  update: {
    state: () => ipcRenderer.invoke('twin:update-state'),
    check: () => ipcRenderer.invoke('twin:update-check'),
    install: () => ipcRenderer.invoke('twin:update-install'),
    on: on('twin:update'),
  },
})
