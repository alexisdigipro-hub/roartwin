// RoarKit (RoarTwin until 28 Oct) for Mac and Windows (The Mad Lions Lab, Oct 2026): a utility of many tools for film people.
// The page (app/) asks; this side walks the disk, runs the engine (engine.js, with the ffmpeg that comes inside
// the app) and moves what the person chose to the computer's Trash. Nothing is ever deleted for good, and a group
// always keeps at least one of its files.
const { app, BrowserWindow, Menu, Notification, dialog, ipcMain, nativeTheme, net, protocol, screen, shell, powerSaveBlocker } = require('electron')
const fs = require('fs')
const path = require('path')
const { pathToFileURL } = require('url')
const engine = require('./engine')
const clean = require('./clean')
const tools = require('./tools')
const { execFile } = require('child_process')
const updater = require('./updater')
const jobsMod = require('./jobs')
const trayMod = require('./tray')

nativeTheme.themeSource = 'dark'
/* the look the person chose (Settings > Appearance), kept here from the last run so the window opens in it, not dark first */
const LOOK_FILE = () => path.join(app.getPath('userData'), 'look.json')
const savedTheme = () => { try { return JSON.parse(fs.readFileSync(LOOK_FILE(), 'utf8')).theme || 'dark' } catch { return 'dark' } }
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
/* as RoarMail (Alex, 30 Oct): the window's buttons sit in a 40px strip above the floating columns (theme.css --mac-top) */
const frame = process.platform === 'darwin'
  ? { titleBarStyle: 'hidden', trafficLightPosition: { x: 20, y: 13 } }
  : { titleBarStyle: 'hidden', titleBarOverlay: { color: '#1b1e23', symbolColor: '#eef0f3', height: 40 } }
const overlay = (light) => ({ color: light ? '#eceef1' : '#1b1e23', symbolColor: light ? '#1b1f25' : '#eef0f3', height: 40 })
// it opens big (Alex, 30 Oct): most of the screen, up to 1600 x 1060
function startSize() {
  const a = screen.getPrimaryDisplay().workAreaSize
  return { width: Math.min(1600, Math.round(a.width * 0.9)), height: Math.min(1060, Math.round(a.height * 0.92)) }
}

function open() {
  const th = savedTheme()
  nativeTheme.themeSource = th === 'auto' ? 'system' : th === 'light' ? 'light' : 'dark'
  const light = !nativeTheme.shouldUseDarkColors
  const look = process.platform === 'win32' ? { titleBarStyle: 'hidden', titleBarOverlay: overlay(light) } : frame
  // the page paints its own graphite backdrop behind the floating columns (RoarMail's look, 30 Oct)
  const glass = { backgroundColor: light ? '#eceef1' : '#1b1e23' }
  win = new BrowserWindow({
    ...startSize(), minWidth: 900, minHeight: 600, show: false, autoHideMenuBar: true, ...look, ...glass,
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
  // a swipe on the trackpad (Mac) and the mouse's or keyboard's back and forward keys (Windows) go back and forward
  win.on('swipe', (_e, dir) => { if (dir === 'right') send('back'); if (dir === 'left') send('forward') })
  win.on('app-command', (_e, cmd) => { if (cmd === 'browser-backward') send('back'); if (cmd === 'browser-forward') send('forward') })
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
    { label: 'View', submenu: [
      // back and forward through the screens (Alex, 28 Oct)
      { label: 'Back', accelerator: mac ? 'Cmd+[' : 'Alt+Left', click: () => send('back') },
      { label: 'Forward', accelerator: mac ? 'Cmd+]' : 'Alt+Right', click: () => send('forward') },
      { type: 'separator' },
      { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
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
    jobDone('scan')
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
    lastCopy = await engine.makeTwin({ source: String(opts.source), targets, folder: String(opts.folder || ''), skipHidden: opts.skipHidden !== false, version: app.getVersion() }, tick, () => stopNow)
    if (opts.eject && process.platform === 'darwin' && !lastCopy.failed.length && /^\/Volumes\/[^/]+\/?$/.test(String(opts.source))) {
      lastCopy.ejected = await new Promise((done) => execFile('diskutil', ['eject', String(opts.source)], { timeout: 30e3 }, (err) => done(!err)))
    }
    jobDone('copy')
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
    jobDone('backup')
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
    jobDone('backup')
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
    lastClean = items.map((item, i) => ({ ...item, match: undefined, skip: undefined, ...got[i], entries: undefined, count: got[i].entries.length, open: (item.apps || []).filter((a) => open.includes(a)),
      // the biggest things inside, so the person sees what goes before it goes (Alex, 28 Oct)
      top: [...got[i].entries].sort((a, b) => b.size - a.size).slice(0, 5).map((en) => ({ path: en.path, name: path.basename(en.path), size: en.size })) }))
    return lastClean
  } catch (err) {
    if (err instanceof clean.Stopped) return { stopped: true }
    throw err
  } finally { scanning = false }
})
/* the chosen places to the Trash: by the page's Move to Trash, and by the weekly job (Do by itself) */
async function cleanPlaces(ids) {
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
}
ipcMain.handle('twin:clean', async (_e, ids) => {
  const r = await cleanPlaces(ids)
  jobDone('clean')
  return r
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
  prefs: () => ({ ...prefs }),
  handle: (name, fn) => ipcMain.handle('tool:' + name, async (e, args) => fn(args ?? {}, { emit: (ev, v) => { try { e.sender.send('tool:' + ev, v) } catch { /* window gone */ } } })),
  /* a long job: the lock, the computer kept awake, Stop turned into { stopped: true } */
  async run(fn) {
    if (scanning) throw new Error('A scan is already running.')
    scanning = true; stopNow = false
    const awake = powerSaveBlocker.start('prevent-app-suspension')
    try { const r = await fn(); if (!r?.stopped) jobDone(); return r } catch (err) {
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

const known = (p) => shown.has(p) || (lastClean || []).some((c) => (c.found || []).includes(p) || (c.top || []).some((x) => x.path === p))
  || (last?.groups || []).some((g) => g.files.some((f) => f.path === p))
  || (lastBackup?.missing || []).some((f) => f.path === p || f.other === p)
  || !!lastCopy && [...lastCopy.reports, ...(lastCopy.mhl || []), ...lastCopy.targets, ...lastCopy.failed.map((f) => f.path)].includes(p)
ipcMain.handle('twin:reveal', (_e, p) => { if (known(String(p))) shell.showItemInFolder(String(p)) })
ipcMain.handle('twin:open', (_e, p) => (known(String(p)) ? shell.openPath(String(p)) : ''))
// the list as a CSV a spreadsheet opens (Excel, Numbers)
ipcMain.handle('twin:export', async (_e, text) => {
  const { canceled, filePath } = await dialog.showSaveDialog(win, { defaultPath: 'RoarKit duplicates.csv', filters: [{ name: 'CSV', extensions: ['csv'] }] })
  if (canceled || !filePath) return false
  fs.writeFileSync(filePath, '﻿' + String(text), 'utf8')
  shell.showItemInFolder(filePath)
  return true
})
ipcMain.handle('twin:version', () => app.getVersion())
/* Settings (Alex, 28 Oct): the look of the app's own windows, menus and scroll bars, and the end-of-job notification */
const prefs = { lang: 'en', theme: 'dark', notify: true, sound: false, company: '', companyLine: '', tray: null }
/* what must hold before the page opens (and while no window is open): the menu bar icon and the language of its menu
   and of the jobs' notifications, kept in userData/background.json */
const BG_FILE = () => path.join(app.getPath('userData'), 'background.json')
try { const v = JSON.parse(fs.readFileSync(BG_FILE(), 'utf8')); if (typeof v.tray === 'boolean') prefs.tray = v.tray; if (v.lang) prefs.lang = v.lang } catch { /* first start */ }
// the menu bar icon is on at first on a Mac (Alex, 29 Oct), off on Windows until it is chosen
const trayOn = () => (prefs.tray == null ? process.platform === 'darwin' : prefs.tray)
// the window's own colour under the page (not on a Mac, whose window is see-through for the side menu's glass)
const paintWindow = () => { if (process.platform === 'darwin') return; try { win?.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#16181d' : '#f3f4f7') } catch { /* closing */ } }
nativeTheme.on('updated', () => { if (prefs.theme === 'auto') paintWindow() })
ipcMain.handle('twin:prefs', (_e, v) => {
  const was = { tray: trayOn(), lang: prefs.lang }
  Object.assign(prefs, Object.fromEntries(Object.entries(v || {}).filter(([k]) => k in prefs && !(k === 'tray' && typeof v[k] !== 'boolean'))))
  try { fs.writeFileSync(LOOK_FILE(), JSON.stringify({ theme: prefs.theme })) } catch { /* the next start opens dark, nothing more */ }
  try { fs.writeFileSync(BG_FILE(), JSON.stringify({ tray: prefs.tray, lang: prefs.lang })) } catch { /* kept for this run */ }
  if (trayOn() !== was.tray) tray?.show(trayOn())
  else if (prefs.lang !== was.lang) tray?.relabel()
  nativeTheme.themeSource = prefs.theme === 'auto' ? 'system' : prefs.theme === 'light' ? 'light' : 'dark'
  const light = !nativeTheme.shouldUseDarkColors
  try {
    paintWindow()
    if (process.platform === 'win32') win?.setTitleBarOverlay(overlay(light))
  } catch { /* an older window */ }
  return true
})
/* a long job ended while the person was in another app: say so (Settings > When a job ends) */
const DONE = {
  en: { scan: 'The twins are found.', copy: 'The card is copied and checked.', backup: 'The backup check is done.', clean: 'Clean up is done.', job: 'The job is done.' },
  el: { scan: 'Βρέθηκαν τα διπλά.', copy: 'Η κάρτα αντιγράφηκε και ελέγχθηκε.', backup: 'Ο έλεγχος του backup τελείωσε.', clean: 'Το καθάρισμα τελείωσε.', job: 'Η δουλειά τελείωσε.' },
}
function jobDone(kind = 'job') {
  if (!prefs.notify || !win || win.isFocused()) return
  try {
    if (Notification.isSupported()) new Notification({ title: 'RoarKit', body: (DONE[prefs.lang] || DONE.en)[kind] || DONE.en.job, silent: !prefs.sound }).show()
    if (process.platform === 'darwin') app.dock?.bounce('informational')
    else win.flashFrame(true)
  } catch { /* no notifications here */ }
}
/* ---------- Do by itself (Alex, 29 Oct): the weekly Clean up and the monthly backup check, see jobs.js ---------- */
const JOB_TEXT = {
  en: { clean: 'Clean up by itself: {a} moved to the Trash.', cleanNone: 'Clean up by itself: nothing to clear.', cleanSkip: ' Left alone while open: {a}.',
    backup: 'Backup check by itself: {a} of {b} files as they were.', backupBad: 'Backup check by itself: {a} files changed or gone. Open RoarKit to see them.', backupGone: ' Not connected: {a}.', fail: 'A job by itself did not run: {a}' },
  el: { clean: 'Καθάρισμα μόνο του: {a} πήγαν στον Κάδο.', cleanNone: 'Καθάρισμα μόνο του: τίποτα για καθάρισμα.', cleanSkip: ' Έμειναν όσο είναι ανοιχτά: {a}.',
    backup: 'Έλεγχος backup μόνος του: {a} από {b} αρχεία όπως ήταν.', backupBad: 'Έλεγχος backup μόνος του: {a} αρχεία άλλαξαν ή χάθηκαν. Άνοιξε το RoarKit για να τα δεις.', backupGone: ' Δεν είναι συνδεδεμένοι: {a}.', fail: 'Μια αυτόματη δουλειά δεν έγινε: {a}' },
}
const jt = (k, vars = {}) => String((JOB_TEXT[prefs.lang] || JOB_TEXT.en)[k]).replace(/\{(\w+)\}/g, (_, x) => vars[x] ?? '')
const gbText = (n) => trayMod.gb(n)
/* each job's work, with the same lock as every other job of the app; the result is kept as data (the page writes it
   in its own words) and as a sentence for the notification */
async function runJob(id, cfg) {
  if (id === 'clean') {
    // the safe caches only: what Clean up chooses at first, never the installers in Downloads
    const ids = places().filter((i) => i.on && i.kind === 'inside').map((i) => i.id)
    const r = await cleanPlaces(ids)
    const skipped = [...new Set(r.failed.filter((f) => f.apps).flatMap((f) => f.apps))]
    return { freed: r.freed, files: r.ok, skipped, text: (r.freed ? jt('clean', { a: gbText(r.freed) }) : jt('cleanNone')) + (skipped.length ? jt('cleanSkip', { a: skipped.join(', ') }) : '') }
  }
  if (id === 'backup') {
    const folders = []
    for (const folder of cfg.folders || []) {
      if (!fs.existsSync(folder)) { folders.push({ folder, error: 'gone' }); continue }
      if (scanning) throw new Error('A scan is already running.')
      scanning = true; stopNow = false
      const awake = powerSaveBlocker.start('prevent-app-suspension')
      try {
        const r = await engine.recheck({ folder })
        folders.push({ folder, total: r.total, safe: r.safe, changed: r.missing.filter((m) => m.why === 'changed').length, gone: r.missing.filter((m) => m.why === 'gone').length, when: r.when })
      } catch (err) { folders.push({ folder, error: String(err?.message || err) }) } finally { scanning = false; powerSaveBlocker.stop(awake) }
    }
    const total = folders.reduce((n, f) => n + (f.total || 0), 0), safe = folders.reduce((n, f) => n + (f.safe || 0), 0)
    const away = folders.filter((f) => f.error).map((f) => path.basename(f.folder) || f.folder)
    const problem = safe < total || away.length > 0 || !folders.length
    return { folders, problem, text: (safe < total ? jt('backupBad', { a: total - safe }) : jt('backup', { a: safe, b: total })) + (away.length ? jt('backupGone', { a: away.join(', ') }) : '') }
  }
  throw new Error('No such job.')
}
let jobs = null
function startJobs() {
  jobs = jobsMod.create({
    file: path.join(app.getPath('userData'), 'jobs.json'),
    run: runJob,
    busy: () => scanning,
    notify: (e) => {
      try { if (Notification.isSupported()) new Notification({ title: 'RoarKit', body: e.text || jt('fail', { a: '' }), silent: !prefs.sound }).show() } catch { /* no notifications */ }
      try { win?.webContents.send('twin:jobs', jobs.get()) } catch { /* no window */ }
    },
  })
  // a job missed while RoarKit was closed runs soon after the start, then each on its time
  setTimeout(() => jobs.tick(), 20e3)
  setInterval(() => jobs.tick(), 60e3)
}
ipcMain.handle('twin:jobs', () => jobs?.get() || null)
ipcMain.handle('twin:jobs-set', (_e, cfg) => jobs?.set(cfg || {}) || null)
ipcMain.handle('twin:jobs-run', async (_e, id) => { await jobs?.runNow(String(id)); return jobs?.get() || null })
ipcMain.handle('twin:tray', () => trayOn())

/* the menu bar (tray.js): open the window, on a tool when one is asked */
let tray = null
function showApp(tool) {
  if (!win) open()
  if (win.isMinimized()) win.restore()
  win.show(); win.focus()
  if (tool) { const go = () => send('go:' + tool); if (win.webContents.isLoading()) win.webContents.once('did-finish-load', go); else go() }
}

ipcMain.handle('twin:has-ffmpeg', () => { const p = ffmpegPath(); return !!p && fs.existsSync(p) })

if (!app.requestSingleInstanceLock()) app.quit()
app.on('second-instance', () => showApp(''))
/* RoarKit can update itself only where it may replace itself: in Applications, not opened straight from the .dmg
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
  startJobs()
  tray = trayMod.create({ open: showApp, lang: () => prefs.lang })
  if (trayOn()) tray.show(true)
  app.on('activate', () => { if (!win) open() })
})
app.on('before-quit', () => { quitting = true; stopNow = true })
// with the menu bar icon on, Windows keeps RoarKit running in the notification area (its jobs go on)
app.on('window-all-closed', () => { if (process.platform !== 'darwin' && !tray?.on()) app.quit() })
