// Startup items (Alex, 29 Oct): what starts by itself with the computer, and a switch to turn each off and on again.
// Mac: the login items (System Events), and the launch agents and daemons (their plists in ~/Library/LaunchAgents,
// /Library/LaunchAgents, /Library/LaunchDaemons: the label, the program, whether it starts at login, whether it is loaded
// now per launchctl list). Windows: the Run keys of the registry (the person's and the computer's) and the Startup folders.
// Turning off is never a delete: a person's own launch agent is stopped (launchctl bootout) and its plist moved into
// RoarKit's "Disabled startup items" folder; a login item is removed through System Events and remembered; a Run value
// is saved before it is taken out of the registry; a Startup folder shortcut is moved aside. Each can be turned back on
// from what was kept. What is set for every user (/Library, HKLM, the common Startup folder) is shown, not changed.
const fs = require('fs')
const fsp = fs.promises
const path = require('path')
const { execFile } = require('child_process')
const { parsePlist } = require('./drives')
const { parseRegQuery } = require('./uninstall')

const run = (cmd, args, ms = 15e3) => new Promise((ok) => {
  try { execFile(cmd, args, { maxBuffer: 16 << 20, timeout: ms, windowsHide: true }, (err, out, se) => ok({ ok: !err, out: String(out || ''), err: String(se || err?.message || '') })) } catch (e) { ok({ ok: false, out: '', err: String(e?.message || e) }) }
})

/* ---------- parsers ---------- */
/* AppleScript's own way of writing a value (osascript -s s): {{"a", "b"}, {"/x", missing value}, {false, true}} */
function parseAppleScript(text) {
  const s = String(text || '').trim()
  let i = 0
  const ws = () => { while (i < s.length && /\s/.test(s[i])) i++ }
  function value() {
    ws()
    if (s[i] === '{') {
      i++; const list = []; ws()
      if (s[i] === '}') { i++; return list }
      for (;;) { list.push(value()); ws(); if (s[i] === ',') { i++; continue } if (s[i] === '}') { i++; return list } throw new Error('bad list') }
    }
    if (s[i] === '"') {
      i++; let out = ''
      while (i < s.length && s[i] !== '"') { if (s[i] === '\\' && i + 1 < s.length) { i++; out += s[i] === 'n' ? '\n' : s[i] === 't' ? '\t' : s[i] } else out += s[i]; i++ }
      i++; return out
    }
    const m = s.slice(i).match(/^(missing value|true|false|-?\d+(?:\.\d+)?)/)
    if (!m) throw new Error('bad value')
    i += m[0].length
    return m[0] === 'missing value' ? null : m[0] === 'true' ? true : m[0] === 'false' ? false : Number(m[0])
  }
  try { return value() } catch { return null }
}
/* the login items as System Events lists them: names, paths, hidden */
function parseLoginItems(text) {
  const v = parseAppleScript(text)
  if (!Array.isArray(v) || v.length < 1 || !Array.isArray(v[0])) return []
  const [names, paths = [], hidden = []] = v
  return names.map((name, k) => ({ name: String(name ?? ''), path: paths[k] == null ? '' : String(paths[k]), hidden: hidden[k] === true })).filter((x) => x.name)
}
/* a launchd plist: its label, the program, whether it starts at login and stays alive, whether it is switched off in it */
function parseAgent(xml, file = '') {
  const p = parsePlist(xml)
  if (!p || typeof p !== 'object' || Array.isArray(p)) return null
  const args = Array.isArray(p.ProgramArguments) ? p.ProgramArguments.map(String) : []
  const program = String(p.Program || args[0] || '')
  return {
    label: String(p.Label || path.basename(file).replace(/\.plist$/i, '')), program, args,
    runAtLoad: p.RunAtLoad === true, keepAlive: p.KeepAlive === true || (typeof p.KeepAlive === 'object' && p.KeepAlive !== null),
    disabled: p.Disabled === true, interval: Number(p.StartInterval) || 0,
  }
}
/* launchctl list: "PID\tStatus\tLabel" -> Map(label -> { pid, status }) */
function parseLaunchctl(text) {
  const out = new Map()
  for (const line of String(text || '').split('\n').slice(1)) {
    const m = line.match(/^(\S+)\t(\S+)\t(.+)$/)
    if (m) out.set(m[3].trim(), { pid: m[1] === '-' ? null : Number(m[1]), status: Number(m[2]) })
  }
  return out
}
/* reg query of a Run key -> [{ key, name, type, data }] */
function parseRun(text) {
  const out = []
  for (const b of parseRegQuery(text)) for (const [name, v] of Object.entries(b.values)) out.push({ key: b.key, name, type: b.types[name] || 'REG_SZ', data: typeof v === 'number' ? '0x' + v.toString(16) : String(v) })
  return out
}
/* the program a Run value starts: "C:\x\a.exe" /flag -> a */
const programOf = (cmd) => { const s = String(cmd || '').trim(); const m = s.match(/^"([^"]+)"/) || s.match(/^(\S+)/); return m ? path.win32.basename(m[1]).replace(/\.exe$/i, '') : '' }

/* ---------- what was turned off, kept so it can come back ---------- */
/* store(dir): dir is RoarKit's "Disabled startup items" folder; list.json in it says what each kept thing was */
function store(dir) {
  const file = path.join(dir, 'list.json')
  const read = () => { try { const v = JSON.parse(fs.readFileSync(file, 'utf8')); return Array.isArray(v) ? v : [] } catch { return [] } }
  const write = (list) => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file, JSON.stringify(list, null, 2)) }
  return {
    dir, all: read,
    add(rec) { write([...read().filter((r) => r.id !== rec.id), rec]) },
    remove(id) { write(read().filter((r) => r.id !== id)) },
    get: (id) => read().find((r) => r.id === id) || null,
    /* a free name in the folder for a file kept there */
    place(name) { fs.mkdirSync(dir, { recursive: true }); const { name: base, ext } = path.parse(name); let p = path.join(dir, name); for (let k = 2; fs.existsSync(p); k++) p = path.join(dir, `${base} ${k}${ext}`); return p },
  }
}
/* move a file; across drives a copy is made and the original goes to the Trash (never deleted) */
async function move(from, to, sys) {
  try { await fsp.rename(from, to) } catch (e) {
    if (e.code !== 'EXDEV') throw e
    await fsp.copyFile(from, to, fs.constants.COPYFILE_EXCL)
    await sys.trash(from)
  }
}
/* turn an item off; sys holds the computer's side (launchctl, System Events, reg, the Trash), so it can be tested */
async function disable(item, st, sys) {
  if (!item?.canSwitch) throw new Error('This one is set for every user of the computer; RoarKit only shows it.')
  if (item.kind === 'agent' || item.kind === 'folder') {
    if (item.kind === 'agent') await sys.bootout(item.path)
    const to = st.place(path.basename(item.path))
    await move(item.path, to, sys)
    st.add({ id: item.id, kind: item.kind, name: item.name, label: item.label || '', from: item.path, file: to, program: item.program || '', at: sys.now() })
    return
  }
  if (item.kind === 'login') {
    st.add({ id: item.id, kind: 'login', name: item.name, from: item.path, hidden: !!item.hidden, program: item.path, at: sys.now() })
    try { await sys.loginRemove(item.name) } catch (e) { st.remove(item.id); throw e }
    return
  }
  if (item.kind === 'run') {
    // saved first: if the value cannot be taken out, nothing is lost
    st.add({ id: item.id, kind: 'run', name: item.name, key: item.key, type: item.type, data: item.data, program: item.program || '', at: sys.now() })
    try { await sys.regDelete(item.key, item.name) } catch (e) { st.remove(item.id); throw e }
    return
  }
  throw new Error('This kind cannot be turned off here.')
}
/* turn it back on from what was kept */
async function restore(id, st, sys) {
  const rec = st.get(id)
  if (!rec) throw new Error('RoarKit has nothing kept for this one.')
  if (rec.kind === 'agent' || rec.kind === 'folder') {
    if (fs.existsSync(rec.from)) throw new Error('Something of that name is back in its place already.')
    await fsp.mkdir(path.dirname(rec.from), { recursive: true })
    await move(rec.file, rec.from, sys)
    if (rec.kind === 'agent') await sys.bootstrap(rec.from)
  } else if (rec.kind === 'login') await sys.loginAdd(rec)
  else if (rec.kind === 'run') await sys.regAdd(rec.key, rec.name, rec.type, rec.data)
  st.remove(id)
  return rec
}

/* ---------- reading the computer ---------- */
async function readPlistFile(file) {
  let buf
  try { buf = await fsp.readFile(file) } catch { return null }
  if (buf.subarray(0, 6).toString() === 'bplist') return process.platform === 'darwin' ? (await run('plutil', ['-convert', 'xml1', '-o', '-', file])).out : ''
  return buf.toString('utf8')
}
const SYSTEM_NOTE = 'Set for every user of the computer. Turn it off in its own program, or with an administrator.'
async function agentsIn(dir, scope, kind, loaded) {
  let names = []
  try { names = (await fsp.readdir(dir)).filter((n) => /\.plist$/i.test(n) && !n.startsWith('.')) } catch { return [] }
  const out = []
  for (const n of names.sort()) {
    const file = path.join(dir, n)
    const a = parseAgent(await readPlistFile(file), file)
    if (!a) continue
    const l = loaded.get(a.label)
    out.push({
      id: 'agent:' + file, kind, scope, name: a.label, label: a.label, program: a.program, path: file, where: dir,
      runAtLoad: a.runAtLoad, keepAlive: a.keepAlive, loaded: !!l, pid: l?.pid ?? null, on: !a.disabled,
      canSwitch: scope === 'user', note: scope === 'user' ? '' : SYSTEM_NOTE, apple: /^com\.apple\./i.test(a.label),
    })
  }
  return out
}
async function readMac(home, st) {
  const [li, lc] = await Promise.all([
    run('osascript', ['-s', 's', '-e', 'tell application "System Events" to get {name, path, hidden} of every login item'], 20e3),
    run('launchctl', ['list']),
  ])
  const loaded = parseLaunchctl(lc.out)
  const items = parseLoginItems(li.out).map((x) => ({ id: 'login:' + x.name, kind: 'login', scope: 'user', name: x.name, program: x.path, path: x.path, hidden: x.hidden, on: true, canSwitch: true, where: 'Login items' }))
  items.push(...await agentsIn(path.join(home, 'Library', 'LaunchAgents'), 'user', 'agent', loaded))
  items.push(...await agentsIn('/Library/LaunchAgents', 'system', 'agent', loaded))
  items.push(...await agentsIn('/Library/LaunchDaemons', 'system', 'daemon', loaded))
  return { items: withKept(items, st), loginError: li.ok ? '' : li.err }
}
const RUN_KEYS = [
  ['HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', 'user'],
  ['HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', 'system'],
  ['HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run', 'system'],
]
async function readWin(st) {
  const items = []
  for (const [k, scope] of RUN_KEYS) {
    for (const v of parseRun((await run('reg', ['query', k])).out)) {
      if (!v.name) continue
      items.push({ id: 'run:' + k + '\\' + v.name, kind: 'run', scope, name: v.name, key: k, type: v.type, data: v.data, program: v.data, on: true, canSwitch: scope === 'user', note: scope === 'user' ? '' : SYSTEM_NOTE, where: scope === 'user' ? 'Run (you)' : 'Run (every user)' })
    }
  }
  const folders = [[path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup'), 'user'], [path.join(process.env.ProgramData || 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'StartUp'), 'system']]
  for (const [dir, scope] of folders) {
    let names = []
    try { names = await fsp.readdir(dir) } catch { continue }
    for (const n of names) {
      if (/^desktop\.ini$/i.test(n) || n.startsWith('.')) continue
      items.push({ id: 'folder:' + path.join(dir, n), kind: 'folder', scope, name: n.replace(/\.(lnk|url)$/i, ''), program: n, path: path.join(dir, n), on: true, canSwitch: scope === 'user', note: scope === 'user' ? '' : SYSTEM_NOTE, where: 'Startup folder' })
    }
  }
  return { items: withKept(items, st), loginError: '' }
}
/* what RoarKit turned off is listed too, switched off, so it can come back */
function withKept(items, st) {
  const kept = st.all().map((r) => ({ id: r.id, kind: r.kind, scope: 'user', name: r.name, label: r.label, program: r.program || r.data || r.from || '', path: r.from || '', on: false, kept: true, canSwitch: true, at: r.at,
    where: r.kind === 'login' ? 'Login items' : r.kind === 'run' ? 'Run (you)' : r.kind === 'folder' ? 'Startup folder' : path.dirname(r.from || '') }))
  const ids = new Set(kept.map((k) => k.id))
  return [...items.filter((i) => !ids.has(i.id)), ...kept]
}

const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
function system(ctx) {
  const uid = typeof process.getuid === 'function' ? process.getuid() : 501
  const must = async (p, what) => { const r = await p; if (!r.ok) throw new Error(what + (r.err ? ': ' + r.err.trim().split('\n').pop() : '')); return r }
  return {
    now: () => Date.now(),
    trash: (p) => ctx.shell.trashItem(p),
    // not loaded is fine: it is stopped either way
    bootout: (file) => run('launchctl', ['bootout', `gui/${uid}`, file]),
    bootstrap: (file) => run('launchctl', ['bootstrap', `gui/${uid}`, file]),
    loginRemove: (name) => must(run('osascript', ['-e', `tell application "System Events" to delete login item "${esc(name)}"`], 20e3), 'macOS did not let RoarKit change the login items'),
    loginAdd: (rec) => must(run('osascript', ['-e', `tell application "System Events" to make login item at end with properties {path:"${esc(rec.from)}", hidden:${rec.hidden ? 'true' : 'false'}}`], 20e3), 'macOS did not let RoarKit change the login items'),
    regDelete: (key, name) => must(run('reg', ['delete', key, '/v', name, '/f']), 'Windows did not let RoarKit change it'),
    regAdd: (key, name, type, data) => must(run('reg', ['add', key, '/v', name, '/t', type || 'REG_SZ', '/d', data, '/f']), 'Windows did not let RoarKit change it'),
  }
}

function register(ctx) {
  const st = () => store(path.join(ctx.app.getPath('userData'), 'Disabled startup items'))
  let lastItems = []
  ctx.handle('startup-list', async () => {
    const r = process.platform === 'darwin' ? await readMac(ctx.app.getPath('home'), st()) : process.platform === 'win32' ? await readWin(st()) : { items: withKept([], st()), loginError: '' }
    lastItems = r.items
    ctx.allow(r.items.map((i) => i.path).filter(Boolean))
    return { ...r, platform: process.platform, at: Date.now() }
  })
  ctx.handle('startup-switch', async ({ id, on }) => {
    const s = st()
    if (on) { await restore(String(id), s, system(ctx)); return { ok: true } }
    const item = lastItems.find((i) => i.id === String(id) && i.on)
    if (!item) throw new Error('List the startup items again.')
    await disable(item, s, system(ctx))
    return { ok: true }
  })
}

module.exports = { register, parseAppleScript, parseLoginItems, parseAgent, parseLaunchctl, parseRun, programOf, store, disable, restore, agentsIn, withKept }
