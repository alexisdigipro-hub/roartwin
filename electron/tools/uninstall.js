// Uninstall apps (Alex, 29 Oct): the apps on the computer, each with its version, size and the last time it was opened.
// On a Mac an app is its .app; what it leaves in ~/Library (its settings, caches, containers, saved state, logs, login
// agents) is found by its bundle id and its name, each with its size, and the app and the leftovers chosen go to the
// Trash together. On Windows an app is an entry in the system's list of installed programs (the Uninstall keys of the
// registry), and its own uninstaller is run after a confirm. Never macOS's own apps or Apple's, never RoarKit itself,
// never an app that is open. Nothing is deleted: only the Trash (shell.trashItem).
const fs = require('fs')
const fsp = fs.promises
const path = require('path')
const { execFile, spawn } = require('child_process')
const { parsePlist } = require('./drives')

const run = (cmd, args, ms = 20e3) => new Promise((ok) => {
  try { execFile(cmd, args, { maxBuffer: 32 << 20, timeout: ms, windowsHide: true }, (err, out) => ok(err && !out ? '' : String(out || ''))) } catch { ok('') }
})

/* ---------- Mac: the apps ---------- */
const SELF_ID = 'com.themadlions.roartwin'
/* an app's Info.plist: XML as it is, a binary one through plutil (Mac) */
async function readPlist(file) {
  let buf
  try { buf = await fsp.readFile(file) } catch { return null }
  if (buf.subarray(0, 6).toString() === 'bplist') {
    if (process.platform !== 'darwin') return null
    return parsePlist(await run('plutil', ['-convert', 'xml1', '-o', '-', file], 10e3)) || null
  }
  return parsePlist(buf.toString('utf8')) || null
}
/* the .app bundles in the folders given, and one folder deeper (Adobe puts its apps in a folder of their own) */
async function findBundles(dirs) {
  const out = []
  for (const dir of dirs) {
    let list = []
    try { list = await fsp.readdir(dir, { withFileTypes: true }) } catch { continue }
    for (const e of list) {
      if (!e.isDirectory() || e.name.startsWith('.')) continue
      const p = path.join(dir, e.name)
      if (/\.app$/i.test(e.name)) { out.push(p); continue }
      let inner = []
      try { inner = await fsp.readdir(p, { withFileTypes: true }) } catch { continue }
      for (const i of inner) if (i.isDirectory() && /\.app$/i.test(i.name)) out.push(path.join(p, i.name))
    }
  }
  return [...new Set(out)]
}
/* what an app is, from its Info.plist */
async function appInfo(bundle) {
  const info = (await readPlist(path.join(bundle, 'Contents', 'Info.plist'))) || {}
  const base = path.basename(bundle).replace(/\.app$/i, '')
  return {
    path: bundle, name: String(info.CFBundleDisplayName || info.CFBundleName || base), file: base,
    id: String(info.CFBundleIdentifier || ''), version: String(info.CFBundleShortVersionString || info.CFBundleVersion || ''),
    exe: String(info.CFBundleExecutable || base),
  }
}
/* why an app may not be removed here ('' when it may) */
function refusal(app, { running = [] } = {}) {
  const id = String(app.id || '').toLowerCase()
  if (/^\/system\//i.test(app.path) || /^\/(usr|bin|sbin)\//.test(app.path)) return 'It is part of macOS.'
  if (id.startsWith('com.apple.')) return 'It is one of Apple\'s own apps.'
  if (id === SELF_ID || /^(roarkit|roartwin)$/i.test(app.file || app.name || '')) return 'RoarKit cannot remove itself.'
  if (isRunning(app, running)) return 'It is open. Quit it first.'
  return ''
}
/* is it open: a program running from inside the bundle */
const isRunning = (app, running) => running.some((p) => p === app.path || p.startsWith(app.path + '/'))
/* the programs running now, by the path they were started from */
async function runningNow() {
  if (process.platform === 'win32') return []
  return (await run('ps', ['-axo', 'comm='], 8e3)).split('\n').map((l) => l.trim()).filter(Boolean)
}
/* "2026-10-20 08:12:44 +0000" from mdls -raw, or "(null)" */
const parseMdlsDate = (s) => { const m = String(s || '').match(/(\d{4}-\d\d-\d\d) (\d\d:\d\d:\d\d) ([+-]\d{4})/); if (!m) return 0; const t = Date.parse(`${m[1]}T${m[2]}${m[3].slice(0, 3)}:${m[3].slice(3)}`); return Number.isFinite(t) ? t : 0 }

/* everything in a folder (or a file): its size in bytes; links are not followed */
async function sizeOf(p) {
  let st
  try { st = await fsp.lstat(p) } catch { return 0 }
  if (!st.isDirectory()) return st.isFile() ? st.size : 0
  let size = 0
  const dirs = [p]
  while (dirs.length) {
    const d = dirs.pop()
    let list = []
    try { list = await fsp.readdir(d, { withFileTypes: true }) } catch { continue }
    for (const e of list) {
      const q = path.join(d, e.name)
      if (e.isSymbolicLink()) continue
      if (e.isDirectory()) dirs.push(q)
      else if (e.isFile()) { try { size += (await fsp.lstat(q)).size } catch { /* gone */ } }
    }
  }
  return size
}
async function pool(items, n, fn) {
  let i = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k) } }))
}

/* ---------- Mac: what an app leaves in ~/Library ---------- */
const PLACES = ['Application Support', 'Caches', 'Preferences', 'Containers', 'Group Containers', 'Saved Application State', 'Logs', 'HTTPStorages', 'WebKit', 'LaunchAgents']
// a folder named after the app counts only in these, and only for a name that is not a word many share
const BY_NAME = new Set(['Application Support', 'Caches', 'Logs', 'WebKit', 'HTTPStorages'])
const SHARED = new Set(['adobe', 'apple', 'google', 'microsoft', 'common', 'default', 'cache', 'caches', 'data', 'logs', 'log', 'support', 'temp', 'tmp', 'app', 'apps', 'helper', 'update', 'updater', 'crashpad', 'crashreporter', 'diagnostics', 'electron', 'chromium', 'java', 'oracle', 'mozilla', 'macos', 'library', 'preferences', 'settings', 'plugins'])
/* does this entry of ~/Library/<where> belong to the app? 'id' (by its bundle id), 'name' (by its name) or '' */
function matchOf(entry, where, app, others = []) {
  const n = entry.toLowerCase()
  const id = String(app.id || '').toLowerCase()
  // an entry that belongs to another app whose id starts with this one's (com.foo.bar and com.foo.bar.pro) is not its
  const theirs = others.map((o) => String(o || '').toLowerCase()).filter((o) => o && o !== id && o.startsWith(id + '.'))
  const ofId = (x) => x === id || x.startsWith(id + '.')
  if (id.split('.').length >= 3 || (id.split('.').length === 2 && id.length >= 8)) {
    let byId = ofId(n)
    // Group Containers are named TEAMID.com.foo.bar or group.com.foo.bar
    if (!byId && where === 'Group Containers') { const rest = n.replace(/^(group\.|[a-z0-9]{10}\.)/, ''); byId = rest !== n && ofId(rest) }
    if (byId && !theirs.some((o) => n === o || n.startsWith(o + '.') || n.endsWith('.' + o))) return 'id'
  }
  if (BY_NAME.has(where)) {
    for (const name of new Set([app.name, app.file].filter(Boolean).map((x) => String(x).toLowerCase()))) {
      if (name.length >= 3 && !SHARED.has(name) && n === name) return 'name'
    }
  }
  return ''
}
/* leftoversFor(home, app, others) -> [{ path, name, where, by, size }], biggest first */
async function leftoversFor(home, app, others = []) {
  const out = []
  const lib = path.join(home, 'Library')
  for (const where of PLACES) {
    const dir = path.join(lib, where)
    let list = []
    try { list = await fsp.readdir(dir) } catch { continue }
    for (const name of list) {
      const by = matchOf(name, where, app, others)
      if (!by) continue
      const p = path.join(dir, name)
      out.push({ path: p, name, where, by, size: await sizeOf(p) })
    }
  }
  return out.sort((a, b) => b.size - a.size)
}
/* only what leftoversFor found for this app, inside ~/Library, never ~/Library itself or one of its places */
function mayTrashLeftover(found, p, home) {
  const lib = path.join(home, 'Library')
  if (typeof p !== 'string' || path.resolve(p) !== p || !p.startsWith(lib + path.sep)) return false
  if (PLACES.some((w) => p === path.join(lib, w))) return false
  return found.some((f) => f.path === p)
}

/* ---------- Windows: the Uninstall keys of the registry ---------- */
const UNINSTALL_KEYS = [
  'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
]
/* reg query <key> /s: blocks of a key's path and its values ("    Name    REG_SZ    value") */
function parseRegQuery(text) {
  const out = []
  let cur = null
  for (const raw of String(text || '').split(/\r?\n/)) {
    if (/^HKEY_/i.test(raw)) { cur = { key: raw.trim(), values: {}, types: {} }; out.push(cur); continue }
    const m = raw.match(/^ {4}(.+?) {4}(REG_[A-Z_]+)(?: {4}(.*))?$/)
    if (m && cur) {
      let v = m[3] ?? ''
      if (m[2] === 'REG_DWORD' || m[2] === 'REG_QWORD') v = parseInt(v, 16)
      cur.values[m[1] === '(Default)' ? '' : m[1]] = v
      cur.types[m[1] === '(Default)' ? '' : m[1]] = m[2]
    }
  }
  return out
}
/* the installed programs a person would recognise: a name and an uninstaller; not system parts, not updates */
function winApps(blocks) {
  const seen = new Set(), out = []
  for (const b of blocks) {
    const v = b.values
    const name = String(v.DisplayName || '').trim()
    if (!name || !(v.UninstallString || v.QuietUninstallString)) continue
    if (v.SystemComponent === 1 || v.ParentKeyName || /^(update|hotfix|security update)$/i.test(String(v.ReleaseType || ''))) continue
    const k = name.toLowerCase() + '|' + String(v.DisplayVersion || '')
    if (seen.has(k)) continue
    seen.add(k)
    const d = String(v.InstallDate || '').match(/^(\d{4})(\d\d)(\d\d)$/)
    out.push({
      id: b.key, path: String(v.InstallLocation || '').trim(), name, file: name, version: String(v.DisplayVersion || ''), publisher: String(v.Publisher || ''),
      size: Number.isFinite(v.EstimatedSize) ? v.EstimatedSize * 1024 : 0, installed: d ? Date.parse(`${d[1]}-${d[2]}-${d[3]}T12:00:00`) : 0,
      uninstall: String(v.UninstallString || v.QuietUninstallString), user: /^HKEY_CURRENT_USER/i.test(b.key),
    })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}
/* why a Windows program may not be removed here */
const winRefusal = (a) => (/^(roarkit|roartwin)\b/i.test(a.name) ? 'RoarKit cannot remove itself.' : '')
/* the command an uninstall string runs; an MSI's /I (change) becomes /X (remove) */
const uninstallCommand = (s) => String(s || '').trim().replace(/^(msiexec(?:\.exe)?\s+)\/I\s*(\{[0-9A-F-]+\})/i, '$1/X$2')

/* ---------- the doors ---------- */
let last = null // { apps: Map(path|id -> app), others: [ids] }
let lastLeft = null // { app, found }
async function listMac(ctx, emit) {
  const home = ctx.app.getPath('home')
  const bundles = await findBundles(['/Applications', '/Applications/Utilities', path.join(home, 'Applications')])
  const running = await runningNow()
  const apps = []
  let done = 0
  await pool(bundles, 4, async (b) => {
    const a = await appInfo(b)
    const [du, md] = await Promise.all([run('du', ['-sk', b], 60e3), run('mdls', ['-raw', '-name', 'kMDItemLastUsedDate', b], 8e3)])
    a.size = (parseInt(du, 10) || 0) * 1024
    a.lastUsed = parseMdlsDate(md)
    a.refusal = refusal(a, { running })
    apps.push(a)
    done++; emit('uninstall-progress', { done, total: bundles.length, name: a.name })
  })
  return apps.sort((x, y) => x.name.localeCompare(y.name))
}
async function listWin() {
  const blocks = []
  for (const k of UNINSTALL_KEYS) blocks.push(...parseRegQuery(await run('reg', ['query', k, '/s'], 30e3)))
  return winApps(blocks).map((a) => ({ ...a, refusal: winRefusal(a) }))
}

function register(ctx) {
  ctx.handle('uninstall-list', (_a, { emit }) => ctx.run(async () => {
    const apps = process.platform === 'darwin' ? await listMac(ctx, emit) : process.platform === 'win32' ? await listWin() : []
    last = { apps: new Map(apps.map((a) => [a.path || a.id, a])), others: apps.map((a) => a.id) }
    ctx.allow(apps.map((a) => a.path).filter(Boolean))
    return { apps, platform: process.platform, at: Date.now() }
  }))
  // what a Mac app leaves in ~/Library
  ctx.handle('uninstall-leftovers', async ({ path: p }) => {
    const app = last?.apps.get(String(p || ''))
    if (!app || process.platform !== 'darwin') throw new Error('List the apps again.')
    const found = await leftoversFor(ctx.app.getPath('home'), app, last.others)
    lastLeft = { app, found }
    ctx.allow(found.map((f) => f.path))
    return { found }
  })
  // the app and the leftovers chosen, to the Trash (Mac)
  ctx.handle('uninstall-trash', async ({ path: p, leftovers }) => {
    const app = last?.apps.get(String(p || ''))
    if (!app || process.platform !== 'darwin') throw new Error('List the apps again.')
    const why = refusal(app, { running: await runningNow() })
    if (why) throw new Error(why)
    const home = ctx.app.getPath('home')
    const found = lastLeft?.app === app ? lastLeft.found : []
    const ok = [], failed = []
    let freed = 0
    try { await ctx.shell.trashItem(app.path); ok.push(app.path); freed += app.size || 0 } catch (err) { throw new Error(/permission|not permitted|denied/i.test(String(err?.message)) ? 'macOS did not let RoarKit move it. Drag it to the Trash in the Finder.' : String(err?.message || err)) }
    const uid = typeof process.getuid === 'function' ? process.getuid() : null
    for (const l of (Array.isArray(leftovers) ? leftovers : []).map(String)) {
      if (!mayTrashLeftover(found, l, home)) { failed.push({ path: l, error: 'Only what was found for this app.' }); continue }
      // a login agent of the app stops first, so nothing keeps running from the Trash
      if (/[\\/]LaunchAgents[\\/][^\\/]+\.plist$/i.test(l) && uid != null) await run('launchctl', ['bootout', `gui/${uid}`, l], 8e3)
      try { await ctx.shell.trashItem(l); ok.push(l); freed += found.find((f) => f.path === l)?.size || 0 } catch (err) { failed.push({ path: l, error: String(err?.message || err) }) }
    }
    last.apps.delete(app.path)
    return { ok, failed, freed }
  })
  // Windows: the program's own uninstaller, after the page asked
  ctx.handle('uninstall-run', async ({ id }) => {
    const app = last?.apps.get(String(id || ''))
    if (!app || process.platform !== 'win32') throw new Error('List the apps again.')
    if (app.refusal) throw new Error(app.refusal)
    const cmd = uninstallCommand(app.uninstall)
    if (!cmd) throw new Error('This program has no uninstaller.')
    await new Promise((ok, bad) => {
      const p = spawn(cmd, [], { shell: true, detached: true, stdio: 'ignore', windowsHide: false })
      p.on('error', bad); p.on('spawn', ok); p.unref()
    })
    return { started: true, name: app.name }
  })
}

module.exports = { register, readPlist, findBundles, appInfo, refusal, isRunning, parseMdlsDate, sizeOf, matchOf, leftoversFor, mayTrashLeftover, parseRegQuery, winApps, winRefusal, uninstallCommand, PLACES }
