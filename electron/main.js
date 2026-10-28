// RoarTwin for Mac and Windows (The Mad Lions Lab, Oct 2026): give it folders or drives, it finds the twins.
// The page (app/) asks; this side walks the disk, runs the engine (engine.js, with the ffmpeg that comes inside
// the app) and moves what the person chose to the computer's Trash. Nothing is ever deleted for good, and a group
// always keeps at least one of its files.
const { app, BrowserWindow, Menu, dialog, ipcMain, nativeTheme, net, protocol, shell, powerSaveBlocker } = require('electron')
const fs = require('fs')
const path = require('path')
const { pathToFileURL } = require('url')
const engine = require('./engine')
const clean = require('./clean')
const tools = require('./tools')
const { execFile } = require('child_process')
const updater = require('./updater')

nativeTheme.themeSource = 'dark'
/* RoarTwin is called RoarKit since 28 Oct: its settings, its Vault and everything it keeps stay in the old folder,
   whatever the app is called, so nothing is lost when the app itself takes the new name. */
app.setPath('userData', path.join(app.getPath('appData'), 'RoarTwin'))
app.setName('RoarKit')

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
      const n = dialog.showMessageBoxSync(win, { type: 'question', buttons: ['Stop and close', 'Keep scanning'], defaultId: 1, message: 'RoarKit is still working.', detail: 'Closing the window stops it.' })
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
// make a twin: a card copied to one or more drives, every copy read back and checked (Alex, 25 Oct). It only ever
// adds files; nothing is written over or deleted.
let lastCopy = null
ipcMain.handle('twin:copy', async (e, opts) => {
  if (scanning) throw new Error('A scan is already running.')
  const dirOk = (p) => { try { return fs.statSync(String(p)).isDirectory() } catch { return false } }
  const targets = (Array.isArray(opts?.targets) ? opts.targets : []).map(String).filter(dirOk)
  if (!dirOk(opts?.source) || !targets.length) throw new Error('Choose the card and where it is copied first.')
  scanning = true; stopNow = false
  const awake = powerSaveBlocker.start('prevent-app-suspension')
  let lastTick = 0
  const tick = (t) => { const now = Date.now(); if (now - lastTick > 120 || t.done === t.total) { lastTick = now; try { e.sender.send('twin:progress', t) } catch { /* window gone */ } } }
  try {
    lastCopy = await engine.makeTwin({ source: String(opts.source), targets, folder: String(opts.folder || ''), skipHidden: opts.skipHidden !== false }, tick, () => stopNow)
    return lastCopy
  } catch (err) {
    if (err instanceof engine.Stopped) return { stopped: true }
    throw err
  } finally { scanning = false; powerSaveBlocker.stop(awake) }
})
// a drive checked again against the report its twin left, months later (Alex, 25 Oct). Reads only.
ipcMain.handle('twin:recheck', async (e, opts) => {
  if (scanning) throw new Error('A scan is already running.')
  const dirOk = (p) => { try { return fs.statSync(String(p)).isDirectory() } catch { return false } }
  if (!dirOk(opts?.folder)) throw new Error('Choose the folder a twin was made in.')
  scanning = true; stopNow = false
  const awake = powerSaveBlocker.start('prevent-app-suspension')
  let lastTick = 0
  const tick = (t) => { const now = Date.now(); if (now - lastTick > 120) { lastTick = now; try { e.sender.send('twin:progress', t) } catch { /* window gone */ } } }
  try {
    lastBackup = await engine.recheck({ folder: String(opts.folder) }, tick, () => stopNow)
    return lastBackup
  } catch (err) {
    if (err instanceof engine.Stopped) return { stopped: true }
    throw err
  } finally { scanning = false; powerSaveBlocker.stop(awake) }
})
/* a card put in (Alex, 25 Oct): the drives are looked at every few seconds, and a new one holding camera clips is
   told to the page, which offers to copy it (or not, if that is switched off there) */
let volumes = null
async function currentVolumes() {
  if (process.platform === 'darwin') return (await fs.promises.readdir('/Volumes').catch(() => [])).map((n) => path.join('/Volumes', n))
  if (process.platform === 'win32') return 'DEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((l) => l + ':\\').filter((p) => { try { return fs.existsSync(p) } catch { return false } })
  return []
}
async function watchVolumes() {
  const now = await currentVolumes()
  if (volumes) for (const v of now) if (!volumes.includes(v) && await engine.looksLikeCard(v)) { try { win?.webContents.send('twin:card', { path: v, name: path.basename(v) || v }) } catch { /* no window */ } }
  volumes = now
}
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
/* Clean up (Alex, 28 Oct): the caches of Resolve, Adobe, the apps; measured, then to the Trash only what was chosen.
   The page sends only which places; the files are listed again here, each checked against the places (clean.allowed),
   and a place whose program is open is left alone. */
const places = () => clean.catalogue({ home: app.getPath('home') })
const processes = () => new Promise((done) => {
  const [cmd, args] = process.platform === 'win32' ? ['tasklist', ['/fo', 'csv', '/nh']] : ['ps', ['-axo', 'comm=']]
  execFile(cmd, args, { maxBuffer: 8 << 20 }, (err, out) => done(err ? [] : String(out).split(/\r?\n/).map((l) => l.replace(/^"([^"]*)".*$/, '$1')).filter(Boolean)))
})
let lastClean = null
ipcMain.handle('twin:clean-look', async (e) => {
  if (scanning) throw new Error('A scan is already running.')
  scanning = true; stopNow = false
  try {
    const items = places()
    const open = clean.openApps(items, await processes())
    const tick = (r) => { try { e.sender.send('twin:clean-tick', { id: r.id, size: r.size, files: r.files }) } catch { /* window gone */ } }
    const got = await clean.measure(items, tick, () => stopNow)
    lastClean = items.map((item, i) => ({ ...item, match: undefined, skip: undefined, ...got[i], entries: undefined, count: got[i].entries.length, open: (item.apps || []).filter((a) => open.includes(a)) }))
    return lastClean
  } catch (err) {
    if (err instanceof clean.Stopped) return { stopped: true }
    throw err
  } finally { scanning = false }
})
ipcMain.handle('twin:clean', async (_e, ids) => {
  if (scanning) throw new Error('A scan is already running.')
  scanning = true; stopNow = false
  const ok = [], failed = []
  let freed = 0
  try {
    const items = places()
    const open = clean.openApps(items, await processes())
    for (const item of items.filter((i) => (Array.isArray(ids) ? ids : []).includes(i.id))) {
      const busy = (item.apps || []).filter((a) => open.includes(a))
      if (busy.length) { failed.push({ id: item.id, apps: busy, error: `Close ${busy.join(', ')} first.` }); continue }
      for (const en of await clean.entriesOf(item)) {
        if (stopNow) break
        if (!clean.allowed(items, en.path)) continue
        try { await shell.trashItem(en.path); ok.push(en.path); freed += en.size } catch (err) { failed.push({ id: item.id, path: en.path, error: String(err?.message || err) }) }
      }
    }
  } finally { scanning = false }
  return { ok: ok.length, freed, failed }
})

/* The other tools (Alex, 28 Oct: "one app, a utility of many tools"): each in electron/tools/<name>.js, given what it
   needs here. One job at a time across every tool (the same lock as a scan), the Stop button stops any of them, and
   only paths a tool has shown may be revealed or opened. */
const shown = new Set()
const ctx = {
  app, shell, dialog, engine, clean,
  ffmpeg: () => ffmpegPath(),
  win: () => win,
  allow: (...ps) => ps.flat().forEach((p) => p && shown.add(String(p))),
  stopped: () => stopNow,
  handle: (name, fn) => ipcMain.handle('tool:' + name, async (e, args) => fn(args ?? {}, { emit: (ev, v) => { try { e.sender.send('tool:' + ev, v) } catch { /* window gone */ } } })),
  /* a long job: the lock, the computer kept awake, Stop turned into { stopped: true } */
  async run(fn) {
    if (scanning) throw new Error('A scan is already running.')
    scanning = true; stopNow = false
    const awake = powerSaveBlocker.start('prevent-app-suspension')
    try { return await fn() } catch (err) {
      if (err instanceof engine.Stopped || err?.name === 'Stopped' || err?.message === 'Stopped') return { stopped: true }
      throw err
    } finally { scanning = false; powerSaveBlocker.stop(awake) }
  },
  /* a page of HTML made into a PDF the person saves (Media report, Contact sheet) */
  async savePDF(html, name, { landscape = false } = {}) {
    const { canceled, filePath } = await dialog.showSaveDialog(win, { defaultPath: name, filters: [{ name: 'PDF', extensions: ['pdf'] }] })
    if (canceled || !filePath) return ''
    // through a file, not a data: address: a sheet of many pictures is bigger than one may be
    const tmp = path.join(app.getPath('temp'), `roartwin-${process.pid}-${Date.now()}.html`)
    fs.writeFileSync(tmp, String(html), 'utf8')
    const w = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } })
    try {
      await w.loadFile(tmp)
      fs.writeFileSync(filePath, await w.webContents.printToPDF({ landscape, printBackground: true, pageSize: 'A4', margins: { marginType: 'none' } }))
    } finally { w.destroy(); fs.rmSync(tmp, { force: true }) }
    shown.add(filePath); shell.showItemInFolder(filePath)
    return filePath
  },
  /* a text file the person saves (CSV, a log) */
  async saveText(text, name, ext = 'csv') {
    const { canceled, filePath } = await dialog.showSaveDialog(win, { defaultPath: name, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] })
    if (canceled || !filePath) return ''
    fs.writeFileSync(filePath, (ext === 'csv' ? '\ufeff' : '') + String(text), 'utf8')
    shown.add(filePath); shell.showItemInFolder(filePath)
    return filePath
  },
}
tools.register(ctx)

const known = (p) => shown.has(p) || (lastClean || []).some((c) => (c.found || []).includes(p))
  || (last?.groups || []).some((g) => g.files.some((f) => f.path === p))
  || (lastBackup?.missing || []).some((f) => f.path === p || f.other === p)
  || !!lastCopy && [...lastCopy.reports, ...lastCopy.targets, ...lastCopy.failed.map((f) => f.path)].includes(p)
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
    message: 'Move RoarKit to Applications?',
    detail: 'From there RoarKit updates itself, with nothing to download or install by hand. It opens again by itself.',
  })
  if (r !== 0) return false
  try {
    // an older RoarTwin already in Applications is replaced by this one
    return app.moveToApplicationsFolder({ conflictHandler: () => true })
  } catch (e) {
    dialog.showErrorBox('RoarKit could not move itself', `${e?.message || e}\n\nDrag RoarKit into the Applications folder yourself and open it from there.`)
    return false
  }
}

app.whenReady().then(() => {
  if (offerApplications()) return
  serveApp()
  menu()
  open()
  updater.start(ipcMain, () => { quitting = true })
  watchVolumes(); setInterval(watchVolumes, 3000)
  app.on('activate', () => { if (!win) open() })
})
app.on('before-quit', () => { quitting = true; stopNow = true })
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
