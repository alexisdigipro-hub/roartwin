// RoarTwin's engine (The Mad Lions Lab, Oct 2026): finds twins in the folders and drives it is given.
// 1. Exact copies, of any file: the same size, then the same bytes at the start, middle and end, then the same
//    SHA-256 of the whole file. The name plays no part, so a copy renamed is still found, and two files that only
//    share a name are never taken for twins.
// 2. The same video in another file (Alex: "not only by the name, by every technical means"): a video re-exported,
//    in another size, codec or container. ffmpeg reads each video's length, picture size and codec; videos of about
//    the same length are compared by their pictures: nine frames, 10% to 90% through, each shrunk to a 9x8 grey
//    fingerprint (a difference hash). Flat frames (black, white, one colour) say nothing and are left out, so two
//    different black clips are not twins.
// Plain Node, no Electron: test/engine.test.js runs it as it is.
const fs = require('fs')
const fsp = fs.promises
const path = require('path')
const crypto = require('crypto')
const { spawn, execFileSync } = require('child_process')

const VIDEO = new Set(['mp4', 'mov', 'm4v', 'mkv', 'avi', 'mxf', 'mts', 'm2ts', 'ts', 'wmv', 'webm', 'flv', 'mpg', 'mpeg', 'm2v', '3gp', 'dv', 'vob', 'ogv', 'r3d', 'braw', 'crm', 'insv', 'lrv'])
const IMAGE = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tif', 'tiff'])
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
      if (opts.videosOnly && !isVideo(e.name)) continue
      let st
      try { st = await fsp.stat(p) } catch { continue }
      if (st.size < Math.max(1, opts.minSize || 0)) continue
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

/* ffmpeg, its output as bytes, its log as text */
function ff(bin, args, stop, max = 8 * 1024 * 1024) {
  return new Promise((ok) => {
    const p = spawn(bin, ['-hide_banner', '-nostdin', ...args], { windowsHide: true })
    const out = [], err = []
    let size = 0
    const timer = setTimeout(() => p.kill('SIGKILL'), 60e3)
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
  await pool(videos, 3, async (f) => { if (!f.video) f.video = await probe(bin, f.path, stop); if (++done % 5 === 0 || done === videos.length) tick({ stage: 'video', done, total: videos.length }) }, stop)
  const ok = videos.filter((f) => f.video && f.video.dur > 0.5).sort((a, b) => a.video.dur - b.video.dur)
  const pairs = []
  for (let i = 0; i < ok.length; i++) for (let j = i + 1; j < ok.length && closeLength(ok[i].video.dur, ok[j].video.dur); j++) pairs.push([ok[i], ok[j]])
  const need = [...new Set(pairs.flat())]
  done = 0
  tick({ stage: 'frames', done, total: need.length })
  await pool(need, 3, async (f) => { if (!f.prints) f.prints = await fingerprint(bin, f, stop); done++; tick({ stage: 'frames', done, total: need.length }) }, stop)
  // twins of twins are one group
  const parent = new Map()
  const find = (x) => { while (parent.get(x) !== x) x = parent.get(x); return x }
  for (const f of need) parent.set(f, f)
  for (const [a, b] of pairs) if (samePictures(a.prints, b.prints)) parent.set(find(a), find(b))
  const groups = groupBy(need, (f) => find(f))
  return [...groups.values()].filter((g) => g.length > 1)
}

/* the one to keep: for the same video, the biggest picture, then the most data; for exact copies, the oldest */
function suggest(g, kind) {
  const score = (f) => kind === 'similar'
    ? [(f.video?.w || 0) * (f.video?.h || 0), f.size, -f.mtime]
    : [-f.mtime, -f.path.length, 0]
  let best = g[0]
  for (const f of g.slice(1)) { const a = score(f), b = score(best); for (let i = 0; i < 3; i++) { if (a[i] !== b[i]) { if (a[i] > b[i]) best = f; break } } }
  return best
}

/* a small picture of a video or an image, as a data URL */
async function thumb(bin, f, stop) {
  const at = f.video ? ['-ss', (f.video.dur * 0.4).toFixed(2)] : []
  const { out } = await ff(bin, [...at, '-i', f.path, '-frames:v', '1', '-an', '-vf', 'scale=320:-2', '-c:v', 'mjpeg', '-q:v', '6', '-f', 'image2pipe', '-'], stop, 400 * 1024)
  return out.length > 100 ? 'data:image/jpeg;base64,' + out.toString('base64') : ''
}

/*
 * scan({ roots, videosOnly, similar, minSize, skipHidden, skipCloud, ffmpeg }, tick, stop) ->
 *   { groups: [{ id, kind: 'exact' | 'similar', size, free, files: [{ path, name, dir, size, mtime, video, thumb, keep }] }], files, took }
 * tick(progress) is called often; stop() returning true ends the scan with a Stopped error.
 */
async function scan(opts, tick = () => {}, stop = () => false) {
  const t0 = Date.now()
  const roots = [...new Set((opts.roots || []).map((r) => path.resolve(r)))]
  const cloud = []
  const files = await list(roots, opts, tick, stop, cloud)
  const exactGroups = await exact(files, tick, stop)
  const out = exactGroups.map((g) => ({ kind: 'exact', files: g }))
  if (opts.similar !== false && opts.ffmpeg) {
    // one file of each exact group stands for it; the rest are already twins
    const inExact = new Set(exactGroups.flatMap((g) => g.slice(1)))
    const videos = files.filter((f) => isVideo(f.name) && !inExact.has(f))
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
  // what each file is, the one to keep, a picture
  const all = out.flatMap((g) => g.files)
  let done = 0
  if (opts.ffmpeg) {
    tick({ stage: 'thumbs', done, total: all.length })
    await pool(all, 3, async (f) => {
      if (isVideo(f.name) && !f.video) f.video = await probe(opts.ffmpeg, f.path, stop)
      if ((isVideo(f.name) && f.video) || isImage(f.name)) f.thumb = await thumb(opts.ffmpeg, f, stop)
      done++; tick({ stage: 'thumbs', done, total: all.length })
    }, stop)
  }
  const groups = out.map((g, i) => {
    const keep = suggest(g.files, g.kind)
    const size = g.files.reduce((a, f) => a + f.size, 0)
    return {
      id: 'g' + i, kind: g.kind, size, free: size - keep.size,
      files: g.files.map((f) => ({ path: f.path, name: f.name, dir: f.dir, size: f.size, mtime: f.mtime, video: f.video || null, thumb: f.thumb || '', keep: f === keep })),
    }
  }).sort((a, b) => b.free - a.free)
  return { groups, files: files.length, took: Date.now() - t0, cloud }
}

module.exports = { scan, Stopped, parseProbe, dhash, hamming, samePictures, isVideo }
