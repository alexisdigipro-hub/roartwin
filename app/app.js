// RoarTwin's page: where to look, the scan, the twins. Everything on the disk goes through window.twin
// (electron/preload.js); opened in a browser, a sample stands in for it (demo.js), so the page can be seen and tested.
import { demoTwin } from './demo.js'

const T = window.twin || demoTwin()
document.documentElement.classList.add(T.platform === 'darwin' ? 'mac' : T.platform === 'win32' ? 'win' : 'web')

/* ---------- small helpers ---------- */
const h = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v)
    else if (k === 'html') e.innerHTML = v
    else if (k === 'style' && typeof v === 'object') for (const [sk, sv] of Object.entries(v)) sk.startsWith('--') ? e.style.setProperty(sk, sv) : (e.style[sk] = sv)
    else e.setAttribute(k, v === true ? '' : v)
  }
  for (const c of kids.flat(9)) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)))
  return e
}
const I = {
  folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.2h7a2 2 0 0 1 2 2v7.8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.2 4.2L19 7"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M5 7l1 12.5A2 2 0 0 0 8 21h8a2 2 0 0 0 2-1.5L19 7M9 7V4h6v3"/></svg>',
  reveal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.2h7a2 2 0 0 1 2 2v7.8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><path d="m10 13 2 2 2-2M12 10v5"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="m10 9 5 3-5 3z"/></svg>',
  file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10A.5.5 0 0 1 7 20z"/><path d="M14 3.5V8h4"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 14v4.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V14"/></svg>',
  done: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.2 4.2L19 7"/></svg>',
  stop: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="7" width="10" height="10" rx="2"/></svg>',
}
const ico = (name, cls) => h('span', { class: cls, html: I[name], 'aria-hidden': 'true' })
const bytes = (n) => {
  if (n < 1000) return n + ' B'
  const u = ['KB', 'MB', 'GB', 'TB']; let i = -1
  do { n /= 1000; i++ } while (n >= 1000 && i < u.length - 1)
  return (n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2)) + ' ' + u[i]
}
const dur = (s) => { s = Math.round(s); const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60; return (hh ? hh + ':' + String(mm).padStart(2, '0') : mm) + ':' + String(ss).padStart(2, '0') }
const num = (n) => n.toLocaleString('en-US')
const plural = (n, one, many = one + 's') => `${num(n)} ${n === 1 ? one : many}`
const store = { get: (k, d) => { try { const v = JSON.parse(localStorage.getItem('twin:' + k)); return v ?? d } catch { return d } }, set: (k, v) => { try { localStorage.setItem('twin:' + k, JSON.stringify(v)) } catch { /* private */ } } }
function toast(t) { const e = h('div', { class: 'toast' }, t); document.body.append(e); setTimeout(() => e.remove(), 3200) }
function sheet(title, text, buttons) {
  return new Promise((done) => {
    const close = (v) => { veil.remove(); document.removeEventListener('keydown', key); done(v) }
    const key = (e) => { if (e.key === 'Escape') close(null) }
    const veil = h('div', { class: 'veil', onclick: (e) => { if (e.target === veil) close(null) } },
      h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' }, h('h3', {}, title), h('p', {}, text),
        h('div', { class: 'row' }, ...buttons.map(([label, v, main]) => h('button', { class: 'btn' + (main ? ' main' : ''), onclick: () => close(v) }, label)))))
    document.addEventListener('keydown', key)
    document.body.append(veil)
    veil.querySelector('.btn.main')?.focus()
  })
}
/* a segmented choice whose glass lens slides to the chosen option */
function seg(options, value, onPick) {
  const lens = h('span', { class: 'lens' })
  const box = h('div', { class: 'seg', role: 'radiogroup' }, lens, ...options.map(([v, label, extra]) => h('button', { type: 'button', class: v === value ? 'on' : '', 'data-v': v, role: 'radio', 'aria-checked': String(v === value), onclick: () => onPick(v) }, label, extra != null ? h('small', {}, extra) : null)))
  const place = () => { const on = box.querySelector('button.on'); if (on) { lens.style.left = on.offsetLeft + 'px'; lens.style.width = on.offsetWidth + 'px' } }
  requestAnimationFrame(place)
  return box
}
const switchEl = (on, onFlip, label) => h('button', { type: 'button', class: 'switch' + (on ? ' on' : ''), role: 'switch', 'aria-checked': String(on), 'aria-label': label, onclick: () => onFlip(!on) })

/* ---------- state ---------- */
const S = {
  view: 'home',
  roots: store.get('roots', []),
  opts: { videosOnly: false, similar: true, minSize: 0, skipHidden: true, skipCloud: true, ...store.get('opts', {}) },
  progress: null, stages: new Set(),
  result: null, filter: 'all', shown: 40, sel: new Set(), gone: new Set(),
  version: '', update: null,
}
const saveOpts = () => { store.set('roots', S.roots); store.set('opts', S.opts) }
const app = document.getElementById('app')
T.version?.().then((v) => { S.version = v; if (S.view !== 'scan') draw() })
T.update?.state?.().then((s) => { S.update = s; drawTop() })
T.update?.on?.((s) => { S.update = s; drawTop() })

/* ---------- the top row ---------- */
let topEl = null
function drawTop() {
  if (!topEl) return
  const r = S.result
  const upd = S.update?.status === 'ready'
    ? h('button', { class: 'btn upd', onclick: () => T.update.install() }, h('span', { class: 'chip tint upd', style: { height: '20px', padding: '0 8px', border: 0 } }, h('i')), 'Restart to update')
    : null
  const kids = [h('div', { class: 'wm' }, h('span', {}, 'ROAR'), h('b', {}, 'TWIN'))]
  if (S.view === 'results' && r) {
    const counts = { all: r.groups.length, exact: r.groups.filter((g) => g.kind === 'exact').length, similar: r.groups.filter((g) => g.kind === 'similar').length }
    kids.push(
      h('div', { class: 'title' }, 'Twins'),
      seg([['all', 'All', counts.all], ['exact', 'Exact copies', counts.exact], ['similar', 'Same video', counts.similar]], S.filter, (v) => { S.filter = v; S.shown = 40; draw() }),
      h('div', { class: 'spacer' }), upd,
      h('button', { class: 'btn', onclick: exportList, title: 'Export the list (CSV)' }, ico('out'), h('span', { class: 'lbl' }, 'Export')),
      h('button', { class: 'btn', onclick: () => { S.view = 'home'; draw() } }, ico('search'), h('span', { class: 'lbl' }, 'New scan')))
  } else {
    kids.push(h('div', { class: 'spacer' }), upd, S.version ? h('span', { class: 'chip' }, 'v' + S.version + ' beta') : null)
  }
  topEl.replaceChildren(...kids.filter(Boolean))
}

function draw() {
  topEl = h('header', { class: 'top' })
  const body = S.view === 'scan' ? viewScan() : S.view === 'results' ? viewResults() : viewHome()
  app.replaceChildren(topEl, body)
  drawTop()
  drawFoot()
}

/* ---------- home: where to look ---------- */
async function addRoots(paths) {
  const add = []
  for (const p of paths) if (p && !S.roots.includes(p) && (await T.isFolder(p))) add.push(p)
  if (!add.length) { if (paths.length) toast('Drop folders or drives, not single files.'); return }
  S.roots = [...S.roots, ...add]; saveOpts(); draw()
}
function viewHome() {
  const o = S.opts
  const set = (k, v) => { o[k] = v; saveOpts(); draw() }
  const drop = h('div', { class: 'drop' },
    h('div', { class: 'dz-i', html: I.folder }),
    h('b', {}, S.roots.length ? 'Drop more folders or drives' : 'Drop a folder or a drive here'),
    h('small', {}, 'A shoot, an archive, a whole disk. Nothing is changed until you choose.'),
    h('button', { class: 'btn', onclick: async () => addRoots(await T.pick()) }, ico('plus'), 'Choose folders…'),
    S.roots.length ? h('div', { class: 'roots' }, ...S.roots.map((r) => h('span', { class: 'root', title: r }, ico('folder'), h('span', {}, r),
      h('button', { 'aria-label': 'Remove ' + r, html: I.x, onclick: () => { S.roots = S.roots.filter((x) => x !== r); saveOpts(); draw() } })))) : null)
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over') })
  drop.addEventListener('dragleave', () => drop.classList.remove('over'))
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); addRoots([...e.dataTransfer.files].map((f) => T.pathOf(f))) })
  const opt = (title, sub, control) => h('div', { class: 'opt' }, h('span', {}, h('b', {}, title), h('small', {}, sub)), control)
  return h('main', {}, h('div', { class: 'home' }, h('div', { class: 'card' },
    h('div', { class: 'hero' }, h('h1', { html: 'Find the <b>twins</b>.' }),
      h('p', {}, 'RoarTwin finds the same file twice, whatever its name, and the same video in another size or format, so you keep one and free the space.')),
    drop,
    h('div', { class: 'opts' },
      opt('Look for', o.videosOnly ? 'Videos only: MOV, MP4, MXF, MKV, AVI and more.' : 'Every kind of file: videos, photos, sound, projects.',
        seg([[false, 'Every file'], [true, 'Videos only']], o.videosOnly, (v) => set('videosOnly', v))),
      opt('The same video in another file', 'Also when it was exported again, in another size, codec or format. RoarTwin compares the pictures.',
        switchEl(o.similar, (v) => set('similar', v), 'The same video in another file')),
      opt('Smallest file', 'Smaller files are left out.',
        seg([[0, 'Any'], [1e6, '1 MB'], [1e8, '100 MB'], [1e9, '1 GB']], o.minSize, (v) => set('minSize', v))),
      opt('Skip hidden and system folders', 'The system, the apps, the Trash, and libraries like Photos or Final Cut.',
        switchEl(o.skipHidden, (v) => set('skipHidden', v), 'Skip hidden and system folders')),
      // Alex, 24 Oct: a cloud drive shows the whole cloud as if it were here, and reading it downloads it
      opt('Skip cloud drives', 'pCloud, iCloud, Dropbox, Google Drive, OneDrive: their files live online, and reading them downloads them. A cloud folder you choose yourself is still looked in.',
        switchEl(o.skipCloud, (v) => set('skipCloud', v), 'Skip cloud drives'))),
    h('div', { class: 'go' }, h('button', { class: 'btn main big', disabled: !S.roots.length, onclick: start }, ico('search'), 'Find twins')),
    h('p', { class: 'note' }, 'Found files go to the Trash only when you say so, and one of each always stays.'))))
}

/* ---------- the scan ---------- */
const STAGES = [['list', 'Listing'], ['compare', 'Comparing'], ['hash', 'Reading'], ['video', 'Videos'], ['frames', 'Pictures'], ['thumbs', 'Previews']]
let scanEls = null
async function start() {
  if (!S.roots.length) return
  S.view = 'scan'; S.progress = { stage: 'list', files: 0 }; S.stages = new Set(['list']); draw()
  const off = T.onProgress((p) => { S.progress = p; S.stages.add(p.stage); drawProgress() })
  try {
    const r = await T.scan({ roots: S.roots, ...S.opts })
    if (r?.stopped) { S.view = 'home'; toast('Scan stopped.'); return draw() }
    S.result = r; S.filter = 'all'; S.shown = 40; S.gone = new Set()
    // exact copies: everything but the one to keep is chosen; the same video in another file is for you to decide
    S.sel = new Set(r.groups.filter((g) => g.kind === 'exact').flatMap((g) => g.files.filter((f) => !f.keep).map((f) => f.path)))
    S.view = 'results'; draw()
  } catch (e) {
    S.view = 'home'; draw(); toast(String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
  } finally { off?.() }
}
function viewScan() {
  scanEls = { ring: h('div', { class: 'ring' }), t: h('div', { class: 'stage-t' }), s: h('div', { class: 'stage-s' }), steps: h('div', { class: 'steps' }) }
  scanEls.ring.innerHTML = '<svg viewBox="0 0 100 100"><circle class="t" cx="50" cy="50" r="44"/><circle class="p" cx="50" cy="50" r="44" stroke-dasharray="276.5" stroke-dashoffset="276.5"/></svg><b></b>'
  const m = h('main', {}, h('div', { class: 'scan' }, h('div', { class: 'card' }, scanEls.ring, scanEls.t, scanEls.s, scanEls.steps,
    h('button', { class: 'btn', onclick: () => { T.stop(); scanEls.t.textContent = 'Stopping…' } }, ico('stop'), 'Stop'))))
  requestAnimationFrame(drawProgress)
  return m
}
function drawProgress() {
  if (S.view !== 'scan' || !scanEls) return
  const p = S.progress || {}
  const text = {
    list: ['Listing the files', `${plural(p.files || 0, 'file')} so far`],
    compare: ['Comparing sizes and samples', `${num(p.done || 0)} of ${num(p.total || 0)} files with a twin in size`],
    hash: ['Reading the possible copies', `${bytes(p.bytesDone || 0)} of ${bytes(p.bytesTotal || 0)}`],
    video: ['Reading the videos', `${num(p.done || 0)} of ${plural(p.total || 0, 'video')}: length, size, codec`],
    frames: ['Looking at the pictures', `${num(p.done || 0)} of ${plural(p.total || 0, 'video')} of about the same length`],
    thumbs: ['Making the previews', `${num(p.done || 0)} of ${plural(p.total || 0, 'file')}`],
  }[p.stage] || ['Starting', '']
  const frac = p.stage === 'hash' ? (p.bytesTotal ? p.bytesDone / p.bytesTotal : 1) : p.total ? p.done / p.total : null
  scanEls.ring.classList.toggle('spin', frac == null)
  scanEls.ring.querySelector('.p').setAttribute('stroke-dashoffset', String(276.5 * (1 - (frac ?? 0))))
  scanEls.ring.querySelector('b').textContent = frac == null ? '' : Math.floor(frac * 100) + '%'
  scanEls.t.textContent = text[0]; scanEls.s.textContent = text[1]
  const at = STAGES.findIndex(([k]) => k === p.stage)
  scanEls.steps.replaceChildren(...STAGES.filter(([k]) => S.opts.similar || !['video', 'frames'].includes(k)).map(([k, label]) => {
    const i = STAGES.findIndex(([x]) => x === k)
    return h('span', { class: 'chip' + (i === at ? ' on' : i < at ? ' done' : '') }, h('i'), label)
  }))
}

/* ---------- the twins ---------- */
// which cloud drives were left out, named, so a missing folder is never a mystery
const cloudChip = (r) => (r.cloud?.length ? h('span', { class: 'chip', title: r.cloud.join('\n') },
  `Cloud left out: ${[...new Set(r.cloud.map((p) => p.split(/[\\/]/).pop()))].slice(0, 3).join(', ')}${r.cloud.length > 3 ? '…' : ''}`) : null)
const live = (g) => g.files.filter((f) => !S.gone.has(f.path))
function viewResults() {
  const r = S.result
  const groups = r.groups.map((g) => ({ ...g, files: live(g) })).filter((g) => g.files.length > 1)
  const list = groups.filter((g) => S.filter === 'all' || g.kind === S.filter)
  if (!groups.length) {
    return h('main', {}, h('div', { class: 'empty' }, h('div', {},
      h('div', { class: 'big-i', html: I.done }),
      h('h2', { html: S.gone.size ? 'All <b>tidy</b>.' : 'No <b>twins</b> here.' }),
      h('p', {}, `${plural(r.files, 'file')} looked at${S.gone.size ? `, ${plural(S.gone.size, 'file')} in the Trash` : ''}.`),
      cloudChip(r),
      h('button', { class: 'btn', onclick: () => { S.view = 'home'; draw() } }, ico('back'), 'Back'))))
  }
  const free = groups.reduce((a, g) => a + g.files.filter((f) => !f.keep).reduce((b, f) => b + f.size, 0), 0)
  const sum = h('div', { class: 'sum' },
    h('span', { class: 'chip tint' }, h('i'), `${plural(groups.length, 'group')} of twins`),
    h('span', { class: 'chip' }, `up to ${bytes(free)} to free`),
    h('span', { class: 'chip' }, `${plural(r.files, 'file')} looked at in ${dur(r.took / 1000)}`),
    cloudChip(r))
  const shown = list.slice(0, S.shown)
  return h('main', {}, h('div', { class: 'res' }, sum, ...shown.map(groupEl),
    list.length > shown.length ? h('button', { class: 'btn more', onclick: () => { S.shown += 60; draw() } }, `Show ${Math.min(60, list.length - shown.length)} more`) : null))
}
function groupEl(g) {
  const same = g.kind === 'exact'
  const chosen = g.files.filter((f) => S.sel.has(f.path))
  const v = g.files.find((f) => f.video)?.video
  return h('section', { class: 'group' },
    h('div', { class: 'g-head' },
      h('span', { class: 'chip tint', style: { '--c': same ? 'var(--acc)' : 'var(--warn)' } }, h('i'), same ? 'Exact copy' : 'Same video, other files'),
      h('span', { class: 'g-t' }, plural(g.files.length, 'file')),
      h('span', { class: 'g-s' }, same ? `${bytes(g.files[0].size)} each${v ? ' · ' + dur(v.dur) : ''}` : v ? dur(v.dur) : ''),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn', style: { height: '30px', padding: '0 12px', fontSize: '12.5px' }, onclick: () => { g.files.forEach((f) => (f.keep ? S.sel.delete(f.path) : S.sel.add(f.path))); draw() } }, 'Keep the suggested one'),
      chosen.length ? h('button', { class: 'btn', style: { height: '30px', padding: '0 12px', fontSize: '12.5px' }, onclick: () => { g.files.forEach((f) => S.sel.delete(f.path)); draw() } }, 'Keep all') : null),
    h('div', { class: 'files' }, ...g.files.map((f) => fileEl(f, g))))
}
function fileEl(f, g) {
  const on = S.sel.has(f.path)
  // the last one not chosen cannot be chosen too: one of each stays
  const lastOne = !on && g.files.filter((x) => !S.sel.has(x.path)).length === 1
  const v = f.video
  const meta = [
    h('span', { class: 'chip' }, bytes(f.size)),
    v ? h('span', { class: 'chip' }, `${v.w}×${v.h}`) : null,
    v ? h('span', { class: 'chip' }, dur(v.dur)) : null,
    v ? h('span', { class: 'chip' }, v.codec.toUpperCase() + (v.fps ? ` · ${Math.round(v.fps * 100) / 100} fps` : '')) : null,
    h('span', { class: 'chip' }, new Date(f.mtime).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })),
    f.keep ? h('span', { class: 'chip tint keep' }, h('i'), g.kind === 'exact' ? 'Keep · the oldest' : 'Keep · the best picture') : null,
  ]
  return h('div', { class: 'file' + (on ? ' sel' : '') },
    h('button', { class: 'check' + (on ? ' on' : ''), html: I.check, disabled: lastOne, title: lastOne ? 'One of each stays' : on ? 'Keep it' : 'Move to the Trash', 'aria-label': (on ? 'Keep ' : 'Choose ') + f.name,
      onclick: () => { on ? S.sel.delete(f.path) : S.sel.add(f.path); draw() } }),
    h('div', { class: 'thumb', style: f.thumb ? { backgroundImage: `url("${f.thumb}")` } : null }, f.thumb ? null : ico(v ? 'play' : 'file')),
    h('div', { class: 'f-main' }, h('div', { class: 'f-name', title: f.name }, f.name), h('div', { class: 'f-dir', title: f.dir }, '‎' + f.dir), h('div', { class: 'f-meta' }, ...meta)),
    h('div', { class: 'f-act' },
      h('button', { class: 'ib sm', title: T.platform === 'win32' ? 'Show in Explorer' : 'Show in Finder', 'aria-label': 'Show ' + f.name, html: I.reveal, onclick: () => T.reveal(f.path) }),
      h('button', { class: 'ib sm', title: 'Open', 'aria-label': 'Open ' + f.name, html: v ? I.play : I.file, onclick: () => T.open(f.path) })))
}

/* ---------- the Trash ---------- */
let footEl = null
function drawFoot() {
  if (!footEl) { footEl = h('div', { class: 'foot' }); document.body.append(footEl) }
  const files = S.view === 'results' && S.result ? S.result.groups.flatMap((g) => live(g)).filter((f) => S.sel.has(f.path)) : []
  footEl.classList.toggle('show', files.length > 0)
  if (!files.length) return
  const size = files.reduce((a, f) => a + f.size, 0)
  footEl.replaceChildren(h('span', {}, h('b', {}, plural(files.length, 'file')), ' chosen · ', h('b', {}, bytes(size))),
    h('button', { class: 'btn', onclick: () => { S.sel.clear(); draw() } }, 'Clear'),
    h('button', { class: 'btn main', onclick: () => toTrash(files, size) }, ico('trash'), 'Move to Trash'))
}
async function toTrash(files, size) {
  const ok = await sheet(`Move ${plural(files.length, 'file')} to the Trash?`, `${bytes(size)} will be freed when you empty the Trash. One file of each group stays where it is.`, [['Cancel', false], ['Move to Trash', true, true]])
  if (!ok) return
  const r = await T.trash(files.map((f) => f.path))
  r.ok.forEach((p) => { S.gone.add(p); S.sel.delete(p) })
  draw()
  if (r.failed.length) toast(`${plural(r.failed.length, 'file')} could not be moved: ${r.failed[0].error}`)
  else toast(`${plural(r.ok.length, 'file')} moved to the Trash`)
}

/* ---------- the list as CSV ---------- */
async function exportList() {
  const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`
  const rows = [['Group', 'Kind', 'Suggested', 'Chosen', 'Name', 'Folder', 'Size (bytes)', 'Length', 'Picture', 'Codec', 'Modified'].map(q).join(',')]
  S.result.groups.forEach((g, i) => live(g).forEach((f) => rows.push([i + 1, g.kind === 'exact' ? 'Exact copy' : 'Same video', f.keep ? 'Keep' : '', S.sel.has(f.path) ? 'Trash' : '', f.name, f.dir, f.size, f.video ? dur(f.video.dur) : '', f.video ? `${f.video.w}x${f.video.h}` : '', f.video?.codec || '', new Date(f.mtime).toISOString().slice(0, 10)].map(q).join(','))))
  if (await T.exportCSV(rows.join('\r\n'))) toast('List saved')
}

T.onMenu?.((cmd) => {
  if (cmd === 'add' && S.view === 'home') T.pick().then(addRoots)
  if (cmd === 'new' && S.view !== 'scan') { S.view = 'home'; draw() }
  if (cmd === 'export' && S.view === 'results') exportList()
})
// a folder dropped anywhere on the home screen counts
document.addEventListener('dragover', (e) => e.preventDefault())
document.addEventListener('drop', (e) => { e.preventDefault(); if (S.view === 'home' && !e.target.closest('.drop')) addRoots([...e.dataTransfer.files].map((f) => T.pathOf(f))) })
window.addEventListener('resize', () => document.querySelectorAll('.seg').forEach((s) => { const on = s.querySelector('button.on'), l = s.querySelector('.lens'); if (on && l) { l.style.left = on.offsetLeft + 'px'; l.style.width = on.offsetWidth + 'px' } }))
draw()
