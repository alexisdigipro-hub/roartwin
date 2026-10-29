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
/* a link inside the archive that points outside the folder (absolute, or climbing above it with ".."): taking it
   out, and anything stored "through" it, could write outside the folder (audit, 29 Oct) */
function linkOutside(name, target) {
  const t = String(target || '').replace(/\\/g, '/')
  if (!t) return false
  if (t.startsWith('/') || /^[a-z]:/i.test(t) || t.startsWith('//')) return true
  const parts = String(name).replace(/\\/g, '/').split('/').filter(Boolean).slice(0, -1)
  for (const step of t.split('/')) {
    if (!step || step === '.') continue
    if (step === '..') { if (!parts.length) return true; parts.pop() } else parts.push(step)
  }
  return false
}
/* every entry that must stay in the archive: outside the folder, a link that points outside, or stored under a link */
function unsafeEntries(entries) {
  const links = entries.filter((e) => e.link || e.hard).map((e) => e.name.replace(/\/+$/, ''))
  return entries.filter((e) => unsafe(e.name) || ((e.link || e.hard) && (e.hard ? unsafe(e.target) : linkOutside(e.name, e.target)))
    || links.some((l) => e.name.startsWith(l + '/'))).map((e) => e.name)
}
/* bsdtar writes a name it cannot print in the C locale as octal escapes (\316\221 for Α): read them back as UTF-8 */
const unescapeName = (n) => String(n).replace(/(?:\\[0-7]{3})+/g, (m) => Buffer.from(m.match(/\\[0-7]{3}/g).map((x) => parseInt(x.slice(1), 8))).toString('utf8'))
/* a name for bsdtar's -T list, which takes patterns: [ ] * ? and \ are made plain */
const plainPattern = (n) => String(n).replace(/[\\[\]*?]/g, (c) => '\\' + c)
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
    } else { out.push({ name: unescapeName(line), size: 0, mtime: 0, dir: line.endsWith('/') }); continue }
    let target = ''
    if (mode[0] === 'l') { const k = name.lastIndexOf(' -> '); if (k >= 0) { target = name.slice(k + 4); name = name.slice(0, k) } }
    if (mode[0] === 'h') { const k = name.lastIndexOf(' link to '); if (k >= 0) { target = name.slice(k + 9); name = name.slice(0, k) } }
    // GNU tar marks a hard link with "link to" too, under an ordinary mode
    else if (/ link to /.test(name) && mode[0] === '-') { const k = name.lastIndexOf(' link to '); target = name.slice(k + 9); name = name.slice(0, k); mode = 'h' + mode.slice(1) }
    name = unescapeName(name); target = unescapeName(target)
    out.push({ name, size, mtime, dir: mode[0] === 'd' || name.endsWith('/'), link: mode[0] === 'l', hard: mode[0] === 'h', ...(target ? { target } : {}) })
  }
  return out
}

/* ---------- what to run ---------- */
const LEVEL = { zip: { fast: 1, normal: 6, small: 9 }, '7z': { fast: 1, normal: 5, small: 9 }, 'tar.gz': { fast: 1, normal: 6, small: 9 }, 'tar.xz': { fast: 0, normal: 6, small: 9 } }
const EXT = { zip: '.zip', '7z': '.7z', 'tar.gz': '.tar.gz', 'tar.xz': '.tar.xz' }
const JUNK_PATTERNS = ['.DS_Store', '__MACOSX', '._*', 'Thumbs.db', 'desktop.ini']

/* the tar arguments for a new archive: items are absolute paths, each added by its own name from its own folder */
function makeArgs({ format = 'zip', level = 'normal', out, items, junk = true, flavour = 'bsd', platform = process.platform, password = '' }) {
  const lv = (LEVEL[format] || LEVEL.zip)[level] ?? LEVEL[format]?.normal ?? 6
  const a = ['-c', '-v', '-f', out]
  if (flavour === 'bsd') {
    // a ZIP locked with a password: AES-256, which a Mac, Windows 11 and 7-Zip open
    if (format === 'zip') a.push('--format', 'zip', '--options', password ? `zip:compression-level=${lv},zip:encryption=aes256` : `zip:compression-level=${lv}`, ...(password ? ['--passphrase', password] : []))
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
/* what a tar can make: bsdtar names the libraries it was built with (Windows' tar.exe has no liblzma, so no 7z or
   tar.xz there); GNU tar makes tar kinds through the compressors this computer has */
function writable(flavour, version, has = () => true) {
  if (flavour === 'bsd') {
    const v = String(version).toLowerCase()
    const listed = /zlib|liblzma|bz2lib/.test(v)
    const zlib = !listed || v.includes('zlib'), lzma = !listed || v.includes('liblzma')
    return ['zip', '7z', 'tar.gz', 'tar.xz'].filter((f) => (f === '7z' || f === 'tar.xz' ? lzma : zlib))
  }
  if (flavour === 'gnu') return [has('gzip') && 'tar.gz', has('xz') && 'tar.xz'].filter(Boolean)
  return []
}
function findTar(platform = process.platform) {
  if (platform === 'win32') {
    const bin = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe')
    let v = ''
    try { v = execFileSync(bin, ['--version'], { encoding: 'utf8', timeout: 5000, windowsHide: true }) } catch { /* an old Windows: no tar */ }
    return { bin: v ? bin : '', flavour: v ? 'bsd' : '', formats: v ? writable('bsd', v) : [] }
  }
  const cands = platform === 'darwin' ? ['/usr/bin/bsdtar', '/usr/bin/tar'] : ['/usr/bin/bsdtar', '/usr/local/bin/bsdtar', '/usr/bin/tar', '/bin/tar']
  for (const bin of cands) {
    if (!fs.existsSync(bin)) continue
    let v = ''
    try { v = execFileSync(bin, ['--version'], { encoding: 'utf8', timeout: 5000 }) } catch { continue }
    const flavour = /bsdtar|libarchive/i.test(v) ? 'bsd' : 'gnu'
    const has = (p) => ['/usr/bin', '/bin', '/usr/local/bin', '/opt/homebrew/bin'].some((d) => fs.existsSync(path.join(d, p)))
    return { bin, flavour, formats: writable(flavour, v, has) }
  }
  return { bin: '', flavour: '', formats: [] }
}
/* the words tar's messages are in: UTF-8, so a Greek name comes back as itself and not as \316\221 escapes (a Mac app
   started from the Finder has no LANG of its own) */
const LOCALE = { darwin: { LC_ALL: 'en_US.UTF-8' }, linux: { LC_ALL: 'C.UTF-8' } }
/* tar's error, said so a person can act on it */
function friendly(err, info = {}) {
  const e = String(err || '')
  if (/no space left|disk full|not enough space/i.test(e)) return 'The drive is full. Free some space, or choose another place for it.'
  if (/truncat|unexpected end|premature end|damaged|corrupt|crc|checksum|bad (archive|header)|invalid (central|zip|header)|not .* archive|unrecognized archive/i.test(e)) return 'The archive is damaged or cut short: it was not downloaded or copied whole.'
  if (/permission denied|operation not permitted|read-only/i.test(e)) return 'This app may not write there. Choose another place.'
  return cleanErr(e) || info.fallback || ''
}

/* run a program, every output line to onLine; stop() ends it */
function run(bin, args, { stop = () => false, onLine = () => {}, env } = {}) {
  return new Promise((ok) => {
    let p
    // no input: a password tar would ask for on a terminal is never waited for (it answers "required" instead)
    try { p = spawn(bin, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: env ? { ...process.env, ...env } : process.env }) } catch (e) { return ok({ code: -1, out: '', err: String(e.message || e) }) }
    const out = [], err = []
    let errLen = 0, killed = false
    const split = (buf, keep) => {
      let rest = ''
      return (c) => { const s = rest + c.toString('utf8'); const lines = s.split(/\r?\n/); rest = lines.pop(); for (const l of lines) { onLine(l); if (keep) keep(l) } }
    }
    p.stdout.on('data', split(null, (l) => out.push(l)))
    // bsdtar's -v writes "x name" / "a name" to stderr: those are progress, not the error, and must not crowd it out
    p.stderr.on('data', split(null, (l) => { if (/^[xa] /.test(l)) return; err.push(l); if (++errLen > 60) err.shift() }))
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
function makeTool({ tar = findTar(), platform = process.platform, freeSpace = defaultFree } = {}) {
  const env = LOCALE[platform]
  const which = (name) => { for (const d of ['/usr/bin', '/usr/local/bin', '/opt/homebrew/bin', '/bin']) { const p = path.join(d, name); if (fs.existsSync(p)) return p } return '' }

  async function list(file, { stop, password = '' } = {}) {
    const k = kindOf(file)
    const dmg = Object.keys(NOT_ARCHIVE).find((e) => String(file).toLowerCase().endsWith(e))
    if (dmg) throw new Error(NOT_ARCHIVE[dmg])
    if (!k) throw new Error('This is not an archive RoarKit knows.')
    const st = await fsp.stat(file)
    if (SINGLE.has(k.kind)) {
      // one file squeezed: what comes out is the same name without the ending
      const name = path.basename(file).slice(0, -k.ext.length) || 'file'
      return { path: file, kind: k.kind, single: true, entries: [{ name, size: 0, mtime: st.mtimeMs, dir: false }], count: 1, files: 1, size: 0, packed: st.size, unsafe: [] }
    }
    if (!tar.bin) throw new Error('This computer has no tar to open archives with.')
    if (tar.flavour === 'gnu' && !/^tar/.test(k.kind)) throw new Error('This computer\'s tar opens only tar archives.')
    const args = ['-t', '-v', '-f', file]
    if (password && tar.flavour === 'bsd') args.push('--passphrase', password)
    const r = await run(tar.bin, args, { stop, env })
    if (r.killed) throw new Stopped()
    // a RAR or 7z whose names are locked too: the names come only with the password
    if (r.code !== 0 && !r.out && needsPass(r.err)) return { path: file, kind: k.kind, needPassword: true, wrong: !!password, packed: st.size }
    if (r.code !== 0 && !r.out) throw new Error(friendly(r.err) || 'The archive could not be read.')
    const entries = parseList(r.out)
    const filesOnly = entries.filter((e) => !e.dir)
    return {
      path: file, kind: k.kind, entries: entries.slice(0, 3000), count: entries.length, files: filesOnly.length,
      size: filesOnly.reduce((n, e) => n + e.size, 0), packed: st.size,
      unsafe: unsafeEntries(entries),
      junk: entries.filter((e) => isJunk(e.name)).length,
      // a listing that ended in an error: the archive is cut short or damaged (audit, 29 Oct: it used to look whole)
      ...(r.code !== 0 ? { damaged: friendly(r.err) || 'The archive is damaged or cut short: it was not downloaded or copied whole.' } : {}),
      ...(password ? { locked: true } : {}),
    }
  }

  async function extract(file, { dest = '', password = '', stop = () => false, tick = () => {} } = {}) {
    const started = Date.now()
    const info = await list(file, { stop, password })
    if (info.needPassword) return { needPassword: true, wrong: info.wrong }
    const parent = dest || path.dirname(file)
    // room enough on the drive for what comes out (the listing says how much); a full drive is said before, not after
    const free = await freeSpace(parent)
    if (free != null && info.size && info.size > free) throw new Error('There is not room enough on that drive for what is inside.')
    const folder = freeName(parent, baseOf(file))
    await fsp.mkdir(folder, { recursive: true })
    // the folder is the app's own, made just now: on Stop, or when nothing could come out, it goes again
    const undo = async () => { await fsp.rm(folder, { recursive: true, force: true }).catch(() => {}) }
    if (info.single) {
      const out = path.join(folder, info.entries[0].name)
      try { await single(file, info.kind, out, { stop, tick }) } catch (e) { await undo(); throw e instanceof Stopped ? e : new Error(friendly(e.message) || e.message) }
      return { folder, count: 1, skipped: [], took: Date.now() - started }
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
      const bad = new Set(info.unsafe)
      const keep = info.entries.length === info.count ? info.entries.filter((e) => !bad.has(e.name)).map((e) => e.name) : null
      if (!keep) { await undo(); throw new Error('This archive has entries that would land outside the folder, and too many entries to leave them out one by one.') }
      // bsdtar reads the list as patterns: a name with [ ] * ? in it is made plain, or it would not be found
      await fsp.writeFile(listFile, keep.map((n) => (tar.flavour === 'bsd' ? plainPattern(n) : n)).join('\n') + '\n')
      args.push('-T', listFile)
    }
    const r = await run(tar.bin, args, { stop, onLine, env })
    if (listFile) await fsp.rm(listFile, { force: true })
    if (r.killed) { await undo(); throw new Stopped() }
    if (r.code !== 0) {
      if (needsPass(r.err)) { await undo(); return { needPassword: true, wrong: !!password } }
      // a damaged archive: what came out stays, and the page says it is partly opened; nothing at all, the folder goes
      let some = 0
      try { some = (await fsp.readdir(folder)).length } catch { /* gone */ }
      if (!some) { await undo(); throw new Error(friendly(r.err) || 'The archive could not be opened.') }
      return { folder, count: Math.min(done, info.count), skipped: info.unsafe, partial: friendly(r.err) || 'The archive is damaged or cut short: it was not downloaded or copied whole.', took: Date.now() - started }
    }
    return { folder, count: info.count - info.unsafe.length, skipped: info.unsafe, took: Date.now() - started }
  }

  /* is every entry whole? Read through to the end without writing anything (the checksums inside are checked) */
  async function test(file, { password = '', stop = () => false, tick = () => {} } = {}) {
    const started = Date.now()
    const info = await list(file, { stop, password })
    if (info.needPassword) return { needPassword: true, wrong: info.wrong }
    if (info.single) {
      if (info.kind !== 'gz') return { ok: true, count: 1, took: 0, light: true }
      try {
        await new Promise((ok, no) => {
          const src = fs.createReadStream(file), z = zlib.createGunzip()
          const watch = setInterval(() => { if (stop()) src.destroy(new Stopped()) }, 250)
          src.on('error', (e) => { clearInterval(watch); no(e) }); z.on('error', (e) => { clearInterval(watch); no(e) })
          z.on('data', () => {}); z.on('end', () => { clearInterval(watch); ok() })
          src.pipe(z)
        })
      } catch (e) { if (e instanceof Stopped) throw e; return { ok: false, count: 1, error: friendly(e.message) || e.message, took: Date.now() - started } }
      return { ok: true, count: 1, took: Date.now() - started }
    }
    const total = info.count || 1
    let done = 0
    const args = ['-x', '-v', '-O', '-f', file]
    if (password && tar.flavour === 'bsd') args.push('--passphrase', password)
    // the content goes to stdout and is read away, never kept; the names come on stderr (bsdtar) or stdout (GNU -v with -O: none)
    const r = await new Promise((ok) => {
      let p
      try { p = spawn(tar.bin, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: env ? { ...process.env, ...env } : process.env }) } catch (e) { return ok({ code: -1, err: String(e.message || e) }) }
      const err = []
      let rest = '', killed = false
      p.stdout.on('data', () => {})
      p.stderr.on('data', (c) => {
        const lines = (rest + c.toString('utf8')).split(/\r?\n/); rest = lines.pop()
        for (const l of lines) { if (/^[x] /.test(l)) { done++; tick({ done: Math.min(done, total), total }) } else if (l) { err.push(l); if (err.length > 40) err.shift() } }
      })
      const watch = setInterval(() => { if (stop() && !killed) { killed = true; p.kill('SIGKILL') } }, 250)
      p.on('error', (e) => { clearInterval(watch); ok({ code: -1, err: String(e.message || e) }) })
      p.on('close', (code) => { clearInterval(watch); ok({ code: killed ? -2 : code, err: err.join('\n'), killed }) })
    })
    if (r.killed) throw new Stopped()
    if (r.code !== 0) {
      if (needsPass(r.err)) return { needPassword: true, wrong: !!password }
      return { ok: false, count: info.count, error: friendly(r.err) || 'The archive is damaged or cut short: it was not downloaded or copied whole.', took: Date.now() - started }
    }
    if (info.damaged) return { ok: false, count: info.count, error: info.damaged, took: Date.now() - started }
    return { ok: true, count: info.count, took: Date.now() - started }
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
    if (!bin) throw new Error('Opening this single compressed file needs a program this computer does not have.')
    const fd = await fsp.open(out, 'wx')
    try {
      await new Promise((ok, no) => {
        const p = spawn(bin, ['-d', '-c', file], { windowsHide: true })
        const w = fs.createWriteStream(null, { fd: fd.fd, autoClose: false })
        p.stdout.pipe(w)
        const watch = setInterval(() => { if (stop()) p.kill('SIGKILL') }, 250)
        p.on('error', (e) => { clearInterval(watch); no(e) })
        p.on('close', (code) => { clearInterval(watch); if (stop()) no(new Stopped()); else if (code) no(new Error('The archive is damaged or cut short: it was not downloaded or copied whole.')); else w.end(ok) })
      })
    } finally { await fd.close() }
  }

  async function make(items, { format = 'zip', level = 'normal', junk = true, name = '', dest = '', password = '', stop = () => false, tick = () => {} } = {}) {
    const started = Date.now()
    if (!items.length) throw new Error('Choose files or folders first.')
    if (!tar.bin) throw new Error('This computer has no tar to make archives with.')
    if (!EXT[format]) throw new Error('Unknown kind of archive.')
    if (tar.formats && !tar.formats.includes(format)) throw new Error('This computer cannot make that kind. Choose ZIP or TAR.GZ.')
    if (password && format !== 'zip') throw new Error('Only a ZIP can have a password.')
    const dir = dest || path.dirname(items[0])
    const base = String(name || (items.length === 1 ? path.parse(items[0]).name : 'Archive')).replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Archive'
    const out = freeName(dir, base.endsWith(EXT[format]) ? base.slice(0, -EXT[format].length) : base, EXT[format])
    const { files, size } = await countItems(items, junk)
    const total = Math.max(1, files)
    let done = 0
    const onLine = (l) => { if (l && !/^(tar|bsdtar)(\.exe)?: /.test(l) && !l.endsWith('/')) { done++; tick({ done: Math.min(done, total), total }) } }
    const free = await freeSpace(dir)
    if (free != null && free < Math.min(size, 50e6)) throw new Error('There is not room enough on that drive.')
    const args = makeArgs({ format, level, out, items, junk, flavour: tar.flavour, platform, password })
    const r = await run(tar.bin, args, { stop, onLine, env: { ...(env || {}), ...(platform === 'darwin' && junk ? { COPYFILE_DISABLE: '1' } : {}) } })
    // the half archive is the app's own new file: it goes (no file of the person's is touched)
    if (r.killed) { await fsp.rm(out, { force: true }); throw new Stopped() }
    if (r.code !== 0) {
      await fsp.rm(out, { force: true })
      if (password && /encrypt|passphrase|crypto/i.test(r.err)) throw new Error('This computer\'s tar cannot lock a ZIP with a password.')
      throw new Error(friendly(r.err) || 'The archive could not be made.')
    }
    const st = await fsp.stat(out)
    return { path: out, size: st.size, files, original: size, took: Date.now() - started, locked: !!password }
  }

  return { list, extract, test, make, tar }
}
// how much a drive has free (null when the computer does not say)
async function defaultFree(dir) { try { const s = await fsp.statfs(dir); return Number(s.bavail) * Number(s.bsize) } catch { return null } }
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
  ctx.handle('archive-info', async () => ({ tar: !!tool.tar.bin, flavour: tool.tar.flavour, formats: tool.tar.formats || [], platform: process.platform }))
  // inside ctx.run: a Stop pressed earlier does not end this one, and a big tar.gz is read through
  ctx.handle('archive-list', ({ path: p, password } = {}) => ctx.run(async () => { need(p); return tool.list(String(p), { stop: ctx.stopped, password: String(password || '') }) }))
  ctx.handle('archive-test', ({ path: p, password } = {}, { emit }) => ctx.run(async () => { need(p); return tool.test(String(p), { password: String(password || ''), stop: ctx.stopped, tick: (v) => emit('archive-progress', v) }) }))
  ctx.handle('archive-extract', ({ path: p, dest, password } = {}, { emit }) => ctx.run(async () => {
    need(p); if (dest) need(dest)
    const r = await tool.extract(String(p), { dest: dest ? String(dest) : '', password: String(password || ''), stop: ctx.stopped, tick: (v) => emit('archive-progress', v) })
    if (r.folder) { allowed.add(r.folder); ctx.allow(r.folder) }
    return r
  }))
  ctx.handle('archive-make', ({ items, format, level, junk, name, dest, password } = {}, { emit }) => ctx.run(async () => {
    const list = (Array.isArray(items) ? items : []).map(String)
    list.forEach(need); if (dest) need(dest)
    const r = await tool.make(list, { format: String(format || 'zip'), level: String(level || 'normal'), junk: junk !== false, name: String(name || ''), dest: dest ? String(dest) : '', password: String(password || ''), stop: ctx.stopped, tick: (v) => emit('archive-progress', v) })
    ctx.allow(r.path)
    return r
  }))
}

module.exports = { register, makeTool, kindOf, baseOf, unsafe, linkOutside, unsafeEntries, unescapeName, plainPattern, isJunk, freeName, parseList, makeArgs, findTar, writable, friendly, countItems, Stopped }
