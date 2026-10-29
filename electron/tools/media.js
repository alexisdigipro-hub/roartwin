// Media report, Clip check and Contact sheet (Alex, 28 Oct): three tools on the clips of a card or a folder, all read
// through the ffmpeg inside the app. ffmpeg-static has no ffprobe, so what a clip is comes from `ffmpeg -i`'s own log
// (parseMedia). Nothing here changes a file: it reads, and writes only the CSV or PDF the person saves.
//
// Doors (window.twin.tool):
//   report-scan { root, skipHidden, photos }    -> { id, root, clips: [clip], at, took }   events report-progress { done, total }
//   report-pdf { id, words, locale }            -> the saved PDF's path ('' if cancelled), of that report
//   clipcheck-scan { root, skipHidden, quick }  -> { root, total, ok, broken: [...], unread: [...], quick, took }
//                                                                                     events clipcheck-progress { done, total }
//   contact-scan { root, frames: 1|3, photos, skipHidden } -> { id, root, clips: [{ path, name, dir, dur, tc, frames }], took }
//                                                                                     events contact-progress { done, total }
//   contact-pdf { id, cols, landscape, title, words } -> the saved PDF's path, of that sheet
//   media-save-csv { text, name }              -> the saved CSV's path
// A report or a sheet is kept by its id (the last few), so the PDF is of the one on the screen, also after Back.
// The company and its second line (Settings > Reports) head every PDF (ctx.prefs()).
const path = require('path')

/* ---------- what ffmpeg's log says about a clip ---------- */
const PRORES = { proxy: '422 Proxy', lt: '422 LT', standard: '422', hq: '422 HQ', '4444': '4444', '4444xq': '4444 XQ', xq: '4444 XQ' }
const CODEC = { h264: 'H.264', hevc: 'H.265', prores: 'ProRes', dnxhd: 'DNxHD', mpeg2video: 'MPEG-2', mpeg4: 'MPEG-4', mjpeg: 'Motion JPEG', vp9: 'VP9', av1: 'AV1', cfhd: 'CineForm', rawvideo: 'Uncompressed', qtrle: 'Animation', png: 'PNG', dvvideo: 'DV', tiff: 'TIFF', webp: 'WebP', jpeg2000: 'JPEG 2000' }
const CHANNELS = { mono: 1, stereo: 2, '2.1': 3, quad: 4, '4.0': 4, '5.0': 5, '5.1': 6, '5.1(side)': 6, '6.1': 7, '7.1': 8 }
/* camera formats ffmpeg cannot open (Alex, 29 Oct: "say so, not broken"): what they are, and where to look at them */
const UNREADABLE = {
  braw: ['Blackmagic RAW', 'Blackmagic RAW Player or DaVinci Resolve'], r3d: ['REDCODE RAW', 'REDCINE-X or DaVinci Resolve'],
  crm: ['Canon Cinema RAW Light', 'Canon RAW Development or DaVinci Resolve'], ari: ['ARRIRAW', 'ARRI Reference Tool or DaVinci Resolve'],
  arx: ['ARRIRAW HDE', 'ARRI Reference Tool or DaVinci Resolve'], nev: ['Nikon N-RAW', 'Nikon NX Studio or DaVinci Resolve'],
}
const PICTURE = new Set(['jpg', 'jpeg', 'png', 'tif', 'tiff', 'webp', 'bmp', 'gif'])
const extOf = (p) => path.extname(String(p)).slice(1).toLowerCase()
// the codec as people say it: ProRes 422 HQ, H.264 High, DNxHR HQX
function codecName(codec, profile) {
  const c = String(codec || '').toLowerCase(), p = String(profile || '').trim()
  if (c === 'prores') return 'ProRes ' + (PRORES[p.toLowerCase().replace(/\s+/g, '')] || p || '').trim()
  if (c === 'dnxhd' && /dnxhr/i.test(p)) return p.replace(/^dnxhr\s*/i, 'DNxHR ')
  const base = CODEC[c] || c.toUpperCase()
  return p ? `${base} ${p}` : base
}
const clock = (s) => { const m = String(s).match(/(\d+):(\d+):(\d+(?:\.\d+)?)/); return m ? (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]) : null }

function parseMedia(log) {
  const text = String(log || '')
  const out = { dur: null, bitrate: null, video: null, audio: [], tc: '', meta: {} }
  const d = text.match(/Duration:\s*([\d:.]+|N\/A)(?:,\s*start:\s*[-\d.]+)?(?:,\s*bitrate:\s*(\d+)\s*kb\/s)?/)
  if (d) { out.dur = clock(d[1]); out.bitrate = d[2] ? +d[2] : null }
  const tc = text.match(/timecode\s*:\s*(\d{2}:\d{2}:\d{2}[:;.]\d{2,3})/)
  if (tc) out.tc = tc[1]
  // the file's own tags (first Metadata block): camera, date, the program that wrote it
  for (const m of text.matchAll(/^\s{4}(creation_time|encoder|com\.apple\.quicktime\.(?:make|model|software)|make|model|title|reel_name|original_format)\s*:\s*(.+)$/gim)) {
    const k = m[1].toLowerCase().replace('com.apple.quicktime.', '')
    if (!(k in out.meta)) out.meta[k] = m[2].trim()
  }
  for (const line of text.split('\n')) {
    const v = line.match(/Stream #[^:]+:\d+[^:]*:\s*Video:\s*([a-z0-9_]+)(?:\s*\(([^)]+)\))?(.*)$/i)
    if (v && !out.video && !/attached pic/.test(line)) {
      const rest = v[3]
      const size = rest.match(/(\d{2,5})x(\d{2,5})/)
      const fps = rest.match(/([\d.]+)\s*fps/)
      const kb = rest.match(/(\d+)\s*kb\/s/)
      const pix = rest.match(/,\s*([a-z0-9]+(?:le|be)?)(?:\(([^)]*)\))?,/i)
      // "(High)" or "(HQ)" right after the codec is its profile; a fourcc like "(apch / 0x…)" is not
      const profile = v[2] && !/\//.test(v[2]) ? v[2] : ''
      out.video = {
        codec: v[1].toLowerCase(), profile, name: codecName(v[1], profile),
        w: size ? +size[1] : 0, h: size ? +size[2] : 0, fps: fps ? +fps[1] : null, kbps: kb ? +kb[1] : null,
        pix: pix ? pix[1] : '',
        // the colour ffmpeg names in brackets after the pixel format: range, matrix/primaries/transfer, the scan
        color: pix && pix[2] ? pix[2].split(',').map((x) => x.trim()).filter((x) => x && !/^(progressive|tv|pc)$/.test(x)).join(' ') : '',
        hdr: /smpte2084/.test(rest) ? 'HDR PQ' : /arib-std-b67/.test(rest) ? 'HDR HLG' : '',
        scan: /top first|bottom first/.test(rest) ? 'interlaced' : 'progressive',
      }
    }
    const a = line.match(/Stream #[^:]+:\d+[^:]*:\s*Audio:\s*([a-z0-9_]+)(?:\s*\(([^)]+)\))?[^,]*,\s*(\d+)\s*Hz,\s*([^,]+)(?:,\s*([^,]+))?(?:,\s*(\d+)\s*kb\/s)?/i)
    if (a) {
      const lay = a[4].trim()
      const ch = CHANNELS[lay] ?? (+((lay.match(/(\d+)\s*channels?/) || [])[1]) || 0)
      const bits = (line.match(/\((\d+)\s*bit\)/) || [])[1]
      out.audio.push({ codec: a[1].toLowerCase(), rate: +a[3], layout: lay, channels: ch, bits: bits ? +bits : null, kbps: a[6] ? +a[6] : null })
    }
  }
  return out
}

/* the timecode where a clip ends (TC out), from its start, length and frame rate; '' when it cannot be said exactly
   (drop-frame timecode, no frame rate) */
function tcOut(tc, dur, fps) {
  const m = String(tc || '').match(/^(\d{2}):(\d{2}):(\d{2})([:.])(\d{2,3})$/)
  if (!m || !(dur > 0) || !(fps > 0)) return ''
  const base = Math.round(fps)
  if (Math.abs(fps - base) > 0.01 && m[4] !== ':') return ''
  const start = ((+m[1] * 60 + +m[2]) * 60 + +m[3]) * base + +m[5]
  // the last frame of the clip, not the one after it
  let f = start + Math.max(0, Math.round(dur * fps) - 1)
  const day = 24 * 3600 * base
  f = ((f % day) + day) % day
  const p = (n) => String(n).padStart(2, '0')
  return `${p(Math.floor(f / (3600 * base)))}:${p(Math.floor(f / (60 * base)) % 60)}:${p(Math.floor(f / base) % 60)}:${p(f % base)}`
}

/* ---------- a broken clip, in plain words ---------- */
function whyBroken(lines, code) {
  const all = lines.join('\n')
  if (/moov atom not found/i.test(all)) return 'Cut short: the camera or the copy stopped before the file was closed.'
  if (/Invalid data found when processing input/i.test(all)) return 'Not a playable file, or damaged from its start.'
  if (/partial file|truncat|end of file|stream ends prematurely|Packet corrupt|ran out of data/i.test(all)) return 'It ends too soon: the end of the file is missing.'
  if (/error while decoding|corrupt|concealing|invalid nal|non-existing pps|decode_slice|missing reference|Error submitting packet/i.test(all)) return 'Damaged frames inside: some pictures or sound will not play right.'
  // killed by the time limit (no exit code), saying nothing: not proven broken, only too slow to read here
  if (code == null && !lines.length) return 'It took too long to read here: play it once to be sure.'
  if (code !== 0 && !lines.length) return 'ffmpeg could not read it.'
  return 'Errors while reading it.'
}
// ffmpeg's error lines without its noise (repeats, the "Last message repeated" lines)
const errorLines = (log) => [...new Set(String(log || '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !/^Last message repeated/i.test(l)))].slice(0, 6)

/* ---------- the PDFs (HTML pages main prints) ---------- */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const hms = (s) => { if (s == null) return ''; s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0') }
const size = (n) => { if (!n) return ''; const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0; while (n >= 1000 && i < u.length - 1) { n /= 1000; i++ } return (n >= 100 || i === 0 ? n.toFixed(0) : n.toFixed(1)) + ' ' + u[i] }
const audioName = (c) => (c.audio?.[0]?.codec || '').replace(/^pcm_.*/, 'PCM').toUpperCase()
const codecLabel = (c) => (c.video ? c.video.name : c.unread ? c.unread : audioName(c))
const W = (words, k, d) => esc((words && words[k]) || d)
const PAGE_CSS = `*{box-sizing:border-box}body{margin:0;font:9.5px/1.35 -apple-system,'Helvetica Neue','Segoe UI',Arial,sans-serif;color:#16181d;-webkit-print-color-adjust:exact}
.pg{padding:14mm 12mm}.co{display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #e3e4e8}
.co b{font-size:12px;letter-spacing:.02em}.co span{color:#777}h1{margin:0;font-size:20px;font-weight:300}h1 b{font-weight:800}.sub{color:#666;margin:4px 0 10px;word-break:break-all}
.tot{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}.tot span{padding:3px 8px;border-radius:99px;background:#f1f2f4}
table{width:100%;border-collapse:collapse}th{text-align:left;font-size:8px;text-transform:uppercase;letter-spacing:.05em;color:#777;padding:4px;border-bottom:1px solid #ddd}
td{padding:4px;border-bottom:1px solid #eee;vertical-align:middle}tr{page-break-inside:avoid}td img{width:64px;height:36px;object-fit:cover;border-radius:3px;display:block;background:#000}
.nm{font-weight:600;word-break:break-all}.dir{color:#888;font-size:8px;word-break:break-all}.foot{margin-top:10px;color:#999;font-size:8px}`
// the company line at the top of a page (Settings > Reports); nothing when it is not set
const companyHTML = (co) => (co?.company || co?.companyLine ? `<div class="co"><b>${esc(co.company)}</b><span>${esc(co.companyLine)}</span></div>` : '')
const when = (ms, locale) => { try { return new Date(ms || Date.now()).toLocaleString(locale || 'en-GB') } catch { return new Date(ms || Date.now()).toLocaleString('en-GB') } }
// the page's language, so Greek capitals lose their accents as they should (ΟΝΟΜΑ, not ΌΝΟΜΑ)
const langOf = (locale) => (/^el/i.test(String(locale || '')) ? 'el' : 'en')
// every codec with how many clips and how long they run, for the totals
function byCodec(clips) {
  const m = new Map()
  for (const c of clips) { const k = codecLabel(c); if (!k) continue; const x = m.get(k) || { name: k, n: 0, dur: 0 }; x.n++; x.dur += c.dur || 0; m.set(k, x) }
  return [...m.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name))
}

function reportHTML(r, words = {}, co = {}, locale = '') {
  const clips = r.clips || []
  const total = clips.reduce((n, c) => n + (c.dur || 0), 0), bytes = clips.reduce((n, c) => n + (c.size || 0), 0)
  const rows = clips.map((c) => `<tr><td>${c.thumb ? `<img src="${esc(c.thumb)}">` : ''}</td><td><div class="nm">${esc(c.name)}</div><div class="dir">${esc(c.dir)}</div></td>
<td>${esc(hms(c.dur))}</td><td>${esc(c.tc)}</td><td>${esc(c.tcOut || '')}</td><td>${esc(codecLabel(c))}</td><td>${c.video ? `${c.video.w}×${c.video.h}` : ''}</td>
<td>${c.video?.fps ? esc(Math.round(c.video.fps * 1000) / 1000) : ''}</td><td>${c.audio?.length ? esc(c.audio.map((a) => `${a.channels || a.layout} ch · ${Math.round(a.rate / 100) / 10} kHz`).join(', ')) : ''}</td>
<td>${esc(size(c.size))}</td><td>${esc(c.date || '')}</td></tr>`).join('\n')
  return `<!doctype html><html lang="${langOf(locale)}"><head><meta charset="utf-8"><style>${PAGE_CSS}</style></head><body><div class="pg">${companyHTML(co)}
<h1><b>${W(words, 'title', 'Media report')}</b></h1><div class="sub">${esc(r.root)} · ${esc(when(r.at, locale))}</div>
<div class="tot"><span>${clips.length} ${W(words, 'clips', 'clips')}</span><span>${esc(hms(total))}</span><span>${esc(size(bytes))}</span>${byCodec(clips).map((c) => `<span>${esc(c.name)} · ${c.n}${c.dur ? ' · ' + esc(hms(c.dur)) : ''}</span>`).join('')}</div>
<table><thead><tr><th></th><th>${W(words, 'name', 'Name')}</th><th>${W(words, 'length', 'Length')}</th><th>${W(words, 'tc', 'TC in')}</th><th>${W(words, 'tcOut', 'TC out')}</th><th>${W(words, 'codec', 'Codec')}</th><th>${W(words, 'picture', 'Picture')}</th><th>fps</th><th>${W(words, 'sound', 'Sound')}</th><th>${W(words, 'size', 'Size')}</th><th>${W(words, 'date', 'Date')}</th></tr></thead>
<tbody>${rows}</tbody></table><div class="foot">RoarKit · The Mad Lions Lab</div></div></body></html>`
}

function contactHTML(sheet, { cols = 4, words = {}, title = '', co = {}, locale = '' } = {}) {
  const n = Math.max(1, Math.min(8, Number(cols) || 4))
  const tiles = (sheet.clips || []).map((c) => `<div class="t"><div class="fr" style="grid-template-columns:repeat(${Math.max(1, c.frames.length)},1fr)">${c.frames.map((f) => `<img src="${esc(f)}">`).join('') || '<div class="no"></div>'}</div>
<div class="nm">${esc(c.name)}</div><div class="mt">${esc([hms(c.dur), c.tc ? 'TC ' + c.tc : '', c.res || ''].filter(Boolean).join(' · '))}</div></div>`).join('\n')
  return `<!doctype html><html lang="${langOf(locale)}"><head><meta charset="utf-8"><style>${PAGE_CSS}
.grid{display:grid;grid-template-columns:repeat(${n},1fr);gap:8px}.t{page-break-inside:avoid}.fr{display:grid;gap:2px}.fr img,.no{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:3px;display:block;background:#111}
.t .nm{margin-top:3px;font-size:8.5px;word-break:break-all}.mt{color:#777;font-size:8px}</style></head><body><div class="pg">${companyHTML(co)}
<h1><b>${esc(title) || W(words, 'title', 'Contact sheet')}</b></h1><div class="sub">${esc(sheet.root)} · ${(sheet.clips || []).length} ${W(words, 'clips', 'clips')}</div>
<div class="grid">${tiles}</div><div class="foot">RoarKit · The Mad Lions Lab</div></div></body></html>`
}

/* ---------- reading the clips ---------- */
const isPhoto = (engine, name) => engine.PHOTO.has(extOf(name))
async function clipsOf(engine, root, opts, stop) {
  const files = await engine.list([root], { skipHidden: opts.skipHidden !== false, skipCloud: false, kind: 'all' }, () => {}, stop)
  return files.filter((f) => engine.isVideo(f.name) || engine.isAudio(f.name) || (opts.photos && isPhoto(engine, f.name)))
    .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }))
}
const day = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
/* a camera format ffmpeg could not open: its name, and where it can be looked at */
function unreadable(name, m) {
  const u = UNREADABLE[extOf(name)]
  return u && !m.video && !m.audio.length ? u : null
}
async function describe(engine, bin, f, stop) {
  const { log } = await engine.ff(bin, ['-i', f.path], stop)
  const m = parseMedia(log)
  const photo = isPhoto(engine, f.name)
  const kind = photo ? 'photo' : engine.isAudio(f.name) && !m.video ? 'audio' : 'video'
  const u = unreadable(f.name, m)
  const clip = {
    path: f.path, name: f.name, dir: f.dir, size: f.size, mtime: f.mtime, date: day(f.mtime), kind,
    dur: photo ? null : m.dur, tc: m.tc, video: m.video, audio: m.audio, bitrate: m.bitrate, meta: m.meta, thumb: '',
    tcOut: photo ? '' : tcOut(m.tc, m.dur, m.video?.fps), unread: u ? u[0] : '', unreadApp: u ? u[1] : '',
  }
  if (m.video && (photo ? PICTURE.has(extOf(f.name)) : m.dur != null)) {
    clip.thumb = await engine.thumb(bin, { path: f.path, name: f.name, dims: { w: m.video.w, h: m.video.h }, ...(photo ? {} : { video: { dur: m.dur } }) }, stop).catch(() => '')
  }
  return clip
}
/* one frame at a point through the clip, as a JPEG data address */
async function frameAt(engine, bin, file, at, stop) {
  const pic = (fast) => engine.ff(bin, [...(fast ? ['-skip_frame', 'nokey'] : []), '-ss', at.toFixed(2), '-i', file, '-frames:v', '1', '-an', '-vf', 'scale=480:-2', '-c:v', 'mjpeg', '-q:v', '4', '-f', 'image2pipe', '-'], stop, 600 * 1024)
  let { out } = await pic(true)
  if (out.length <= 100) out = (await pic(false)).out
  return out.length > 100 ? 'data:image/jpeg;base64,' + out.toString('base64') : ''
}
/* every frame decoded, nothing written: what ffmpeg says on the way is what is wrong. quick (Alex, 29 Oct): only the
   first and the last seconds, where a card or a copy that stopped short shows, in a fraction of the time. */
const QUICK = 6
async function checkClip(engine, bin, f, stop, quick = false) {
  const probe = parseMedia((await engine.ff(bin, ['-i', f.path], stop)).log)
  const u = unreadable(f.name, probe)
  if (u) return { ok: false, unread: true, why: u[0], app: u[1] }
  const run = (pre, ms) => engine.ff(bin, ['-v', 'error', ...pre, '-i', f.path, '-f', 'null', '-'], stop, 1024, ms, 2)
  // a generous limit: two cores decoding a 6K or 8K clip go slower than it plays
  const ms = Math.max(120e3, (probe.dur || 0) * 15000)
  let logs = [], code = 0
  if (quick && probe.dur > QUICK * 2) {
    for (const r of [await run(['-t', String(QUICK)], 60e3), await run(['-sseof', String(-QUICK)], 60e3)]) { logs.push(r.log); if (r.code !== 0) code = r.code }
  } else { const r = await run([], ms); logs = [r.log]; code = r.code }
  if (stop()) return null
  const lines = errorLines(logs.join('\n'))
  if (!lines.length && code === 0) return { ok: true }
  return { ok: false, why: whyBroken(lines, code), lines }
}

/* the last few reports and sheets, by id: a PDF is of the one on the screen */
function keeper(max = 6) {
  const m = new Map()
  let n = 0
  return {
    add(v) { const id = `${Date.now().toString(36)}-${++n}`; m.set(id, v); while (m.size > max) m.delete(m.keys().next().value); return { id, ...v } },
    get(id) { return m.get(String(id)) || (id == null && m.size ? [...m.values()].pop() : null) },
  }
}
const baseName = (root) => path.basename(String(root).replace(/[\\/]+$/, '')) || 'Card'

function register(ctx) {
  const { engine } = ctx
  const stop = () => ctx.stopped()
  const reports = keeper(), sheets = keeper()
  const co = () => { const p = ctx.prefs?.() || {}; return { company: p.company || '', companyLine: p.companyLine || '' } }
  const each = async (list, ev, emit, fn) => {
    let done = 0
    emit(ev, { done, total: list.length })
    await engine.pool(list, engine.JOBS, async (f, i) => { await fn(f, i); done++; emit(ev, { done, total: list.length }) }, stop)
  }

  ctx.handle('report-scan', ({ root, skipHidden, photos }, { emit }) => ctx.run(async () => {
    const t0 = Date.now(), bin = ctx.ffmpeg()
    const files = await clipsOf(engine, String(root), { skipHidden, photos: !!photos }, stop)
    const clips = new Array(files.length)
    await each(files, 'report-progress', emit, async (f, i) => { clips[i] = await describe(engine, bin, f, stop) })
    ctx.allow(files.map((f) => f.path))
    return reports.add({ root: String(root), clips, at: Date.now(), took: Date.now() - t0 })
  }))
  ctx.handle('report-pdf', async ({ id, words, locale }) => {
    const r = reports.get(id)
    return r ? ctx.savePDF(reportHTML(r, words, co(), locale), `Media report ${baseName(r.root)}.pdf`, { landscape: true }) : ''
  })

  ctx.handle('clipcheck-scan', ({ root, skipHidden, quick }, { emit }) => ctx.run(async () => {
    const t0 = Date.now(), bin = ctx.ffmpeg()
    const files = await clipsOf(engine, String(root), { skipHidden }, stop)
    const broken = [], unread = []
    let ok = 0
    await each(files, 'clipcheck-progress', emit, async (f) => {
      const r = await checkClip(engine, bin, f, stop, !!quick)
      if (!r) return
      if (r.ok) ok++
      else if (r.unread) unread.push({ path: f.path, name: f.name, dir: f.dir, size: f.size, why: r.why, app: r.app })
      else broken.push({ path: f.path, name: f.name, dir: f.dir, size: f.size, why: r.why, lines: r.lines })
    })
    const order = (a, b) => a.path.localeCompare(b.path, undefined, { numeric: true })
    ctx.allow([...broken, ...unread].map((b) => b.path))
    return { root: String(root), total: files.length, ok, broken: broken.sort(order), unread: unread.sort(order), quick: !!quick, took: Date.now() - t0 }
  }))

  ctx.handle('contact-scan', ({ root, frames, photos, skipHidden }, { emit }) => ctx.run(async () => {
    const t0 = Date.now(), bin = ctx.ffmpeg()
    const at = Number(frames) === 3 ? [0.2, 0.5, 0.8] : [0.4]
    const files = (await clipsOf(engine, String(root), { skipHidden, photos: !!photos }, stop)).filter((f) => engine.isVideo(f.name) || isPhoto(engine, f.name))
    const clips = new Array(files.length)
    await each(files, 'contact-progress', emit, async (f, i) => {
      const m = parseMedia((await engine.ff(bin, ['-i', f.path], stop)).log)
      const shots = []
      if (isPhoto(engine, f.name)) {
        if (m.video && PICTURE.has(extOf(f.name))) shots.push(await engine.thumb(bin, { path: f.path, name: f.name, dims: { w: m.video.w, h: m.video.h } }, stop).catch(() => ''))
      } else if (m.video && m.dur != null) for (const p of at) shots.push(await frameAt(engine, bin, f.path, m.dur * p, stop))
      const u = unreadable(f.name, m)
      clips[i] = { path: f.path, name: f.name, dir: f.dir, dur: isPhoto(engine, f.name) ? null : m.dur, tc: m.tc, res: m.video ? `${m.video.w}×${m.video.h}` : u ? u[0] : '', frames: shots.filter(Boolean) }
    })
    ctx.allow(files.map((f) => f.path))
    return sheets.add({ root: String(root), clips, took: Date.now() - t0 })
  }))
  ctx.handle('contact-pdf', async ({ id, cols, landscape, title, words, locale }) => {
    const s = sheets.get(id)
    return s ? ctx.savePDF(contactHTML(s, { cols, words, title: String(title || ''), co: co(), locale }), `Contact sheet ${baseName(s.root)}.pdf`, { landscape: !!landscape }) : ''
  })

  ctx.handle('media-save-csv', ({ text, name }) => ctx.saveText(String(text || ''), String(name || 'Media report.csv'), 'csv'))
}

module.exports = { register, parseMedia, codecName, whyBroken, errorLines, reportHTML, contactHTML, checkClip, describe, frameAt, tcOut, byCodec, keeper }
