// RoarTwin for Mac and Windows (The Mad Lions Lab, Oct 2026): give it folders or drives, it finds the twins.
// The page (app/) asks; this side walks the disk, runs the engine (engine.js, with the ffmpeg that comes inside
// the app) and moves what the person chose to the computer's Trash. Nothing is ever deleted for good, and a group
// always keeps at least one of its files.
const { app, BrowserWindow, Menu, dialog, ipcMain, nativeTheme, net, protocol, shell, powerSaveBlocker } = require('electron')
const fs = require('fs')
const path = require('path')
const { pathToFileURL } = require('url')
const engine = require('./engine')
const updater = require('./updater')

nativeTheme.themeSource = 'dark'

// ffmpeg comes with the app (ffmpeg-static); inside a packed app it sits next to the archive, not in it
function ffmpegPath() {
  try {
    const p = require('ffmpeg-static')
    return p ? p.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep) : ''
  } catch { return '' }
}

// the page comes from app://twin/ (the app/ folder inside the program)
const APP_DIR = path.join(__dirname, '..', 'app')
const HOME = 'app://twin/index.html'
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }])
function serveApp() {
  protocol.handle('app', (req) => {
    const rel = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, '') || 'index.html'
    const file = path.normalize(path.join(APP_DIR, rel))
    if (!file.startsWith(APP_DIR + path.sep)) return new Response('Not found', { status: 404 })
    return net.fetch(pathToFileURL(file).toString())
  })
}

let win = null
let quitting = false
const openOutside = (url) => { if (/^(https?:|mailto:)/i.test(String(url))) shell.openExternal(url) }
const frame = process.platform === 'darwin'
  ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 16, y: 21 } }
  : { titleBarStyle: 'hidden', titleBarOverlay: { color: '#16181d', symbolColor: '#eef0f3', height: 58 } }

function open() {
  win = new BrowserWindow({
    width: 1320, height: 860, minWidth: 900, minHeight: 600, show: false, backgroundColor: '#16181d', autoHideMenuBar: true, ...frame,
    webPreferences: { contextIsolation: true, sandbox: true, preload: path.join(__dirname, 'preload.js') },
  })
  win.loadURL(HOME)
  win.once('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler(({ url }) => { openOutside(url); return { action: 'deny' } })
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://twin/')) { e.preventDefault(); openOutside(url) } })
  win.on('close', (e) => {
    if (scanning && !quitting) {
      const n = dialog.showMessageBoxSync(win, { type: 'question', buttons: ['Stop and close', 'Keep scanning'], defaultId: 1, message: 'RoarTwin is still scanning.', detail: 'Closing the window stops the scan.' })
      if (n === 1) { e.preventDefault(); return }
      stopNow = true
    }
  })
  win.on('closed', () => { win = null })
}

const send = (cmd) => win?.webContents.send('twin:menu', cmd)
function menu() {
  const mac = process.platform === 'darwin'
  const cmd = mac ? 'Cmd' : 'Ctrl'
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(mac ? [{ role: 'appMenu' }] : []),
    { label: 'File', submenu: [
      { label: 'Add Folders…', accelerator: `${cmd}+O`, click: () => send('add') },
      { label: 'New Scan', accelerator: `${cmd}+N`, click: () => send('new') },
      { type: 'separator' },
      { label: 'Export the List…', accelerator: `${cmd}+E`, click: () => send('export') },
      ...(mac ? [] : [{ type: 'separator' }, { role: 'quit' }]),
    ] },
    { role: 'editMenu' },
    { label: 'View', submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
    { role: 'windowMenu' },
  ]))
}

// one scan at a time; the last result is kept here too, so the Trash can check the page's request against it
let scanning = false
let stopNow = false
let last = null
ipcMain.handle('twin:pick', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, { title: 'Folders or drives to look in', properties: ['openDirectory', 'multiSelections', 'createDirectory'] })
  return canceled ? [] : filePaths
})
ipcMain.handle('twin:is-folder', (_e, p) => { try { return fs.statSync(String(p)).isDirectory() } catch { return false } })
ipcMain.handle('twin:scan', async (e, opts) => {
  if (scanning) throw new Error('A scan is already running.')
  const roots = (Array.isArray(opts?.roots) ? opts.roots : []).map(String).filter((r) => { try { return fs.statSync(r).isDirectory() } catch { return false } })
  if (!roots.length) throw new Error('Choose a folder or a drive first.')
  scanning = true; stopNow = false
  // the computer does not fall asleep in the middle of a long scan
  const awake = powerSaveBlocker.start('prevent-app-suspension')
  let lastTick = 0
  const tick = (t) => { const now = Date.now(); if (now - lastTick > 120 || t.done === t.total) { lastTick = now; try { e.sender.send('twin:progress', t) } catch { /* window gone */ } } }
  try {
    const r = await engine.scan({
      roots, kind: ['video', 'image', 'audio'].includes(opts.kind) ? opts.kind : opts.videosOnly ? 'video' : 'all', similar: opts.similar !== false, skipHidden: opts.skipHidden !== false, skipCloud: opts.skipCloud !== false,
      minSize: Math.max(0, Number(opts.minSize) || 0), ffmpeg: ffmpegPath(),
      // Alex, 25 Oct: Masters folders, a part of a longer video, similar photos, the same sound, proxies
      protect: (Array.isArray(opts.protect) ? opts.protect : []).map(String).filter((p) => roots.some((r) => engine.inside(p, r) || engine.inside(r, p))),
      folders: opts.folders !== false, parts: !!opts.parts, photos: opts.photos !== false, sounds: opts.sounds !== false, proxies: opts.proxies !== false,
    }, tick, () => stopNow)
    last = r
    return r
  } catch (err) {
    if (err instanceof engine.Stopped) return { stopped: true }
    throw err
  } finally { scanning = false; powerSaveBlocker.stop(awake) }
})
ipcMain.handle('twin:stop', () => { stopNow = true; return true })
// is every file of the originals on the backup? (Alex, 25 Oct) Reads only; changes nothing.
let lastBackup = null
ipcMain.handle('twin:backup', async (e, opts) => {
  if (scanning) throw new Error('A scan is already running.')
  const dirOk = (p) => { try { return fs.statSync(String(p)).isDirectory() } catch { return false } }
  if (!dirOk(opts?.source) || !dirOk(opts?.backup)) throw new Error('Choose the originals and the backup first.')
  scanning = true; stopNow = false
  const awake = powerSaveBlocker.start('prevent-app-suspension')
  let lastTick = 0
  const tick = (t) => { const now = Date.now(); if (now - lastTick > 120 || t.done === t.total) { lastTick = now; try { e.sender.send('twin:progress', t) } catch { /* window gone */ } } }
  try {
    lastBackup = await engine.backupCheck({ source: String(opts.source), backup: String(opts.backup), skipHidden: opts.skipHidden !== false, skipCloud: opts.skipCloud !== false }, tick, () => stopNow)
    return lastBackup
  } catch (err) {
    if (err instanceof engine.Stopped) return { stopped: true }
    throw err
  } finally { scanning = false; powerSaveBlocker.stop(awake) }
})

// to the Trash: only files of the last scan, and never every file of a group
ipcMain.handle('twin:trash', async (_e, paths) => {
  const want = new Set((Array.isArray(paths) ? paths : []).map(String))
  const ok = [], failed = []
  for (const g of last?.groups || []) {
    const left = g.files.filter((f) => !want.has(f.path))
    let go = g.files.filter((f) => want.has(f.path))
    if (!go.length) continue
    // a proxy with no original is a group of one: it may go; every other group keeps one
    if (!left.length && g.kind !== 'orphan') { go.forEach((f) => failed.push({ path: f.path, error: 'At least one file of each group stays.' })); continue }
    // nothing in a Masters folder ever goes
    const masters = go.filter((f) => f.protected || (last.protect || []).some((p) => engine.inside(f.path, p)))
    masters.forEach((f) => failed.push({ path: f.path, error: 'It is in a Masters folder.' }))
    go = go.filter((f) => !masters.includes(f))
    for (const f of go) {
      try { await shell.trashItem(f.path); ok.push(f.path) } catch (err) { failed.push({ path: f.path, error: String(err?.message || err) }) }
    }
  }
  if (last) {
    const gone = new Set(ok)
    last.groups = last.groups.map((g) => ({ ...g, files: g.files.filter((f) => !gone.has(f.path)) })).filter((g) => g.files.length > (g.kind === 'orphan' ? 0 : 1))
  }
  return { ok, failed }
})
const known = (p) => (last?.groups || []).some((g) => g.files.some((f) => f.path === p))
  || (lastBackup?.missing || []).some((f) => f.path === p || f.other === p)
ipcMain.handle('twin:reveal', (_e, p) => { if (known(String(p))) shell.showItemInFolder(String(p)) })
ipcMain.handle('twin:open', (_e, p) => (known(String(p)) ? shell.openPath(String(p)) : ''))
// the list as a CSV a spreadsheet opens (Excel, Numbers)
ipcMain.handle('twin:export', async (_e, text) => {
  const { canceled, filePath } = await dialog.showSaveDialog(win, { defaultPath: 'RoarTwin duplicates.csv', filters: [{ name: 'CSV', extensions: ['csv'] }] })
  if (canceled || !filePath) return false
  fs.writeFileSync(filePath, '﻿' + String(text), 'utf8')
  shell.showItemInFolder(filePath)
  return true
})
ipcMain.handle('twin:version', () => app.getVersion())
ipcMain.handle('twin:has-ffmpeg', () => { const p = ffmpegPath(); return !!p && fs.existsSync(p) })

if (!app.requestSingleInstanceLock()) app.quit()
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus() } })
/* RoarTwin can update itself only where it may replace itself: in Applications, not opened straight from the .dmg
   or from Downloads (macOS runs those from a hidden read-only copy). There the update used to open the new .dmg
   instead, so it had to be installed by hand every time (Alex, 24 Oct: "make it update by itself"). Started from
   anywhere else, it offers to move itself to Applications once per start; Electron moves it and opens it again. */
function offerApplications() {
  if (process.platform !== 'darwin' || !app.isPackaged || app.isInApplicationsFolder()) return false
  const r = dialog.showMessageBoxSync({
    type: 'question', buttons: ['Move to Applications', 'Not now'], defaultId: 0, cancelId: 1,
    message: 'Move RoarTwin to Applications?',
    detail: 'From there RoarTwin updates itself, with nothing to download or install by hand. It opens again by itself.',
  })
  if (r !== 0) return false
  try {
    // an older RoarTwin already in Applications is replaced by this one
    return app.moveToApplicationsFolder({ conflictHandler: () => true })
  } catch (e) {
    dialog.showErrorBox('RoarTwin could not move itself', `${e?.message || e}\n\nDrag RoarTwin into the Applications folder yourself and open it from there.`)
    return false
  }
}

app.whenReady().then(() => {
  if (offerApplications()) return
  serveApp()
  menu()
  open()
  updater.start(ipcMain, () => { quitting = true })
  app.on('activate', () => { if (!win) open() })
})
app.on('before-quit', () => { quitting = true; stopNow = true })
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
