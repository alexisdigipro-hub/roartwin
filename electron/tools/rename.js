// Rename clips (Alex, 28 Oct): the files of a folder renamed by a rule of tokens, {date}_{project}_{cam}{card}_{n} and
// the rest, read from each clip's own metadata (its creation date, start timecode, camera, reel; the file's dates
// when it has none). A preview first; names that clash, or that another file already has, are refused, never written
// over. The last batch can be undone. The page sends the rule; the names are worked out here.
const fs = require('fs')
const fsp = fs.promises
const path = require('path')
const { parseInfo, parseMdls, kindOf, inside, cleanName, freeName, sameFile } = require('./files')

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
  let day = '', k = 0
  const rows = sel.map((f) => {
    const d = new Date(when(f))
    // the counter starts again on each shooting day when asked (a card of three days: _001 on each)
    const today = DATE['YYYY-MM-DD'](d)
    if (r.perDay && today !== day) { day = today; k = 0 }
    const n = k++
    const vars = {
      date: fmt(d), time: `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`,
      project: r.project || '', cam: r.cam || '', card: r.card || '', n: String((Number(r.start) || 0) + n).padStart(width, '0'),
      name: f.base, ext: f.ext, tc: (f.meta?.tc || '').replace(/[:;.]/g, ''), camera: f.meta?.camera || '', reel: f.meta?.reel || '',
    }
    // a token with nothing in it leaves a mark, so only the separators around it go ("2026-10-28_{project}_A" is
    // "2026-10-28_A") and the ones written into the rule stay ("{project} - {name}" keeps its " - ")
    const MISS = '\u0001'
    let base = String(r.pattern).replace(/\{(\w+)\}/g, (all, key) => (TOKENS.includes(key) ? (String(vars[key] ?? '').trim() || MISS) : all))
    base = base.replace(/([_\-. ]*)\u0001+([_\-. ]*)/g, (m, a, b) => a || b)
    base = cleanName(base).replace(/^[_\-. ]+|[_\-. ]+$/g, '')
    if (r.case === 'upper') base = base.toUpperCase()
    else if (r.case === 'lower') base = base.toLowerCase()
    const to = !base ? '' : /\{ext\}/.test(r.pattern) || !f.ext ? base : `${base}.${f.ext}`
    return { path: f.path, from: f.name, to, kind: f.kind, status: !to ? 'empty' : to === f.name ? 'same' : 'ok' }
  })
  const count = new Map()
  for (const x of rows) if (x.to) count.set(x.to.toLowerCase(), (count.get(x.to.toLowerCase()) || 0) + 1)
  for (const x of rows) if (x.status === 'ok' && count.get(x.to.toLowerCase()) > 1) x.status = 'clash'
  // another file has the name: fine when that file is renamed away in this same batch (001 to 002 while 002 goes to
  // 003); else taken. Worked out until nothing changes, as one row taken keeps its name and may block another.
  const others = new Set(folderNames.map((n) => n.toLowerCase()))
  for (let changed = true; changed;) {
    changed = false
    const leaving = new Set(rows.filter((x) => x.status === 'ok').map((x) => x.from.toLowerCase()))
    for (const x of rows) {
      if (x.status !== 'ok') continue
      const key = x.to.toLowerCase()
      if (others.has(key) && key !== x.from.toLowerCase() && !leaving.has(key)) { x.status = 'taken'; changed = true }
    }
  }
  // a name that stays (same, or refused) keeps it, so no other row may take it
  const kept = new Set(rows.filter((x) => x.status !== 'ok').map((x) => x.from.toLowerCase()))
  for (const x of rows) if (x.status === 'ok' && kept.has(x.to.toLowerCase()) && x.to.toLowerCase() !== x.from.toLowerCase()) x.status = 'taken'
  return rows
}

/* renames in two steps, so names may pass from one file to another (001 to 002 while 002 goes to 003) and only the
   case may change: every file first to a passing name of its own, then each to its new name, never over a file that
   is not part of the batch. A file whose new name turns out taken goes back to its old name. */
async function moveAll(dir, pairs) {
  const moves = [], failed = [], parked = []
  for (const x of pairs) {
    const from = path.join(dir, x.from)
    try {
      const tmp = await freeName(dir, `.roarkit-${process.pid}-${parked.length}-${x.from}`)
      await fsp.rename(from, tmp)
      parked.push({ ...x, tmp })
    } catch (e) { failed.push({ name: x.from, error: String(e?.message || e) }) }
  }
  for (const x of parked) {
    const to = path.join(dir, x.to)
    try {
      if (await exists(to) && !(await sameFile(x.tmp, to))) throw new Error('That name is taken.')
      await fsp.rename(x.tmp, to)
      moves.push({ from: x.from, to: x.to })
    } catch (e) {
      await fsp.rename(x.tmp, path.join(dir, x.from)).catch(() => {})
      failed.push({ name: x.from, error: String(e?.message || e) })
    }
  }
  return { moves, failed }
}
/* the plan carried out, never over a file; the moves come back for Undo */
async function apply(dir, rows) {
  if (rows.some((x) => ['clash', 'taken', 'empty'].includes(x.status))) throw new Error('Some names clash or are taken. Change the rule first.')
  return moveAll(dir, rows.filter((y) => y.status === 'ok').map((x) => ({ from: x.from, to: x.to })))
}
async function undo(dir, moves) {
  // each file must still be there under its new name; the old names must be free, or be the batch's own
  const back = [], failed = []
  const coming = new Set(moves.map((m) => m.to.toLowerCase()))
  for (const m of moves) {
    if (!(await exists(path.join(dir, m.to)))) { failed.push({ name: m.to, error: 'It is not there any more.' }); continue }
    if (await exists(path.join(dir, m.from)) && !coming.has(m.from.toLowerCase()) && m.from.toLowerCase() !== m.to.toLowerCase()) { failed.push({ name: m.to, error: 'The old name is taken now.' }); continue }
    back.push({ from: m.to, to: m.from })
  }
  const r = await moveAll(dir, back)
  return { done: r.moves.length, failed: [...failed, ...r.failed] }
}

function register(ctx) {
  const folders = new Set()
  const cache = new Map()
  // the last batch, kept in the app's own folder, so Undo still works after the app was closed and opened again
  const logFile = () => { try { return path.join(ctx.app.getPath('userData'), 'rename-undo.json') } catch { return '' } }
  let last = null
  try { const f = logFile(); if (f && fs.existsSync(f)) { last = JSON.parse(fs.readFileSync(f, 'utf8')); if (last?.dir) folders.add(last.dir) } } catch { last = null }
  const keep = () => { const f = logFile(); if (!f) return; try { if (last) fs.writeFileSync(f, JSON.stringify(last)); else fs.rmSync(f, { force: true }) } catch { /* not kept: Undo still works until the app closes */ } }
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
    last = r.moves.length ? { dir, moves: r.moves, at: Date.now() } : last
    keep()
    cache.set(dir, await scan(dir))
    return { done: r.moves.length, failed: r.failed }
  })
  ctx.handle('rename-undo', async () => {
    if (!last) return { done: 0, failed: [] }
    const dir = last.dir
    const r = await undo(dir, last.moves)
    last = null; keep()
    if (cache.has(dir) || folders.has(dir)) cache.set(dir, await scan(dir).catch(() => []))
    return r
  })
  ctx.handle('rename-last', async () => (last ? { dir: last.dir, count: last.moves.length, at: last.at || 0 } : null))
  ctx.handle('rename-csv', async ({ text }) => ctx.saveText(String(text || ''), 'Renamed clips.csv', 'csv'))
}

module.exports = { register, plan, apply, undo, moveAll, scanFolder, metaOf, TOKENS }
