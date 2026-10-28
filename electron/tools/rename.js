// Rename clips (Alex, 28 Oct): the files of a folder renamed by a rule of tokens, {date}_{project}_{cam}{card}_{n} and
// the rest, read from each clip's own metadata (its creation date, start timecode, camera, reel; the file's dates
// when it has none). A preview first; names that clash, or that another file already has, are refused, never written
// over. The last batch can be undone. The page sends the rule; the names are worked out here.
const fs = require('fs')
const fsp = fs.promises
const path = require('path')
const { parseInfo, parseMdls, kindOf, inside, cleanName } = require('./files')

const exists = async (p) => { try { await fsp.lstat(p); return true } catch { return false } }
const pad = (n, w = 2) => String(n).padStart(w, '0')

/* a clip's metadata: when it was shot, its start timecode, its camera and reel (each may be missing) */
function metaOf(info, mdls = {}) {
  const tags = { ...(info?.tags || {}) }
  for (const s of info?.streams || []) for (const [k, v] of Object.entries(s.tags || {})) if (!(k in tags)) tags[k] = v
  const pick = (re) => { const k = Object.keys(tags).find((x) => re.test(x)); return k ? String(tags[k]).trim() : '' }
  const created = pick(/^(com\.apple\.quicktime\.creationdate|creation_time|date)$/i) || mdls.kMDItemContentCreationDate || ''
  const make = pick(/(^|\.)make$/i) || mdls.kMDItemAcquisitionMake || ''
  const model = pick(/(^|\.)model$/i) || mdls.kMDItemAcquisitionModel || ''
  const d = created ? new Date(created.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3').replace(/ \+0000$/, 'Z')) : null
  return {
    created: d && !isNaN(d) ? d.getTime() : null,
    tc: info?.timecode || '',
    camera: [make, model.startsWith(make) ? model.slice(make.length).trim() : model].filter(Boolean).join(' '),
    reel: pick(/reel/i),
  }
}

/* the files of a folder (not its folders), each with its metadata */
async function scanFolder(dir, { bin, ff, mdls, onProgress, stop } = {}) {
  const ents = (await fsp.readdir(dir, { withFileTypes: true })).filter((e) => e.isFile() && !e.name.startsWith('.'))
  const out = []
  for (let i = 0; i < ents.length; i++) {
    if (stop?.()) throw Object.assign(new Error('Stopped'), { name: 'Stopped' })
    const name = ents[i].name, p = path.join(dir, name)
    const st = await fsp.lstat(p)
    const ext = path.extname(name).slice(1), kind = kindOf(name, false)
    let meta = { created: null, tc: '', camera: '', reel: '' }
    if (['video', 'audio', 'image'].includes(kind)) {
      let info = null
      if (bin && ff) { const { log } = await ff(bin, ['-i', p], () => false, 1024, 20e3); info = parseInfo(log) }
      meta = metaOf(info, kind === 'image' && mdls ? await mdls(p) : {})
    }
    out.push({ path: p, name, base: ext ? name.slice(0, -ext.length - 1) : name, ext, size: st.size, mtime: st.mtimeMs, birth: st.birthtimeMs || st.mtimeMs, kind, meta })
    onProgress?.({ done: i + 1, total: ents.length })
  }
  return out
}

const DATE = {
  'YYYY-MM-DD': (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
  YYYYMMDD: (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`,
  YYMMDD: (d) => `${String(d.getFullYear()).slice(2)}${pad(d.getMonth() + 1)}${pad(d.getDate())}`,
  'DD-MM-YYYY': (d) => `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`,
}
const TOKENS = ['date', 'time', 'project', 'cam', 'card', 'n', 'name', 'ext', 'tc', 'camera', 'reel']

/* the new names, in the order the clips were shot: rows { path, from, to, status } with status ok, same, clash
   (two clips would get one name), taken (another file of the folder has it) or empty (the rule gave nothing) */
function plan(files, rule = {}, folderNames = files.map((f) => f.name)) {
  const r = { pattern: '{name}', start: 1, pad: 3, dateFormat: 'YYYY-MM-DD', dateFrom: 'clip', case: 'keep', kind: 'all', ...rule }
  const only = Array.isArray(r.only) && r.only.length ? new Set(r.only) : null
  // a clip's own date; else the file's modified date, which a copy keeps (its created date is the day of the copy)
  const when = (f) => (r.dateFrom === 'clip' && f.meta?.created) || f.mtime
  const sel = files.filter((f) => (r.kind === 'all' || f.kind === r.kind) && (!only || only.has(f.name)))
    .sort((a, b) => when(a) - when(b) || a.name.localeCompare(b.name))
  const fmt = DATE[r.dateFormat] || DATE['YYYY-MM-DD']
  const width = Math.max(1, Math.min(8, Number(r.pad) || 1))
  const rows = sel.map((f, i) => {
    const d = new Date(when(f))
    const vars = {
      date: fmt(d), time: `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`,
      project: r.project || '', cam: r.cam || '', card: r.card || '', n: String((Number(r.start) || 0) + i).padStart(width, '0'),
      name: f.base, ext: f.ext, tc: (f.meta?.tc || '').replace(/[:;.]/g, ''), camera: f.meta?.camera || '', reel: f.meta?.reel || '',
    }
    let base = String(r.pattern).replace(/\{(\w+)\}/g, (all, k) => (TOKENS.includes(k) ? vars[k] : all))
    // the parts a missing token leaves: "2026-10-28__A" is "2026-10-28_A"
    base = cleanName(base).replace(/([_\-. ])[_\-. ]*(?=[_\-. ])/g, '').replace(/^[_\-. ]+|[_\-. ]+$/g, '')
    if (r.case === 'upper') base = base.toUpperCase()
    else if (r.case === 'lower') base = base.toLowerCase()
    const to = !base ? '' : /\{ext\}/.test(r.pattern) || !f.ext ? base : `${base}.${f.ext}`
    return { path: f.path, from: f.name, to, kind: f.kind, status: !to ? 'empty' : to === f.name ? 'same' : 'ok' }
  })
  const count = new Map()
  for (const x of rows) if (x.to) count.set(x.to.toLowerCase(), (count.get(x.to.toLowerCase()) || 0) + 1)
  const others = new Set(folderNames.map((n) => n.toLowerCase()))
  for (const x of rows) {
    if (x.status !== 'ok') continue
    const k = x.to.toLowerCase()
    if (count.get(k) > 1) x.status = 'clash'
    else if (others.has(k) && k !== x.from.toLowerCase()) x.status = 'taken'
  }
  return rows
}

/* the plan carried out, one rename at a time, never over a file; the moves come back for Undo */
async function apply(dir, rows) {
  if (rows.some((x) => ['clash', 'taken', 'empty'].includes(x.status))) throw new Error('Some names clash or are taken. Change the rule first.')
  const moves = [], failed = []
  for (const x of rows.filter((y) => y.status === 'ok')) {
    const from = path.join(dir, x.from), to = path.join(dir, x.to)
    try {
      if (x.to.toLowerCase() === x.from.toLowerCase()) { const tmp = from + '.roartwin-rename'; await fsp.rename(from, tmp); await fsp.rename(tmp, to) } else {
        if (await exists(to)) throw new Error('That name is taken.')
        await fsp.rename(from, to)
      }
      moves.push({ from: x.from, to: x.to })
    } catch (e) { failed.push({ name: x.from, error: String(e?.message || e) }) }
  }
  return { moves, failed }
}
async function undo(dir, moves) {
  let done = 0
  const failed = []
  for (const m of [...moves].reverse()) {
    const from = path.join(dir, m.from), to = path.join(dir, m.to)
    try {
      if (m.to.toLowerCase() !== m.from.toLowerCase() && await exists(from)) throw new Error('The old name is taken now.')
      if (m.to.toLowerCase() === m.from.toLowerCase()) { const tmp = to + '.roartwin-rename'; await fsp.rename(to, tmp); await fsp.rename(tmp, from) } else await fsp.rename(to, from)
      done++
    } catch (e) { failed.push({ name: m.to, error: String(e?.message || e) }) }
  }
  return { done, failed }
}

function register(ctx) {
  const folders = new Set()
  const cache = new Map()
  let last = null
  const must = (p) => {
    const r = path.resolve(String(p || ''))
    if (!p || ![...folders].some((f) => inside(r, f))) throw new Error('Choose the folder first.')
    return r
  }
  const add = async (p) => {
    const r = path.resolve(String(p || ''))
    const st = await fsp.stat(r).catch(() => null)
    if (!st) throw new Error('That folder is not there.')
    // a file dropped: its folder, and that file only
    const dir = st.isDirectory() ? r : path.dirname(r)
    folders.add(dir); ctx.allow?.(dir)
    return { path: dir, only: st.isDirectory() ? [] : [path.basename(r)] }
  }
  const bin = () => ctx.ffmpeg?.() || ''
  const mdls = (p) => new Promise((done) => {
    if (process.platform !== 'darwin') return done({})
    require('child_process').execFile('mdls', [p], { timeout: 8000 }, (e, out) => done(e ? {} : parseMdls(out)))
  })
  const scan = (dir, emit) => scanFolder(dir, { bin: bin(), ff: ctx.engine?.ff, mdls, stop: () => ctx.stopped?.(), onProgress: (x) => emit?.('rename-progress', x) })
  const names = async (dir) => (await fsp.readdir(dir)).filter((n) => !n.startsWith('.'))

  ctx.handle('rename-pick', async () => {
    const { canceled, filePaths } = await ctx.dialog.showOpenDialog(ctx.win?.(), { properties: ['openDirectory'] })
    return canceled || !filePaths[0] ? null : add(filePaths[0])
  })
  ctx.handle('rename-folder', async ({ paths }) => {
    const got = []
    for (const p of Array.isArray(paths) ? paths : []) got.push(await add(p))
    if (!got.length) throw new Error('Choose the folder first.')
    // files dropped from one folder: those files; else the first folder
    const same = got.filter((g) => g.path === got[0].path)
    return { path: got[0].path, only: same.every((g) => g.only.length) ? same.flatMap((g) => g.only) : [] }
  })
  ctx.handle('rename-scan', async ({ path: p }, { emit } = {}) => {
    const dir = must(p)
    return ctx.run(async () => { const files = await scan(dir, emit); cache.set(dir, files); return { count: files.length } })
  })
  ctx.handle('rename-preview', async ({ path: p, rule }) => {
    const dir = must(p)
    if (!cache.has(dir)) cache.set(dir, await scan(dir))
    return plan(cache.get(dir), rule, await names(dir))
  })
  ctx.handle('rename-apply', async ({ path: p, rule }) => {
    const dir = must(p)
    if (!cache.has(dir)) cache.set(dir, await scan(dir))
    const rows = plan(cache.get(dir), rule, await names(dir))
    const r = await apply(dir, rows)
    last = { dir, moves: r.moves, rows: rows.filter((x) => r.moves.some((m) => m.from === x.from)) }
    cache.set(dir, await scan(dir))
    return { done: r.moves.length, failed: r.failed }
  })
  ctx.handle('rename-undo', async () => {
    if (!last) return { done: 0, failed: [] }
    const r = await undo(last.dir, last.moves)
    cache.set(last.dir, await scan(last.dir))
    last = null
    return r
  })
  ctx.handle('rename-last', async () => (last ? { dir: last.dir, moves: last.moves } : null))
  ctx.handle('rename-csv', async ({ text }) => ctx.saveText(String(text || ''), 'Renamed clips.csv', 'csv'))
}

module.exports = { register, plan, apply, undo, scanFolder, metaOf, TOKENS }
