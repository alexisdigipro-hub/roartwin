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
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5.5" y="10.5" width="13" height="9.5" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5 5 6v5.5c0 4.3 3 7.7 7 9 4-1.3 7-4.7 7-9V6z"/><path d="m9 12 2.2 2.2L15.5 10"/></svg>',
  warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4 3 20h18z"/><path d="M12 10v4.5M12 17.5v.01"/></svg>',
  sound: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2"/></svg>',
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
  opts: { videosOnly: false, similar: true, minSize: 0, skipHidden: true, skipCloud: true, folders: true, parts: false, photos: true, sounds: true, proxies: true, ...store.get('opts', {}) },
  // Alex, 25 Oct: folders marked Masters (never offered for the Trash), and the backup check's two folders
  protect: store.get('protect', []),
  mode: store.get('mode', 'twins'), source: store.get('source', ''), backup: store.get('backup', ''), bres: null,
  progress: null, stages: new Set(),
  result: null, filter: 'all', shown: 40, sel: new Set(), gone: new Set(),
  version: '', update: null,
}
const saveOpts = () => { store.set('roots', S.roots); store.set('opts', S.opts); store.set('protect', S.protect); store.set('mode', S.mode); store.set('source', S.source); store.set('backup', S.backup) }
/* what each kind of group is called, its colour, what the kept one is, and whether its copies come chosen */
const KINDS = {
  exact: { label: 'Exact copy', tab: 'Exact copies', c: 'var(--acc)', keep: 'the oldest', pre: true },
  folder: { label: 'Same folder twice', tab: 'Folders', c: '#64d2ff', keep: 'the oldest', pre: true },
  similar: { label: 'Same video, other files', tab: 'Same video', c: 'var(--warn)', keep: 'the best picture' },
  part: { label: 'Part of a longer video', tab: 'Parts', c: '#bf5af2', keep: 'the full video' },
  photo: { label: 'Similar photos', tab: 'Photos', c: '#ffd60a', keep: 'the most pixels' },
  sound: { label: 'Same sound, other files', tab: 'Sound', c: '#5e9bff', keep: 'the best quality' },
  orphan: { label: 'Proxy with no original here', tab: 'Proxies', c: 'var(--dim)', keep: '' },
}
// the copies chosen for the Trash at first: exact copies and twin folders, never what is in a Masters folder
const preselect = (groups) => new Set(groups.filter((g) => KINDS[g.kind]?.pre).flatMap((g) => g.files.filter((f) => !f.keep && !f.protected).map((f) => f.path)))
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
  if (S.view === 'backup' && S.bres) {
    kids.push(
      h('div', { class: 'title' }, 'Backup check'),
      h('div', { class: 'spacer' }), upd,
      S.bres.missing.length ? h('button', { class: 'btn', onclick: exportBackup, title: 'Export the list (CSV)' }, ico('out'), h('span', { class: 'lbl' }, 'Export')) : null,
      h('button', { class: 'btn', onclick: () => { S.view = 'home'; draw() } }, ico('search'), h('span', { class: 'lbl' }, 'New check')))
  } else if (S.view === 'results' && r) {
    // one tab a kind that was found
    const tabs = [['all', 'All', r.groups.length], ...Object.entries(KINDS).map(([k, m]) => [k, m.tab, r.groups.filter((g) => g.kind === k).length]).filter((t) => t[2])]
    kids.push(
      h('div', { class: 'title' }, 'Twins'),
      seg(tabs, S.filter, (v) => { S.filter = v; S.shown = 40; draw() }),
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
  const body = S.view === 'scan' ? viewScan() : S.view === 'results' ? viewResults() : S.view === 'backup' ? viewBackup() : viewHome()
  app.replaceChildren(topEl, body)
  drawTop()
  drawFoot()
}

/* ---------- home: where to look ---------- */
const LOOK_FOR = {
  all: 'Every kind of file: videos, photos, sound, projects.',
  video: 'Videos only: MOV, MP4, MXF, MKV, AVI and more.',
  image: 'Images only: JPG, PNG, HEIC, TIFF, PSD and camera RAW (CR3, NEF, ARW, DNG…).',
  audio: 'Audio only: WAV, AIFF, MP3, M4A, FLAC and more.',
}
// the choice as it is kept; "Videos only" from before reads as Videos
const lookFor = (o) => (LOOK_FOR[o.kind] ? o.kind : o.videosOnly ? 'video' : 'all')
async function addRoots(paths) {
  const add = []
  for (const p of paths) if (p && !S.roots.includes(p) && (await T.isFolder(p))) add.push(p)
  if (!add.length) { if (paths.length) toast('Drop folders or drives, not single files.'); return }
  S.roots = [...S.roots, ...add]; saveOpts(); draw()
}
function viewHome() {
  const o = S.opts
  const set = (k, v) => { o[k] = v; saveOpts(); draw() }
  const k = lookFor(o)
  const isMasters = (r) => S.protect.includes(r)
  const flipMasters = (r) => { S.protect = isMasters(r) ? S.protect.filter((x) => x !== r) : [...S.protect, r]; saveOpts(); draw() }
  const dropOn = (box, take) => {
    box.addEventListener('dragover', (e) => { e.preventDefault(); box.classList.add('over') })
    box.addEventListener('dragleave', () => box.classList.remove('over'))
    box.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); box.classList.remove('over'); take([...e.dataTransfer.files].map((f) => T.pathOf(f))) })
    return box
  }
  const opt = (title, sub, control) => h('div', { class: 'opt' }, h('span', {}, h('b', {}, title), h('small', {}, sub)), control)
  const mode = h('div', { class: 'modes' }, seg([['twins', 'Find twins'], ['backup', 'Check a backup']], S.mode, (v) => { S.mode = v; saveOpts(); draw() }))
  const quiet = [
    opt('Skip hidden and system folders', 'The system, the apps, the Trash, and libraries like Photos or Final Cut.',
      switchEl(o.skipHidden, (v) => set('skipHidden', v), 'Skip hidden and system folders')),
    // Alex, 24 Oct: a cloud drive shows the whole cloud as if it were here, and reading it downloads it
    opt('Skip cloud drives', 'pCloud, iCloud, Dropbox, Google Drive, OneDrive: their files live online, and reading them downloads them. A cloud folder you choose yourself is still looked in.',
      switchEl(o.skipCloud, (v) => set('skipCloud', v), 'Skip cloud drives')),
  ]
  if (S.mode === 'backup') {
    // the originals (a card, a shoot) on one side, the backup on the other (Alex, 25 Oct)
    const side = (key, title, sub) => {
      const pick = async (paths) => { const p = paths?.[0]; if (!p) return; if (!(await T.isFolder(p))) return toast('Choose a folder or a drive.'); S[key] = p; saveOpts(); draw() }
      return dropOn(h('div', { class: 'drop side' + (S[key] ? ' set' : '') },
        h('div', { class: 'dz-i', html: key === 'source' ? I.folder : I.shield }),
        h('b', {}, title), h('small', {}, sub),
        S[key] ? h('span', { class: 'root', title: S[key] }, ico('folder'), h('span', {}, S[key]),
          h('button', { 'aria-label': 'Remove ' + S[key], html: I.x, onclick: () => { S[key] = ''; saveOpts(); draw() } })) : null,
        h('button', { class: 'btn', onclick: async () => pick(await T.pick()) }, ico('plus'), S[key] ? 'Choose another…' : 'Choose…')), pick)
    }
    return h('main', {}, h('div', { class: 'home' }, h('div', { class: 'card' },
      h('div', { class: 'hero' }, h('h1', { html: 'Is it all on the <b>backup</b>?' }),
        h('p', {}, 'RoarTwin looks for every file of the originals on the backup by what it holds, byte for byte, wherever it sits and whatever it is called, and lists what is missing or different.')),
      mode,
      h('div', { class: 'sides' },
        side('source', 'The originals', 'A card, a shoot, a drive.'),
        side('backup', 'The backup', 'Where they should all be.')),
      h('div', { class: 'opts' }, ...quiet),
      h('div', { class: 'go' }, h('button', { class: 'btn main big', disabled: !S.source || !S.backup, onclick: startBackup }, ico('shield'), 'Check the backup')),
      h('p', { class: 'note' }, 'Nothing is changed: RoarTwin only reads both sides.'))))
  }
  const drop = dropOn(h('div', { class: 'drop' },
    h('div', { class: 'dz-i', html: I.folder }),
    h('b', {}, S.roots.length ? 'Drop more folders or drives' : 'Drop a folder or a drive here'),
    h('small', {}, 'A shoot, an archive, a whole disk. Nothing is changed until you choose. The lock marks a folder as Masters.'),
    h('button', { class: 'btn', onclick: async () => addRoots(await T.pick()) }, ico('plus'), 'Choose folders…'),
    S.roots.length ? h('div', { class: 'roots' }, ...S.roots.map((r) => h('span', { class: 'root' + (isMasters(r) ? ' masters' : ''), title: r },
      // Masters (Alex, 25 Oct): nothing in it is ever offered for the Trash, and its copy is the one kept
      h('button', { class: 'lock', 'aria-pressed': String(isMasters(r)), 'aria-label': (isMasters(r) ? 'Unmark ' : 'Mark as Masters: ') + r,
        title: isMasters(r) ? 'Masters: nothing here goes to the Trash. Click to unmark.' : 'Mark as Masters: nothing here is ever offered for the Trash', html: I.lock, onclick: () => flipMasters(r) }),
      isMasters(r) ? h('em', {}, 'Masters') : null,
      h('span', {}, r),
      h('button', { 'aria-label': 'Remove ' + r, html: I.x, onclick: () => { S.roots = S.roots.filter((x) => x !== r); S.protect = S.protect.filter((x) => x !== r); saveOpts(); draw() } })))) : null), addRoots)
  const videos = k === 'all' || k === 'video', images = k === 'all' || k === 'image', audio = k === 'all' || k === 'audio'
  return h('main', {}, h('div', { class: 'home' }, h('div', { class: 'card' },
    h('div', { class: 'hero' }, h('h1', { html: 'Find the <b>twins</b>.' }),
      h('p', {}, 'RoarTwin finds the same file twice, whatever its name, and the same video in another size or format, so you keep one and free the space.')),
    mode,
    drop,
    h('div', { class: 'opts' },
      // Images and Audio too (Alex, 24 Oct)
      opt('Look for', LOOK_FOR[k],
        seg([['all', 'Every file'], ['video', 'Videos'], ['image', 'Images'], ['audio', 'Audio']], k, (v) => { o.videosOnly = false; set('kind', v) })),
      opt('Whole folders twice', 'A card or a shoot copied twice shows as one folder, not file by file.',
        switchEl(o.folders, (v) => set('folders', v), 'Whole folders twice')),
      videos ? opt('The same video in another file', 'Also when it was exported again, in another size, codec or format. RoarTwin compares the pictures.',
        switchEl(o.similar, (v) => set('similar', v), 'The same video in another file')) : null,
      videos ? opt('Parts of longer videos', 'A trim or a teaser cut out of a longer video, and where it starts. Slower: every video is read through.',
        switchEl(o.parts, (v) => set('parts', v), 'Parts of longer videos')) : null,
      videos ? opt('Leave editing proxies alone', 'A proxy is never taken for a twin of its original. Proxies whose original is not in these folders are listed apart.',
        switchEl(o.proxies, (v) => set('proxies', v), 'Leave editing proxies alone')) : null,
      images ? opt('Similar photos', 'The same photo saved again or resized, and shots of a burst that are nearly alike.',
        switchEl(o.photos, (v) => set('photos', v), 'Similar photos')) : null,
      audio ? opt('The same sound in another file', 'A WAV and its MP3 or M4A: RoarTwin listens to the sound itself.',
        switchEl(o.sounds, (v) => set('sounds', v), 'The same sound in another file')) : null,
      opt('Smallest file', 'Smaller files are left out.',
        seg([[0, 'Any'], [1e6, '1 MB'], [1e8, '100 MB'], [1e9, '1 GB']], o.minSize, (v) => set('minSize', v))),
      ...quiet),
    h('div', { class: 'go' }, h('button', { class: 'btn main big', disabled: !S.roots.length, onclick: start }, ico('search'), 'Find twins')),
    h('p', { class: 'note' }, 'Found files go to the Trash only when you say so, and one of each always stays.'))))
}

/* ---------- the scan ---------- */
const STAGES = [['list', 'Listing'], ['compare', 'Comparing'], ['hash', 'Reading'], ['folders', 'Folders'], ['video', 'Videos'], ['frames', 'Pictures'], ['parts', 'Parts'], ['photos', 'Photos'], ['sound', 'Sound'], ['listen', 'Listening'], ['thumbs', 'Previews']]
// the steps this scan will take, from its choices
function plannedStages() {
  if (S.running === 'backup') return ['list', 'compare', 'hash']
  const o = S.opts, k = lookFor(o)
  const v = k === 'all' || k === 'video', i = k === 'all' || k === 'image', a = k === 'all' || k === 'audio'
  return ['list', 'compare', 'hash', o.folders && 'folders', v && (o.similar || o.parts) && 'video', v && o.similar && 'frames', v && o.parts && 'parts', i && o.photos && 'photos', a && o.sounds && 'sound', a && o.sounds && 'listen', S.running !== 'backup' && 'thumbs'].filter(Boolean)
}
let scanEls = null
async function start() {
  if (!S.roots.length) return
  S.running = 'twins'
  S.view = 'scan'; S.progress = { stage: 'list', files: 0 }; S.stages = new Set(['list']); draw()
  const off = T.onProgress((p) => { S.progress = p; S.stages.add(p.stage); drawProgress() })
  try {
    const r = await T.scan({ roots: S.roots, protect: S.protect.filter((p) => S.roots.includes(p)), ...S.opts })
    if (r?.stopped) { S.view = 'home'; toast('Scan stopped.'); return draw() }
    S.result = r; S.filter = 'all'; S.shown = 40; S.gone = new Set()
    // exact copies and twin folders: everything but the one to keep is chosen; the rest is for you to decide
    S.sel = preselect(r.groups)
    S.view = 'results'; draw()
  } catch (e) {
    S.view = 'home'; draw(); toast(String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
  } finally { off?.() }
}
async function startBackup() {
  if (!S.source || !S.backup) return
  S.running = 'backup'
  S.view = 'scan'; S.progress = { stage: 'list', files: 0 }; S.stages = new Set(['list']); draw()
  const off = T.onProgress((p) => { S.progress = p; S.stages.add(p.stage); drawProgress() })
  try {
    const r = await T.backup({ source: S.source, backup: S.backup, skipHidden: S.opts.skipHidden, skipCloud: S.opts.skipCloud })
    if (r?.stopped) { S.view = 'home'; toast('Check stopped.'); return draw() }
    S.bres = r; S.shown = 60; S.view = 'backup'; draw()
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
    hash: [S.running === 'backup' ? 'Reading both sides, byte for byte' : 'Reading the possible copies', `${bytes(p.bytesDone || 0)} of ${bytes(p.bytesTotal || 0)}`],
    folders: ['Looking for whole folders twice', ''],
    parts: ['Reading the videos through', `${num(p.done || 0)} of ${plural(p.total || 0, 'video')}, one frame a second`],
    photos: ['Looking at the photos', `${num(p.done || 0)} of ${plural(p.total || 0, 'photo')}`],
    sound: ['Reading the sound files', `${num(p.done || 0)} of ${plural(p.total || 0, 'file')}: length, format`],
    listen: ['Listening', `${num(p.done || 0)} of ${plural(p.total || 0, 'file')} of about the same length`],
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
  const plan = plannedStages()
  scanEls.steps.replaceChildren(...STAGES.filter(([k]) => plan.includes(k) || S.stages.has(k)).map(([k, label]) => {
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
  const groups = r.groups.map((g) => ({ ...g, files: live(g) })).filter((g) => g.files.length > (g.kind === 'orphan' ? 0 : 1))
  const list = groups.filter((g) => S.filter === 'all' || g.kind === S.filter)
  if (!groups.length) {
    return h('main', {}, h('div', { class: 'empty' }, h('div', {},
      h('div', { class: 'big-i', html: I.done }),
      h('h2', { html: S.gone.size ? 'All <b>tidy</b>.' : 'No <b>twins</b> here.' }),
      h('p', {}, `${plural(r.files, 'file')} looked at${S.gone.size ? `, ${plural(S.gone.size, 'file')} in the Trash` : ''}.`),
      cloudChip(r),
      h('button', { class: 'btn', onclick: () => { S.view = 'home'; draw() } }, ico('back'), 'Back'))))
  }
  const free = groups.reduce((a, g) => a + g.files.filter((f) => !f.keep && !f.protected).reduce((b, f) => b + f.size, 0), 0)
  const sum = h('div', { class: 'sum' },
    h('span', { class: 'chip tint' }, h('i'), `${plural(groups.length, 'group')} of twins`),
    h('span', { class: 'chip' }, `up to ${bytes(free)} to free`),
    h('span', { class: 'chip' }, `${plural(r.files, 'file')} looked at in ${dur(r.took / 1000)}`),
    r.protect?.length ? h('span', { class: 'chip tint', style: { '--c': 'var(--ok)' }, title: r.protect.join('\n') }, h('i'), `Masters kept safe: ${r.protect.map((p) => p.split(/[\\/]/).pop()).join(', ')}`) : null,
    cloudChip(r))
  const shown = list.slice(0, S.shown)
  return h('main', {}, h('div', { class: 'res' }, sum, ...shown.map(groupEl),
    list.length > shown.length ? h('button', { class: 'btn more', onclick: () => { S.shown += 60; draw() } }, `Show ${Math.min(60, list.length - shown.length)} more`) : null))
}
function groupEl(g) {
  const m = KINDS[g.kind] || KINDS.exact
  const chosen = g.files.filter((f) => S.sel.has(f.path))
  const v = g.files.find((f) => f.video)?.video
  const a = g.files.find((f) => f.audio)?.audio
  const part = g.files.find((f) => f.partAt != null && !f.keep)
  const info = g.kind === 'exact' ? `${bytes(g.files[0].size)} each${v ? ' · ' + dur(v.dur) : ''}`
    : g.kind === 'folder' ? `${plural(g.files[0].count, 'file')} · ${bytes(g.files[0].size)} each`
    : g.kind === 'part' && part ? `starts at ${dur(part.partAt)} in ${g.files.find((f) => f !== part)?.name || 'the longer one'}`
    : g.kind === 'sound' && a ? dur(a.dur)
    : g.kind === 'orphan' ? 'its original is not in these folders'
    : v ? dur(v.dur) : ''
  const small = { height: '30px', padding: '0 12px', fontSize: '12.5px' }
  return h('section', { class: 'group' },
    h('div', { class: 'g-head' },
      h('span', { class: 'chip tint', style: { '--c': m.c } }, h('i'), m.label),
      h('span', { class: 'g-t' }, g.kind === 'folder' ? plural(g.files.length, 'folder') : plural(g.files.length, 'file')),
      h('span', { class: 'g-s' }, info),
      h('span', { class: 'spacer' }),
      g.kind !== 'orphan' ? h('button', { class: 'btn', style: small, onclick: () => { g.files.forEach((f) => (f.keep || f.protected ? S.sel.delete(f.path) : S.sel.add(f.path))); draw() } }, 'Keep the suggested one') : null,
      chosen.length ? h('button', { class: 'btn', style: small, onclick: () => { g.files.forEach((f) => S.sel.delete(f.path)); draw() } }, g.kind === 'orphan' ? 'Keep it' : 'Keep all') : null),
    h('div', { class: 'files' }, ...g.files.map((f) => fileEl(f, g))))
}
function fileEl(f, g) {
  const on = S.sel.has(f.path)
  // the last one not chosen cannot be chosen too: one of each stays (a proxy with no original is a group of one)
  const lastOne = !on && g.kind !== 'orphan' && g.files.filter((x) => !S.sel.has(x.path)).length === 1
  const locked = f.protected
  const v = f.video, a = f.audio
  const keepWhy = f.protected ? 'Keep · Masters' : `Keep · ${KINDS[g.kind]?.keep || 'the oldest'}`
  const meta = [
    h('span', { class: 'chip' }, bytes(f.size)),
    f.folder ? h('span', { class: 'chip' }, plural(f.count, 'file')) : null,
    v ? h('span', { class: 'chip' }, `${v.w}×${v.h}`) : null,
    v ? h('span', { class: 'chip' }, dur(v.dur)) : null,
    v ? h('span', { class: 'chip' }, v.codec.toUpperCase() + (v.fps ? ` · ${Math.round(v.fps * 100) / 100} fps` : '')) : null,
    !v && f.dims ? h('span', { class: 'chip' }, `${f.dims.w}×${f.dims.h}`) : null,
    a ? h('span', { class: 'chip' }, dur(a.dur)) : null,
    a ? h('span', { class: 'chip' }, a.codec.replace(/^pcm_.*/, 'PCM').toUpperCase() + (a.kbps ? ` · ${a.kbps} kb/s` : '') + ` · ${Math.round(a.rate / 100) / 10} kHz`) : null,
    f.partAt != null && !f.keep ? h('span', { class: 'chip tint', style: { '--c': '#bf5af2' } }, h('i'), `Part · from ${dur(f.partAt)}`) : null,
    f.proxy ? h('span', { class: 'chip' }, 'Proxy') : null,
    h('span', { class: 'chip' }, new Date(f.mtime).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })),
    f.protected ? h('span', { class: 'chip tint keep' }, h('i'), 'Masters') : null,
    f.keep && !f.protected ? h('span', { class: 'chip tint keep' }, h('i'), keepWhy) : null,
  ]
  return h('div', { class: 'file' + (on ? ' sel' : '') },
    h('button', { class: 'check' + (on ? ' on' : ''), html: I.check, disabled: lastOne || locked, title: locked ? 'In a Masters folder: it stays' : lastOne ? 'One of each stays' : on ? 'Keep it' : 'Move to the Trash', 'aria-label': (on ? 'Keep ' : 'Choose ') + f.name,
      onclick: () => { on ? S.sel.delete(f.path) : S.sel.add(f.path); draw() } }),
    h('div', { class: 'thumb', style: f.thumb ? { backgroundImage: `url("${f.thumb}")` } : null }, f.thumb ? null : ico(f.folder ? 'folder' : v ? 'play' : a ? 'sound' : 'file')),
    h('div', { class: 'f-main' }, h('div', { class: 'f-name', title: f.name }, f.name), h('div', { class: 'f-dir', title: f.dir }, '‎' + f.dir), h('div', { class: 'f-meta' }, ...meta)),
    h('div', { class: 'f-act' },
      h('button', { class: 'ib sm', title: T.platform === 'win32' ? 'Show in Explorer' : 'Show in Finder', 'aria-label': 'Show ' + f.name, html: I.reveal, onclick: () => T.reveal(f.path) }),
      h('button', { class: 'ib sm', title: 'Open', 'aria-label': 'Open ' + f.name, html: f.folder ? I.folder : v ? I.play : I.file, onclick: () => T.open(f.path) })))
}

/* ---------- the backup check ---------- */
function viewBackup() {
  const b = S.bres
  const differs = b.missing.filter((m) => m.why === 'differs').length
  const allThere = !b.missing.length
  const head = h('section', { class: 'group verdict' + (allThere ? ' ok' : ' bad') },
    h('div', { class: 'big-i', html: allThere ? I.shield : I.warn }),
    h('div', {},
      h('h2', { html: allThere ? 'Everything is on the <b>backup</b>.' : `${plural(b.missing.length, 'file')} ${b.missing.length === 1 ? 'is' : 'are'} <b>not</b> on the backup.` }),
      h('div', { class: 'sum' },
        h('span', { class: 'chip tint', style: { '--c': 'var(--ok)' } }, h('i'), `${num(b.safe)} of ${plural(b.total, 'file')} safe · ${bytes(b.safeBytes)}`),
        b.missing.length - differs ? h('span', { class: 'chip tint' }, h('i'), `${num(b.missing.length - differs)} missing`) : null,
        differs ? h('span', { class: 'chip tint', style: { '--c': 'var(--warn)' } }, h('i'), `${num(differs)} different on the backup`) : null,
        h('span', { class: 'chip' }, `checked byte for byte in ${dur(b.took / 1000)}`),
        cloudChip(b)),
      h('p', { class: 'paths' }, h('span', { title: b.source }, b.source), ' → ', h('span', { title: b.backup }, b.backup))))
  const shown = b.missing.slice(0, S.shown)
  return h('main', {}, h('div', { class: 'res' }, head,
    shown.length ? h('section', { class: 'group' }, h('div', { class: 'files', style: { paddingTop: '8px' } }, ...shown.map((f) => h('div', { class: 'file nocheck' },
      h('div', { class: 'thumb' }, ico('file')),
      h('div', { class: 'f-main' }, h('div', { class: 'f-name', title: f.name }, f.name), h('div', { class: 'f-dir', title: f.dir }, '‎' + f.dir),
        h('div', { class: 'f-meta' },
          h('span', { class: 'chip tint', style: { '--c': f.why === 'differs' ? 'var(--warn)' : 'var(--acc)' } }, h('i'), f.why === 'differs' ? 'Different on the backup' : 'Not on the backup'),
          h('span', { class: 'chip' }, bytes(f.size)),
          h('span', { class: 'chip' }, new Date(f.mtime).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })))),
      h('div', { class: 'f-act' },
        h('button', { class: 'ib sm', title: T.platform === 'win32' ? 'Show in Explorer' : 'Show in Finder', 'aria-label': 'Show ' + f.name, html: I.reveal, onclick: () => T.reveal(f.path) }),
        f.other ? h('button', { class: 'ib sm', title: 'Show the one on the backup', 'aria-label': 'Show the backup copy of ' + f.name, html: I.shield, onclick: () => T.reveal(f.other) }) : null))))) : null,
    b.missing.length > shown.length ? h('button', { class: 'btn more', onclick: () => { S.shown += 60; draw() } }, `Show ${Math.min(60, b.missing.length - shown.length)} more`) : null))
}
async function exportBackup() {
  const q = (x) => `"${String(x ?? '').replace(/"/g, '""')}"`
  const rows = [['Name', 'Folder', 'Size (bytes)', 'Problem', 'At the same place on the backup', 'Modified'].map(q).join(',')]
  S.bres.missing.forEach((f) => rows.push([f.name, f.dir, f.size, f.why === 'differs' ? 'Different on the backup' : 'Not on the backup', f.other, new Date(f.mtime).toISOString().slice(0, 10)].map(q).join(',')))
  if (await T.exportCSV(rows.join('\r\n'))) toast('List saved')
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
  S.result.groups.forEach((g, i) => live(g).forEach((f) => rows.push([i + 1, KINDS[g.kind]?.label || g.kind, f.keep ? 'Keep' : '', S.sel.has(f.path) ? 'Trash' : '', f.name, f.dir, f.size, f.video ? dur(f.video.dur) : '', f.video ? `${f.video.w}x${f.video.h}` : '', f.video?.codec || '', new Date(f.mtime).toISOString().slice(0, 10)].map(q).join(','))))
  if (await T.exportCSV(rows.join('\r\n'))) toast('List saved')
}

T.onMenu?.((cmd) => {
  if (cmd === 'add' && S.view === 'home') T.pick().then(addRoots)
  if (cmd === 'new' && S.view !== 'scan') { S.view = 'home'; draw() }
  if (cmd === 'export' && S.view === 'backup') exportBackup()
  if (cmd === 'export' && S.view === 'results') exportList()
})
// a folder dropped anywhere on the home screen counts
document.addEventListener('dragover', (e) => e.preventDefault())
document.addEventListener('drop', (e) => { e.preventDefault(); if (S.view === 'home' && S.mode === 'twins' && !e.target.closest('.drop')) addRoots([...e.dataTransfer.files].map((f) => T.pathOf(f))) })
window.addEventListener('resize', () => document.querySelectorAll('.seg').forEach((s) => { const on = s.querySelector('button.on'), l = s.querySelector('.lens'); if (on && l) { l.style.left = on.offsetLeft + 'px'; l.style.width = on.offsetWidth + 'px' } }))
draw()
