// Project leftovers (Alex, 28 Oct): the render and cache folders editing programs leave next to finished projects
// (Resolve, Premiere, After Effects, Final Cut), each with its size, the project and the last time it changed. Those
// untouched for a while are offered; chosen whole folders go to the Trash. Doors: leftovers-scan, leftovers-trash,
// leftovers-export (electron/tools/leftovers.js).
const APP = { Resolve: '#ff6b2c', Premiere: '#bf5af2', 'After Effects': '#5e9bff', 'Final Cut': '#64d2ff' }
const st = { roots: null, months: null, res: null, busy: false, prog: null, sel: new Map(), gone: new Set() }
let lastDraw = 0
function init(ctx) {
  if (st.roots == null) { st.roots = ctx.load('leftovers', 'roots', []); st.months = ctx.load('leftovers', 'months', 3) }
}
const save = (ctx) => { ctx.save('leftovers', 'roots', st.roots); ctx.save('leftovers', 'months', st.months) }
const cut = () => Date.now() - st.months * 30.44 * 864e5
const live = () => (st.res?.items || []).filter((i) => !st.gone.has(i.path))
const offered = () => live().filter((i) => i.newest < cut())
const pickedSize = () => [...st.sel.values()].reduce((n, i) => n + i.size, 0)

async function scan(ctx) {
  if (!st.roots.length) return
  st.busy = true; st.prog = null; st.sel.clear(); st.gone.clear()
  ctx.busy(true)
  const off = ctx.on('leftovers-progress', (p) => { st.prog = p; if (Date.now() - lastDraw > 250) { lastDraw = Date.now(); ctx.draw() } })
  try {
    const r = await ctx.call('leftovers-scan', { roots: st.roots, skipHidden: ctx.S.opts.skipHidden, protect: ctx.S.protect })
    if (r?.stopped) ctx.toast(ctx.t('Stopped.'))
    else { st.res = r; for (const i of offered()) if (!i.protected) st.sel.set(i.path, i) }
  } catch (e) { ctx.toast(ctx.err(e)) } finally { off?.(); st.busy = false; ctx.busy(false) }
}
async function toTrash(ctx) {
  const { t, bytes, plural } = ctx
  const items = [...st.sel.values()]
  if (!items.length) return
  const ok = await ctx.sheet(t('Move {n} to the Trash?', { n: plural(items.length, 'folder') }), t('{size} will be freed when you empty the Trash. The projects themselves stay; their programs make these again if they are opened.', { size: bytes(pickedSize()) }), [[t('Cancel'), false], [t('Move to Trash'), true, true]])
  if (!ok) return
  try {
    const r = await ctx.call('leftovers-trash', { paths: items.map((i) => i.path) })
    r.ok.forEach((p) => { st.gone.add(p); st.sel.delete(p) })
    if (r.failed.length) ctx.toast(t('{n} could not be moved: {e}', { n: plural(r.failed.length, 'folder'), e: t(r.failed[0].error) }))
    else ctx.toast(t('{n} moved to the Trash', { n: plural(r.ok.length, 'folder') }))
  } catch (e) { ctx.toast(ctx.err(e)) }
  ctx.draw()
}
async function exportCsv(ctx) {
  const { t } = ctx
  const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`
  const rows = [[t('Program'), t('What'), t('Project'), t('Folder'), t('Size (bytes)'), t('Files'), t('Last changed')], ...live().map((i) => [i.app, t(i.what), i.project, i.path, i.size, i.files, new Date(i.newest).toISOString().slice(0, 10)])]
  try { if (await ctx.call('leftovers-export', { text: rows.map((r) => r.map(q).join(',')).join('\r\n'), name: 'Project leftovers.csv' })) ctx.toast(t('List saved')) } catch (e) { ctx.toast(ctx.err(e)) }
}

function itemRow(ctx, i, recent) {
  const { h, t, bytes, plural, dateOf, I } = ctx
  const on = st.sel.has(i.path)
  return h('div', { class: 'sp-file' + (on ? ' sel' : '') + (recent ? ' recent' : '') },
    h('button', { class: 'check' + (on ? ' on' : ''), html: I.check, disabled: !!i.protected, title: i.protected ? t('In a Masters folder: it stays') : on ? t('Keep it') : t('Move to the Trash'), 'aria-label': i.path,
      onclick: () => { on ? st.sel.delete(i.path) : st.sel.set(i.path, i); ctx.draw() } }),
    h('span', { class: 'sp-ic', html: I.box }),
    h('span', { class: 'sp-name' }, h('b', { title: i.project }, i.project), h('small', { title: i.path }, '‎' + i.path)),
    h('span', { class: 'sp-meta' },
      h('span', { class: 'chip tint', style: { '--c': APP[i.app] || 'var(--acc)' } }, h('i'), i.app + ' · ' + t(i.what)),
      h('span', { class: 'chip', title: t('The last time anything in it changed') }, t('Last changed {d}', { d: dateOf(i.newest) })),
      h('span', { class: 'chip' }, plural(i.files, 'file')),
      i.protected ? h('span', { class: 'chip tint keep' }, h('i'), t('Masters')) : null,
      h('span', { class: 'chip sp-size' }, bytes(i.size))),
    h('button', { class: 'ib sm', title: ctx.revealLabel(), 'aria-label': ctx.revealLabel(), html: I.reveal, onclick: () => ctx.reveal(i.path) }))
}

function viewResult(ctx) {
  const { h, t, bytes, plural, seg, dur } = ctx
  const all = live(), old = offered(), recent = all.filter((i) => !old.includes(i))
  const oldSize = old.reduce((n, i) => n + i.size, 0)
  const opt = (title, sub, control) => h('div', { class: 'opt' }, h('span', {}, h('b', {}, title), h('small', {}, sub)), control)
  const foot = st.sel.size ? h('div', { class: 'foot show sp-foot' }, h('span', {}, h('b', {}, plural(st.sel.size, 'folder')), ' · ', h('b', {}, bytes(pickedSize()))),
    h('button', { class: 'btn', onclick: () => { st.sel.clear(); ctx.draw() } }, t('Clear')),
    h('button', { class: 'btn main', onclick: () => toTrash(ctx) }, ctx.ico('trash'), t('Move to Trash'))) : null
  if (!all.length) {
    return h('main', {}, h('div', { class: 'empty' }, h('div', {}, h('div', { class: 'big-i', html: ctx.I.done }),
      h('h2', { html: st.gone.size ? t('All <b>tidy</b>.') : t('No <b>leftovers</b> here.') }),
      h('p', {}, t('Looked in {n} in {t}.', { n: plural(st.res.roots.length, 'folder'), t: dur(st.res.took / 1000) })))))
  }
  return h('main', {}, h('div', { class: 'res sp' },
    h('div', { class: 'opts' }, opt(t('Untouched for'), t('Only what has not changed for that long is offered.'),
      seg([[1, t('1 month')], [3, t('3 months')], [6, t('6 months')], [12, t('1 year')]], st.months, (v) => { st.months = v; save(ctx); for (const [p, i] of st.sel) if (i.newest >= cut()) st.sel.delete(p); ctx.draw() }))),
    h('div', { class: 'sum' },
      h('span', { class: 'chip tint' }, h('i'), t('{n} to free in {f}', { n: bytes(oldSize), f: plural(old.length, 'folder') })),
      recent.length ? h('span', { class: 'chip' }, t('{n} still in use, left out', { n: plural(recent.length, 'folder') })) : null,
      h('span', { class: 'chip' }, t('in {t}', { t: dur(st.res.took / 1000) })),
      old.length ? h('button', { class: 'btn', style: { height: '28px', padding: '0 12px', fontSize: '12.5px' }, onclick: () => { for (const i of old) if (!i.protected) st.sel.set(i.path, i); ctx.draw() } }, t('Choose all')) : null),
    old.length ? h('section', { class: 'group sp-list' }, ...old.map((i) => itemRow(ctx, i))) : h('p', { class: 'note' }, t('Everything here changed recently.')),
    recent.length ? h('section', { class: 'group sp-list' }, h('div', { class: 'sp-head' }, h('b', {}, t('Changed recently')), h('small', {}, t('Probably still being edited.'))),
      ...recent.map((i) => itemRow(ctx, i, true))) : null), foot)
}
function viewBusy(ctx) {
  const { h, t, plural, ico } = ctx
  const p = st.prog || {}
  const ring = h('div', { class: 'ring spin', html: '<svg viewBox="0 0 100 100"><circle class="t" cx="50" cy="50" r="44"/><circle class="p" cx="50" cy="50" r="44" stroke-dasharray="276.5" stroke-dashoffset="276.5"/></svg><b></b>' })
  return h('main', {}, h('div', { class: 'scan' }, h('div', { class: 'card' }, ring,
    h('div', { class: 'stage-t' }, t('Looking for leftovers')),
    h('div', { class: 'stage-s' }, t('{a} looked in · {b} found', { a: plural(p.folders || 0, 'folder'), b: p.found || 0 })),
    p.dir ? h('div', { class: 'sp-now', title: p.dir }, '‎' + p.dir) : null,
    h('button', { class: 'btn', onclick: () => ctx.stop() }, ico('stop'), t('Stop')))))
}
function viewStart(ctx) {
  const { h, t, I, ico } = ctx
  const add = async (paths) => {
    const more = []
    for (const p of paths || []) if (p && !st.roots.includes(p) && (await ctx.isFolder(p))) more.push(p)
    if (!more.length) { if (paths?.length) ctx.toast(t('Drop folders or drives, not single files.')); return }
    st.roots = [...st.roots, ...more]; save(ctx); ctx.draw()
  }
  return h('main', {}, h('div', { class: 'home' }, h('div', { class: 'card' },
    h('div', { class: 'hero' }, h('h1', { html: t('What finished <b>projects</b> left behind.') }),
      h('p', {}, t('Optimized and proxy media and the render cache of DaVinci Resolve, the previews of Premiere, the disk cache of After Effects, the render files and transcoded media of Final Cut: big, and made again if a project is ever opened.'))),
    ctx.dropOn(h('div', { class: 'drop' + (st.roots.length ? ' set' : '') }, h('div', { class: 'dz-i', html: I.box }),
      h('b', {}, st.roots.length ? t('Drop more folders or drives') : t('Drop a folder or a drive here')), h('small', {}, t('Your projects drive, an archive, the RAID.')),
      st.roots.length ? h('div', { class: 'roots' }, ...st.roots.map((r) => h('span', { class: 'root', title: r }, ico('folder'), h('span', {}, r),
        h('button', { 'aria-label': t('Remove'), html: I.x, onclick: () => { st.roots = st.roots.filter((x) => x !== r); save(ctx); ctx.draw() } })))) : null,
      h('button', { class: 'btn', onclick: async () => add(await ctx.pick()) }, ico('plus'), t('Choose folders…'))), add),
    h('div', { class: 'go' }, h('button', { class: 'btn main big', disabled: !st.roots.length, onclick: () => scan(ctx) }, ico('search'), t('Find leftovers'))),
    h('p', { class: 'note' }, t('The projects, their media and their Auto-Save folders are never touched. Folders go to the Trash only when you choose them.')))))
}

export default {
  id: 'leftovers',
  el: {
    'What finished <b>projects</b> left behind.': 'Τι άφησαν πίσω τα <b>projects</b> που τελείωσαν.',
    'Optimized and proxy media and the render cache of DaVinci Resolve, the previews of Premiere, the disk cache of After Effects, the render files and transcoded media of Final Cut: big, and made again if a project is ever opened.': 'Τα optimized και proxy media και το render cache του DaVinci Resolve, τα previews του Premiere, το disk cache του After Effects, τα render files και τα transcoded media του Final Cut: μεγάλα, και ξαναφτιάχνονται αν ανοίξει ποτέ ξανά το project.',
    'Your projects drive, an archive, the RAID.': 'Ο δίσκος με τα projects, ένα αρχείο, το RAID.',
    'Find leftovers': 'Βρες τα υπόλοιπα',
    'The projects, their media and their Auto-Save folders are never touched. Folders go to the Trash only when you choose them.': 'Τα projects, τα media τους και οι φάκελοι Auto-Save δεν αγγίζονται ποτέ. Οι φάκελοι πάνε στον Κάδο μόνο όταν τους διαλέξεις.',
    'Looking for leftovers': 'Ψάχνει υπόλοιπα',
    '{a} looked in · {b} found': '{a} ελέγχθηκαν · {b} βρέθηκαν',
    'Stopped.': 'Σταμάτησε.',
    'Untouched for': 'Χωρίς αλλαγή για', 'Only what has not changed for that long is offered.': 'Προτείνονται μόνο όσα δεν έχουν αλλάξει τόσο καιρό.',
    '1 month': '1 μήνα', '3 months': '3 μήνες', '6 months': '6 μήνες', '1 year': '1 χρόνο',
    '{n} to free in {f}': '{n} για ελευθέρωση σε {f}',
    '{n} still in use, left out': '{n} σε χρήση ακόμα, έμειναν έξω',
    'Choose all': 'Διάλεξε όλα',
    'Everything here changed recently.': 'Όλα εδώ άλλαξαν πρόσφατα.',
    'Changed recently': 'Άλλαξαν πρόσφατα', 'Probably still being edited.': 'Μάλλον γίνεται ακόμα μοντάζ.',
    'No <b>leftovers</b> here.': 'Δεν υπάρχουν <b>υπόλοιπα</b> εδώ.',
    'Looked in {n} in {t}.': 'Ελέγχθηκαν {n} σε {t}.',
    'The last time anything in it changed': 'Η τελευταία φορά που άλλαξε κάτι μέσα του',
    'Last changed {d}': 'Τελευταία αλλαγή {d}',
    '{size} will be freed when you empty the Trash. The projects themselves stay; their programs make these again if they are opened.': '{size} θα ελευθερωθούν όταν αδειάσεις τον Κάδο. Τα ίδια τα projects μένουν· τα προγράμματά τους τα ξαναφτιάχνουν αν ανοίξουν.',
    'Optimized media': 'Optimized media', 'Proxy media': 'Proxy media', 'Render cache': 'Render cache', 'Video previews': 'Previews βίντεο',
    'Audio previews': 'Previews ήχου', 'Disk cache': 'Disk cache', 'Render files': 'Render files', 'Transcoded media': 'Transcoded media',
    'Program': 'Πρόγραμμα', 'What': 'Τι', 'Last changed': 'Τελευταία αλλαγή', 'Files': 'Αρχεία',
    'Only folders of the last scan, and nothing in a Masters folder.': 'Μόνο φάκελοι του τελευταίου ψαξίματος, και τίποτα από φάκελο Masters.',
  },
  top(ctx) {
    const { h, t, ico } = ctx
    init(ctx)
    if (!st.res || st.busy) return null
    return [h('div', { class: 'title' }, t('Project leftovers')), h('div', { class: 'spacer' }),
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
    'leftovers-scan': async (a, emit) => {
      for (let i = 1; i <= 6; i++) { emit('leftovers-progress', { folders: i * 812, found: i, dir: '/Volumes/RAID/Projects/2025/Project ' + i }); await new Promise((r) => setTimeout(r, 90)) }
      const D = (d) => Date.now() - d * 864e5, P = '/Volumes/RAID/Projects'
      const it = (project, rel, app, kind, what, size, files, days, extra = {}) => ({ path: `${P}/${project}/${rel}`, name: rel.split('/').pop(), project, app, kind, what, size, files, newest: D(days), dir: `${P}/${project}`, ...extra })
      return { roots: a.roots, took: 18400, items: [
        it('Fakinos - Mataria mou', 'CacheClip/OptimizedMedia', 'Resolve', 'resolve-optimized', 'Optimized media', 412e9, 2210, 210),
        it('Panic Records Live', 'Library.fcpbundle/Day 1/Render Files', 'Final Cut', 'fcp-render', 'Render files', 188e9, 940, 540, { project: 'Library' }),
        it('Heaven Music Spot', 'CacheClip', 'Resolve', 'resolve-cache', 'Render cache', 96e9, 18800, 6),
        it('Garbi - Teaser', 'Adobe Premiere Pro Video Previews', 'Premiere', 'premiere-video', 'Video previews', 54e9, 310, 120),
        it('Fakinos - Mataria mou', 'ProxyMedia', 'Resolve', 'resolve-proxy', 'Proxy media', 38e9, 420, 210),
        it('Garbi - Teaser', 'Adobe After Effects Disk Cache', 'After Effects', 'ae-cache', 'Disk cache', 21e9, 5120, 130),
        it('Archive 2023 Masters', 'ProxyMedia', 'Resolve', 'resolve-proxy', 'Proxy media', 12e9, 180, 800, { protected: true }),
        it('Garbi - Teaser', 'Adobe Premiere Pro Audio Previews', 'Premiere', 'premiere-audio', 'Audio previews', 1.2e9, 88, 120),
      ] }
    },
    'leftovers-trash': async ({ paths }) => ({ ok: paths, failed: [] }),
    'leftovers-export': async () => '/Users/alex/Desktop/Project leftovers.csv',
  },
}
