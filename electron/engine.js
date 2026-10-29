// RoarTwin's engine (The Mad Lions Lab, Oct 2026): finds twins in the folders and drives it is given.
// 1. Exact copies, of any file: the same size, then the same bytes at the start, middle and end, then the same
//    SHA-256 of the whole file. The name plays no part, so a copy renamed is still found, and two files that only
//    share a name are never taken for twins.
// 2. The same video in another file (Alex: "not only by the name, by every technical means"): a video re-exported,
//    in another size, codec or container. ffmpeg reads each video's length, picture size and codec; videos of about
//    the same length are compared by their pictures: nine frames, 10% to 90% through, each shrunk to a 9x8 grey
//    fingerprint (a difference hash). Flat frames (black, white, one colour) say nothing and are left out, so two
//    different black clips are not twins.
// 3. More (Alex, 25 Oct, after a look at what other duplicate finders do): whole folders twice, a video that is a
//    part of a longer one, similar photos, the same sound in another file, editing proxies kept apart, folders marked
//    Masters (never offered for the Trash), and a backup check (is every file of the originals on the backup?).
// 4. Make a twin (Alex, 25 Oct, for the cards of a shoot): a copy of a folder to one or more drives at once, each file
//    read back from every drive and checked against the card's SHA-256, so nothing arrives corrupted.
// Plain Node, no Electron: test/engine.test.js runs it as it is.
const fs = require('fs')
const fsp = fs.promises
const path = require('path')
const crypto = require('crypto')
const { spawn, execFileSync } = require('child_process')
const os = require('os')

const VIDEO = new Set(['mp4', 'mov', 'm4v', 'mkv', 'avi', 'mxf', 'mts', 'm2ts', 'ts', 'wmv', 'webm', 'flv', 'mpg', 'mpeg', 'm2v', '3gp', 'dv', 'vob', 'ogv', 'r3d', 'braw', 'crm', 'insv', 'lrv'])
const IMAGE = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tif', 'tiff'])
// Look for: Images also takes the camera RAWs, HEIC and Photoshop files (no preview made for those); Audio the sound
// of a shoot and of a mix (Alex, 24 Oct)
const PHOTO = new Set([...IMAGE, 'heic', 'heif', 'avif', 'psd', 'psb', 'dng', 'cr2', 'cr3', 'crw', 'nef', 'nrw', 'arw', 'srf', 'sr2', 'raf', 'orf', 'rw2', 'pef', 'srw', 'x3f', '3fr', 'iiq', 'erf', 'kdc', 'mos', 'mrw', 'raw'])
const AUDIO = new Set(['wav', 'bwf', 'aif', 'aiff', 'aifc', 'mp3', 'm4a', 'aac', 'flac', 'alac', 'ogg', 'oga', 'opus', 'wma', 'caf', 'ac3', 'eac3', 'dts', 'mka', 'amr', 'm4b', 'ape', 'wv', 'sd2', 'rf64', 'w64'])
// never worth walking into: the system's own folders and the trash
const SYSTEM = new Set(['$RECYCLE.BIN', 'System Volume Information', '.Trashes', '.Trash', '.Spotlight-V100', '.fseventsd', '.DocumentRevisions-V100', '.TemporaryItems'])
// with "skip hidden and system folders": also the app's own data and a Mac's Library (caches, mail, settings)
const QUIET = new Set(['node_modules', 'Library', 'AppData', 'Program Files', 'Program Files (x86)', 'Windows'])
// a Photos or Final Cut library is one thing on a Mac: its insides are not loose files to tidy
const BUNDLE = /\.(app|photoslibrary|fcpbundle|lrdata|imovielibrary|tvlibrary|logicx)$/i
/* cloud drives (Alex, 24 Oct: 733 GB "seen" on a 250 GB Mac): pCloud, iCloud, Dropbox, Google Drive, OneDrive and the
   like show every file of the cloud as if it were here, and reading one downloads it. With "skip cloud drives" a folder
   by one of these names, and a drive mounted by a cloud app (FUSE or WebDAV on a Mac), is not walked into; a folder
   chosen by hand is looked in all the same, as it was asked for. */
const CLOUD = /^(pcloud ?drive|icloud drive|mobile documents|cloudstorage|dropbox( \(.+\))?|google ?drive.*|my drive|onedrive.*|box drive|creative cloud files.*|megasync|nextcloud|owncloud|proton ?drive|tresorit|synologydrive|icedrive)$/i
let mounts = null
function cloudMounts() {
  if (mounts) return mounts
  mounts = new Set()
  if (process.platform === 'win32') return mounts
  try {
    // "pCloud.fs on /Volumes/pCloud Drive (macfuse, nodev, nosuid)" on a Mac, "x on /p type fuse.y (...)" on Linux
    for (const line of execFileSync('mount', { encoding: 'utf8', timeout: 4000 }).split('\n')) {
      const m = line.match(/^.+? on (.+?) (?:\(([^,)]+)|type (\S+))/)
      if (m && /fuse|webdav|pcloud/i.test(m[2] || m[3] || '')) mounts.add(m[1])
    }
  } catch { /* no mount command: the names still apply */ }
  return mounts
}
const extOf = (f) => path.extname(f).slice(1).toLowerCase()
const isVideo = (f) => VIDEO.has(extOf(f))
const isImage = (f) => IMAGE.has(extOf(f))
// which files a scan takes: 'all', 'video', 'image' or 'audio' (videosOnly from before means 'video')
const KIND = { video: (f) => isVideo(f), image: (f) => PHOTO.has(extOf(f)), audio: (f) => AUDIO.has(extOf(f)) }
const isAudio = (f) => AUDIO.has(extOf(f))
/* an editing proxy: in a Proxy / Proxies / Proxy Media / CacheClip / Optimized Media folder, or named …_Proxy.mov.
   It is the same picture as its original on purpose, so it is never offered as a twin of it. */
const PROXY_DIR = /^(proxy|proxies|proxy media|cacheclip|optimized media|transcoded media)$/i
const isProxy = (f) => /[_ .-]proxy$/i.test(path.parse(f.name).name) || f.dir.split(/[\\/]/).some((d) => PROXY_DIR.test(d))
// the original's name a proxy stands for: A001_C003_Proxy.mp4 -> a001_c003
const proxyBase = (name) => path.parse(name).name.replace(/[_ .-]proxy$/i, '').toLowerCase()
// a path inside a folder (or the folder itself)
const inside = (p, dir) => p === dir || p.startsWith(dir.endsWith(path.sep) ? dir : dir + path.sep)

class Stopped extends Error { constructor() { super('Stopped') } }

/* run a few jobs at a time */
async function pool(items, n, fn, stop) {
  let i = 0
  const run = async () => { while (i < items.length) { if (stop()) throw new Stopped(); const k = i++; await fn(items[k], k) } }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, run))
}

/* every file under the roots: path, size, mtime; one entry per real file (overlapping roots and hard links count once) */
async function list(roots, opts, tick, stop, skipped = []) {
  const out = [], seen = new Set(), dirs = [...roots]
  const cloud = opts.skipCloud ? cloudMounts() : new Set()
  let n = 0
  while (dirs.length) {
    if (stop()) throw new Stopped()
    const dir = dirs.pop()
    let d
    try { d = await fsp.opendir(dir) } catch { continue } // no permission, gone
    for await (const e of d) {
      const p = path.join(dir, e.name)
      if (e.isSymbolicLink()) continue
      if (e.isDirectory()) {
        if (SYSTEM.has(e.name)) continue
        if (opts.skipCloud && (CLOUD.test(e.name) || cloud.has(p))) { skipped.push(p); continue }
        if (opts.skipHidden && (e.name.startsWith('.') || QUIET.has(e.name) || BUNDLE.test(e.name))) continue
        dirs.push(p)
        continue
      }
      if (!e.isFile()) continue
      if (opts.skipHidden && e.name.startsWith('.')) continue
      // a card copied whole keeps its hidden files (a camera may write some); only what a Mac leaves behind stays out
      if (opts.card && (e.name === '.DS_Store' || e.name.startsWith('._'))) continue
      const only = KIND[opts.kind || (opts.videosOnly ? 'video' : 'all')]
      if (only && !only(e.name)) continue
      let st
      try { st = await fsp.stat(p) } catch { continue }
      if (st.size < Math.max(opts.keepEmpty ? 0 : 1, opts.minSize || 0)) continue
      const key = `${st.dev}:${st.ino}`
      if (st.ino && seen.has(key)) continue
      seen.add(key)
      out.push({ path: p, name: e.name, dir, size: st.size, mtime: st.mtimeMs })
      if (++n % 200 === 0) tick({ stage: 'list', files: n })
    }
  }
  tick({ stage: 'list', files: n })
  return out
}

const SAMPLE = 64 * 1024
/* the first, middle and last 64 KB, hashed: two files that differ almost always differ here already */
async function sampleHash(f) {
  const fh = await fsp.open(f.path, 'r')
  try {
    const h = crypto.createHash('sha1')
    const buf = Buffer.alloc(SAMPLE)
    for (const at of f.size <= SAMPLE * 3 ? [0] : [0, Math.floor(f.size / 2) - SAMPLE / 2, f.size - SAMPLE]) {
      const { bytesRead } = await fh.read(buf, 0, SAMPLE, at)
      h.update(buf.subarray(0, bytesRead))
    }
    return h.digest('hex')
  } finally { await fh.close() }
}
/* the whole file */
function fullHash(f, onBytes, stop) {
  return new Promise((ok, bad) => {
    const h = crypto.createHash('sha256')
    const s = fs.createReadStream(f.path, { highWaterMark: 4 * 1024 * 1024 })
    s.on('data', (c) => { if (stop()) { s.destroy(); bad(new Stopped()); return } h.update(c); onBytes(c.length) })
    s.on('error', bad)
    s.on('end', () => ok(h.digest('hex')))
  })
}
const groupBy = (items, key) => { const m = new Map(); for (const x of items) { const k = key(x); if (k == null) continue; const l = m.get(k); l ? l.push(x) : m.set(k, [x]) } return m }

/* exact copies: size, then the samples, then the whole file */
async function exact(files, tick, stop) {
  const bySize = [...groupBy(files, (f) => String(f.size)).values()].filter((l) => l.length > 1)
  const sampled = bySize.flat()
  let done = 0
  await pool(sampled, 6, async (f) => { try { f.sample = await sampleHash(f) } catch { f.sample = null } if (++done % 50 === 0) tick({ stage: 'compare', done, total: sampled.length }) }, stop)
  tick({ stage: 'compare', done, total: sampled.length })
  const bySample = []
  for (const l of bySize) for (const g of groupBy(l, (f) => f.sample).values()) if (g.length > 1) bySample.push(g)
  const toRead = bySample.flat()
  const bytesTotal = toRead.reduce((a, f) => a + f.size, 0)
  let bytesDone = 0, last = 0
  tick({ stage: 'hash', bytesDone, bytesTotal })
  await pool(toRead, 2, async (f) => {
    try { f.hash = await fullHash(f, (n) => { bytesDone += n; if (Date.now() - last > 250) { last = Date.now(); tick({ stage: 'hash', bytesDone, bytesTotal }) } }, stop) } catch (e) { if (e instanceof Stopped) throw e; f.hash = null }
  }, stop)
  const groups = []
  for (const l of bySample) for (const g of groupBy(l, (f) => f.hash).values()) if (g.length > 1) groups.push(g)
  return groups
}

/* Lighter on the computer (Alex, 26 Oct: "make it lighter"): each ffmpeg decodes on one core (on two for a whole video
   read through) and runs at a low priority, and as many run side by side as half the cores, two at least and four at
   most; the Mac stays free for everything else while a scan runs. */
const JOBS = Math.max(2, Math.min(4, Math.floor((os.cpus()?.length || 4) / 2)))
/* ffmpeg, its output as bytes, its log as text */
function ff(bin, args, stop, max = 8 * 1024 * 1024, ms = 60e3, threads = 1) {
  return new Promise((ok) => {
    const p = spawn(bin, ['-hide_banner', '-nostdin', '-threads', String(threads), ...args], { windowsHide: true })
    try { os.setPriority(p.pid, 10) } catch { /* not allowed: it runs as it is */ }
    const out = [], err = []
    let size = 0
    const timer = setTimeout(() => p.kill('SIGKILL'), ms)
    const watch = setInterval(() => { if (stop()) p.kill('SIGKILL') }, 300)
    p.stdout.on('data', (c) => { size += c.length; if (size <= max) out.push(c) })
    p.stderr.on('data', (c) => { if (err.length < 200) err.push(c) })
    p.on('error', () => { clearTimeout(timer); clearInterval(watch); ok({ out: Buffer.alloc(0), log: '', code: -1 }) })
    p.on('close', (code) => { clearTimeout(timer); clearInterval(watch); ok({ out: Buffer.concat(out), log: Buffer.concat(err).toString('utf8'), code }) })
  })
}

/* what ffmpeg says about a video: length, picture size, codec, frame rate */
function parseProbe(log) {
  const m = log.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
  const v = log.match(/Stream #[^\n]*?Video:\s*([a-z0-9_]+)[^\n]*?(\d{2,5})x(\d{2,5})/i)
  if (!m || !v) return null
  const dur = (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3])
  const fps = (log.match(/Video:[^\n]*?([\d.]+)\s*fps/) || [])[1]
  const rot = /rotate\s*:\s*-?(90|270)|displaymatrix: rotation of -?(90|270)/i.test(log)
  const w = +v[2], h = +v[3]
  return { dur, codec: v[1].toLowerCase(), w: rot ? h : w, h: rot ? w : h, fps: fps ? +fps : null }
}
async function probe(bin, file, stop) {
  const { log } = await ff(bin, ['-i', file], stop)
  return parseProbe(log)
}

const AT = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]
/* one frame as a 64-bit difference hash, or null when the frame is flat */
function dhash(px) {
  if (!px || px.length < 72) return null
  let sum = 0, sq = 0
  for (let i = 0; i < 72; i++) { sum += px[i]; sq += px[i] * px[i] }
  const mean = sum / 72, sd = Math.sqrt(Math.max(0, sq / 72 - mean * mean))
  if (sd < 4) return null
  let bits = 0n
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits = (bits << 1n) | (px[y * 9 + x] > px[y * 9 + x + 1] ? 1n : 0n)
  return bits
}
const hamming = (a, b) => { let x = a ^ b, n = 0; while (x) { n += Number(x & 1n); x >>= 1n } return n }
async function fingerprint(bin, f, stop) {
  const prints = []
  for (const p of AT) {
    const t = (f.video.dur * p).toFixed(3)
    const { out } = await ff(bin, ['-ss', t, '-i', f.path, '-frames:v', '1', '-an', '-vf', 'scale=9:8:flags=area,format=gray', '-f', 'rawvideo', '-'], stop, 1024)
    prints.push(dhash(out))
  }
  return prints
}
/* two videos show the same thing when most of their frames, side by side, have nearly the same fingerprint */
function samePictures(a, b) {
  const d = []
  for (let i = 0; i < AT.length; i++) if (a[i] != null && b[i] != null) d.push(hamming(a[i], b[i]))
  if (d.length < 4) return false
  d.sort((x, y) => x - y)
  const close = d.filter((x) => x <= 12).length
  return d[Math.floor(d.length / 2)] <= 10 && close / d.length >= 0.7
}
const closeLength = (a, b) => Math.abs(a - b) <= Math.max(1, 0.01 * Math.max(a, b))

/* the same video in other files: videos of about the same length, compared by their pictures */
async function similar(bin, videos, tick, stop) {
  let done = 0
  tick({ stage: 'video', done, total: videos.length })
  await pool(videos, JOBS, async (f) => { if (!f.video) f.video = await probe(bin, f.path, stop); if (++done % 5 === 0 || done === videos.length) tick({ stage: 'video', done, total: videos.length }) }, stop)
  const ok = videos.filter((f) => f.video && f.video.dur > 0.5).sort((a, b) => a.video.dur - b.video.dur)
  const pairs = []
  for (let i = 0; i < ok.length; i++) for (let j = i + 1; j < ok.length && closeLength(ok[i].video.dur, ok[j].video.dur); j++) pairs.push([ok[i], ok[j]])
  const need = [...new Set(pairs.flat())]
  done = 0
  tick({ stage: 'frames', done, total: need.length })
  await pool(need, JOBS, async (f) => { if (!f.prints) f.prints = await fingerprint(bin, f, stop); done++; tick({ stage: 'frames', done, total: need.length }) }, stop)
  // twins of twins are one group
  const parent = new Map()
  const find = (x) => { while (parent.get(x) !== x) x = parent.get(x); return x }
  for (const f of need) parent.set(f, f)
  for (const [a, b] of pairs) if (samePictures(a.prints, b.prints)) parent.set(find(a), find(b))
  const groups = groupBy(need, (f) => find(f))
  return [...groups.values()].filter((g) => g.length > 1)
}

/* the one to keep: one in a Masters folder first; then for the same video the biggest picture, then the most data; for
   a part, the full video; for photos the most pixels; for sound the most data (WAV over MP3); for exact copies and
   folders, the oldest */
function suggest(g, kind) {
  const score = (f) => [f.protected ? 1 : 0, ...(kind === 'similar' ? [(f.video?.w || 0) * (f.video?.h || 0), f.size, -f.mtime]
    : kind === 'part' ? [f.video?.dur || 0, f.size, 0]
    : kind === 'photo' ? [(f.dims?.w || 0) * (f.dims?.h || 0), f.size, -f.mtime]
    : kind === 'sound' ? [f.size, -f.mtime, 0]
    : [-f.mtime, -f.path.length, 0])]
  let best = g[0]
  for (const f of g.slice(1)) { const a = score(f), b = score(best); for (let i = 0; i < 4; i++) { if (a[i] !== b[i]) { if (a[i] > b[i]) best = f; break } } }
  return best
}

/* ---------- 64-bit fingerprints as two numbers, for comparing many quickly ---------- */
const pop32 = (x) => { x -= (x >>> 1) & 0x55555555; x = (x & 0x33333333) + ((x >>> 2) & 0x33333333); return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24 }
const split64 = (b) => (b == null ? null : [Number(b >> 32n), Number(b & 0xffffffffn)])
const ham64 = (a, b) => pop32(a[0] ^ b[0]) + pop32(a[1] ^ b[1])
// twins of twins are one group
function unite(items, pairs) {
  const parent = new Map(items.map((x) => [x, x]))
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x) } return x }
  for (const [a, b] of pairs) parent.set(find(a), find(b))
  return [...groupBy(items, (x) => find(x)).values()].filter((g) => g.length > 1)
}

/* ---------- whole folders twice ---------- */
/* A folder whose every file has an exact twin, and another folder holding the same twins, file for file, are the same
   folder twice (whatever the files are called). Only the outermost such folders are shown (a subfolder of two twins
   is not news), and the file groups that lie wholly inside them are then shown there only. */
function dupFolders(files, exactGroups, roots) {
  const gid = new Map()
  exactGroups.forEach((g, i) => g.forEach((f) => gid.set(f, i)))
  const dirs = new Map()
  for (const f of files) {
    let d = f.dir
    for (;;) {
      let e = dirs.get(d)
      if (!e) dirs.set(d, (e = { path: d, ids: [], size: 0, n: 0, ok: true, mtime: 0 }))
      const id = gid.get(f)
      if (id == null) e.ok = false; else e.ids.push(id)
      e.size += f.size; e.n++; e.mtime = Math.max(e.mtime, f.mtime)
      if (roots.includes(d)) break
      const up = path.dirname(d)
      if (up === d) break
      d = up
    }
  }
  const sig = (e) => crypto.createHash('sha1').update(e.ids.sort((a, b) => a - b).join(',')).digest('hex')
  const bySig = groupBy([...dirs.values()].filter((e) => e.ok && e.n >= 2), sig)
  const groups = [...bySig.values()]
    // a folder that only wraps its twin (old/ holding nothing but CARD_A copy/) gives way to the folder inside it
    .map((l) => l.filter((e) => !l.some((o) => o !== e && inside(o.path, e.path))))
    .filter((l) => l.length > 1)
    .sort((a, b) => b[0].size - a[0].size)
  const taken = []
  const out = []
  for (const l of groups) {
    if (l.every((e) => taken.some((t) => inside(e.path, t)))) continue
    l.forEach((e) => taken.push(e.path))
    out.push(l.map((e) => ({ path: e.path, name: path.basename(e.path) || e.path, dir: path.dirname(e.path), size: e.size, mtime: e.mtime, count: e.n, folder: true })))
  }
  return out
}

/* ---------- a video that is a part of a longer one ---------- */
/* Every video, one frame a second, each a 9x8 fingerprint. A shorter video whose frames match a stretch of a longer one,
   frame for frame, is a part of it (a trim, a teaser cut out of the full clip), and where it starts is kept. Reading
   every video through takes time, so it is a choice of its own. */
async function framesPerSecond(bin, f, stop) {
  const n = Math.ceil(f.video.dur) + 2
  const { out } = await ff(bin, ['-i', f.path, '-an', '-sn', '-vf', 'fps=1,scale=9:8:flags=area,format=gray', '-f', 'rawvideo', '-'], stop, n * 72 + 1024, Math.max(60e3, f.video.dur * 1500), 2)
  const prints = []
  for (let i = 0; i + 72 <= out.length; i += 72) prints.push(split64(dhash(out.subarray(i, i + 72))))
  return prints
}
// the second of the long video where the short one starts, or -1: of every place where it fits, the closest
function partAt(sp, lp) {
  const valid = sp.map((x, i) => (x ? i : -1)).filter((i) => i >= 0)
  if (valid.length < 3 || lp.length < sp.length) return -1
  const a = valid[Math.floor(valid.length / 2)]
  let best = -1, bestMean = Infinity
  for (let k = 0; k + sp.length <= lp.length + 1; k++) {
    const at = lp[k + a]
    if (!at || ham64(sp[a], at) > 10) continue
    const d = []
    for (const i of valid) if (lp[k + i]) d.push(ham64(sp[i], lp[k + i]))
    if (d.length < Math.max(3, valid.length * 0.6)) continue
    d.sort((x, y) => x - y)
    if (d[Math.floor(d.length / 2)] > 8 || d.filter((x) => x <= 12).length / d.length < 0.75) continue
    const mean = d.reduce((x, y) => x + y, 0) / d.length
    if (mean < bestMean) { bestMean = mean; best = k }
  }
  return best
}
async function parts(bin, videos, tick, stop) {
  let done = 0
  tick({ stage: 'video', done, total: videos.length })
  await pool(videos, JOBS, async (f) => { if (!f.video) f.video = await probe(bin, f.path, stop); done++; tick({ stage: 'video', done, total: videos.length }) }, stop)
  const ok = videos.filter((f) => f.video && f.video.dur >= 3 && f.video.dur <= 3 * 3600)
  const pairs = []
  for (const s of ok) for (const l of ok) if (s !== l && s.video.dur <= 900 && l.video.dur > s.video.dur * 1.1 + 1) pairs.push([s, l])
  const need = [...new Set(pairs.flat())]
  done = 0
  tick({ stage: 'parts', done, total: need.length })
  await pool(need, Math.max(1, JOBS >> 1), async (f) => { if (!f.secs) f.secs = await framesPerSecond(bin, f, stop); done++; tick({ stage: 'parts', done, total: need.length }) }, stop)
  const found = []
  const seen = new Set()
  // the longest video a short one is part of
  for (const [s, l] of pairs.sort((a, b) => b[1].video.dur - a[1].video.dur)) {
    if (seen.has(s)) continue
    const k = partAt(s.secs, l.secs)
    if (k >= 0) { seen.add(s); s.partAt = k; found.push([l, s]) }
  }
  return found
}

/* ---------- similar photos ---------- */
/* Each picture shrunk to a 9x8 fingerprint: the same photo saved again, resized or re-compressed, and shots of a burst
   that are nearly alike come out within a few bits of each other. Pictures of another shape are never alike. */
async function photos(bin, images, tick, stop) {
  let done = 0
  tick({ stage: 'photos', done, total: images.length })
  await pool(images, JOBS, async (f) => {
    // a JPEG is read at an eighth of its size: twice as fast, the same fingerprint
    const { out, log } = await ff(bin, [...(/\.jpe?g$/i.test(f.name) ? ['-lowres', '3'] : []), '-i', f.path, '-frames:v', '1', '-vf', 'scale=9:8:flags=area,format=gray', '-f', 'rawvideo', '-'], stop, 1024)
    f.print = split64(dhash(out))
    const v = log.match(/Video:[^\n]*?(\d{2,5})x(\d{2,5})/)
    f.dims = v ? { w: +v[1], h: +v[2] } : null
    done++; if (done % 10 === 0 || done === images.length) tick({ stage: 'photos', done, total: images.length })
  }, stop)
  const ok = images.filter((f) => f.print && f.dims)
  const pairs = []
  for (let i = 0; i < ok.length; i++) {
    if (i % 500 === 0 && stop()) throw new Stopped()
    const a = ok[i], ra = a.dims.w / a.dims.h
    for (let j = i + 1; j < ok.length; j++) {
      const b = ok[j]
      if (Math.abs(ra - b.dims.w / b.dims.h) > 0.03 * ra) continue
      if (ham64(a.print, b.print) <= 6) pairs.push([a, b])
    }
  }
  return unite(ok, pairs)
}

/* ---------- the same sound in another file ---------- */
/* WAV, AIFF, MP3, M4A of the same recording: about the same length, then the sound itself compared, the way audio
   fingerprints work (Haitsma and Kalker): 40 seconds from a tenth of the way in, as 32 bits every 46 ms that say
   whether the energy rises or falls between 33 bands from 300 Hz to 2 kHz and from one moment to the next. The same
   recording in another format keeps almost every bit; another recording keeps about half. Silence is left out. */
function parseAudio(log) {
  const m = log.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
  const a = log.match(/Stream #[^\n]*?Audio:\s*([a-z0-9_]+)[^\n]*?(\d{4,6}) Hz/i)
  if (!m || !a) return null
  const br = (log.match(/Audio:[^\n]*?(\d+) kb\/s/) || [])[1]
  return { dur: (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]), codec: a[1].toLowerCase(), rate: +a[2], kbps: br ? +br : null }
}
const RATE = 11025, WIN = 2048, HOP = 512, BANDS = 33
const EDGES = Array.from({ length: BANDS + 1 }, (_, i) => Math.round(300 * Math.pow(2000 / 300, i / BANDS) * WIN / RATE))
const HANN = Float64Array.from({ length: WIN }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (WIN - 1)))
function fftMag(re) {
  const n = re.length, im = new Float64Array(n)
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { const t = re[i]; re[i] = re[j]; re[j] = t } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr
      }
    }
  }
  return (k) => re[k] * re[k] + im[k] * im[k]
}
function soundPrint(pcm) {
  const frames = []
  let prev = null
  for (let at = 0; at + WIN <= pcm.length; at += HOP) {
    const buf = new Float64Array(WIN)
    let energy = 0
    for (let i = 0; i < WIN; i++) { buf[i] = pcm[at + i] * HANN[i]; energy += buf[i] * buf[i] }
    const mag = fftMag(buf)
    const e = new Float64Array(BANDS)
    for (let b = 0; b < BANDS; b++) { let sum = 0; for (let k = EDGES[b]; k < EDGES[b + 1]; k++) sum += mag(k); e[b] = sum }
    if (prev) {
      let bits = 0
      for (let b = 0; b < 32; b++) if ((e[b] - e[b + 1]) - (prev[b] - prev[b + 1]) > 0) bits |= 1 << b
      frames.push(energy / WIN > 4e-5 ? bits >>> 0 : null)
    }
    prev = e
  }
  return frames
}
async function soundOf(bin, f, stop) {
  const from = Math.min(30, f.audio.dur * 0.1)
  const { out } = await ff(bin, ['-ss', from.toFixed(2), '-i', f.path, '-t', '40', '-vn', '-ac', '1', '-ar', String(RATE), '-f', 's16le', '-'], stop, RATE * 2 * 42)
  const pcm = new Float64Array(out.length >> 1)
  for (let i = 0; i < pcm.length; i++) pcm[i] = out.readInt16LE(i * 2) / 32768
  return soundPrint(pcm)
}
// the share of bits that differ at the best of a few small shifts (an encoder's delay), or 1 when too little to say
function soundDiff(a, b) {
  let best = 1
  for (let s = -4; s <= 4; s++) {
    let bits = 0, n = 0
    for (let i = Math.max(0, -s); i < a.length && i + s < b.length; i++) {
      const x = a[i], y = b[i + s]
      if (x == null || y == null) continue
      bits += pop32((x ^ y) | 0); n++
    }
    if (n >= 60) best = Math.min(best, bits / (n * 32))
  }
  return best
}
async function sounds(bin, list, tick, stop) {
  let done = 0
  tick({ stage: 'sound', done, total: list.length })
  await pool(list, JOBS, async (f) => { const { log } = await ff(bin, ['-i', f.path], stop); f.audio = parseAudio(log); done++; tick({ stage: 'sound', done, total: list.length }) }, stop)
  const ok = list.filter((f) => f.audio && f.audio.dur >= 5).sort((a, b) => a.audio.dur - b.audio.dur)
  const pairs = []
  for (let i = 0; i < ok.length; i++) for (let j = i + 1; j < ok.length && closeLength(ok[i].audio.dur, ok[j].audio.dur); j++) pairs.push([ok[i], ok[j]])
  const need = [...new Set(pairs.flat())]
  done = 0
  tick({ stage: 'listen', done, total: need.length })
  await pool(need, JOBS, async (f) => { if (!f.sound) f.sound = await soundOf(bin, f, stop); done++; tick({ stage: 'listen', done, total: need.length }) }, stop)
  return unite(need, pairs.filter(([a, b]) => soundDiff(a.sound, b.sound) <= 0.2))
}

/* a small picture of a video or an image, as a data URL: for a video the key frame nearest 40% in (three times faster
   than the exact frame, and only a preview), a JPEG read at a size still above the preview's */
async function thumb(bin, f, stop) {
  const w = f.dims?.w || 0
  const low = /\.jpe?g$/i.test(f.name) ? ['-lowres', w >= 2560 ? '3' : w >= 1280 ? '2' : '1'] : []
  const pic = (at) => ff(bin, [...at, '-i', f.path, '-frames:v', '1', '-an', '-vf', 'scale=320:-2', '-c:v', 'mjpeg', '-q:v', '6', '-f', 'image2pipe', '-'], stop, 400 * 1024)
  const ss = f.video ? ['-ss', (f.video.dur * 0.4).toFixed(2)] : low
  // no key frame after that point (a short clip with one at its start): the exact frame after all
  let { out } = await pic(f.video ? ['-skip_frame', 'nokey', ...ss] : ss)
  if (out.length <= 100 && f.video) out = (await pic(ss)).out
  return out.length > 100 ? 'data:image/jpeg;base64,' + out.toString('base64') : ''
}

/*
 * scan({ roots, protect, kind: 'all' | 'video' | 'image' | 'audio', similar, parts, photos, sounds, proxies, minSize,
 *        skipHidden, skipCloud, ffmpeg }, tick, stop) ->
 *   { groups: [{ id, kind, size, free, files: [{ path, name, dir, size, mtime, video, thumb, keep, protected, ... }] }],
 *     files, took, cloud }
 * kind of a group: 'exact', 'similar' (the same video), 'folder' (the same folder twice), 'part' (a part of a longer
 * video), 'photo' (similar photos), 'sound' (the same sound) or 'orphan' (a proxy whose original is not in the scan).
 * tick(progress) is called often; stop() returning true ends the scan with a Stopped error.
 */
async function scan(opts, tick = () => {}, stop = () => false) {
  const t0 = Date.now()
  const roots = [...new Set((opts.roots || []).map((r) => path.resolve(r)))]
  const protect = [...new Set((opts.protect || []).map((r) => path.resolve(r)))]
  const cloud = []
  const files = await list(roots, opts, tick, stop, cloud)
  for (const f of files) if (protect.some((p) => inside(f.path, p))) f.protected = true
  const kind = opts.kind || (opts.videosOnly ? 'video' : 'all')
  const keepProxies = opts.proxies !== false
  const exactGroups = await exact(files, tick, stop)
  const out = exactGroups.map((g) => ({ kind: 'exact', files: g }))
  // one file of each exact group stands for it; the rest are already twins
  const inExact = new Set(exactGroups.flatMap((g) => g.slice(1)))
  if (opts.folders !== false) {
    tick({ stage: 'folders' })
    const fold = dupFolders(files, exactGroups, roots)
    for (const g of fold) {
      for (const d of g) if (protect.some((p) => inside(d.path, p))) d.protected = true
      out.push({ kind: 'folder', files: g })
    }
    // file groups wholly inside the twin folders are shown there only
    const dirs = fold.flat().map((d) => d.path)
    for (let i = out.length - 1; i >= 0; i--) if (out[i].kind === 'exact' && out[i].files.every((f) => dirs.some((d) => inside(f.path, d)))) out.splice(i, 1)
  }
  const videos = opts.ffmpeg && (kind === 'all' || kind === 'video') ? files.filter((f) => isVideo(f.name) && !inExact.has(f) && !(keepProxies && isProxy(f))) : []
  if (opts.similar !== false && videos.length) {
    const sim = await similar(opts.ffmpeg, videos, tick, stop)
    for (const g of sim) {
      // a group that is all one exact copy is not news; otherwise bring the exact copies of its members in too
      const members = new Set(g)
      for (const e of exactGroups) if (members.has(e[0])) e.forEach((f) => members.add(f))
      const all = [...members]
      if (all.every((f) => f.hash && f.hash === all[0].hash)) continue
      out.push({ kind: 'similar', files: all })
    }
    // the exact groups that are now inside a same-video group are shown there only
    const shown = new Set(out.filter((g) => g.kind === 'similar').flatMap((g) => g.files))
    for (let i = out.length - 1; i >= 0; i--) if (out[i].kind === 'exact' && out[i].files.every((f) => shown.has(f))) out.splice(i, 1)
  }
  if (opts.parts && videos.length) {
    const together = new Map()
    out.filter((g) => g.kind === 'similar').forEach((g, i) => g.files.forEach((f) => together.set(f, i)))
    for (const [l, sh] of await parts(opts.ffmpeg, videos, tick, stop)) {
      if (together.has(l) && together.get(l) === together.get(sh)) continue
      out.push({ kind: 'part', files: [l, sh] })
    }
  }
  if (opts.photos !== false && opts.ffmpeg && (kind === 'all' || kind === 'image')) {
    const images = files.filter((f) => isImage(f.name) && f.size >= 30e3 && !inExact.has(f))
    for (const g of await photos(opts.ffmpeg, images, tick, stop)) {
      const all = new Set(g)
      for (const e of exactGroups) if (all.has(e[0])) e.forEach((f) => all.add(f))
      out.push({ kind: 'photo', files: [...all] })
    }
    const shown = new Set(out.filter((g) => g.kind === 'photo').flatMap((g) => g.files))
    for (let i = out.length - 1; i >= 0; i--) if (out[i].kind === 'exact' && out[i].files.every((f) => shown.has(f))) out.splice(i, 1)
  }
  if (opts.sounds !== false && opts.ffmpeg && (kind === 'all' || kind === 'audio')) {
    const list2 = files.filter((f) => isAudio(f.name) && !inExact.has(f))
    for (const g of await sounds(opts.ffmpeg, list2, tick, stop)) {
      const all = new Set(g)
      for (const e of exactGroups) if (all.has(e[0])) e.forEach((f) => all.add(f))
      const members = [...all]
      if (members.every((f) => f.hash && f.hash === members[0].hash)) continue
      out.push({ kind: 'sound', files: members })
    }
    const shown = new Set(out.filter((g) => g.kind === 'sound').flatMap((g) => g.files))
    for (let i = out.length - 1; i >= 0; i--) if (out[i].kind === 'exact' && out[i].files.every((f) => shown.has(f))) out.splice(i, 1)
  }
  // proxies whose original is nowhere in the folders looked at: listed apart, one a group, nothing chosen
  if (keepProxies && (kind === 'all' || kind === 'video')) {
    const originals = new Set(files.filter((f) => isVideo(f.name) && !isProxy(f)).map((f) => proxyBase(f.name)))
    for (const f of files) if (isVideo(f.name) && isProxy(f) && !originals.has(proxyBase(f.name))) out.push({ kind: 'orphan', files: [f] })
  }
  // what each file is, the one to keep, a picture
  const all = out.flatMap((g) => g.files).filter((f) => !f.folder)
  let done = 0
  if (opts.ffmpeg) {
    tick({ stage: 'thumbs', done, total: all.length })
    await pool(all, JOBS, async (f) => {
      if (isVideo(f.name) && !f.video) f.video = await probe(opts.ffmpeg, f.path, stop)
      if ((isVideo(f.name) && f.video) || isImage(f.name)) { if (!f.thumb) f.thumb = await thumb(opts.ffmpeg, f, stop) }
      done++; tick({ stage: 'thumbs', done, total: all.length })
    }, stop)
  }
  const groups = out.map((g, i) => {
    const keep = g.kind === 'orphan' ? null : suggest(g.files, g.kind)
    const size = g.files.reduce((a, f) => a + f.size, 0)
    return {
      id: 'g' + i, kind: g.kind, size, free: keep ? size - keep.size : size,
      files: g.files.map((f) => ({
        path: f.path, name: f.name, dir: f.dir, size: f.size, mtime: f.mtime, video: f.video || null, thumb: f.thumb || '', keep: f === keep,
        protected: !!f.protected, folder: !!f.folder, count: f.count || 0, partAt: f.partAt ?? null, audio: f.audio || null, dims: f.dims || null, proxy: !f.folder && isProxy(f),
      })),
    }
  }).sort((a, b) => b.free - a.free)
  return { groups, files: files.length, took: Date.now() - t0, cloud, protect }
}

/* ---------- is every file of the originals on the backup? ---------- */
/* Every file under the originals (a card, a shoot) is looked for on the backup by what it holds, not by its name or
   place: the same size, the same samples, then the same SHA-256 of the whole file. A file with no such twin on the
   backup is missing; if a file sits at the same place on the backup with other bytes, it is different there. */
async function backupCheck(opts, tick = () => {}, stop = () => false) {
  const t0 = Date.now()
  const source = path.resolve(opts.source), backup = path.resolve(opts.backup)
  if (inside(backup, source) || inside(source, backup)) throw new Error('The originals and the backup cannot be one inside the other.')
  const lo = { skipHidden: opts.skipHidden !== false, skipCloud: opts.skipCloud !== false, minSize: 1 }
  const cloud = []
  const src = await list([source], lo, tick, stop, cloud)
  const dst = await list([backup], lo, tick, stop, cloud)
  const bySize = groupBy(dst, (f) => String(f.size))
  const need = new Set()
  for (const f of src) { const c = bySize.get(String(f.size)); if (c) { need.add(f); c.forEach((x) => need.add(x)) } }
  let done = 0
  const sampled = [...need]
  await pool(sampled, 6, async (f) => { try { f.sample = await sampleHash(f) } catch { f.sample = null } if (++done % 50 === 0) tick({ stage: 'compare', done, total: sampled.length }) }, stop)
  tick({ stage: 'compare', done, total: sampled.length })
  // the files to read whole: each original with a sample twin, and those twins
  const cands = new Map()
  for (const f of src) {
    const c = f.sample ? (bySize.get(String(f.size)) || []).filter((x) => x.sample === f.sample) : []
    if (c.length) cands.set(f, c)
  }
  const toRead = [...new Set([...cands.keys(), ...[...cands.values()].flat()])]
  const bytesTotal = toRead.reduce((a, f) => a + f.size, 0)
  let bytesDone = 0, last = 0
  tick({ stage: 'hash', bytesDone, bytesTotal })
  await pool(toRead, 2, async (f) => {
    try { f.hash = await fullHash(f, (n) => { bytesDone += n; if (Date.now() - last > 250) { last = Date.now(); tick({ stage: 'hash', bytesDone, bytesTotal }) } }, stop) } catch (e) { if (e instanceof Stopped) throw e; f.hash = null }
  }, stop)
  const atPlace = new Map(dst.map((f) => [path.relative(backup, f.path), f]))
  const missing = []
  let safe = 0, safeBytes = 0
  for (const f of src) {
    const ok = f.hash && (cands.get(f) || []).some((x) => x.hash === f.hash)
    if (ok) { safe++; safeBytes += f.size; continue }
    const there = atPlace.get(path.relative(source, f.path))
    missing.push({ path: f.path, name: f.name, dir: f.dir, size: f.size, mtime: f.mtime, why: there ? 'differs' : 'missing', other: there ? there.path : '' })
  }
  missing.sort((a, b) => b.size - a.size)
  return { mode: 'backup', source, backup, total: src.length, totalBytes: src.reduce((a, f) => a + f.size, 0), safe, safeBytes, missing, cloud, took: Date.now() - t0 }
}

/* ---------- make a twin: copy a card to one or more drives, and check every copy ---------- */
/* The card is read once; each piece goes to every drive at the same time, and the card's SHA-256 is worked out on the
   way. Each file is written under a temporary name and only takes its own name once whole, with the card's dates. Then
   every copy is read back from its drive and its SHA-256 compared with the card's: the same, or it is reported. Nothing
   is ever written over: a file already there with the same bytes counts as copied, one with other bytes is reported
   and left alone. Each copy gets a report (CSV: every file, its size, its SHA-256, the result), and an ASC MHL v1.1
   hash list (Alex, 28 Oct: the file post houses and insurers ask for; its MD5 is worked out in the same read). */
const PART = '.roartwin-part'
const stamp = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}-${String(d.getMinutes()).padStart(2, '0')}`
async function hashFile(p, onBytes, stop) { return fullHash({ path: p }, onBytes, stop) }
async function makeTwin(opts, tick = () => {}, stop = () => false) {
  const t0 = Date.now()
  const source = path.resolve(opts.source)
  const targets = [...new Set((opts.targets || []).map((t) => path.resolve(t)))]
  if (!targets.length) throw new Error('Choose where the copy goes.')
  for (const t of targets) if (inside(t, source) || inside(source, t)) throw new Error('The card and where it is copied cannot be one inside the other.')
  // where the copy goes on each drive: the card's own name, or a folder path from the naming rule (Date_Project/Day01/
  // CamA_Card03), each part made safe for Mac and Windows
  const named = String(opts.folder || '').split(/[\\/]+/).map((x) => x.replace(/[:*?"<>|\x00-\x1f]/g, '-').replace(/^\.+/, '').trim()).filter(Boolean)
  const name = named.length ? path.join(...named) : path.basename(source) || 'Copy'
  // the whole card, hidden files too, whatever "Skip hidden and system folders" says (28 Oct: a backup leaves nothing out;
  // only a Mac's own leftovers, .DS_Store, ._ files, .Spotlight and the like, stay out)
  const files = await list([source], { skipHidden: false, skipCloud: false, keepEmpty: true, card: true }, tick, stop, [])
  const bytesTotal = files.reduce((a, f) => a + f.size, 0)
  // room on every drive first
  for (const t of targets) {
    try {
      const st = await fsp.statfs(t)
      const free = st.bavail * st.bsize
      if (free < bytesTotal) throw Object.assign(new Error(`Not enough room on ${t}: the copy needs ${(bytesTotal / 1e9).toFixed(1)} GB, ${(free / 1e9).toFixed(1)} GB are free.`), { room: true })
    } catch (e) { if (e.room) throw e }
  }
  const dests = targets.map((t) => path.join(t, name))
  const rows = new Map(files.map((f) => [f, { file: f, rel: path.relative(source, f.path), hash: '', md5: '', hashedAt: '', results: dests.map(() => '') }]))
  const failed = []
  const fail = (f, i, error) => { rows.get(f).results[i] = 'failed'; failed.push({ path: f.path, name: f.name, target: dests[i], error }) }
  let bytesDone = 0, last = 0
  const report = (stage) => { if (Date.now() - last > 250) { last = Date.now(); tick({ stage, bytesDone, bytesTotal }) } }
  tick({ stage: 'copy', bytesDone, bytesTotal })
  for (const f of files) {
    if (stop()) throw new Stopped()
    const row = rows.get(f)
    const outs = []
    for (let i = 0; i < dests.length; i++) {
      const to = path.join(dests[i], row.rel)
      try {
        const there = await fsp.stat(to).catch(() => null)
        if (there) { row.results[i] = there.size === f.size ? 'check' : 'failed'; if (there.size !== f.size) fail(f, i, 'A different file with this name is already there; it was left alone.'); continue }
        await fsp.mkdir(path.dirname(to), { recursive: true })
        outs.push({ i, to, tmp: to + PART, fh: await fsp.open(to + PART, 'wx') })
      } catch (e) { fail(f, i, String(e?.message || e)) }
    }
    const h = crypto.createHash('sha256')
    const h5 = crypto.createHash('md5')
    try {
      const rs = fs.createReadStream(f.path, { highWaterMark: 4 * 1024 * 1024 })
      for await (const chunk of rs) {
        if (stop()) { rs.destroy(); throw new Stopped() }
        h.update(chunk); h5.update(chunk)
        await Promise.all(outs.filter((o) => !o.err).map((o) => o.fh.write(chunk).catch((e) => { o.err = e })))
        bytesDone += chunk.length; report('copy')
      }
      row.hash = h.digest('hex'); row.md5 = h5.digest('hex'); row.hashedAt = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
    } catch (e) {
      for (const o of outs) { await o.fh.close().catch(() => {}); await fsp.rm(o.tmp, { force: true }) }
      if (e instanceof Stopped) throw e
      dests.forEach((_, i) => { if (row.results[i] !== 'failed') fail(f, i, 'The card could not be read: ' + (e?.message || e)) })
      continue
    }
    for (const o of outs) {
      try {
        if (o.err) throw o.err
        await o.fh.sync(); await o.fh.close()
        await fsp.rename(o.tmp, o.to)
        await fsp.utimes(o.to, new Date(), new Date(f.mtime))
        row.results[o.i] = 'written'
      } catch (e) { await o.fh.close().catch(() => {}); await fsp.rm(o.tmp, { force: true }); fail(f, o.i, String(e?.message || e)) }
    }
  }
  // every copy read back from its drive
  const toCheck = []
  for (const row of rows.values()) row.results.forEach((r, i) => { if (r === 'written' || r === 'check') toCheck.push([row, i]) })
  const vTotal = toCheck.reduce((a, [row]) => a + row.file.size, 0)
  let vDone = 0
  last = 0
  tick({ stage: 'verify', bytesDone: 0, bytesTotal: vTotal })
  for (const [row, i] of toCheck) {
    const to = path.join(dests[i], row.rel)
    let got = ''
    try { got = await hashFile(to, (n) => { vDone += n; if (Date.now() - last > 250) { last = Date.now(); tick({ stage: 'verify', bytesDone: vDone, bytesTotal: vTotal }) } }, stop) } catch (e) { if (e instanceof Stopped) throw e }
    if (got && got === row.hash) row.results[i] = row.results[i] === 'check' ? 'already there' : 'verified'
    else fail(row.file, i, row.results[i] === 'check' ? 'A different file with this name is already there; it was left alone.' : 'The copy is not the same as the card (corrupted on the way). Copy it again.')
  }
  // the report, in each copy
  const when = stamp()
  const reports = [], mhl = []
  const ok = (r) => r === 'verified' || r === 'already there'
  const q = (x) => `"${String(x ?? '').replace(/"/g, '""')}"`
  for (let i = 0; i < dests.length; i++) {
    const lines = [['File', 'Size (bytes)', 'SHA-256', 'Result'].map(q).join(',')]
    for (const row of rows.values()) lines.push([row.rel, row.file.size, row.hash, row.results[i] || 'failed'].map(q).join(','))
    const rp = path.join(dests[i], `_RoarTwin copy report ${when}.csv`)
    try { await fsp.mkdir(dests[i], { recursive: true }); await fsp.writeFile(rp, '﻿' + lines.join('\r\n'), 'utf8'); reports.push(rp) } catch { /* the drive went away: the failures say so */ }
    // the MHL: only the files that are right on this drive
    const mp = path.join(dests[i], `_RoarTwin copy ${when}.mhl`)
    try { await fsp.writeFile(mp, mhlOf([...rows.values()].filter((r) => r.md5 && ok(r.results[i])), opts.version), 'utf8'); mhl.push(mp) } catch { /* as above */ }
  }
  const all = [...rows.values()]
  return {
    mode: 'twin', source, targets: dests, reports, mhl, total: files.length, bytes: bytesTotal,
    verified: all.filter((r) => r.results.every(ok)).length,
    already: all.filter((r) => r.results.some((x) => x === 'already there')).length,
    failed, took: Date.now() - t0,
  }
}

/* ASC MHL v1.1: one <hash> a file, its path inside the copy (forward slashes), size, date, MD5 */
const xml = (x) => String(x ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const isoS = (ms) => new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z')
function mhlOf(rows, version = '') {
  const now = isoS(Date.now())
  return ['<?xml version="1.0" encoding="UTF-8"?>', '<hashlist version="1.1">',
    '  <creatorinfo>', `    <name>${xml((() => { try { return os.userInfo().username } catch { return '' } })())}</name>`, `    <hostname>${xml(os.hostname())}</hostname>`,
    `    <tool>RoarTwin${version ? ' ' + xml(version) : ''}</tool>`, `    <startdate>${now}</startdate>`, `    <finishdate>${now}</finishdate>`, '  </creatorinfo>',
    ...rows.map((r) => ['  <hash>', `    <file>${xml(r.rel.split(path.sep).join('/'))}</file>`, `    <size>${r.file.size}</size>`,
      `    <lastmodificationdate>${isoS(r.file.mtime)}</lastmodificationdate>`, `    <md5>${r.md5}</md5>`, `    <hashdate>${r.hashedAt}</hashdate>`, '  </hash>'].join('\n')),
    '</hashlist>', ''].join('\n')
}

/* ---------- a drive checked again against its copy report, months later ---------- */
/* Drives go bad on the shelf without a sound (bit rot). The report a twin left in its folder holds every file's SHA-256
   from the day it was copied; reading the folder again and comparing tells what is still the same, what has changed
   and what is gone. The newest report in the folder is used. */
function readCsv(text) {
  const rows = []
  let row = [], cell = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++ } else q = false } else cell += c; continue }
    if (c === '"') q = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = '' }
    else cell += c
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  return rows
}
async function recheck(opts, tick = () => {}, stop = () => false) {
  const t0 = Date.now()
  const folder = path.resolve(opts.folder)
  const reports = (await fsp.readdir(folder)).filter((n) => /^_RoarTwin copy report .*\.csv$/i.test(n)).sort()
  if (!reports.length) throw new Error('There is no RoarTwin copy report in this folder. Choose the folder a twin was made in.')
  const report = path.join(folder, reports[reports.length - 1])
  const rows = readCsv((await fsp.readFile(report, 'utf8')).replace(/^﻿/, '')).slice(1).filter((r) => r.length >= 4 && r[2])
  const want = rows.filter((r) => r[3] === 'verified' || r[3] === 'already there').map((r) => ({ rel: r[0], size: +r[1], hash: r[2] }))
  const bytesTotal = want.reduce((a, f) => a + f.size, 0)
  let bytesDone = 0, last = 0
  tick({ stage: 'hash', bytesDone, bytesTotal })
  const missing = []
  let safe = 0, safeBytes = 0
  for (const f of want) {
    if (stop()) throw new Stopped()
    const p = path.join(folder, f.rel)
    const st = await fsp.stat(p).catch(() => null)
    const base = { path: p, name: path.basename(p), dir: path.dirname(p), size: f.size, mtime: st ? st.mtimeMs : 0, other: '' }
    if (!st) { missing.push({ ...base, why: 'gone' }); bytesDone += f.size; continue }
    let got = ''
    try { got = await fullHash({ path: p }, (n) => { bytesDone += n; if (Date.now() - last > 250) { last = Date.now(); tick({ stage: 'hash', bytesDone, bytesTotal }) } }, stop) } catch (e) { if (e instanceof Stopped) throw e }
    if (got === f.hash) { safe++; safeBytes += f.size } else missing.push({ ...base, why: 'changed' })
  }
  missing.sort((a, b) => b.size - a.size)
  const when = (reports[reports.length - 1].match(/report (.+)\.csv$/i) || [])[1] || ''
  return { mode: 'recheck', source: report, backup: folder, when, total: want.length, totalBytes: bytesTotal, safe, safeBytes, missing, cloud: [], took: Date.now() - t0 }
}

/* ---------- is this drive a camera card? ---------- */
/* What cameras put at the top of a card: DCIM (most), PRIVATE / M4ROOT / XDROOT (Sony), CLIP / CONTENTS (Canon, Panasonic
   P2), AVCHD, BPAV, a RED .RDM, Blackmagic and ARRI clips straight in it. A drive that only holds documents is not one. */
const CARD_DIRS = /^(dcim|private|m4root|xdroot|clip|contents|avchd|bpav|xavc|arriraw|.+\.rdm)$/i
async function looksLikeCard(root) {
  try {
    const top = await fsp.readdir(root, { withFileTypes: true })
    if (top.some((e) => e.isDirectory() && CARD_DIRS.test(e.name))) return true
    if (top.some((e) => e.isFile() && isVideo(e.name))) return true
    for (const e of top.filter((x) => x.isDirectory() && !x.name.startsWith('.')).slice(0, 12)) {
      const inner = await fsp.readdir(path.join(root, e.name)).catch(() => [])
      if (inner.some((n) => isVideo(n))) return true
    }
  } catch { /* gone */ }
  return false
}

module.exports = { scan, backupCheck, makeTwin, recheck, looksLikeCard, readCsv, Stopped, parseProbe, parseAudio, dhash, hamming, samePictures, partAt, soundPrint, soundDiff, isVideo, isProxy, inside,
  // for the other tools (electron/tools/): the walk, ffmpeg, a preview, the kinds of file
  list, ff, probe, thumb, pool, JOBS, VIDEO, AUDIO, PHOTO, isAudio, BUNDLE, SYSTEM }
