// File manager (Alex, 28 Oct: "file management", and "media info: every piece of information of a file, in depth").
// Two panes of folders the person opens; new folder, rename, copy and move between them (never over another file: a
// clash gets " 2"), to the Trash, compare the two, a production folder tree in one click, and the media info of a file
// read from ffmpeg's own report (ffmpeg-static has no ffprobe) and, on a Mac, Spotlight's (mdls: a photo's EXIF).
// The page asks only for folders: every path it then acts on must be inside a folder opened here (opened, in main).
const fs = require('fs')
const fsp = fs.promises
const path = require('path')
const { execFile } = require('child_process')

const inside = (p, dir) => { const r = path.relative(dir, p); return r === '' || (!!r && !r.startsWith('..') && !path.isAbsolute(r)) }
// a name a folder accepts: no slashes, no characters macOS or Windows refuse
const cleanName = (n) => String(n || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+$/, '')
const exists = async (p) => { try { await fsp.lstat(p); return true } catch { return false } }

/* what a file is, by its extension: for the list's Kind and its icon */
const EXT = {
  video: 'mp4 mov m4v mkv avi mxf mts m2ts ts wmv webm flv mpg mpeg m2v 3gp dv vob ogv r3d braw crm insv lrv',
  image: 'jpg jpeg png webp gif bmp tif tiff heic heif avif psd psb dng cr2 cr3 crw nef nrw arw srf sr2 raf orf rw2 pef srw x3f 3fr iiq erf kdc mos mrw raw exr dpx svg',
  audio: 'wav bwf aif aiff aifc mp3 m4a aac flac alac ogg oga opus wma caf ac3 eac3 dts mka amr m4b ape wv sd2 rf64 w64',
  project: 'prproj drp drt aep aet fcpxml fcpxmld xml edl aaf omf otio mogrt cube 3dl c4d blend nk hip',
  doc: 'pdf doc docx txt rtf md pages key numbers xls xlsx csv ppt pptx fdx fountain',
  archive: 'zip rar 7z tar gz tgz bz2 xz zst dmg iso pkg',
}
const KIND_OF = new Map(Object.entries(EXT).flatMap(([k, v]) => v.split(' ').map((e) => [e, k])))
const PACKAGE = /\.(app|photoslibrary|fcpbundle|lrdata|imovielibrary|tvlibrary|logicx|bundle|framework|plugin|rtfd)$/i
function kindOf(name, isDir) {
  if (isDir) return PACKAGE.test(name) ? 'package' : 'folder'
  return KIND_OF.get(path.extname(name).slice(1).toLowerCase()) || 'other'
}

/* one folder's contents: links listed as links (never followed), a package (an .app, a Final Cut library) as one item */
async function listDir(dir) {
  const ents = await fsp.readdir(dir, { withFileTypes: true })
  const out = []
  for (const e of ents) {
    if (e.name === '.DS_Store' || e.name === '.localized') continue
    const p = path.join(dir, e.name)
    let st
    try { st = await fsp.lstat(p) } catch { continue }
    const link = st.isSymbolicLink()
    const isDir = st.isDirectory()
    out.push({ name: e.name, path: p, dir: isDir && !PACKAGE.test(e.name), link, size: isDir ? null : st.size, mtime: st.mtimeMs, kind: link ? 'link' : kindOf(e.name, isDir), hidden: e.name.startsWith('.') })
  }
  return out
}

/* a free name in a folder: "Clip.mov", then "Clip 2.mov", "Clip 3.mov"… */
async function freeName(dir, name) {
  const ext = path.extname(name), base = ext ? name.slice(0, -ext.length) : name
  for (let i = 1; ; i++) {
    const p = path.join(dir, i === 1 ? name : `${base} ${i}${ext}`)
    if (!(await exists(p))) return p
  }
}

class Stopped extends Error { constructor() { super('Stopped') } }

/* the bytes of one file or a whole folder (links count as themselves) */
async function sizeOf(p, stop) {
  let st
  try { st = await fsp.lstat(p) } catch { return 0 }
  if (!st.isDirectory()) return st.isFile() ? st.size : 0
  let n = 0
  let kids = []
  try { kids = await fsp.readdir(p) } catch { return 0 }
  for (const k of kids) { if (stop?.()) throw new Stopped(); n += await sizeOf(path.join(p, k), stop) }
  return n
}

/* one file copied: into a part file next to it, then given its name (never over another), its date kept */
async function copyFile(src, target, onBytes, stop) {
  const st = await fsp.stat(src)
  const part = target + '.roartwin-part'
  await new Promise((ok, bad) => {
    const r = fs.createReadStream(src), w = fs.createWriteStream(part, { flags: 'wx' })
    const fail = (e) => { r.destroy(); w.destroy(); fsp.rm(part, { force: true }).finally(() => bad(e)) }
    r.on('data', (c) => { if (stop?.()) return fail(new Stopped()); onBytes?.(c.length) })
    r.on('error', fail); w.on('error', fail); w.on('finish', ok)
    r.pipe(w)
  })
  if (await exists(target)) { await fsp.rm(part, { force: true }); throw new Error('A file with that name appeared meanwhile.') }
  await fsp.rename(part, target)
  await fsp.utimes(target, st.atime, st.mtime).catch(() => {})
}
async function copyItem(src, destDir, onBytes, stop) {
  const st = await fsp.lstat(src)
  const target = await freeName(destDir, path.basename(src))
  if (st.isSymbolicLink()) { await fsp.symlink(await fsp.readlink(src), target); return target }
  if (st.isDirectory()) {
    await fsp.mkdir(target)
    for (const k of await fsp.readdir(src)) await copyItem(path.join(src, k), target, onBytes, stop)
    await fsp.utimes(target, st.atime, st.mtime).catch(() => {})
    return target
  }
  await copyFile(src, target, onBytes, stop)
  return target
}

/* copy or move items into a folder. A move on the same drive is a rename; to another drive it is a copy, then the
   original goes to the Trash (trash()), never deleted. Never a folder into itself. */
async function transfer({ paths, to, move }, { onProgress, stop, trash } = {}) {
  let total = 0, done = 0
  for (const p of paths) total += await sizeOf(p, stop)
  const tick = (n) => { done += n; onProgress?.({ done, total }) }
  const ok = [], failed = []
  for (const src of paths) {
    if (stop?.()) throw new Stopped()
    try {
      if (inside(path.resolve(to), path.resolve(src))) throw new Error('A folder cannot go inside itself.')
      if (move) {
        if (path.resolve(path.dirname(src)) === path.resolve(to)) { ok.push(src); continue }
        const target = await freeName(to, path.basename(src))
        try { await fsp.rename(src, target); tick(await sizeOf(target)); ok.push(target); continue } catch (e) { if (e.code !== 'EXDEV') throw e }
        const copied = await copyItem(src, to, tick, stop)
        if (trash) await trash(src)
        ok.push(copied)
      } else ok.push(await copyItem(src, to, tick, stop))
    } catch (e) {
      if (e instanceof Stopped) throw e
      failed.push({ path: src, error: String(e?.message || e) })
    }
  }
  return { ok, failed }
}

/* the two panes side by side: what is only in one, and what has the same name but another size (every level) */
async function compare(left, right, stop) {
  const walk = async (root) => {
    const out = new Map(), dirs = ['']
    while (dirs.length) {
      const rel = dirs.pop()
      let ents = []
      try { ents = await fsp.readdir(path.join(root, rel), { withFileTypes: true }) } catch { continue }
      for (const e of ents) {
        if (stop?.()) throw new Stopped()
        if (e.name === '.DS_Store' || e.name.startsWith('._')) continue
        const r = rel ? path.join(rel, e.name) : e.name
        if (e.isDirectory() && !PACKAGE.test(e.name)) { dirs.push(r); continue }
        let st
        try { st = await fsp.lstat(path.join(root, r)) } catch { continue }
        out.set(r, st.isDirectory() ? -1 : st.size)
        if (out.size > 200000) return out
      }
    }
    return out
  }
  const a = await walk(left), b = await walk(right)
  const onlyLeft = [], onlyRight = [], differ = []
  let same = 0
  for (const [r, s] of a) { if (!b.has(r)) onlyLeft.push({ rel: r, size: s }); else if (b.get(r) !== s) differ.push({ rel: r, left: s, right: b.get(r) }); else same++ }
  for (const [r, s] of b) if (!a.has(r)) onlyRight.push({ rel: r, size: s })
  const byName = (x, y) => x.rel.localeCompare(y.rel)
  return { left, right, onlyLeft: onlyLeft.sort(byName), onlyRight: onlyRight.sort(byName), differ: differ.sort(byName), same }
}

/* a production's folder tree: one name a line, "a/b" for a folder inside another; what is there already stays */
async function makeTemplate(dir, names) {
  let made = 0
  for (const line of names) {
    const parts = String(line).split('/').map(cleanName).filter(Boolean)
    if (!parts.length) continue
    let p = dir
    for (const part of parts) { p = path.join(p, part); if (!(await exists(p))) { await fsp.mkdir(p); made++ } }
  }
  return made
}

/* ---------- media info: ffmpeg's report read into its parts ---------- */
// "a, b (c, d), e" at the top level only
function splitTop(s) {
  const out = []
  let d = 0, cur = ''
  for (const c of String(s)) {
    if (c === '(' || c === '[') d++
    else if (c === ')' || c === ']') d--
    if (c === ',' && d === 0) { out.push(cur.trim()); cur = ''; continue }
    cur += c
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}
const hms = (s) => { const m = String(s).match(/(\d+):(\d+):(\d+(?:\.\d+)?)/); return m ? (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]) : null }
const CHANNELS = { mono: 1, stereo: 2, '2.1': 3, '3.0': 3, quad: 4, '4.0': 4, '4.1': 5, '5.0': 5, '5.1': 6, '6.0': 6, '6.1': 7, '7.0': 7, '7.1': 8, hexagonal: 6, octagonal: 8 }
const FIELD = /^(progressive|top first|bottom first|top coded first \(swapped\)|bottom coded first \(swapped\))$/
function bitDepthOf(pix) {
  if (!pix) return null
  if (/^(rgb48|bgr48|rgba64|bgra64|gray16|ya16)/.test(pix)) return 16
  const m = pix.match(/(\d{2})(le|be)$/)
  return m ? +m[1] : 8
}
function parseStream(index, lang, type, rest) {
  const parts = splitTop(rest)
  const first = parts.shift() || ''
  const parens = [...first.matchAll(/\(([^()]*)\)/g)].map((x) => x[1])
  const s = { index: +index, type: type.toLowerCase(), lang: lang && lang !== 'und' ? lang : '', codec: first.split(/\s+/)[0], profile: parens.find((p) => !p.includes('/')) || '', fourcc: (parens.find((p) => p.includes('/')) || '').split('/')[0].trim(), tags: {}, side: [], flags: [] }
  for (let p of parts) {
    const fl = p.match(/\s*\(([a-z_ ]+)\)$/)
    if (fl && /^(default|forced|attached pic|hearing impaired|visual impaired|dub|original|comment|lyrics|karaoke|captions|descriptions|metadata|dependent|still image)$/.test(fl[1])) { s.flags.push(fl[1]); p = p.slice(0, fl.index).trim() }
    let m
    if (s.type === 'video') {
      if ((m = p.match(/^(\d{2,5})x(\d{2,5})(?:\s*\[SAR (\d+:\d+) DAR (\d+:\d+)\])?/))) { s.width = +m[1]; s.height = +m[2]; if (m[3]) { s.sar = m[3]; s.dar = m[4] } continue }
      if ((m = p.match(/^([\d.]+)\s*fps$/))) { s.fps = +m[1]; continue }
      if ((m = p.match(/^([\d.]+k?)\s*tbr$/))) { s.tbr = m[1]; continue }
      if (/tb[nc]$/.test(p)) continue
      if (!s.pix && (m = p.match(/^([a-z][a-z0-9_]*)(?:\((.*)\))?$/)) && !/kb\/s/.test(p)) {
        s.pix = m[1]; s.bitDepth = bitDepthOf(m[1])
        for (const tok of splitTop(m[2] || '')) {
          if (tok === 'tv' || tok === 'pc') s.range = tok === 'tv' ? 'Limited (tv)' : 'Full (pc)'
          else if (FIELD.test(tok)) s.scan = tok === 'progressive' ? 'Progressive' : `Interlaced, ${tok.replace(' (swapped)', '')}`
          else if (tok.includes('/')) { const [mx, pr, tr] = tok.split('/'); s.matrix = mx; s.primaries = pr; s.transfer = tr }
          else if (/^(bt|smpte|unknown|reserved|gbr|fcc|ycgco|bt470|iec|log|linear|arib|film|ictcp|chroma)/.test(tok)) { s.matrix = s.primaries = s.transfer = tok }
        }
        continue
      }
    }
    if (s.type === 'audio') {
      if ((m = p.match(/^(\d+)\s*Hz$/))) { s.rate = +m[1]; continue }
      if ((m = p.match(/^(\d+) channels(?: \((.+)\))?$/))) { s.channels = +m[1]; s.layout = m[2] || ''; continue }
      const lay = p.replace(/\(.*\)$/, '')
      if (CHANNELS[lay] && !s.channels) { s.channels = CHANNELS[lay]; s.layout = p; continue }
      if ((m = p.match(/^([a-z0-9]+p?)(?: \((\d+) bit\))?$/)) && /^(u8|s16|s32|s64|flt|dbl|u8p|s16p|s32p|s64p|fltp|dblp)$/.test(m[1])) { s.sampleFormat = m[1]; if (m[2]) s.bitDepth = +m[2]; continue }
    }
    if ((m = p.match(/^([\d.]+)\s*kb\/s$/))) { s.bitrate = +m[1]; continue }
    s.flags.push(p)
  }
  if (s.type === 'audio' && !s.bitDepth) { const m = s.codec.match(/^pcm_[suf](\d+)/); if (m) s.bitDepth = +m[1] }
  if (s.type === 'video') {
    const tr = s.transfer || ''
    s.hdr = tr === 'smpte2084' ? 'HDR10 (PQ)' : tr === 'arib-std-b67' ? 'HLG' : ''
  }
  return s
}
/* ffmpeg -i's report -> { container, duration, start, bitrate, tags, chapters, streams } */
function parseInfo(log) {
  const info = { container: '', duration: null, start: null, bitrate: null, tags: {}, chapters: [], streams: [] }
  let cur = null, into = null, intoIndent = -1, lastKey = ''
  for (const raw of String(log).split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const indent = raw.length - raw.trimStart().length
    let m
    if ((m = line.match(/^Input #0, (.+?), from '/))) { info.container = m[1]; into = null; continue }
    if (/^(Input #[1-9]|Output #|At least one output)/.test(line)) break
    if (into && indent > intoIndent && !/^(Stream #|Chapter #|Duration:|Metadata:|Side data:|Chapters:)/.test(line)) {
      if (Array.isArray(into)) { into.push(line); continue }
      const kv = line.match(/^([^:]*?)\s*:\s?(.*)$/)
      if (kv && kv[1]) { lastKey = kv[1]; into[lastKey] = kv[2] } else if (kv && lastKey) into[lastKey] += '\n' + kv[2]
      continue
    }
    into = null
    if (line === 'Metadata:') { into = cur ? cur.tags : info.tags; intoIndent = indent; lastKey = ''; continue }
    if (line === 'Side data:') { into = cur ? cur.side || (cur.side = []) : []; intoIndent = indent; continue }
    if (line === 'Chapters:') { cur = null; continue }
    if ((m = line.match(/^Duration:\s*([^,]+)(?:,\s*start:\s*([^,]+))?(?:,\s*bitrate:\s*(.+))?$/))) {
      info.duration = hms(m[1]); info.start = m[2] != null ? parseFloat(m[2]) : null
      const b = (m[3] || '').match(/([\d.]+)\s*kb\/s/); info.bitrate = b ? +b[1] : null
      cur = null; continue
    }
    if ((m = line.match(/^Chapter #\d+:(\d+): start (-?[\d.]+), end (-?[\d.]+)/))) { cur = { index: +m[1], start: +m[2], end: +m[3], tags: {} }; info.chapters.push(cur); continue }
    if ((m = line.match(/^Stream #\d+:(\d+)(?:\[0x[0-9a-f]+\])?(?:\(([a-z]{2,3})\))?: (Video|Audio|Data|Subtitle|Attachment): (.*)$/i))) { cur = parseStream(m[1], m[2], m[3], m[4]); info.streams.push(cur); continue }
  }
  // a still picture is not a video
  if (info.streams.length === 1 && info.streams[0].type === 'video' && /image2|png_pipe|jpeg_pipe|webp_pipe|tiff_pipe|bmp_pipe|_pipe$/.test(info.container)) info.still = true
  // the start timecode, wherever it is kept
  info.timecode = info.tags.timecode || info.streams.map((s) => s.tags.timecode).find(Boolean) || ''
  for (const s of info.streams) if (s.type === 'video' && s.side.some((x) => /DOVI configuration|Dolby Vision/i.test(x))) s.hdr = 'Dolby Vision' + (s.hdr ? ` · ${s.hdr}` : '')
  return info
}

/* Spotlight's fields of a file on a Mac (mdls), as { kMDItem…: value } */
function parseMdls(text) {
  const out = {}
  let key = '', list = null
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim()
    if (list) {
      if (line === ')') { out[key] = list.join(', '); list = null; continue }
      list.push(line.replace(/,$/, '').replace(/^"(.*)"$/, '$1'))
      continue
    }
    const m = line.match(/^(kMDItem\w+)\s*=\s*(.*)$/)
    if (!m) continue
    key = m[1]
    if (m[2] === '(') { list = []; continue }
    if (m[2] === '(null)') continue
    out[key] = m[2].replace(/^"(.*)"$/, '$1')
  }
  return out
}
const PHOTO_FIELDS = [
  ['Camera', (m) => [m.kMDItemAcquisitionMake, m.kMDItemAcquisitionModel].filter(Boolean).join(' ')],
  ['Lens', (m) => m.kMDItemLensModel],
  ['ISO', (m) => m.kMDItemISOSpeed],
  ['Shutter', (m) => { const v = parseFloat(m.kMDItemExposureTimeSeconds); return v ? (v >= 1 ? `${v} s` : `1/${Math.round(1 / v)} s`) : '' }],
  ['Aperture', (m) => (m.kMDItemFNumber ? `ƒ/${+parseFloat(m.kMDItemFNumber).toFixed(1)}` : '')],
  ['Focal length', (m) => (m.kMDItemFocalLength ? `${+parseFloat(m.kMDItemFocalLength).toFixed(1)} mm` + (m.kMDItemFocalLength35mm ? ` (${m.kMDItemFocalLength35mm} mm full frame)` : '') : '')],
  ['Exposure program', (m) => m.kMDItemExposureProgram],
  ['White balance', (m) => (m.kMDItemWhiteBalance === '0' ? 'Auto' : m.kMDItemWhiteBalance === '1' ? 'Manual' : m.kMDItemWhiteBalance)],
  ['Flash', (m) => (m.kMDItemFlashOnOff === '1' ? 'Fired' : m.kMDItemFlashOnOff === '0' ? 'Off' : '')],
  ['Pixels', (m) => (m.kMDItemPixelWidth ? `${m.kMDItemPixelWidth} × ${m.kMDItemPixelHeight}` : '')],
  ['Colour profile', (m) => m.kMDItemProfileName],
  ['Colour space', (m) => m.kMDItemColorSpace],
  ['Bits per sample', (m) => m.kMDItemBitsPerSample],
  ['Taken', (m) => m.kMDItemContentCreationDate],
  ['Latitude', (m) => m.kMDItemLatitude],
  ['Longitude', (m) => m.kMDItemLongitude],
  ['Altitude', (m) => (m.kMDItemAltitude ? `${m.kMDItemAltitude} m` : '')],
]

/* the info as titled sections of rows, the same shape the page shows and copies */
const clock = (s) => { if (s == null) return ''; const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s - h * 3600 - m * 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${x.toFixed(2).padStart(5, '0')}` }
const kbps = (n) => (n == null ? '' : n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)} Mb/s` : `${n} kb/s`)
const size = (n) => { if (n == null) return ''; const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0; while (n >= 1000 && i < u.length - 1) { n /= 1000; i++ } return `${i ? n.toFixed(n >= 100 ? 0 : n >= 10 ? 1 : 2) : n} ${u[i]}` }
function sectionsOf(info, file, mdls = {}) {
  const S = []
  const rows = (pairs) => pairs.filter(([, v]) => v != null && v !== '' && v !== false).map(([k, v]) => [k, String(v)])
  const tags = (o) => Object.entries(o || {}).map(([k, v]) => [k, v])
  S.push({ title: 'File', rows: rows([['Name', file.name], ['Folder', file.dir], ['Size', file.size != null ? `${size(file.size)} (${file.size.toLocaleString('en-US')} bytes)` : ''], ['Modified', file.mtime ? new Date(file.mtime).toISOString().replace('T', ' ').slice(0, 19) : ''], ['Created', file.birth ? new Date(file.birth).toISOString().replace('T', ' ').slice(0, 19) : '']]) })
  if (info && (info.container || info.streams.length)) {
    S.push({ title: 'Container', rows: rows([['Format', info.container], ['Duration', info.still ? '' : clock(info.duration)], ['Start', info.start ? `${info.start} s` : ''], ['Overall bitrate', kbps(info.bitrate)], ['Timecode', info.timecode], ['Streams', info.streams.length], ['Chapters', info.chapters.length || '']]) })
    const n = { video: 0, audio: 0, data: 0, subtitle: 0, attachment: 0 }
    for (const s of info.streams) {
      const i = n[s.type]++
      const title = `${s.type === 'video' && info.still ? 'Picture' : s.type[0].toUpperCase() + s.type.slice(1)} #${i + 1}`
      const base = [['Codec', s.codec + (s.profile ? ` (${s.profile})` : '')], ['Codec tag', s.fourcc], ['Language', s.lang]]
      const v = s.type === 'video' ? [['Resolution', s.width ? `${s.width} × ${s.height}` : ''], ['Pixel aspect (SAR)', s.sar], ['Display aspect (DAR)', s.dar], ['Frame rate', s.fps ? `${s.fps} fps` : ''], ['Scan', s.scan], ['Pixel format', s.pix], ['Bit depth', s.bitDepth ? `${s.bitDepth} bit` : ''], ['Colour range', s.range], ['Colour primaries', s.primaries], ['Transfer', s.transfer], ['Matrix', s.matrix], ['HDR', s.hdr]] : []
      const a = s.type === 'audio' ? [['Channels', s.channels ? `${s.channels}${s.layout ? ` (${s.layout})` : ''}` : s.layout], ['Sample rate', s.rate ? `${(s.rate / 1000).toFixed(s.rate % 1000 ? 1 : 0)} kHz` : ''], ['Bit depth', s.bitDepth ? `${s.bitDepth} bit` : ''], ['Sample format', s.sampleFormat]] : []
      S.push({ title, rows: [...rows([...base, ...v, ...a, ['Bitrate', kbps(s.bitrate)], ['Flags', s.flags.join(', ')]]), ...tags(s.tags), ...s.side.map((x) => ['Side data', x])] })
    }
    if (info.chapters.length) S.push({ title: 'Chapters', rows: info.chapters.map((c) => [`${clock(c.start)} – ${clock(c.end)}`, c.tags.title || `Chapter ${c.index + 1}`]) })
    if (Object.keys(info.tags).length) S.push({ title: 'Metadata', rows: tags(info.tags) })
  }
  const photo = rows(PHOTO_FIELDS.map(([k, f]) => [k, f(mdls) || '']))
  if (photo.length) S.push({ title: 'Photo', rows: photo })
  const spot = Object.entries(mdls).filter(([k]) => !/^kMDItem(FS|Display|Contents?Type|Kind|Path|UseCount|LastUsed|DateAdded|LogicalSize|PhysicalSize|InterestingDate|DocumentIdentifier)/.test(k)).map(([k, v]) => [k.replace(/^kMDItem/, ''), v])
  if (spot.length) S.push({ title: 'Spotlight', rows: spot })
  return S
}
const textOf = (sections) => sections.map((s) => [s.title, ...s.rows.map(([k, v]) => `  ${k}: ${String(v).replace(/\n/g, '\n    ')}`)].join('\n')).join('\n\n')

const mdlsOf = (p) => new Promise((done) => {
  if (process.platform !== 'darwin') return done({})
  execFile('mdls', [p], { maxBuffer: 4 << 20, timeout: 8000 }, (err, out) => done(err ? {} : parseMdls(out)))
})

/* ---------- the doors ---------- */
function register(ctx) {
  const opened = new Set() // folders the person opened in a pane; everything acted on is inside one
  const allowed = (p) => [...opened].some((r) => inside(p, r))
  const must = (p) => {
    const r = path.resolve(String(p || ''))
    if (!p || !allowed(r)) throw new Error('That is not in a folder opened here.')
    return r
  }
  const thumbs = new Map()
  const bin = () => ctx.ffmpeg?.() || ''
  const show = (items) => ctx.allow?.(items.map((i) => i.path))
  const open = async (p) => {
    const r = path.resolve(String(p || ''))
    const st = await fsp.stat(r).catch(() => null)
    if (!st?.isDirectory()) throw new Error('That folder is not there.')
    opened.add(r)
    const items = await listDir(r)
    show(items); ctx.allow?.(r)
    return { path: r, parent: path.dirname(r) !== r ? path.dirname(r) : '', items }
  }

  // where to start: home, its usual folders, the drives
  ctx.handle('files-places', async () => {
    const home = ctx.app?.getPath('home') || require('os').homedir()
    const out = [{ name: 'Home', path: home, kind: 'home' }]
    for (const n of ['Desktop', 'Documents', 'Downloads', 'Movies', 'Videos', 'Pictures', 'Music']) { const p = path.join(home, n); if (await exists(p)) out.push({ name: n, path: p, kind: 'folder' }) }
    if (process.platform === 'darwin') {
      for (const v of await fsp.readdir('/Volumes').catch(() => [])) {
        const p = path.join('/Volumes', v)
        const st = await fsp.lstat(p).catch(() => null)
        if (st && !st.isSymbolicLink()) out.push({ name: v, path: p, kind: 'drive' })
      }
    } else if (process.platform === 'win32') {
      for (const l of 'CDEFGHIJKLMNOPQRSTUVWXYZ') { const p = l + ':\\'; if (await exists(p)) out.push({ name: l + ':', path: p, kind: 'drive' }) }
    }
    return out
  })
  ctx.handle('files-pick', async () => {
    const { canceled, filePaths } = await ctx.dialog.showOpenDialog(ctx.win?.(), { properties: ['openDirectory', 'createDirectory'] })
    return canceled || !filePaths[0] ? null : open(filePaths[0])
  })
  // the page may ask for any folder (a place, a favourite, the one above); nothing else
  ctx.handle('files-open', ({ path: p }) => open(p))
  ctx.handle('files-size', async ({ path: p }) => sizeOf(must(p), () => ctx.stopped?.()))
  ctx.handle('files-thumb', async ({ path: p }) => {
    const r = must(p)
    const st = await fsp.stat(r)
    const key = r + ':' + st.mtimeMs
    if (thumbs.has(key)) return thumbs.get(key)
    const kind = kindOf(r, false)
    if (!bin() || (kind !== 'video' && kind !== 'image')) return ''
    const f = { path: r, name: path.basename(r) }
    if (kind === 'video') { f.video = await ctx.engine.probe(bin(), r, () => false); if (!f.video) return '' }
    const url = await ctx.engine.thumb(bin(), f, () => false)
    if (thumbs.size > 600) thumbs.delete(thumbs.keys().next().value)
    thumbs.set(key, url)
    return url
  })
  // a strip of six frames for the preview (a video does not play in the page)
  ctx.handle('files-frames', async ({ path: p }) => {
    const r = must(p)
    if (!bin()) return []
    const v = await ctx.engine.probe(bin(), r, () => false)
    if (!v) return []
    const out = []
    for (let i = 0; i < 6; i++) {
      const at = (v.dur * (i + 0.5)) / 6
      const grab = (key) => ctx.engine.ff(bin(), [...(key ? ['-skip_frame', 'nokey'] : []), '-ss', at.toFixed(2), '-i', r, '-frames:v', '1', '-an', '-vf', 'scale=320:-2', '-c:v', 'mjpeg', '-q:v', '6', '-f', 'image2pipe', '-'], () => false, 400 * 1024, 20e3)
      // the nearest key frame is quick; with none after that point, the exact frame
      let { out: jpg } = await grab(true)
      if (jpg.length <= 100) jpg = (await grab(false)).out
      if (jpg.length > 100) out.push({ at, url: 'data:image/jpeg;base64,' + jpg.toString('base64') })
    }
    return out
  })
  ctx.handle('files-info', async ({ path: p }) => {
    const r = must(p)
    const st = await fsp.lstat(r)
    const file = { name: path.basename(r), dir: path.dirname(r), size: st.isDirectory() ? null : st.size, mtime: st.mtimeMs, birth: st.birthtimeMs }
    let info = null
    if (!st.isDirectory() && bin()) { const { log } = await ctx.engine.ff(bin(), ['-i', r], () => false, 1024, 20e3); info = parseInfo(log) }
    const sections = sectionsOf(info, file, await mdlsOf(r))
    return { sections, text: textOf(sections) }
  })
  ctx.handle('files-mkdir', async ({ path: p, name }) => {
    const dir = must(p), n = cleanName(name)
    if (!n) throw new Error('Give it a name.')
    const target = await freeName(dir, n)
    await fsp.mkdir(target)
    ctx.allow?.(target)
    return target
  })
  ctx.handle('files-rename', async ({ path: p, name }) => {
    const r = must(p), n = cleanName(name)
    if (!n) throw new Error('Give it a name.')
    const target = path.join(path.dirname(r), n)
    if (target === r) return r
    // only its case changes: through a passing name (a Mac's disk sees both as one)
    if (target.toLowerCase() === r.toLowerCase()) { const tmp = r + '.roartwin-rename'; await fsp.rename(r, tmp); await fsp.rename(tmp, target) } else {
      if (await exists(target)) throw new Error('That name is taken.')
      await fsp.rename(r, target)
    }
    ctx.allow?.(target)
    return target
  })
  ctx.handle('files-transfer', async ({ paths, to, move }, { emit } = {}) => {
    const list = (Array.isArray(paths) ? paths : []).map(must), dest = must(to)
    const st = await fsp.stat(dest).catch(() => null)
    if (!st?.isDirectory()) throw new Error('That folder is not there.')
    let last = 0
    return ctx.run(async () => {
      const r = await transfer({ paths: list, to: dest, move: !!move }, {
        stop: () => ctx.stopped?.(),
        trash: (p) => ctx.shell.trashItem(p),
        onProgress: (x) => { if (Date.now() - last > 150 || x.done === x.total) { last = Date.now(); emit?.('files-progress', x) } },
      })
      ctx.allow?.(r.ok)
      return r
    })
  })
  ctx.handle('files-trash', async ({ paths }) => {
    const ok = [], failed = []
    for (const p of Array.isArray(paths) ? paths : []) {
      try { const r = must(p); await ctx.shell.trashItem(r); ok.push(r) } catch (e) { failed.push({ path: String(p), error: String(e?.message || e) }) }
    }
    return { ok, failed }
  })
  ctx.handle('files-template', async ({ path: p, names }) => makeTemplate(must(p), Array.isArray(names) ? names : []))
  ctx.handle('files-compare', async ({ left, right }) => {
    const a = must(left), b = must(right)
    return ctx.run(() => compare(a, b, () => ctx.stopped?.()))
  })
}

module.exports = { register, listDir, freeName, transfer, compare, makeTemplate, parseInfo, parseMdls, sectionsOf, textOf, splitTop, kindOf, inside, cleanName, sizeOf }
