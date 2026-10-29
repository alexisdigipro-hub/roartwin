// The menu bar (Alex, 29 Oct): a small RoarKit icon in the Mac's menu bar (the notification area on Windows), a choice
// in Settings, on at first on a Mac. Its menu shows the start-up disk's free space, the memory pressure and the heat
// level, and opens RoarKit, its Overview or Clean up. It tells, once each time it happens (not again until it has
// passed and come back), when the start-up disk falls under 10% free, when a drive reports it is failing (SMART), and
// when the computer gets seriously hot. It reads what Computer stats and Drive health read (electron/tools/stats.js,
// drives.js). The icon is drawn here (a toolbox, black on clear: macOS colours it for the menu bar). Plain functions
// (the alerts, the lines, the icon) are tested by test/tray.test.js; Electron is asked for only in create().
const fs = require('fs')
const os = require('os')
const path = require('path')
const zlib = require('zlib')

/* ---------- a PNG, written by hand (no dependencies) ---------- */
const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
function png(w, h, rgba) {
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, c]) }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4)
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
/* the toolbox: a box with a handle and a lid line, in black, its edges smoothed (4x4 samples a pixel) */
function inBox(x, y) {
  const rr = (x0, y0, x1, y1, r) => { const cx = Math.max(x0 + r, Math.min(x1 - r, x)), cy = Math.max(y0 + r, Math.min(y1 - r, y)); return (x - cx) ** 2 + (y - cy) ** 2 <= r * r && x >= x0 && x <= x1 && y >= y0 && y <= y1 }
  const body = rr(0.06, 0.34, 0.94, 0.9, 0.12)
  const lid = y > 0.5 && y < 0.585 && x > 0.06 && x < 0.94
  const latch = rr(0.42, 0.45, 0.58, 0.66, 0.04)
  const handle = rr(0.3, 0.1, 0.7, 0.4, 0.1) && !rr(0.39, 0.19, 0.61, 0.42, 0.04)
  return (body && !lid) || latch || handle
}
function iconPNG(size) {
  const out = Buffer.alloc(size * size * 4)
  const S = 4
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let n = 0
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) if (inBox((x + (i + 0.5) / S) / size, (y + (j + 0.5) / S) / size)) n++
    out[(y * size + x) * 4 + 3] = Math.round((n / (S * S)) * 255)
  }
  return png(size, size, out)
}

/* ---------- what the menu says and when it tells ---------- */
const WORDS = {
  en: { disk: 'Start-up disk: {a} free ({p}%)', diskNone: 'Start-up disk: not read yet', mem: 'Memory: {a}', heat: 'Heat: {a}', open: 'Open RoarKit', home: 'Overview', clean: 'Clean up', quit: 'Quit RoarKit',
    normal: 'normal', warning: 'under pressure', critical: 'full', nominal: 'normal', fair: 'warm', serious: 'hot', unknown: 'not reported',
    lowT: 'The start-up disk is nearly full', lowB: 'Only {a} free ({p}%). Clean up or the Space map can make room.',
    failT: 'A drive is failing', failB: '{a} reports it is failing. Copy what is on it to another drive now.',
    hotT: 'The computer is hot', hotB: 'It slows itself down to cool off. Give it air; close what works hard.' },
  el: { disk: 'Δίσκος εκκίνησης: {a} ελεύθερα ({p}%)', diskNone: 'Δίσκος εκκίνησης: δεν διαβάστηκε ακόμα', mem: 'Μνήμη: {a}', heat: 'Θερμοκρασία: {a}', open: 'Άνοιγμα RoarKit', home: 'Επισκόπηση', clean: 'Καθάρισμα', quit: 'Έξοδος από το RoarKit',
    normal: 'κανονική', warning: 'πιέζεται', critical: 'γεμάτη', nominal: 'κανονική', fair: 'ζεστός', serious: 'καίει', unknown: 'δεν αναφέρεται',
    lowT: 'Ο δίσκος εκκίνησης σχεδόν γέμισε', lowB: 'Μόνο {a} ελεύθερα ({p}%). Το Καθάρισμα ή ο Χάρτης χώρου κάνουν χώρο.',
    failT: 'Ένας δίσκος χαλάει', failB: 'Ο {a} αναφέρει ότι χαλάει. Αντίγραψε τώρα ό,τι έχει σε άλλον δίσκο.',
    hotT: 'Ο υπολογιστής ζεστάθηκε', hotB: 'Επιβραδύνεται για να κρυώσει. Άφησέ τον να αναπνεύσει· κλείσε ό,τι δουλεύει πολύ.' },
}
const say = (lang, k, vars = {}) => String((WORDS[lang] || WORDS.en)[k] ?? WORDS.en[k] ?? k).replace(/\{(\w+)\}/g, (_, v) => vars[v] ?? '')
const gb = (n) => { if (!(n >= 0)) return '?'; const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0; while (n >= 1000 && i < u.length - 1) { n /= 1000; i++ } return (n >= 10 || i < 3 ? Math.round(n) : n.toFixed(1)) + ' ' + u[i] }
const pct = (r) => (r?.boot?.total ? Math.round((r.boot.free / r.boot.total) * 100) : null)

/* what the reading means: { low, failing: [names], hot } */
function stateOf(r) {
  const p = r?.boot?.total ? r.boot.free / r.boot.total : 1
  return { low: p < 0.1, failing: [...new Set((r?.drives || []).filter((d) => d.health === 'failing').map((d) => d.mounts?.[0]?.name || d.name))].sort(), hot: r?.heat === 'serious' || r?.heat === 'critical' }
}
/* what to tell: only what has just begun (a state that was not, or a drive not failing before) -> { state, notes } */
function alerts(prev, r, lang = 'en') {
  const now = stateOf(r), was = prev || { low: false, failing: [], hot: false }
  // the drives are read less often: until they are read again, what was known stands
  if (!r?.drives) now.failing = was.failing
  const notes = []
  if (now.low && !was.low) notes.push({ id: 'low', title: say(lang, 'lowT'), body: say(lang, 'lowB', { a: gb(r.boot.free), p: pct(r) }), tool: 'space' })
  for (const d of now.failing) if (!was.failing.includes(d)) notes.push({ id: 'fail:' + d, title: say(lang, 'failT'), body: say(lang, 'failB', { a: d }), tool: 'drives' })
  if (now.hot && !was.hot) notes.push({ id: 'hot', title: say(lang, 'hotT'), body: say(lang, 'hotB'), tool: 'stats' })
  return { state: now, notes }
}
/* the menu's reading lines and the short title beside the icon */
function lines(r, lang = 'en') {
  const p = pct(r)
  return {
    disk: r?.boot?.total ? say(lang, 'disk', { a: gb(r.boot.free), p }) : say(lang, 'diskNone'),
    mem: say(lang, 'mem', { a: say(lang, r?.pressure || 'unknown') }),
    heat: say(lang, 'heat', { a: say(lang, r?.heat || 'unknown') }),
    title: r?.boot?.total ? gb(r.boot.free) : '',
  }
}

/* ---------- the readings ---------- */
const bootPath = () => (process.platform === 'win32' ? (process.env.SystemDrive || 'C:') + '\\' : '/')
function bootSpace(p = bootPath()) {
  try { const s = fs.statfsSync(p); return { free: s.bavail * s.bsize, total: s.blocks * s.bsize } } catch { return null }
}
function pressureNow(stats) {
  if (process.platform === 'darwin') {
    try { return stats.parsePressure(require('child_process').execFileSync('sysctl', ['-n', 'kern.memorystatus_vm_pressure_level'], { encoding: 'utf8', timeout: 3000 })) || '' } catch { return '' }
  }
  const free = os.freemem() / os.totalmem()
  return free < 0.05 ? 'critical' : free < 0.12 ? 'warning' : 'normal'
}

/* create({ app, open(tool), lang() }) -> { show(on), refresh() } */
function create({ open, lang = () => 'en', every = 60e3, drivesEvery = 15 * 60e3 }) {
  const { Tray, Menu, nativeImage, Notification, powerMonitor, app } = require('electron')
  const stats = require('./tools/stats'), drives = require('./tools/drives')
  let tray = null, timer = null, state = null, last = null, drivesAt = 0, drivesNow = null
  const image = () => {
    if (process.platform === 'darwin') {
      const img = nativeImage.createFromBuffer(iconPNG(36), { scaleFactor: 2 })
      img.addRepresentation({ scaleFactor: 1, buffer: iconPNG(18) })
      img.setTemplateImage(true)
      return img
    }
    // Windows: the app's own icon, small
    return nativeImage.createFromPath(path.join(__dirname, '..', 'app', 'icon.png')).resize({ width: 16, height: 16 })
  }
  const menu = () => {
    const l = lines(last, lang())
    tray?.setContextMenu(Menu.buildFromTemplate([
      { label: l.disk, enabled: false }, { label: l.mem, enabled: false }, { label: l.heat, enabled: false },
      { type: 'separator' },
      { label: say(lang(), 'open'), click: () => open('') },
      { label: say(lang(), 'home'), click: () => open('home') },
      { label: say(lang(), 'clean'), click: () => open('clean') },
      { type: 'separator' },
      { label: say(lang(), 'quit'), click: () => app.quit() },
    ]))
    if (process.platform === 'darwin') tray?.setTitle(l.title ? ' ' + l.title : '', { fontType: 'monospacedDigit' })
    tray?.setToolTip(`RoarKit · ${l.disk}`)
  }
  async function refresh() {
    let heat = ''
    try { heat = powerMonitor.getCurrentThermalState?.() || '' } catch { /* not on this system */ }
    if (Date.now() - drivesAt > drivesEvery) { drivesAt = Date.now(); try { drivesNow = await drives.readDrives() } catch { drivesNow = null } }
    const r = { boot: bootSpace(), pressure: pressureNow(stats), heat: heat === 'unknown' ? '' : heat, drives: drivesNow }
    last = r
    const a = alerts(state, r, lang())
    state = a.state
    for (const n of a.notes) {
      try { if (Notification.isSupported()) { const x = new Notification({ title: n.title, body: n.body }); x.on('click', () => open(n.tool)); x.show() } } catch { /* no notifications */ }
    }
    menu()
    return r
  }
  return {
    show(on) {
      if (on && !tray) {
        tray = new Tray(image())
        if (process.platform === 'win32') tray.on('click', () => open(''))
        menu(); refresh()
        timer = setInterval(refresh, every)
      } else if (!on && tray) { clearInterval(timer); tray.destroy(); tray = null }
    },
    on: () => !!tray,
    refresh,
    relabel: () => menu(),
  }
}

module.exports = { create, png, crc32, iconPNG, alerts, stateOf, lines, say, gb, bootSpace }
