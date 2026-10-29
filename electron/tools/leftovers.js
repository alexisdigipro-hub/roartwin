// Project leftovers (Alex, 28 Oct): the render and cache folders editing programs leave next to a project, and that
// nobody needs once the project is finished: Resolve's optimized and proxy media and its render cache, Premiere's
// previews, After Effects' disk cache, Final Cut's render files and transcoded media (inside its library). Each with
// its size, the last time anything in it changed, and the project it belongs to. A whole folder goes to the Trash
// only when chosen, only one this scan found, never an Auto-Save folder and never in a Masters folder.
const fs = require('fs')
const fsp = fs.promises
const path = require('path')

class Stopped extends Error { constructor() { super('Stopped') } }

const SYSTEM = new Set(['$RECYCLE.BIN', 'System Volume Information', '.Trashes', '.Trash', '.Spotlight-V100', '.fseventsd', '.DocumentRevisions-V100', '.TemporaryItems'])
const QUIET = new Set(['node_modules', 'Library', 'AppData', 'Program Files', 'Program Files (x86)', 'Windows'])
const BUNDLE = /\.(app|photoslibrary|fcpbundle|lrdata|imovielibrary|tvlibrary|logicx)$/i
const AUTOSAVE = /auto-?save/i
/* the folders, by their exact names (any case); `fcp` ones count only inside a Final Cut library */
const KINDS = [
  { id: 'resolve-optimized', app: 'Resolve', name: /^optimizedmedia$/i, what: 'Optimized media' },
  { id: 'resolve-proxy', app: 'Resolve', name: /^proxymedia$/i, what: 'Proxy media' },
  { id: 'resolve-cache', app: 'Resolve', name: /^cacheclip$/i, what: 'Render cache' },
  { id: 'premiere-video', app: 'Premiere', name: /^adobe premiere pro video previews$/i, what: 'Video previews' },
  { id: 'premiere-audio', app: 'Premiere', name: /^adobe premiere pro audio previews$/i, what: 'Audio previews' },
  // After Effects names the folder it makes after the computer: "Adobe After Effects Disk Cache - Alex's MacBook Pro.local"
  { id: 'ae-cache', app: 'After Effects', name: /^adobe after effects disk cache( - .+)?$/i, what: 'Disk cache' },
  { id: 'fcp-render', app: 'Final Cut', name: /^render files$/i, what: 'Render files', fcp: true },
  { id: 'fcp-transcoded', app: 'Final Cut', name: /^transcoded media$/i, what: 'Transcoded media', fcp: true },
]
const kindFor = (name, inFcp) => (AUTOSAVE.test(name) ? null : KINDS.find((k) => k.name.test(name) && (!k.fcp || inFcp)) || null)
const inside = (p, dir) => p === dir || p.startsWith(dir.endsWith(path.sep) ? dir : dir + path.sep)

/* everything in a folder: size, number of files, the newest change; links are never followed */
async function measure(p, stop) {
  let size = 0, files = 0, newest = 0
  const dirs = [p]
  while (dirs.length) {
    if (stop()) throw new Stopped()
    const d = dirs.pop()
    let list = []
    try { list = await fsp.readdir(d, { withFileTypes: true }) } catch { continue }
    for (const e of list) {
      const q = path.join(d, e.name)
      if (e.isSymbolicLink()) continue
      if (e.isDirectory()) { dirs.push(q); continue }
      if (!e.isFile()) continue
      let st
      try { st = await fsp.lstat(q) } catch { continue }
      size += st.size; files += 1
      if (st.mtimeMs > newest) newest = st.mtimeMs
    }
  }
  if (!newest) { try { newest = (await fsp.lstat(p)).mtimeMs } catch { /* gone */ } }
  return { size, files, newest }
}

/* find(roots, opts, tick, stop) -> [{ path, name, kind, app, what, project, size, files, newest }] */
async function find(roots, opts = {}, tick = () => {}, stop = () => false) {
  const out = [], seen = new Set()
  let looked = 0, last = 0
  for (const root of roots) {
    const stack = [{ p: root, fcp: null }]
    while (stack.length) {
      if (stop()) throw new Stopped()
      const { p, fcp } = stack.pop()
      let list = []
      try { list = await fsp.readdir(p, { withFileTypes: true }) } catch { continue }
      looked++
      if (Date.now() - last > 150) { last = Date.now(); tick({ folders: looked, found: out.length, dir: p }) }
      for (const e of list) {
        if (!e.isDirectory() || e.isSymbolicLink()) continue
        const q = path.join(p, e.name)
        if (SYSTEM.has(e.name) || AUTOSAVE.test(e.name)) continue
        const k = kindFor(e.name, !!fcp)
        if (k) {
          if (seen.has(q)) continue
          seen.add(q)
          const m = await measure(q, stop)
          // the project: the Final Cut library, else the folder it sits in
          const project = fcp ? path.basename(fcp).replace(/\.fcpbundle$/i, '') : path.basename(p)
          out.push({ path: q, name: e.name, kind: k.id, app: k.app, what: k.what, project, dir: p, ...m })
          continue
        }
        if (BUNDLE.test(e.name)) { if (/\.fcpbundle$/i.test(e.name)) stack.push({ p: q, fcp: q }); continue }
        if (opts.skipHidden && (e.name.startsWith('.') || QUIET.has(e.name))) continue
        stack.push({ p: q, fcp })
      }
    }
  }
  tick({ folders: looked, found: out.length, done: true })
  return out.sort((a, b) => b.size - a.size)
}

/* untouched for at least `months`: nothing in it changed since */
const untouched = (items, months, now = Date.now()) => items.filter((i) => i.newest < now - months * 30.44 * 864e5)

/* May this folder go to the Trash? Only one the last scan found, still by a leftover's name, never an Auto-Save
   folder, never in a Masters folder. */
function mayTrash(last, p, protect) {
  if (!last || typeof p !== 'string' || path.resolve(p) !== p) return false
  const item = last.byPath.get(p)
  if (!item || AUTOSAVE.test(p) || !KINDS.some((k) => k.name.test(path.basename(p)))) return false
  return !(protect || []).some((m) => inside(p, path.resolve(m)) || inside(path.resolve(m), p))
}

let last = null // { byPath, protect }
function register(ctx) {
  ctx.handle('leftovers-scan', (a, { emit }) => ctx.run(async () => {
    const roots = (Array.isArray(a.roots) ? a.roots : []).map(String).filter((r) => { try { return fs.statSync(r).isDirectory() } catch { return false } })
    if (!roots.length) throw new Error('Choose a folder or a drive.')
    const t0 = Date.now()
    const items = await find(roots, { skipHidden: a.skipHidden !== false }, (p) => emit('leftovers-progress', p), ctx.stopped)
    const protect = (Array.isArray(a.protect) ? a.protect : []).map(String)
    last = { byPath: new Map(items.map((i) => [i.path, i])), protect }
    ctx.allow(items.map((i) => i.path))
    return { roots, took: Date.now() - t0, items: items.map((i) => ({ ...i, protected: protect.some((m) => inside(i.path, path.resolve(m)) || inside(path.resolve(m), i.path)) })) }
  }))
  ctx.handle('leftovers-trash', async (a) => {
    const ok = [], failed = []
    for (const p of (Array.isArray(a.paths) ? a.paths : []).map(String)) {
      if (!mayTrash(last, p, last?.protect)) { failed.push({ path: p, error: 'Only folders of the last scan, and nothing in a Masters folder.' }); continue }
      try { await ctx.shell.trashItem(p); ok.push(p); last.byPath.delete(p) } catch (err) { failed.push({ path: p, error: String(err?.message || err) }) }
    }
    return { ok, failed }
  })
  ctx.handle('leftovers-export', (a) => ctx.saveText(String(a.text || ''), String(a.name || 'Project leftovers.csv'), 'csv'))
}

module.exports = { register, find, measure, untouched, mayTrash, kindFor, KINDS, Stopped }
