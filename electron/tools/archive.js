// Archives (Alex, 28 Oct: "zip, rar and every kind of compression"): open an archive (look inside, then take it all
// out into a new folder next to it) or make one (ZIP, 7z, tar.gz, tar.xz) from files and folders.
//
// No new program: the computer's own tar, which on a Mac and on Windows 10+ is bsdtar (libarchive). It reads zip,
// rar (4 and 5), 7z, tar and its compressed kinds, iso, cab, cpio, xar/pkg; it writes zip, 7z, tar.gz, tar.xz. A single
// .gz file goes through Node's own zlib; a single .bz2/.xz/.zst through bzip2/xz/zstd where the computer has them.
// Safe: tar is run straight (no shell); only archives, files and folders the person picked or dropped in this window
// are taken; nothing is ever written over (a new folder or file gets " 2", " 3"…); an entry with an absolute path or
// "..", which would land outside the folder (zip-slip), is left out and named.
const fs = require('fs')
const fsp = fs.promises
const path = require('path')
const zlib = require('zlib')
const { spawn, execFileSync } = require('child_process')

/* ---------- what a file is ---------- */
// longest first, so .tar.gz is not taken for a plain .gz
const KINDS = [
  ['.tar.gz', 'tar.gz'], ['.tgz', 'tar.gz'], ['.tar.bz2', 'tar.bz2'], ['.tbz2', 'tar.bz2'], ['.tbz', 'tar.bz2'],
  ['.tar.xz', 'tar.xz'], ['.txz', 'tar.xz'], ['.tar.zst', 'tar.zst'], ['.tzst', 'tar.zst'], ['.tar.lz', 'tar.lz'], ['.tar.lzma', 'tar.lzma'],
  ['.tar.z', 'tar.Z'], ['.tar', 'tar'], ['.zip', 'zip'], ['.zipx', 'zip'], ['.rar', 'rar'], ['.7z', '7z'], ['.iso', 'iso'],
  ['.cab', 'cab'], ['.cpio', 'cpio'], ['.xar', 'xar'], ['.pkg', 'xar'], ['.jar', 'zip'], ['.apk', 'zip'], ['.lha', 'lha'], ['.lzh', 'lha'],
  ['.ar', 'ar'], ['.deb', 'ar'], ['.rpm', 'rpm'], ['.warc', 'warc'],
  ['.gz', 'gz'], ['.bz2', 'bz2'], ['.xz', 'xz'], ['.zst', 'zst'], ['.lzma', 'lzma'],
]
// a single compressed file, not an archive of many
const SINGLE = new Set(['gz', 'bz2', 'xz', 'zst', 'lzma'])
const NOT_ARCHIVE = { '.dmg': 'A .dmg is a disk image, not an archive: open it with a double click and it shows up as a drive.', '.sparseimage': 'A disk image, not an archive: open it with a double click.', '.sparsebundle': 'A disk image, not an archive: open it with a double click.' }

function kindOf(file) {
  const low = String(file).toLowerCase()
  for (const [ext, k] of KINDS) if (low.endsWith(ext)) return { kind: k, ext: low.slice(-ext.length) }
  return null
}
/* the name without its archive ending: Shoot.tar.gz -> Shoot */
function baseOf(file) {
  const name = path.basename(String(file))
  const k = kindOf(name)
  return (k ? name.slice(0, name.length - k.ext.length) : path.parse(name).name) || 'Archive'
}

/* an entry that would land outside the folder: absolute, a drive letter, a UNC path, or a ".." step */
function unsafe(name) {
  const n = String(name).replace(/\\/g, '/')
  return n.startsWith('/') || /^[a-z]:/i.test(n) || n.startsWith('//') || n.split('/').includes('..')
}
// the Mac's and Windows' leftovers in an archive
const isJunk = (name) => { const b = String(name).replace(/\\/g, '/').split('/').filter(Boolean); return b.some((x) => x === '__MACOSX' || x === '.DS_Store' || x.startsWith('._') || x === 'Thumbs.db' || x === 'desktop.ini') }

/* a name in that folder that is not taken yet: "Shoot", "Shoot 2", "Shoot 3"… (ext kept at the end) */
function freeName(dir, base, ext = '') {
  for (let i = 1; ; i++) {
    const p = path.join(dir, (i === 1 ? base : `${base} ${i}`) + ext)
    if (!fs.existsSync(p)) return p
  }
}

/* ---------- the listing ---------- */
const MON = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 }
// bsdtar:  -rw-r--r--  0 alex   staff    1234 Oct 28 10:00 dir/file.txt   (or "Oct 28  2025")
const BSD = /^([-dlcbpsh][^\s]{9})\s+\d+\s+(\S+\s+){1,2}(\d+)\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{1,2}:\d{2}|\d{4})\s(.*)$/
// GNU tar: -rw-r--r-- alex/staff 1234 2026-10-28 10:00 dir/file.txt
const GNU = /^([-dlcbpsh][^\s]{9})\s+\S+\s+(\d+)\s+(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})\s(.*)$/
function parseList(text, now = new Date()) {
  const out = []
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, '')
    if (!line) continue
    let m = line.match(GNU)
    let mode, size, mtime, name
    if (m) {
      mode = m[1]; size = +m[2]; name = m[8]
      mtime = new Date(+m[3], +m[4] - 1, +m[5], +m[6], +m[7]).getTime()
    } else if ((m = line.match(BSD))) {
      mode = m[1]; size = +m[3]; name = m[7]
      const mon = MON[m[4].toLowerCase()] ?? 0, day = +m[5]
      if (m[6].includes(':')) {
        const [hh, mm] = m[6].split(':').map(Number)
        let d = new Date(now.getFullYear(), mon, day, hh, mm)
        if (d - now > 86400000 * 31) d = new Date(now.getFullYear() - 1, mon, day, hh, mm) // ls style: no year means the last twelve months
        mtime = d.getTime()
      } else mtime = new Date(+m[6], mon, day).getTime()
    } else { out.push({ name: line, size: 0, mtime: 0, dir: line.endsWith('/') }); continue }
    if (mode[0] === 'l') name = name.replace(/ -> .*$/, '')
    if (mode[0] === 'h') name = name.replace(/ link to .*$/, '')
    out.push({ name, size, mtime, dir: mode[0] === 'd' || name.endsWith('/'), link: mode[0] === 'l' })
  }
  return out
}

/* ---------- what to run ---------- */
const LEVEL = { zip: { fast: 1, normal: 6, small: 9 }, '7z': { fast: 1, normal: 5, small: 9 }, 'tar.gz': { fast: 1, normal: 6, small: 9 }, 'tar.xz': { fast: 0, normal: 6, small: 9 } }
const EXT = { zip: '.zip', '7z': '.7z', 'tar.gz': '.tar.gz', 'tar.xz': '.tar.xz' }
const JUNK_PATTERNS = ['.DS_Store', '__MACOSX', '._*', 'Thumbs.db', 'desktop.ini']

/* the tar arguments for a new archive: items are absolute paths, each added by its own name from its own folder */
function makeArgs({ format = 'zip', level = 'normal', out, items, junk = true, flavour = 'bsd', platform = process.platform }) {
  const lv = (LEVEL[format] || LEVEL.zip)[level] ?? LEVEL[format]?.normal ?? 6
  const a = ['-c', '-v', '-f', out]
  if (flavour === 'bsd') {
    if (format === 'zip') a.push('--format', 'zip', '--options', `zip:compression-level=${lv}`)
    else if (format === '7z') a.push('--format', '7zip', '--options', `7zip:compression-level=${lv}`)
    else if (format === 'tar.gz') a.push('-z', '--options', `gzip:compression-level=${lv}`)
    else if (format === 'tar.xz') a.push('-J', '--options', `xz:compression-level=${lv}`)
    // a Mac adds ._ files of its own to an archive unless told not to
    if (junk && platform === 'darwin') a.push('--no-mac-metadata')
  } else {
    // GNU tar (Linux): only the tar kinds, the level through the compressor itself
    if (format === 'tar.gz') a.push('--use-compress-program', `gzip -${lv}`)
    else if (format === 'tar.xz') a.push('--use-compress-program', `xz -${lv}`)
    else throw new Error('This computer\'s tar makes only tar.gz and tar.xz.')
  }
  if (junk) for (const p of JUNK_PATTERNS) a.push('--exclude', p)
  for (const it of items) a.push('-C', path.dirname(it), path.basename(it))
  return a
}

/* ---------- running tar ---------- */
function findTar(platform = process.platform) {
  if (platform === 'win32') return { bin: path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'), flavour: 'bsd' }
  const cands = platform === 'darwin' ? ['/usr/bin/bsdtar', '/usr/bin/tar'] : ['/usr/bin/bsdtar', '/usr/local/bin/bsdtar', '/usr/bin/tar', '/bin/tar']
  for (const bin of cands) {
    if (!fs.existsSync(bin)) continue
    let v = ''
    try { v = execFileSync(bin, ['--version'], { encoding: 'utf8', timeout: 5000 }) } catch { continue }
    return { bin, flavour: /bsdtar|libarchive/i.test(v) ? 'bsd' : 'gnu' }
  }
  return { bin: '', flavour: '' }
}

/* run a program, every output line to onLine; stop() ends it */
function run(bin, args, { stop = () => false, onLine = () => {}, env } = {}) {
  return new Promise((ok) => {
    let p
    try { p = spawn(bin, args, { windowsHide: true, env: env ? { ...process.env, ...env } : process.env }) } catch (e) { return ok({ code: -1, out: '', err: String(e.message || e) }) }
    const out = [], err = []
    let errLen = 0, killed = false
    const split = (buf, keep) => {
      let rest = ''
      return (c) => { const s = rest + c.toString('utf8'); const lines = s.split(/\r?\n/); rest = lines.pop(); for (const l of lines) { onLine(l); if (keep) keep(l) } }
    }
    p.stdout.on('data', split(null, (l) => out.push(l)))
    p.stderr.on('data', split(null, (l) => { if (errLen < 400) { err.push(l); errLen++ } }))
    const check = () => { if (stop() && !killed) { killed = true; p.kill('SIGKILL') } }
    const watch = setInterval(check, 250)
    check()
    p.on('error', (e) => { clearInterval(watch); ok({ code: -1, out: '', err: String(e.message || e) }) })
    p.on('close', (code) => { clearInterval(watch); ok({ code: killed ? -2 : code, out: out.join('\n'), err: err.join('\n'), killed }) })
  })
}

class Stopped extends Error { constructor() { super('Stopped'); this.name = 'Stopped' } }
const needsPass = (text) => /passphrase|password|encrypt/i.test(text)

/* everything under some files and folders: how many files (junk left out when asked) and their size */
async function countItems(items, junk) {
  let files = 0, size = 0
  const walk = async (p) => {
    if (junk && isJunk(path.basename(p))) return
    let st
    try { st = await fsp.lstat(p) } catch { return }
    if (st.isDirectory()) { let kids = []; try { kids = await fsp.readdir(p) } catch { return } for (const k of kids) await walk(path.join(p, k)) }
    else { files++; size += st.isFile() ? st.size : 0 }
  }
  for (const it of items) await walk(it)
  return { files, size }
}

/* the tool itself, on a given tar (the tests give it theirs) */
function makeTool({ tar = findTar(), platform = process.platform } = {}) {
  const which = (name) => { for (const d of ['/usr/bin', '/usr/local/bin', '/opt/homebrew/bin', '/bin']) { const p = path.join(d, name); if (fs.existsSync(p)) return p } return '' }

  async function list(file, { stop } = {}) {
    const k = kindOf(file)
    const dmg = Object.keys(NOT_ARCHIVE).find((e) => String(file).toLowerCase().endsWith(e))
    if (dmg) throw new Error(NOT_ARCHIVE[dmg])
    if (!k) throw new Error('This is not an archive RoarTwin knows.')
    const st = await fsp.stat(file)
    if (SINGLE.has(k.kind)) {
      // one file squeezed: what comes out is the same name without the ending
      const name = path.basename(file).slice(0, -k.ext.length) || 'file'
      return { path: file, kind: k.kind, single: true, entries: [{ name, size: 0, mtime: st.mtimeMs, dir: false }], count: 1, files: 1, size: 0, packed: st.size, unsafe: [] }
    }
    if (!tar.bin) throw new Error('This computer has no tar to open archives with.')
    if (tar.flavour === 'gnu' && !/^tar/.test(k.kind)) throw new Error('This computer\'s tar opens only tar archives.')
    const r = await run(tar.bin, ['-t', '-v', '-f', file], { stop })
    if (r.killed) throw new Stopped()
    if (r.code !== 0 && !r.out) throw new Error(needsPass(r.err) ? 'This archive is locked with a password.' : cleanErr(r.err) || 'The archive could not be read.')
    const entries = parseList(r.out)
    const filesOnly = entries.filter((e) => !e.dir)
    return {
      path: file, kind: k.kind, entries: entries.slice(0, 3000), count: entries.length, files: filesOnly.length,
      size: filesOnly.reduce((n, e) => n + e.size, 0), packed: st.size,
      unsafe: entries.filter((e) => unsafe(e.name)).map((e) => e.name),
      junk: entries.filter((e) => isJunk(e.name)).length,
    }
  }

  async function extract(file, { dest = '', password = '', stop = () => false, tick = () => {} } = {}) {
    const info = await list(file, { stop })
    const parent = dest || path.dirname(file)
    const folder = freeName(parent, baseOf(file))
    await fsp.mkdir(folder, { recursive: true })
    if (info.single) {
      const out = path.join(folder, info.entries[0].name)
      await single(file, info.kind, out, { stop, tick })
      return { folder, count: 1, skipped: [] }
    }
    const total = info.count || 1
    let done = 0
    const onLine = (l) => { if (l && !/^(tar|bsdtar)(\.exe)?: /.test(l)) { done++; tick({ done: Math.min(done, total), total }) } }
    const args = ['-x', '-v', '-f', file, '-C', folder]
    if (password && tar.flavour === 'bsd') args.push('--passphrase', password)
    // zip-slip: with entries that would land outside, only the safe ones are taken out, by name
    let listFile = ''
    if (info.unsafe.length) {
      listFile = path.join(folder, `.roartwin-list-${process.pid}-${Date.now()}`)
      const keep = info.entries.length === info.count ? info.entries.filter((e) => !unsafe(e.name)).map((e) => e.name) : null
      if (!keep) throw new Error('This archive has entries that would land outside the folder, and too many entries to leave them out one by one.')
      await fsp.writeFile(listFile, keep.join('\n') + '\n')
      args.push('-T', listFile)
    }
    const r = await run(tar.bin, args, { stop, onLine })
    if (listFile) await fsp.rm(listFile, { force: true })
    if (r.killed) throw new Stopped()
    if (r.code !== 0) {
      if (needsPass(r.err)) {
        // nothing half taken out stays: the folder made for it goes again only if it is still empty
        try { if (!(await fsp.readdir(folder)).length) await fsp.rmdir(folder) } catch { /* it has files: they stay */ }
        return { needPassword: true, wrong: !!password }
      }
      throw new Error(cleanErr(r.err) || 'The archive could not be opened.')
    }
    return { folder, count: info.count - info.unsafe.length, skipped: info.unsafe }
  }

  /* a single compressed file out: gz by Node itself, the others by their own program */
  async function single(file, kind, out, { stop, tick }) {
    const size = (await fsp.stat(file)).size || 1
    if (kind === 'gz') {
      await new Promise((ok, no) => {
        let read = 0
        const src = fs.createReadStream(file)
        const dst = fs.createWriteStream(out, { flags: 'wx' })
        const watch = setInterval(() => { if (stop()) { src.destroy(new Stopped()) } }, 250)
        src.on('data', (c) => { read += c.length; tick({ done: read, total: size, bytes: true }) })
        src.pipe(zlib.createGunzip()).on('error', (e) => { clearInterval(watch); no(e) }).pipe(dst)
        src.on('error', (e) => { clearInterval(watch); no(e) })
        dst.on('finish', () => { clearInterval(watch); ok() })
        dst.on('error', (e) => { clearInterval(watch); no(e) })
      })
      return
    }
    const prog = { bz2: 'bzip2', xz: 'xz', zst: 'zstd', lzma: 'xz' }[kind]
    const bin = platform === 'win32' ? '' : which(prog)
    if (!bin) throw new Error(`Opening a single .${kind} file needs ${prog}, which this computer does not have.`)
    const fd = await fsp.open(out, 'wx')
    try {
      await new Promise((ok, no) => {
        const p = spawn(bin, ['-d', '-c', file], { windowsHide: true })
        const w = fs.createWriteStream(null, { fd: fd.fd, autoClose: false })
        p.stdout.pipe(w)
        const watch = setInterval(() => { if (stop()) p.kill('SIGKILL') }, 250)
        p.on('error', (e) => { clearInterval(watch); no(e) })
        p.on('close', (code) => { clearInterval(watch); if (stop()) no(new Stopped()); else if (code) no(new Error(`${prog} could not open it.`)); else w.end(ok) })
      })
    } finally { await fd.close() }
  }

  async function make(items, { format = 'zip', level = 'normal', junk = true, name = '', dest = '', stop = () => false, tick = () => {} } = {}) {
    if (!items.length) throw new Error('Choose files or folders first.')
    if (!tar.bin) throw new Error('This computer has no tar to make archives with.')
    if (!EXT[format]) throw new Error('Unknown kind of archive.')
    const dir = dest || path.dirname(items[0])
    const base = String(name || (items.length === 1 ? path.parse(items[0]).name : 'Archive')).replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Archive'
    const out = freeName(dir, base.endsWith(EXT[format]) ? base.slice(0, -EXT[format].length) : base, EXT[format])
    const { files, size } = await countItems(items, junk)
    const total = Math.max(1, files)
    let done = 0
    const onLine = (l) => { if (l && !/^(tar|bsdtar)(\.exe)?: /.test(l) && !l.endsWith('/')) { done++; tick({ done: Math.min(done, total), total }) } }
    const args = makeArgs({ format, level, out, items, junk, flavour: tar.flavour, platform })
    const r = await run(tar.bin, args, { stop, onLine, env: platform === 'darwin' && junk ? { COPYFILE_DISABLE: '1' } : undefined })
    if (r.killed) { await fsp.rm(out, { force: true }); throw new Stopped() }
    if (r.code !== 0) { await fsp.rm(out, { force: true }); throw new Error(cleanErr(r.err) || 'The archive could not be made.') }
    const st = await fsp.stat(out)
    return { path: out, size: st.size, files, original: size }
  }

  return { list, extract, make, tar }
}
// tar's own words, without its name in front
const cleanErr = (t) => String(t || '').split(/\r?\n/).map((l) => l.replace(/^(bsd)?tar(\.exe)?: /, '').trim()).filter(Boolean).slice(0, 2).join(' ')

/* ---------- the doors (main.js gives ctx) ---------- */
function register(ctx) {
  const tool = makeTool()
  // only what the person picked or dropped in this window may be read; only folders made here may be shown
  const allowed = new Set()
  const exists = (p) => { try { fs.lstatSync(p); return true } catch { return false } }
  const take = (ps) => { const ok = (Array.isArray(ps) ? ps : []).map(String).filter((p) => path.isAbsolute(p) && exists(p)); ok.forEach((p) => allowed.add(p)); return ok }
  const need = (p) => { if (!allowed.has(String(p))) throw new Error('Choose or drop it here first.') }

  ctx.handle('archive-pick', async ({ mode } = {}) => {
    const props = mode === 'make' ? ['openFile', 'multiSelections', ...(process.platform === 'darwin' ? ['openDirectory'] : [])] : ['openFile', 'multiSelections']
    const r = await ctx.dialog.showOpenDialog(ctx.win(), { title: mode === 'make' ? 'Files and folders to put in an archive' : 'Archives to open', properties: props })
    return r.canceled ? [] : take(r.filePaths)
  })
  // on Windows a file dialog cannot choose folders: a second door for them
  ctx.handle('archive-pick-folders', async () => {
    const r = await ctx.dialog.showOpenDialog(ctx.win(), { title: 'Folders to put in an archive', properties: ['openDirectory', 'multiSelections'] })
    return r.canceled ? [] : take(r.filePaths)
  })
  ctx.handle('archive-add', async ({ paths } = {}) => take(paths))
  ctx.handle('archive-dest', async () => {
    const r = await ctx.dialog.showOpenDialog(ctx.win(), { title: 'Where it goes', properties: ['openDirectory', 'createDirectory'] })
    return r.canceled ? '' : take(r.filePaths)[0] || ''
  })
  ctx.handle('archive-info', async () => ({ tar: !!tool.tar.bin, flavour: tool.tar.flavour, platform: process.platform }))
  // inside ctx.run: a Stop pressed earlier does not end this one, and a big tar.gz is read through
  ctx.handle('archive-list', ({ path: p } = {}) => ctx.run(async () => { need(p); return tool.list(String(p), { stop: ctx.stopped }) }))
  ctx.handle('archive-extract', ({ path: p, dest, password } = {}, { emit }) => ctx.run(async () => {
    need(p); if (dest) need(dest)
    const r = await tool.extract(String(p), { dest: dest ? String(dest) : '', password: String(password || ''), stop: ctx.stopped, tick: (v) => emit('archive-progress', v) })
    if (r.folder) { allowed.add(r.folder); ctx.allow(r.folder) }
    return r
  }))
  ctx.handle('archive-make', ({ items, format, level, junk, name, dest } = {}, { emit }) => ctx.run(async () => {
    const list = (Array.isArray(items) ? items : []).map(String)
    list.forEach(need); if (dest) need(dest)
    const r = await tool.make(list, { format: String(format || 'zip'), level: String(level || 'normal'), junk: junk !== false, name: String(name || ''), dest: dest ? String(dest) : '', stop: ctx.stopped, tick: (v) => emit('archive-progress', v) })
    ctx.allow(r.path)
    return r
  }))
}

module.exports = { register, makeTool, kindOf, baseOf, unsafe, isJunk, freeName, parseList, makeArgs, findTar, countItems, Stopped }
