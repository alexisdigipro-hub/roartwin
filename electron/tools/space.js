// Space map (Alex, 28 Oct): where the space of a folder or a drive went. Every folder with its size, the biggest
// files, the space by kind of file, the large files nobody touched for months, and on a Mac the drive's free space
// and its local snapshots. It only reads; a file goes to the Trash only when it is chosen, only one this scan listed,
// and never one in a Masters folder. Plain Node apart from register(); test/space.test.js runs the rest.
const fs = require('fs')
const fsp = fs.promises
const path = require('path')
const os = require('os')
const { execFile } = require('child_process')
const engine = require('../engine')

class Stopped extends Error { constructor() { super('Stopped') } }

const SYSTEM = new Set(['$RECYCLE.BIN', 'System Volume Information', '.Trashes', '.Trash', '.Spotlight-V100', '.fseventsd', '.DocumentRevisions-V100', '.TemporaryItems'])
const QUIET = new Set(['node_modules', 'Library', 'AppData', 'Program Files', 'Program Files (x86)', 'Windows'])
// a library or an app is one thing: its insides are not loose files (as engine.js)
const BUNDLE = /\.(app|photoslibrary|fcpbundle|lrdata|imovielibrary|tvlibrary|logicx|band|bundle|plugin|aplibrary|rcproject|cpbundle)$/i
// cloud drives are not walked into when Skip cloud drives is on (as engine.js); a folder chosen by hand still is
const CLOUD = /^(pcloud ?drive|icloud drive|mobile documents|cloudstorage|dropbox( \(.+\))?|google ?drive.*|my drive|onedrive.*|box drive|creative cloud files.*|megasync|nextcloud|owncloud|proton ?drive|tresorit|synologydrive|icedrive)$/i

const RAW = new Set(['dng', 'cr2', 'cr3', 'crw', 'nef', 'nrw', 'arw', 'srf', 'sr2', 'raf', 'orf', 'rw2', 'pef', 'srw', 'x3f', '3fr', 'iiq', 'erf', 'kdc', 'mos', 'mrw', 'raw', 'r3d', 'braw', 'ari', 'arx', 'crm'])
const PROJECT = new Set(['drp', 'drt', 'dra', 'prproj', 'aep', 'aepx', 'fcpbundle', 'fcpxml', 'c4d', 'blend', 'nk', 'hip', 'ma', 'mb', 'psb', 'logicx', 'ptx', 'aaf', 'edl', 'xml', 'omf', 'imovielibrary'])
const ARCHIVE = new Set(['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz', 'zst', 'dmg', 'iso', 'pkg', 'cab', 'lz', 'lzma'])
const KINDS = ['video', 'raw', 'photo', 'audio', 'project', 'archive', 'other']
const extOf = (n) => path.extname(n).slice(1).toLowerCase()
function kindOf(name) {
  const e = extOf(name)
  if (RAW.has(e)) return 'raw'
  if (PROJECT.has(e)) return 'project'
  if (engine.VIDEO.has(e)) return 'video'
  if (engine.PHOTO.has(e)) return 'photo'
  if (engine.AUDIO.has(e)) return 'audio'
  if (ARCHIVE.has(e)) return 'archive'
  return 'other'
}
const inside = (p, dir) => p === dir || p.startsWith(dir.endsWith(path.sep) ? dir : dir + path.sep)

/* A bundle's size: everything in it, links counted as themselves and never followed. */
async function sizeOf(p, stop, seen) {
  let st
  try { st = await fsp.lstat(p) } catch { return { size: 0, mtime: 0 } }
  if (st.isSymbolicLink() || (!st.isDirectory() && !st.isFile())) return { size: 0, mtime: st.mtimeMs }
  if (st.isFile()) {
    const key = `${st.dev}:${st.ino}`
    if (st.nlink > 1 && st.ino) { if (seen.has(key)) return { size: 0, mtime: st.mtimeMs }; seen.add(key) }
    return { size: st.size, mtime: st.mtimeMs }
  }
  let size = 0, mtime = st.mtimeMs
  let kids = []
  try { kids = await fsp.readdir(p) } catch { return { size, mtime } }
  for (const k of kids) {
    if (stop()) throw new Stopped()
    const r = await sizeOf(path.join(p, k), stop, seen)
    size += r.size; if (r.mtime > mtime) mtime = r.mtime
  }
  return { size, mtime }
}

/* What a whole-disk start leaves out (Alex, 29 Oct: "This Mac"): other drives, macOS's own view of the same data
   (/System/Volumes holds the Data volume again, so walking it would count every file twice), devices, swap. */
function systemSkips(root, platform = process.platform) {
  const r = path.resolve(root)
  if (platform === 'darwin' && r === '/') return ['/Volumes', '/System/Volumes', '/dev', '/private/var/vm', '/cores', '/net', '/home', '/Network']
  if (platform === 'linux' && r === '/') return ['/proc', '/sys', '/dev', '/run', '/mnt', '/media', '/snap']
  return []
}

/* walk(root, opts, tick, stop) -> { root: node, files: [{ path, name, size, mtime, kind, bundle }], skipped, denied }
   node: { name, path, size, files, kids: [node], loose: [file], bundle } (a bundle is a file of its own, not a node)
   opts: { skipHidden, skipCloud, cloudMounts: Set, skipPaths: [abs] }
   denied: the folders that could not be read (no permission: on a Mac, Full Disk Access), so the total is never a
   silent undercount */
async function walk(root, opts = {}, tick = () => {}, stop = () => false) {
  const files = [], skipped = [], seen = new Set(), denied = []
  let n = 0, bytes = 0, last = 0
  const cloud = opts.cloudMounts || new Set()
  const skipPaths = new Set((opts.skipPaths || []).map((x) => path.resolve(x)))
  async function dir(p, name) {
    if (stop()) throw new Stopped()
    const node = { name, path: p, size: 0, files: 0, kids: [], loose: [] }
    let d
    try { d = await fsp.readdir(p, { withFileTypes: true }) } catch (err) { if (err?.code !== 'ENOENT') denied.push(p); return node } // no permission; gone meanwhile
    if (Date.now() - last > 150) { last = Date.now(); tick({ files: n, bytes, dir: p }) }
    for (const e of d) {
      const q = path.join(p, e.name)
      if (e.isSymbolicLink()) continue
      if (e.isDirectory()) {
        if (SYSTEM.has(e.name) || skipPaths.has(q)) continue
        if (opts.skipCloud && (CLOUD.test(e.name) || cloud.has(q))) { skipped.push(q); continue }
        if (opts.skipHidden && (e.name.startsWith('.') || QUIET.has(e.name))) continue
        if (BUNDLE.test(e.name)) {
          const r = await sizeOf(q, stop, seen)
          const f = { path: q, name: e.name, size: r.size, mtime: r.mtime, kind: kindOf(e.name), bundle: true }
          files.push(f); node.loose.push(f); node.size += r.size; node.files += 1; n++; bytes += r.size
          continue
        }
        const k = await dir(q, e.name)
        node.kids.push(k); node.size += k.size; node.files += k.files
        continue
      }
      if (!e.isFile()) continue
      if (opts.skipHidden && e.name.startsWith('.')) continue
      let st
      try { st = await fsp.lstat(q) } catch { continue }
      // a hard link is one file, however many names it has
      const key = `${st.dev}:${st.ino}`
      if (st.nlink > 1 && st.ino) { if (seen.has(key)) continue; seen.add(key) }
      const f = { path: q, name: e.name, size: st.size, mtime: st.mtimeMs, kind: kindOf(e.name) }
      files.push(f); node.loose.push(f); node.size += st.size; node.files += 1
      n++; bytes += st.size
      if (Date.now() - last > 150) { last = Date.now(); tick({ files: n, bytes, dir: p }) }
    }
    return node
  }
  const top = await dir(root, path.basename(root) || root)
  tick({ files: n, bytes, dir: root, done: true })
  return { root: top, files, skipped, denied }
}

/* What the page is shown of one folder: its folders by size (the biggest 120, the rest as one line) and its own
   biggest files (bundles among them). */
function nodeView(node, keep = 120) {
  const kids = [...node.kids].sort((a, b) => b.size - a.size)
  const loose = [...node.loose].sort((a, b) => b.size - a.size)
  const rest = kids.slice(keep)
  return {
    name: node.name, path: node.path, size: node.size, files: node.files,
    kids: kids.slice(0, keep).map((k) => ({ name: k.name, path: k.path, size: k.size, files: k.files, folders: k.kids.length })),
    more: rest.length ? { count: rest.length, size: rest.reduce((n, k) => n + k.size, 0) } : null,
    loose: loose.slice(0, 60), looseCount: loose.length, looseSize: loose.reduce((n, f) => n + f.size, 0),
  }
}
function findNode(root, p) {
  if (root.path === p) return root
  for (const k of root.kids) if (inside(p, k.path)) return findNode(k, p)
  return null
}
const byKind = (files) => {
  const out = Object.fromEntries(KINDS.map((k) => [k, { size: 0, count: 0 }]))
  for (const f of files) { out[f.kind].size += f.size; out[f.kind].count += 1 }
  return out
}
const biggest = (files, n = 50) => [...files].sort((a, b) => b.size - a.size).slice(0, n)
/* Large and old: over minBytes and not changed for `months` (the date of a bundle is its newest file inside) */
function largeOld(files, minBytes, months, now = Date.now()) {
  const before = now - months * 30.44 * 864e5
  const all = files.filter((f) => f.size >= minBytes && f.mtime && f.mtime < before).sort((a, b) => b.size - a.size)
  return { list: all.slice(0, 300), count: all.length, size: all.reduce((n, f) => n + f.size, 0) }
}

/* diskutil info -plist: the keys we read, as plain values (strings, integers, booleans). Defensive: anything odd is
   left out. */
function parsePlist(xml) {
  const out = {}
  const dict = String(xml || '').match(/<dict>([\s\S]*)<\/dict>/)
  if (!dict) return out
  const re = /<key>([^<]+)<\/key>\s*(<(string|integer|real)>([^<]*)<\/\3>|<(true|false)\/>|<(dict|array)>)/g
  let m
  while ((m = re.exec(dict[1]))) {
    if (m[6]) continue // nested: not needed
    out[m[1]] = m[5] ? m[5] === 'true' : m[3] === 'string' ? m[4] : Number(m[4])
  }
  return out
}
function volumeFromPlist(info) {
  const num = (k) => (Number.isFinite(info[k]) ? info[k] : null)
  return {
    name: info.VolumeName || '', mount: info.MountPoint || '', fs: info.FilesystemName || info.FilesystemType || '',
    total: num('TotalSize') ?? num('Size'), free: num('FreeSpace') ?? num('APFSContainerFree'), containerFree: num('APFSContainerFree'),
    internal: info.Internal === true, ssd: info.SolidState === true,
  }
}
/* tmutil listlocalsnapshots: one name a line (com.apple.TimeMachine.2026-10-27-101530.local and the like) */
const parseSnapshots = (text) => String(text || '').split(/\r?\n/).map((l) => l.trim()).filter((l) => /^com\.\S+/.test(l))

const run = (cmd, args) => new Promise((done) => execFile(cmd, args, { timeout: 8000, maxBuffer: 4 << 20 }, (err, out) => done(err ? '' : String(out))))
let mountsCache = null
async function cloudMounts() {
  if (mountsCache) return mountsCache
  mountsCache = new Set()
  if (process.platform === 'win32') return mountsCache
  for (const line of (await run('mount', [])).split('\n')) {
    const m = line.match(/^.+? on (.+?) (?:\(([^,)]+)|type (\S+))/)
    if (m && /fuse|webdav|pcloud/i.test(m[2] || m[3] || '')) mountsCache.add(m[1])
  }
  return mountsCache
}
/* the drive the folder is on: its size and free space (every system), the rest on a Mac */
async function volumeOf(p) {
  const v = { total: null, free: null, containerFree: null, snapshots: [], name: '', mount: '' }
  try { const s = await fsp.statfs(p); v.total = s.blocks * s.bsize; v.free = s.bavail * s.bsize } catch { /* old Node */ }
  if (process.platform !== 'darwin') return v
  const info = volumeFromPlist(parsePlist(await run('diskutil', ['info', '-plist', p])))
  Object.assign(v, { name: info.name, mount: info.mount, containerFree: info.containerFree, fs: info.fs })
  if (v.total == null) v.total = info.total
  if (info.mount) v.snapshots = parseSnapshots(await run('tmutil', ['listlocalsnapshots', info.mount]))
  return v
}

/* The quick starts (Alex, 29 Oct): the home folder, this computer's own drive, and every other drive in. */
async function places(platform = process.platform) {
  const out = { home: os.homedir(), disk: platform === 'win32' ? (process.env.SystemDrive || 'C:') + '\\' : '/', drives: [] }
  if (platform === 'darwin') {
    for (const e of await fsp.readdir('/Volumes', { withFileTypes: true }).catch(() => [])) {
      // the start-up drive shows in /Volumes as a link to / (Macintosh HD): it is "This Mac" already
      if (e.isSymbolicLink() || e.name.startsWith('.')) continue
      out.drives.push({ name: e.name, path: path.join('/Volumes', e.name) })
    }
  } else if (platform === 'win32') {
    for (const l of 'DEFGHIJKLMNOPQRSTUVWXYZ') { const d = l + ':\\'; if (d.toUpperCase() !== out.disk.toUpperCase() && fs.existsSync(d)) out.drives.push({ name: l + ':', path: d }) }
  }
  return out
}

/* May this path go to the Trash? Only one of the last scan's files, never in a Masters folder. */
function mayTrash(last, p, protect) {
  if (!last || typeof p !== 'string') return false
  const abs = path.resolve(p)
  if (abs !== p) return false
  if ((protect || []).some((m) => inside(abs, path.resolve(m)))) return false
  return last.byPath.has(abs)
}

let last = null // { root, files, byPath, protect }
function register(ctx) {
  ctx.handle('space-scan', (a, { emit }) => ctx.run(async () => {
    const root = String(a.root || '')
    let st
    try { st = fs.statSync(root) } catch { throw new Error('Choose a folder or a drive.') }
    if (!st.isDirectory()) throw new Error('Choose a folder or a drive.')
    const t0 = Date.now()
    const r = await walk(root, { skipHidden: a.skipHidden !== false, skipCloud: a.skipCloud !== false, cloudMounts: a.skipCloud !== false ? await cloudMounts() : new Set(), skipPaths: systemSkips(root) }, (p) => emit('space-progress', p), ctx.stopped)
    const protect = (Array.isArray(a.protect) ? a.protect : []).map(String)
    last = { root: r.root, files: r.files, byPath: new Map(r.files.map((f) => [f.path, f])), protect }
    const mark = (f) => ({ ...f, protected: protect.some((m) => inside(f.path, path.resolve(m))) })
    const view = nodeView(r.root)
    const big = biggest(r.files).map(mark)
    ctx.allow(root, view.kids.map((k) => k.path), view.loose.map((f) => f.path), big.map((f) => f.path))
    return { root, took: Date.now() - t0, size: r.root.size, files: r.files.length, skipped: r.skipped, denied: { count: r.denied.length, some: r.denied.slice(0, 12) }, node: { ...view, loose: view.loose.map(mark) }, big, kinds: byKind(r.files), volume: await volumeOf(root) }
  }))
  ctx.handle('space-dir', (a) => {
    const node = last && findNode(last.root, String(a.path || ''))
    if (!node) throw new Error('Scan again: this folder is not in the last scan.')
    const view = nodeView(node)
    ctx.allow(view.kids.map((k) => k.path), view.loose.map((f) => f.path))
    return { ...view, loose: view.loose.map((f) => ({ ...f, protected: last.protect.some((m) => inside(f.path, path.resolve(m))) })) }
  })
  ctx.handle('space-old', (a) => {
    if (!last) return { list: [], count: 0, size: 0 }
    const r = largeOld(last.files, Math.max(0, Number(a.minBytes) || 0), Math.max(0, Number(a.months) || 0))
    ctx.allow(r.list.map((f) => f.path))
    return { ...r, list: r.list.map((f) => ({ ...f, protected: last.protect.some((m) => inside(f.path, path.resolve(m))) })) }
  })
  ctx.handle('space-trash', async (a) => {
    const ok = [], failed = []
    for (const p of (Array.isArray(a.paths) ? a.paths : []).map(String)) {
      if (!mayTrash(last, p, last?.protect)) { failed.push({ path: p, error: 'Only files of the last scan, and nothing in a Masters folder.' }); continue }
      try { await ctx.shell.trashItem(p); ok.push(p); last.byPath.delete(p); last.files = last.files.filter((f) => f.path !== p) } catch (err) { failed.push({ path: p, error: String(err?.message || err) }) }
    }
    return { ok, failed }
  })
  ctx.handle('space-places', async () => {
    const r = await places()
    ctx.allow(r.home, r.disk, r.drives.map((d) => d.path))
    return r
  })
  ctx.handle('space-export', (a) => ctx.saveText(String(a.text || ''), String(a.name || 'Space map.csv'), 'csv'))
}

module.exports = { register, walk, systemSkips, places, nodeView, findNode, byKind, biggest, largeOld, parsePlist, volumeFromPlist, parseSnapshots, mayTrash, kindOf, Stopped }
