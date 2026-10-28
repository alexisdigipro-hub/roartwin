// Media report (Alex, 28 Oct): every clip of a card or a folder, what it is (length, codec, picture, fps, timecode,
// sound), as a list to send: CSV for Excel, or an A4 PDF. Through electron/tools/media.js (report-scan, report-pdf).
// Also the pieces Clip check and Contact sheet share: the folder to look in and the progress while they work.

/* ---------- shared by the three media tools ---------- */
export const EL_SHARED = {
  'Drop a card or a folder here': 'Ρίξε εδώ μια κάρτα ή έναν φάκελο',
  'Choose…': 'Διάλεξε…', 'Choose another…': 'Διάλεξε άλλον…', 'Remove': 'Αφαίρεση',
  'Stop': 'Διακοπή', 'Stopping…': 'Σταματάει…', 'Starting': 'Ξεκινάει',
  '{a} of {b} clips': '{a} από {b} clips', 'Back': 'Πίσω', 'Saved': 'Αποθηκεύτηκε',
  'Choose a folder or a drive.': 'Διάλεξε φάκελο ή δίσκο.', 'Stopped.': 'Σταμάτησε.',
  'No clips in this folder.': 'Δεν υπάρχουν clips σε αυτόν τον φάκελο.', 'clips': 'clips',
}
// the folder (or card) to look in, dropped or chosen
export function folderBox(ctx, st, key, onSet) {
  const { h, t, I, ico } = ctx
  const set = async (paths) => {
    const p = paths?.[0]
    if (!p) return
    if (!(await ctx.isFolder(p))) return ctx.toast(t('Choose a folder or a drive.'))
    st.root = p; ctx.save(key, 'root', p); onSet?.(); ctx.draw()
  }
  return ctx.dropOn(h('div', { class: 'drop' + (st.root ? ' set' : '') },
    h('div', { class: 'dz-i', html: I.folder }),
    h('b', {}, t('Drop a card or a folder here')),
    st.root ? h('span', { class: 'root', title: st.root }, ico('folder'), h('span', {}, st.root), h('button', { 'aria-label': t('Remove'), html: I.x, onclick: () => { st.root = ''; ctx.save(key, 'root', ''); ctx.draw() } })) : null,
    h('button', { class: 'btn', onclick: async () => set(await ctx.pick()) }, ico('plus'), st.root ? t('Choose another…') : t('Choose…'))), set)
}
// the ring while a tool reads the clips; refs kept so each event updates it without drawing the page again
export function progressEl(ctx, st, title) {
  const { h, t, ico } = ctx
  const ring = h('div', { class: 'ring' })
  ring.innerHTML = '<svg viewBox="0 0 100 100"><circle class="t" cx="50" cy="50" r="44"/><circle class="p" cx="50" cy="50" r="44" stroke-dasharray="276.5" stroke-dashoffset="276.5"/></svg><b></b>'
  const tt = h('div', { class: 'stage-t' }, title), ss = h('div', { class: 'stage-s' })
  const paint = () => {
    const p = st.p || {}
    const frac = p.total ? p.done / p.total : null
    ring.classList.toggle('spin', frac == null)
    ring.querySelector('.p').setAttribute('stroke-dashoffset', String(276.5 * (1 - (frac ?? 0))))
    ring.querySelector('b').textContent = frac == null ? '' : Math.floor(frac * 100) + '%'
    ss.textContent = p.total ? t('{a} of {b} clips', { a: ctx.num(p.done), b: ctx.num(p.total) }) : t('Starting')
  }
  st.paint = paint
  paint()
  return h('main', {}, h('div', { class: 'scan' }, h('div', { class: 'card' }, ring, tt, ss,
    h('button', { class: 'btn', onclick: () => { ctx.stop(); tt.textContent = t('Stopping…') } }, ico('stop'), t('Stop')))))
}
// a tool's job: the menu waits, the ring follows the events, Stop gives { stopped }
export async function runJob(ctx, st, door, args, event) {
  st.busy = true; st.p = null; ctx.busy(true)
  const off = ctx.on(event, (p) => { st.p = p; st.paint?.() })
  try {
    const r = await ctx.call(door, args)
    if (r?.stopped) { ctx.toast(ctx.t('Stopped.')); return null }
    return r
  } catch (e) { ctx.toast(ctx.err(e)); return null } finally { off?.(); st.busy = false; ctx.busy(false) }
}
export const csvOf = (rows) => rows.map((r) => r.map((x) => `"${String(x ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n')
export const codecOf = (c) => (c.video ? c.video.name : (c.audio?.[0]?.codec || '').replace(/^pcm_.*/, 'PCM').toUpperCase())
export const soundOf = (c) => (c.audio || []).map((a) => `${a.channels || a.layout} ch · ${Math.round(a.rate / 100) / 10} kHz${a.bits ? ' · ' + a.bits + ' bit' : ''}`).join(', ')
// a sample picture for the browser preview
export const pic = (a, b, c) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient><radialGradient id="l" cx=".7" cy=".3" r=".5"><stop offset="0" stop-color="${c}" stop-opacity=".9"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient></defs><rect width="160" height="90" fill="url(#g)"/><circle cx="112" cy="28" r="40" fill="url(#l)"/><path d="M0 66h160v24H0z" fill="#000" opacity=".45"/></svg>`)
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
// a sample card for the browser preview: ProRes, BRAW-like H.265, sound files
export const SAMPLE_CLIPS = [
  ['A001_C001.mov', 312.4, '14:02:11:07', { name: 'ProRes 422 HQ', w: 3840, h: 2160, fps: 25 }, 18.4e9, ['#12161f', '#3a1416', '#ffd9a0']],
  ['A001_C002.mov', 96.2, '14:09:40:12', { name: 'ProRes 422 HQ', w: 3840, h: 2160, fps: 25 }, 5.7e9, ['#0b0e16', '#1a1f2c', '#ff6b5e']],
  ['A001_C003.mov', 48.0, '14:15:02:00', { name: 'ProRes 422 HQ', w: 3840, h: 2160, fps: 50 }, 5.6e9, ['#1d4a35', '#06110c', '#c8ffd8']],
  ['B002_C011.mp4', 211.7, '10:21:33:18', { name: 'H.265 Main 10', w: 3840, h: 2160, fps: 23.976 }, 2.9e9, ['#3a2a12', '#0e0a05', '#ffcf8a']],
  ['B002_C012.mp4', 64.3, '10:30:01:04', { name: 'H.265 Main 10', w: 3840, h: 2160, fps: 23.976 }, 0.9e9, ['#2a1840', '#0a0612', '#e6b8ff']],
  ['DRONE_0042.mp4', 182.0, '', { name: 'H.264 High', w: 3840, h: 2160, fps: 29.97 }, 1.1e9, ['#123048', '#06121c', '#a8e0ff']],
].map(([name, dur, tc, v, size, c], i) => ({
  path: `/Volumes/CARD_A/CLIP/${name}`, name, dir: '/Volumes/CARD_A/CLIP', size, date: `2026-10-${14 + (i > 2 ? 1 : 0)}`, dur, tc,
  video: { codec: '', profile: '', fps: v.fps, ...v }, audio: name.startsWith('DRONE') ? [] : [{ codec: 'pcm_s24le', rate: 48000, channels: 2, bits: 24 }], thumb: pic(...c), frames: [pic(...c)],
})).concat([{ path: '/Volumes/CARD_A/SOUND/T014.wav', name: 'T014.wav', dir: '/Volumes/CARD_A/SOUND', size: 0.31e9, date: '2026-10-14', dur: 212.6, tc: '14:02:10:00', video: null, audio: [{ codec: 'pcm_s24le', rate: 48000, channels: 2, bits: 24 }], thumb: '', frames: [] }])
export async function demoRun(event, n, emit) { for (let i = 0; i <= n; i++) { emit(event, { done: i, total: n }); await wait(110) } }

/* ---------- Media report ---------- */
const st = { root: '', res: null, busy: false, p: null }
let loaded = false
const load = (ctx) => { if (!loaded) { loaded = true; st.root = ctx.load('report', 'root', '') } }

const words = (t) => ({ title: t('Media report'), clips: t('clips'), name: t('Name'), length: t('Length'), tc: t('Timecode'), codec: t('Codec'), picture: t('Picture'), sound: t('Sound'), size: t('Size'), date: t('Date') })
async function start(ctx) {
  if (!st.root) return
  const r = await runJob(ctx, st, 'report-scan', { root: st.root, skipHidden: ctx.S.opts.skipHidden }, 'report-progress')
  if (r) { st.res = r; if (!r.clips.length) ctx.toast(ctx.t('No clips in this folder.')) }
  ctx.draw()
}
async function exportCSV(ctx) {
  const { t, dur } = ctx
  const rows = [[t('Name'), t('Folder'), t('Length'), t('Timecode'), t('Codec'), t('Picture'), 'fps', t('Colour'), t('Sound'), t('Size (bytes)'), t('Date'), t('Camera')]]
  for (const c of st.res.clips) rows.push([c.name, c.dir, c.dur != null ? dur(c.dur) : '', c.tc, codecOf(c), c.video ? `${c.video.w}x${c.video.h}` : '', c.video?.fps ?? '', [c.video?.pix, c.video?.color, c.video?.hdr].filter(Boolean).join(' '), soundOf(c), c.size, c.date, [c.meta?.make, c.meta?.model].filter(Boolean).join(' ')])
  const name = `Media report ${st.res.root.split(/[\\/]/).filter(Boolean).pop() || ''}.csv`
  try { if (await ctx.call('media-save-csv', { text: csvOf(rows), name })) ctx.toast(t('Saved')) } catch (e) { ctx.toast(ctx.err(e)) }
}
async function savePDF(ctx) {
  try { if (await ctx.call('report-pdf', { words: words(ctx.t) })) ctx.toast(ctx.t('Saved')) } catch (e) { ctx.toast(ctx.err(e)) }
}

function clipEl(ctx, c) {
  const { h, t, bytes, dur, ico, I } = ctx
  const v = c.video
  const chip = (x) => (x ? h('span', { class: 'chip' }, x) : null)
  return h('div', { class: 'file nocheck' },
    h('div', { class: 'thumb', style: c.thumb ? { backgroundImage: `url("${c.thumb}")` } : null }, c.thumb ? null : ico(v ? 'play' : 'sound')),
    h('div', { class: 'f-main' }, h('div', { class: 'f-name', title: c.name }, c.name), h('div', { class: 'f-dir', title: c.dir }, '‎' + c.dir),
      h('div', { class: 'f-meta' },
        c.dur != null ? chip(dur(c.dur)) : null,
        c.tc ? h('span', { class: 'chip tint', style: { '--c': '#64d2ff' } }, h('i'), 'TC ' + c.tc) : null,
        chip(codecOf(c)),
        v ? chip(`${v.w}×${v.h}` + (v.fps ? ` · ${Math.round(v.fps * 1000) / 1000} fps` : '')) : null,
        v?.hdr ? h('span', { class: 'chip tint', style: { '--c': 'var(--warn)' } }, h('i'), v.hdr) : null,
        c.audio?.length ? chip(soundOf(c)) : null,
        chip(bytes(c.size)), chip(c.date))),
    h('div', { class: 'f-act' },
      h('button', { class: 'ib sm', title: ctx.revealLabel(), 'aria-label': ctx.revealLabel(), html: I.reveal, onclick: () => ctx.reveal(c.path) }),
      h('button', { class: 'ib sm', title: t('Open'), 'aria-label': t('Open'), html: v ? I.play : I.sound, onclick: () => ctx.open(c.path) })))
}

export default {
  // back and forward (app.js): what makes this tool's screen
  nav: { get: () => ({ res: st.res }), set: (s) => { st.res = s.res } },
  id: 'report',
  el: {
    ...EL_SHARED,
    'Media report': 'Αναφορά media', 'A <b>report</b> of the clips.': 'Μια <b>αναφορά</b> των clips.',
    'Every clip of a card or a folder: length, codec, picture, frame rate, timecode and sound, with a frame of each. Save it as a PDF for the post house or as a list for Excel.': 'Κάθε clip μιας κάρτας ή ενός φακέλου: διάρκεια, codec, εικόνα, frame rate, timecode και ήχος, με ένα καρέ από το καθένα. Σώσ\' το ως PDF για το post house ή ως λίστα για το Excel.',
    'Make the report': 'Φτιάξε την αναφορά', 'Reading the clips': 'Διαβάζει τα clips', 'Nothing is changed: RoarKit only reads the clips.': 'Τίποτα δεν αλλάζει: το RoarKit μόνο διαβάζει τα clips.',
    'Export': 'Εξαγωγή', 'Save PDF': 'Αποθήκευση PDF', 'New report': 'Νέα αναφορά', 'Export the list (CSV)': 'Εξαγωγή λίστας (CSV)',
    '{n} clips': '{n} clips', '1 clip': '1 clip', 'in all': 'συνολικά',
    'Name': 'Όνομα', 'Folder': 'Φάκελος', 'Length': 'Διάρκεια', 'Timecode': 'Timecode', 'Codec': 'Codec', 'Picture': 'Εικόνα',
    'Sound': 'Ήχος', 'Size': 'Μέγεθος', 'Size (bytes)': 'Μέγεθος (bytes)', 'Date': 'Ημερομηνία', 'Colour': 'Χρώμα', 'Camera': 'Κάμερα', 'Open': 'Άνοιγμα',
  },
  top(ctx) {
    const { h, t, ico } = ctx
    load(ctx)
    const kids = [h('div', { class: 'title' }, t('Media report')), h('div', { class: 'spacer' })]
    if (st.res && !st.busy) kids.push(
      h('button', { class: 'btn', onclick: () => exportCSV(ctx), title: t('Export the list (CSV)'), disabled: !st.res.clips.length }, ico('out'), h('span', { class: 'lbl' }, t('Export'))),
      h('button', { class: 'btn', onclick: () => savePDF(ctx), disabled: !st.res.clips.length }, ico('file'), h('span', { class: 'lbl' }, t('Save PDF'))),
      h('button', { class: 'btn', onclick: () => { st.res = null; ctx.draw() } }, ico('search'), h('span', { class: 'lbl' }, t('New report'))))
    return kids
  },
  view(ctx) {
    const { h, t, ico, bytes, dur, num } = ctx
    load(ctx)
    if (st.busy) return progressEl(ctx, st, t('Reading the clips'))
    if (st.res) {
      const cl = st.res.clips
      const total = cl.reduce((n, c) => n + (c.dur || 0), 0), size = cl.reduce((n, c) => n + (c.size || 0), 0)
      const codecs = [...new Set(cl.map(codecOf).filter(Boolean))]
      return h('main', {}, h('div', { class: 'res' },
        h('div', { class: 'sum' },
          h('span', { class: 'chip tint' }, h('i'), cl.length === 1 ? t('1 clip') : t('{n} clips', { n: num(cl.length) })),
          h('span', { class: 'chip' }, dur(total) + ' ' + t('in all')), h('span', { class: 'chip' }, bytes(size)),
          ...codecs.map((c) => h('span', { class: 'chip' }, c)),
          h('span', { class: 'chip', title: st.res.root }, st.res.root.split(/[\\/]/).filter(Boolean).pop() || st.res.root)),
        cl.length ? h('section', { class: 'group' }, h('div', { class: 'files', style: { paddingTop: '8px' } }, ...cl.map((c) => clipEl(ctx, c))))
          : h('p', { class: 'note' }, t('No clips in this folder.'))))
    }
    return h('main', {}, h('div', { class: 'home' }, h('div', { class: 'card' },
      h('div', { class: 'hero' }, h('h1', { html: t('A <b>report</b> of the clips.') }),
        h('p', {}, t('Every clip of a card or a folder: length, codec, picture, frame rate, timecode and sound, with a frame of each. Save it as a PDF for the post house or as a list for Excel.'))),
      folderBox(ctx, st, 'report'),
      h('div', { class: 'go' }, h('button', { class: 'btn main big', disabled: !st.root, onclick: () => start(ctx) }, ico('list'), t('Make the report'))),
      h('p', { class: 'note' }, t('Nothing is changed: RoarKit only reads the clips.')))))
  },
  demo: {
    'report-scan': async ({ root }, emit) => { await demoRun('report-progress', SAMPLE_CLIPS.length, emit); return { root, clips: SAMPLE_CLIPS, took: 4200 } },
    'report-pdf': async () => '/Users/alex/Desktop/Media report CARD_A.pdf',
    'media-save-csv': async () => '/Users/alex/Desktop/Media report CARD_A.csv',
  },
}
