// Space map (Alex, 28 Oct): where the space of a folder or a drive went. The folders by size (click to go in), the
// biggest files, the space by kind, the large files nobody touched for months, and the drive's free space and local
// snapshots. Doors: space-scan, space-dir, space-old, space-trash, space-export (electron/tools/space.js).
const KIND = {
  video: ['Video', 'var(--acc)'], raw: ['RAW', '#bf5af2'], photo: ['Photos', '#ffd60a'], audio: ['Audio', '#5e9bff'],
  project: ['Projects', '#64d2ff'], archive: ['Archives', '#ff9f0a'], other: ['Other', 'var(--dim)'],
}
const GB = 1e9
const st = { root: null, res: null, busy: false, prog: null, node: null, trail: [], tab: 'folders', sel: new Map(), gone: new Set(), minGB: null, months: null, old: null }
let lastDraw = 0

function init(ctx) {
  if (st.root == null) {
    st.root = ctx.load('space', 'root', '')
    st.minGB = ctx.load('space', 'minGB', 1)
    st.months = ctx.load('space', 'months', 6)
  }
}
const pickedSize = () => [...st.sel.values()].reduce((n, f) => n + f.size, 0)
const dirOf = (p) => p.replace(/[\\/][^\\/]*$/, '')

async function scan(ctx) {
  if (!st.root) return
  st.busy = true; st.prog = null; st.sel.clear(); st.gone.clear(); st.old = null
  ctx.busy(true)
  const off = ctx.on('space-progress', (p) => { st.prog = p; if (Date.now() - lastDraw > 250) { lastDraw = Date.now(); ctx.draw() } })
  try {
    const r = await ctx.call('space-scan', { root: st.root, skipHidden: ctx.S.opts.skipHidden, skipCloud: ctx.S.opts.skipCloud, protect: ctx.S.protect })
    if (r?.stopped) ctx.toast(ctx.t('Stopped.'))
    else { st.res = r; st.node = r.node; st.trail = []; st.tab = 'folders' }
  } catch (e) { ctx.toast(ctx.err(e)) } finally { off?.(); st.busy = false; ctx.busy(false) }
}
async function go(ctx, path, back) {
  try {
    const n = await ctx.call('space-dir', { path })
    if (back == null) st.trail.push(st.node); else st.trail = st.trail.slice(0, back)
    st.node = n; ctx.draw()
  } catch (e) { ctx.toast(ctx.err(e)) }
}
async function loadOld(ctx) {
  ctx.save('space', 'minGB', st.minGB); ctx.save('space', 'months', st.months)
  // asked once per choice: a failure leaves an empty list, not a loop of asking
  st.old = { list: [], count: 0, size: 0, loading: true }
  try { st.old = await ctx.call('space-old', { minBytes: st.minGB * GB, months: st.months }) } catch (e) { st.old = { list: [], count: 0, size: 0 }; ctx.toast(ctx.err(e)) }
  ctx.draw()
}
async function toTrash(ctx) {
  const { t, bytes, plural } = ctx
  const files = [...st.sel.values()]
  if (!files.length) return
  const ok = await ctx.sheet(t('Move {n} to the Trash?', { n: plural(files.length, 'file') }), t('{size} will be freed when you empty the Trash.', { size: bytes(pickedSize()) }), [[t('Cancel'), false], [t('Move to Trash'), true, true]])
  if (!ok) return
  try {
    const r = await ctx.call('space-trash', { paths: files.map((f) => f.path) })
    r.ok.forEach((p) => { st.gone.add(p); st.sel.delete(p) })
    if (r.failed.length) ctx.toast(t('{n} could not be moved: {e}', { n: plural(r.failed.length, 'file'), e: t(r.failed[0].error) }))
    else ctx.toast(t('{n} moved to the Trash', { n: plural(r.ok.length, 'file') }))
  } catch (e) { ctx.toast(ctx.err(e)) }
  ctx.draw()
}
async function exportCsv(ctx) {
  const { t } = ctx
  const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`
  const day = (ms) => (ms ? new Date(ms).toISOString().slice(0, 10) : '')
  let rows
  if (st.tab === 'folders') rows = [[t('Name'), t('Folder'), t('Size (bytes)'), t('Files')], ...st.node.kids.map((k) => [k.name, k.path, k.size, k.files]), ...st.node.loose.map((f) => [f.name, f.path, f.size, 1])]
  else if (st.tab === 'kinds') rows = [[t('Kind'), t('Size (bytes)'), t('Files')], ...Object.entries(st.res.kinds).map(([k, v]) => [t(KIND[k][0]), v.size, v.count])]
  else rows = [[t('Name'), t('Folder'), t('Size (bytes)'), t('Kind'), t('Modified')], ...((st.tab === 'old' ? st.old?.list : st.res.big) || []).map((f) => [f.name, dirOf(f.path), f.size, t(KIND[f.kind]?.[0] || ''), day(f.mtime)])]
  try { if (await ctx.call('space-export', { text: rows.map((r) => r.map(q).join(',')).join('\r\n'), name: `Space map ${t(TABS[st.tab])}.csv` })) ctx.toast(t('List saved')) } catch (e) { ctx.toast(ctx.err(e)) }
}
const TABS = { folders: 'Folders', big: 'Biggest files', old: 'Large and old', kinds: 'By kind' }

/* one file: chosen for the Trash or not, its size, kind, date, Show in Finder */
function fileRow(ctx, f) {
  const { h, t, bytes, dateOf, I, ico } = ctx
  if (st.gone.has(f.path)) return null
  const on = st.sel.has(f.path)
  const k = KIND[f.kind] || KIND.other
  return h('div', { class: 'sp-file' + (on ? ' sel' : '') },
    h('button', { class: 'check' + (on ? ' on' : ''), html: I.check, disabled: !!f.protected, title: f.protected ? t('In a Masters folder: it stays') : on ? t('Keep it') : t('Move to the Trash'), 'aria-label': f.name,
      onclick: () => { on ? st.sel.delete(f.path) : st.sel.set(f.path, f); ctx.draw() } }),
    h('span', { class: 'sp-ic', html: f.bundle ? I.box : f.kind === 'video' || f.kind === 'raw' ? I.play : f.kind === 'audio' ? I.sound : I.file }),
    h('span', { class: 'sp-name' }, h('b', { title: f.name }, f.name), h('small', { class: 'sp-path', title: f.path }, '‎' + dirOf(f.path))),
    h('span', { class: 'sp-meta' },
      h('span', { class: 'chip tint', style: { '--c': k[1] } }, h('i'), t(k[0])),
      f.mtime ? h('span', { class: 'chip' }, dateOf(f.mtime)) : null,
      f.protected ? h('span', { class: 'chip tint keep' }, h('i'), t('Masters')) : null,
      h('span', { class: 'chip sp-size' }, bytes(f.size))),
    h('button', { class: 'ib sm', title: ctx.revealLabel(), 'aria-label': ctx.revealLabel(), html: I.reveal, onclick: () => ctx.reveal(f.path) }))
}

function viewFolders(ctx) {
  const { h, t, bytes, plural, I } = ctx
  const n = st.node
  const max = Math.max(1, ...n.kids.map((k) => k.size), ...n.loose.map((f) => f.size))
  const crumbs = [...st.trail, n]
  const bar = (size) => h('span', { class: 'sp-bar' }, h('i', { style: { width: Math.max(1.5, (size / max) * 100) + '%' } }))
  return h('div', { class: 'sp-stack' },
    h('div', { class: 'sp-crumbs' }, ...crumbs.flatMap((c, i) => [i ? h('span', { class: 'sp-sep' }, '›') : null,
      h('button', { class: 'chip' + (i === crumbs.length - 1 ? ' tint' : ''), disabled: i === crumbs.length - 1, onclick: () => go(ctx, c.path, i) }, i === crumbs.length - 1 ? h('i') : null, c.name)]),
      h('span', { class: 'spacer' }), h('span', { class: 'chip' }, bytes(n.size) + ' · ' + plural(n.files, 'file'))),
    n.kids.length ? h('section', { class: 'group sp-list' }, ...n.kids.map((k) => h('button', { class: 'sp-dir', onclick: () => go(ctx, k.path) },
      h('span', { class: 'sp-ic', html: I.folder }),
      h('span', { class: 'sp-name' }, h('b', { title: k.name }, k.name), h('small', {}, plural(k.files, 'file') + (k.folders ? ' · ' + plural(k.folders, 'folder') : ''))),
      bar(k.size), h('span', { class: 'chip sp-size' }, bytes(k.size)))),
      n.more ? h('div', { class: 'sp-more' }, t('Smaller folders: {n} · {s}', { n: ctx.num(n.more.count), s: bytes(n.more.size) })) : null) : null,
    n.loose.length ? h('section', { class: 'group sp-list' }, h('div', { class: 'sp-head' }, h('b', {}, t('Files here')), h('small', {}, plural(n.looseCount, 'file') + ' · ' + bytes(n.looseSize))),
      ...n.loose.map((f) => fileRow(ctx, f)),
      n.looseCount > n.loose.length ? h('div', { class: 'sp-more' }, t('and {n} more', { n: plural(n.looseCount - n.loose.length, 'file') })) : null) : null)
}
function viewKinds(ctx) {
  const { h, t, bytes, plural } = ctx
  const ks = Object.entries(st.res.kinds).filter(([, v]) => v.count).sort((a, b) => b[1].size - a[1].size)
  const max = Math.max(1, ...ks.map(([, v]) => v.size))
  return h('section', { class: 'group sp-list' }, ...ks.map(([k, v]) => h('div', { class: 'sp-dir sp-kind' },
    h('span', { class: 'chip tint', style: { '--c': KIND[k][1] } }, h('i'), t(KIND[k][0])),
    h('span', { class: 'sp-name' }, h('small', {}, plural(v.count, 'file'))),
    h('span', { class: 'sp-bar' }, h('i', { style: { width: Math.max(1.5, (v.size / max) * 100) + '%', background: KIND[k][1] } })),
    h('span', { class: 'chip sp-size' }, bytes(v.size)))))
}
function viewOld(ctx) {
  const { h, t, bytes, plural, seg } = ctx
  if (!st.old) loadOld(ctx)
  const opt = (title, sub, control) => h('div', { class: 'opt' }, h('span', {}, h('b', {}, title), h('small', {}, sub)), control)
  return h('div', { class: 'sp-stack' },
    h('div', { class: 'opts' },
      opt(t('Bigger than'), t('Only files at least this big.'), seg([[0.1, '100 MB'], [1, '1 GB'], [5, '5 GB'], [20, '20 GB']], st.minGB, (v) => { st.minGB = v; st.old = null; ctx.draw() })),
      opt(t('Untouched for'), t('Not changed in that time.'), seg([[3, t('3 months')], [6, t('6 months')], [12, t('1 year')], [24, t('2 years')]], st.months, (v) => { st.months = v; st.old = null; ctx.draw() }))),
    st.old && !st.old.loading ? h('div', { class: 'sum' }, h('span', { class: 'chip tint' }, h('i'), plural(st.old.count, 'file') + ' · ' + bytes(st.old.size))) : null,
    st.old?.list.length ? h('section', { class: 'group sp-list' }, ...st.old.list.map((f) => fileRow(ctx, f))) : st.old && !st.old.loading ? h('p', { class: 'note' }, t('Nothing that big and that old here.')) : null)
}

function viewResult(ctx) {
  const { h, t, bytes, plural, dur } = ctx
  const r = st.res, v = r.volume || {}
  const snaps = v.snapshots?.length || 0
  const sum = h('div', { class: 'sum' },
    h('span', { class: 'chip tint' }, h('i'), t('{s} in {n}', { s: bytes(r.size), n: plural(r.files, 'file') })),
    v.total ? h('span', { class: 'chip', title: v.name || '' }, t('{f} free of {t} on the drive', { f: bytes(v.free || 0), t: bytes(v.total) })) : null,
    v.containerFree && v.free && v.containerFree > v.free * 1.02 ? h('span', { class: 'chip', title: t('Space the drive shares with its other volumes.') }, t('{n} free in the container', { n: bytes(v.containerFree) })) : null,
    snaps ? h('span', { class: 'chip tint', style: { '--c': 'var(--warn)' }, title: v.snapshots.join('\n') + '\n\n' + t('Time Machine and macOS keep these on the drive; macOS frees their space by itself when it is needed.') }, h('i'), t('{n} local snapshots', { n: snaps })) : null,
    r.skipped?.length ? h('span', { class: 'chip', title: r.skipped.join('\n') }, t('Cloud left out: {n}', { n: r.skipped.length })) : null,
    h('span', { class: 'chip' }, t('in {t}', { t: dur(r.took / 1000) })))
  const body = st.tab === 'big' ? h('section', { class: 'group sp-list' }, ...r.big.map((f) => fileRow(ctx, f)))
    : st.tab === 'old' ? viewOld(ctx) : st.tab === 'kinds' ? viewKinds(ctx) : viewFolders(ctx)
  return h('main', {}, h('div', { class: 'res sp' }, sum, body), footEl(ctx))
}
function footEl(ctx) {
  const { h, t, bytes, plural, ico } = ctx
  if (!st.sel.size) return null
  return h('div', { class: 'foot show sp-foot' }, h('span', {}, h('b', {}, plural(st.sel.size, 'file')), ' · ', h('b', {}, bytes(pickedSize()))),
    h('button', { class: 'btn', onclick: () => { st.sel.clear(); ctx.draw() } }, t('Clear')),
    h('button', { class: 'btn main', onclick: () => toTrash(ctx) }, ico('trash'), t('Move to Trash')))
}
function viewBusy(ctx) {
  const { h, t, bytes, plural, ico } = ctx
  const p = st.prog || {}
  const ring = h('div', { class: 'ring spin', html: '<svg viewBox="0 0 100 100"><circle class="t" cx="50" cy="50" r="44"/><circle class="p" cx="50" cy="50" r="44" stroke-dasharray="276.5" stroke-dashoffset="276.5"/></svg><b></b>' })
  return h('main', {}, h('div', { class: 'scan' }, h('div', { class: 'card' }, ring,
    h('div', { class: 'stage-t' }, t('Looking through the folders')),
    h('div', { class: 'stage-s' }, plural(p.files || 0, 'file') + ' · ' + bytes(p.bytes || 0)),
    p.dir ? h('div', { class: 'sp-now', title: p.dir }, '‎' + p.dir) : null,
    h('button', { class: 'btn', onclick: () => ctx.stop() }, ico('stop'), t('Stop')))))
}
function viewStart(ctx) {
  const { h, t, I, ico } = ctx
  const take = async (paths) => { const p = paths?.[0]; if (!p) return; if (!(await ctx.isFolder(p))) return ctx.toast(t('Choose a folder or a drive.')); st.root = p; ctx.save('space', 'root', p); ctx.draw() }
  return h('main', {}, h('div', { class: 'home' }, h('div', { class: 'card' },
    h('div', { class: 'hero' }, h('h1', { html: t('Where did the <b>space</b> go?') }),
      h('p', {}, t('Every folder of a drive by its size, the biggest files, the space each kind of file takes, and the big files nobody has touched for months.'))),
    ctx.dropOn(h('div', { class: 'drop' + (st.root ? ' set' : '') }, h('div', { class: 'dz-i', html: I.pie }),
      h('b', {}, t('Drop a folder or a drive here')), h('small', {}, t('A drive, your home folder, a shoot. Nothing is changed until you choose.')),
      st.root ? h('span', { class: 'root', title: st.root }, ico('folder'), h('span', {}, st.root), h('button', { 'aria-label': t('Remove'), html: I.x, onclick: () => { st.root = ''; ctx.save('space', 'root', ''); ctx.draw() } })) : null,
      h('button', { class: 'btn', onclick: async () => take(await ctx.pick()) }, ico('plus'), st.root ? t('Choose another…') : t('Choose…'))), take),
    h('div', { class: 'go' }, h('button', { class: 'btn main big', disabled: !st.root, onclick: () => scan(ctx) }, ico('pie'), t('Map it'))),
    h('p', { class: 'note' }, t('Files go to the Trash only when you choose them; nothing in a Masters folder ever does.')))))
}

export default {
  id: 'space',
  el: {
    'Where did the <b>space</b> go?': 'Πού πήγε ο <b>χώρος</b>;',
    'Every folder of a drive by its size, the biggest files, the space each kind of file takes, and the big files nobody has touched for months.': 'Κάθε φάκελος ενός δίσκου με το μέγεθός του, τα μεγαλύτερα αρχεία, πόσο χώρο πιάνει κάθε είδος αρχείου, και τα μεγάλα αρχεία που δεν έχει αγγίξει κανείς εδώ και μήνες.',
    'A drive, your home folder, a shoot. Nothing is changed until you choose.': 'Ένας δίσκος, ο φάκελος του χρήστη, ένα γύρισμα. Τίποτα δεν αλλάζει μέχρι να διαλέξεις εσύ.',
    'Map it': 'Δείξε τον χάρτη',
    'Files go to the Trash only when you choose them; nothing in a Masters folder ever does.': 'Τα αρχεία πάνε στον Κάδο μόνο όταν τα διαλέξεις· τίποτα από φάκελο Masters δεν πάει ποτέ.',
    'Looking through the folders': 'Ψάχνει τους φακέλους',
    'Stopped.': 'Σταμάτησε.',
    'Folders': 'Φάκελοι', 'Biggest files': 'Μεγαλύτερα αρχεία', 'Large and old': 'Μεγάλα και παλιά', 'By kind': 'Ανά είδος',
    'Video': 'Βίντεο', 'RAW': 'RAW', 'Photos': 'Φωτογραφίες', 'Audio': 'Ήχος', 'Projects': 'Projects', 'Archives': 'Συμπιεσμένα', 'Other': 'Άλλα',
    '{s} in {n}': '{s} σε {n}',
    '{f} free of {t} on the drive': '{f} ελεύθερα από {t} στον δίσκο',
    '{n} free in the container': '{n} ελεύθερα στο container',
    'Space the drive shares with its other volumes.': 'Χώρος που μοιράζεται ο δίσκος με τα άλλα volumes του.',
    '{n} local snapshots': '{n} τοπικά snapshots',
    'Time Machine and macOS keep these on the drive; macOS frees their space by itself when it is needed.': 'Τα κρατάνε στον δίσκο το Time Machine και το macOS· το macOS ελευθερώνει μόνο του τον χώρο τους όταν χρειαστεί.',
    'Files here': 'Αρχεία εδώ',
    'Smaller folders: {n} · {s}': 'Μικρότεροι φάκελοι: {n} · {s}',
    'and {n} more': 'και {n} ακόμα',
    'Bigger than': 'Μεγαλύτερα από', 'Only files at least this big.': 'Μόνο αρχεία τουλάχιστον τόσο μεγάλα.',
    'Untouched for': 'Χωρίς αλλαγή για', 'Not changed in that time.': 'Δεν έχουν αλλάξει σε αυτό το διάστημα.',
    '3 months': '3 μήνες', '6 months': '6 μήνες', '1 year': '1 χρόνο', '2 years': '2 χρόνια',
    'Nothing that big and that old here.': 'Δεν υπάρχει τίποτα τόσο μεγάλο και τόσο παλιό εδώ.',
    '{size} will be freed when you empty the Trash.': '{size} θα ελευθερωθούν όταν αδειάσεις τον Κάδο.',
    'Files': 'Αρχεία',
    'Scan again: this folder is not in the last scan.': 'Ψάξε ξανά: αυτός ο φάκελος δεν είναι στο τελευταίο ψάξιμο.',
    'Only files of the last scan, and nothing in a Masters folder.': 'Μόνο αρχεία του τελευταίου ψαξίματος, και τίποτα από φάκελο Masters.',
  },
  top(ctx) {
    const { h, t, seg, ico } = ctx
    init(ctx)
    if (!st.res || st.busy) return null
    return [h('div', { class: 'title' }, t('Space map')),
      seg(Object.entries(TABS).map(([k, l]) => [k, t(l)]), st.tab, (v) => { st.tab = v; ctx.draw() }),
      h('div', { class: 'spacer' }),
      h('button', { class: 'btn', onclick: () => exportCsv(ctx), title: t('Export the list (CSV)') }, ico('out'), h('span', { class: 'lbl' }, t('Export'))),
      h('button', { class: 'btn', onclick: () => { st.res = null; st.sel.clear(); ctx.draw() } }, ico('search'), h('span', { class: 'lbl' }, t('New scan')))]
  },
  view(ctx) {
    init(ctx)
    if (st.busy) return viewBusy(ctx)
    if (st.res) return viewResult(ctx)
    return viewStart(ctx)
  },
  demo: {
    'space-scan': async (a, emit) => {
      for (let i = 1; i <= 8; i++) { emit('space-progress', { files: i * 5212, bytes: i * 61e9, dir: '/Volumes/RAID/Projects/2026/Shoot ' + i }); await new Promise((r) => setTimeout(r, 90)) }
      return demoScan(a.root)
    },
    'space-dir': async ({ path }) => demoNode(path),
    'space-old': async ({ minBytes, months }) => {
      const list = DEMO_FILES.filter((f) => f.size >= minBytes && f.mtime < Date.now() - months * 30.44 * 864e5).sort((a, b) => b.size - a.size)
      return { list, count: list.length, size: list.reduce((n, f) => n + f.size, 0) }
    },
    'space-trash': async ({ paths }) => ({ ok: paths, failed: [] }),
    'space-export': async () => '/Users/alex/Desktop/Space map.csv',
  },
}

/* the sample a browser shows: a production RAID */
const D = (days) => Date.now() - days * 864e5
const R = '/Volumes/RAID'
const DEMO_FILES = [
  { path: R + '/Projects/2025/Fakinos - Mataria mou/Footage/A001_C003.braw', name: 'A001_C003.braw', size: 182e9, mtime: D(410), kind: 'raw' },
  { path: R + '/Projects/2025/Fakinos - Mataria mou/Footage/A001_C007.braw', name: 'A001_C007.braw', size: 96e9, mtime: D(410), kind: 'raw' },
  { path: R + '/Projects/2026/Heaven Music Spot/Exports/Spot_60s_MASTER.mov', name: 'Spot_60s_MASTER.mov', size: 74e9, mtime: D(40), kind: 'video', protected: true },
  { path: R + '/Projects/2024/Panic Records Live/Renders/Live_full_ProRes4444.mov', name: 'Live_full_ProRes4444.mov', size: 61e9, mtime: D(700), kind: 'video' },
  { path: R + '/Projects/2026/Heaven Music Spot/Resolve/Spot.drp', name: 'Spot.drp', size: 0.4e9, mtime: D(12), kind: 'project' },
  { path: R + '/Archive/2023 BTS.zip', name: '2023 BTS.zip', size: 38e9, mtime: D(900), kind: 'archive' },
  { path: R + '/Sound/Mataria mou_STEMS.wav', name: 'Mataria mou_STEMS.wav', size: 6.2e9, mtime: D(390), kind: 'audio' },
  { path: R + '/Projects/2024/Panic Records Live/Library.fcpbundle', name: 'Library.fcpbundle', size: 212e9, mtime: D(620), kind: 'project', bundle: true },
  { path: R + '/Stills/2025/IMG_4410.CR3', name: 'IMG_4410.CR3', size: 0.06e9, mtime: D(300), kind: 'raw' },
]
function demoScan(root) {
  return {
    root, took: 41200, size: 3.42e12, files: 48231, skipped: ['/Users/alex/pCloud Drive'],
    node: demoNode(R),
    big: [...DEMO_FILES].sort((a, b) => b.size - a.size),
    kinds: { video: { size: 1.41e12, count: 6120 }, raw: { size: 1.12e12, count: 9811 }, photo: { size: 0.21e12, count: 24010 }, audio: { size: 0.18e12, count: 5120 }, project: { size: 0.31e12, count: 210 }, archive: { size: 0.12e12, count: 88 }, other: { size: 0.07e12, count: 2872 } },
    volume: { name: 'RAID', mount: R, total: 8e12, free: 2.9e12, containerFree: null, snapshots: ['com.apple.TimeMachine.2026-10-27-101530.local', 'com.apple.TimeMachine.2026-10-28-091200.local'] },
  }
}
function demoNode(p) {
  const kid = (name, size, files, folders = 3) => ({ name, path: p + '/' + name, size, files, folders })
  if (p === R) {
    return { name: 'RAID', path: R, size: 3.42e12, files: 48231,
      kids: [kid('Projects', 2.61e12, 31022, 14), kid('Archive', 0.42e12, 6120, 9), kid('Stills', 0.21e12, 9020, 4), kid('Sound', 0.16e12, 1820, 6), kid('Exports', 0.02e12, 240, 2)],
      more: { count: 12, size: 1.8e9 }, loose: [DEMO_FILES[5]], looseCount: 3, looseSize: 38.2e9 }
  }
  return { name: p.split('/').pop(), path: p, size: 0.9e12, files: 8122,
    kids: [kid('2026', 0.52e12, 3022, 5), kid('2025', 0.31e12, 4100, 7), kid('2024', 0.07e12, 1000, 2)],
    more: null, loose: DEMO_FILES.slice(0, 2), looseCount: 2, looseSize: 278e9 }
}
