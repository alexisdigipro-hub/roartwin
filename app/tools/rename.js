// Rename clips' page (Alex, 28 Oct): a folder, a rule of tokens, the new names side by side before anything changes,
// clashes refused, Undo for the last batch, the list as a CSV. The names are worked out on the Mac/Windows side
// (electron/tools/rename.js); in a browser `demo` stands in with a made-up card.

const DEFAULT = { pattern: '{date}_{project}_{cam}{card}_{n}', project: '', cam: 'A', card: '', start: 1, pad: 3, dateFormat: 'YYYY-MM-DD', dateFrom: 'clip', case: 'keep', kind: 'video' }
const TOKENS = [['date', 'The day it was shot'], ['time', 'The time, HHMMSS'], ['project', 'Project'], ['cam', 'Camera letter'], ['card', 'Card'], ['n', 'A counter'], ['name', 'Its name now'], ['tc', 'Start timecode'], ['camera', 'Camera make and model'], ['reel', 'Reel'], ['ext', 'The extension']]
const R = { ready: false, dir: '', only: [], rows: [], rule: { ...DEFAULT }, busy: false, progress: null, canUndo: false, err: '' }
let C = null
let timer = 0

const STATUS = { ok: ['New name', 'var(--ok)'], same: ['Stays', 'var(--dim)'], clash: ['Clash', 'var(--acc)'], taken: ['Taken', 'var(--warn)'], empty: ['Nothing', 'var(--warn)'] }
const counts = () => R.rows.reduce((n, r) => { n[r.status] = (n[r.status] || 0) + 1; return n }, {})
const problems = () => { const c = counts(); return (c.clash || 0) + (c.taken || 0) + (c.empty || 0) }

function save() { C.save('rename', 'rule', { ...R.rule, only: undefined }) }
function later() { clearTimeout(timer); timer = setTimeout(previewNow, 140) }
async function previewNow() {
  if (!R.dir) return
  try { R.rows = await C.call('rename-preview', { path: R.dir, rule: { ...R.rule, only: R.only } }); R.err = '' } catch (e) { R.err = C.err(e); R.rows = [] }
  // while the rule is being typed only the list and the Rename button change, so the field keeps its place
  const typing = document.activeElement?.closest?.('.rn') && /INPUT/.test(document.activeElement.tagName)
  const box = document.querySelector('.rn-table')
  if (!typing || !box) return C.draw()
  box.replaceWith(tableEl(C))
  document.querySelector('.rn-sum')?.replaceWith(sumEl(C))
  const go = document.querySelector('.top .rn-go')
  if (go) { const n = counts().ok || 0; go.disabled = R.busy || !n || problems() > 0; go.title = problems() ? C.t('Some names clash or are taken. Change the rule first.') : ''; go.lastChild.textContent = C.t('Rename {n}', { n: C.num(n) }) }
}
async function useFolder(got) {
  if (!got) return
  R.dir = got.path; R.only = got.only || []; R.canUndo = false; R.rows = []; R.asked = false
  R.busy = true; R.progress = { done: 0, total: 0 }; C.busy(true)
  const off = C.on('rename-progress', (x) => { R.progress = x; const el = document.querySelector('.rn-prog'); if (el) el.textContent = C.t('Reading the clips: {a} of {b}', { a: C.num(x.done), b: C.num(x.total) }) })
  try { const r = await C.call('rename-scan', { path: R.dir }); if (r?.stopped) { R.dir = ''; C.toast(C.t('Stopped.')) } } catch (e) { C.toast(C.err(e)); R.dir = '' } finally { off?.(); R.busy = false; C.busy(false) }
  if (R.dir) await previewNow()
}
async function apply() {
  const { t, num } = C
  const n = counts().ok || 0
  if (!n || problems()) return
  const ok = await C.sheet(t('Rename {n} files?', { n: num(n) }), t('Each gets the name shown. Nothing is written over, and Undo puts the old names back.'), [[t('Cancel'), false], [t('Rename'), true, true]])
  if (!ok) return
  try {
    const r = await C.call('rename-apply', { path: R.dir, rule: { ...R.rule, only: R.only } })
    R.canUndo = r.done > 0
    // the files chosen by hand now have their new names
    if (R.only.length) R.only = R.rows.filter((x) => x.status === 'ok' || x.status === 'same').map((x) => (x.status === 'ok' ? x.to : x.from))
    C.toast(r.failed.length ? t('{n} renamed, {m} could not be: {e}', { n: num(r.done), m: num(r.failed.length), e: t(r.failed[0].error) }) : t('{n} renamed', { n: num(r.done) }))
  } catch (e) { C.toast(C.err(e)) }
  await previewNow(); C.draw()
}
async function undo() {
  try {
    const r = await C.call('rename-undo')
    if (R.only.length) R.only = []
    R.canUndo = false
    C.toast(r.failed.length ? C.t('{n} put back, {m} could not be: {e}', { n: C.num(r.done), m: C.num(r.failed.length), e: C.t(r.failed[0].error) }) : C.t('{n} put back', { n: C.num(r.done) }))
  } catch (e) { C.toast(C.err(e)) }
  await previewNow(); C.draw()
}
async function csv() {
  const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`
  const rows = [[C.t('Old name'), C.t('New name'), C.t('Status')].map(q).join(','), ...R.rows.map((r) => [r.from, r.to, C.t(STATUS[r.status]?.[0] || r.status)].map(q).join(','))]
  try { if (await C.call('rename-csv', { text: rows.join('\r\n') })) C.toast(C.t('List saved')) } catch (e) { C.toast(C.err(e)) }
}

function sumEl(ctx) {
  const { h, t, num } = ctx
  const c = counts()
  return h('div', { class: 'sum rn-sum' },
    h('span', { class: 'chip tint', style: { '--c': 'var(--ok)' } }, h('i'), t('{n} to rename', { n: num(c.ok || 0) })),
    c.same ? h('span', { class: 'chip' }, t('{n} stay as they are', { n: num(c.same) })) : null,
    c.clash ? h('span', { class: 'chip tint' }, h('i'), t('{n} clash', { n: num(c.clash) })) : null,
    c.taken ? h('span', { class: 'chip tint', style: { '--c': 'var(--warn)' } }, h('i'), t('{n} taken by another file', { n: num(c.taken) })) : null,
    c.empty ? h('span', { class: 'chip tint', style: { '--c': 'var(--warn)' } }, h('i'), t('{n} with nothing to name them', { n: num(c.empty) })) : null)
}
function tableEl(ctx) {
  const { h, t } = ctx
  if (R.err) return h('div', { class: 'rn-table' }, h('p', { class: 'note' }, R.err))
  if (!R.rows.length) return h('div', { class: 'rn-table' }, h('p', { class: 'note' }, t('No files of that kind in this folder.')))
  return h('div', { class: 'rn-table' }, ...R.rows.slice(0, 2000).map((r) => {
    const [label, c] = STATUS[r.status] || ['', 'var(--dim)']
    return h('div', { class: 'rn-row ' + r.status },
      h('span', { class: 'rn-from', title: r.from }, r.from),
      h('span', { class: 'rn-arrow', 'aria-hidden': 'true' }, '→'),
      h('span', { class: 'rn-to', title: r.to }, r.status === 'same' ? '' : r.to || '—'),
      h('span', { class: 'chip tint', style: { '--c': c } }, h('i'), t(label)))
  }))
}

function view(ctx) {
  C = ctx
  const { h, t, ico, I, seg } = ctx
  if (!R.ready) { R.ready = true; R.rule = { ...DEFAULT, ...ctx.load('rename', 'rule', {}) } }
  const set = (k, v, redraw) => { R.rule[k] = v; save(); if (redraw) { C.draw(); previewNow() } else later() }
  if (!R.dir) {
    const drop = ctx.dropOn(h('div', { class: 'drop' }, h('div', { class: 'dz-i', html: I.rename }), h('b', {}, t('Drop a folder of clips here, or some of its files')),
      h('small', {}, t('Nothing is renamed until you press Rename, and Undo puts the old names back.')),
      h('button', { class: 'btn', onclick: async () => useFolder(await ctx.call('rename-pick').catch((e) => { ctx.toast(ctx.err(e)); return null })) }, ico('plus'), t('Choose a folder…'))),
    async (paths) => useFolder(await ctx.call('rename-folder', { paths }).catch((e) => { ctx.toast(ctx.err(e)); return null })))
    return h('main', {}, h('div', { class: 'home' }, h('div', { class: 'card' },
      h('div', { class: 'hero' }, h('h1', { html: t('<b>Rename</b> the clips.') }),
        h('p', {}, t('A card full of C0001.MP4 becomes 2026-10-28_Ilie mou_A_001.MP4: a rule of your own, with the date each clip was shot, its timecode, the camera and a counter.'))),
      drop)))
  }
  if (R.busy) return h('main', {}, h('div', { class: 'scan' }, h('div', { class: 'card' }, h('div', { class: 'ring spin', html: '<svg viewBox="0 0 100 100"><circle class="t" cx="50" cy="50" r="44"/><circle class="p" cx="50" cy="50" r="44" stroke-dasharray="276.5" stroke-dashoffset="200"/></svg><b></b>' }),
    h('div', { class: 'stage-t rn-prog' }, t('Reading the clips…')), h('button', { class: 'btn', onclick: () => ctx.stop() }, ico('stop'), t('Stop')))))
  const r = R.rule
  const input = (k, label, attrs = {}) => h('label', { class: 'nf' }, h('small', {}, t(label)), h('input', { value: String(r[k] ?? ''), ...attrs, oninput: (e) => set(k, attrs.type === 'number' ? Number(e.target.value) : e.target.value) }))
  const pattern = h('input', { class: 'rn-pattern', value: r.pattern, spellcheck: 'false', 'aria-label': t('The rule'), oninput: (e) => set('pattern', e.target.value) })
  const insert = (tok) => {
    const a = pattern.selectionStart ?? pattern.value.length, b = pattern.selectionEnd ?? a
    pattern.value = pattern.value.slice(0, a) + `{${tok}}` + pattern.value.slice(b)
    pattern.focus(); pattern.setSelectionRange(a + tok.length + 2, a + tok.length + 2)
    set('pattern', pattern.value)
  }
  const opt = (title, control) => h('div', { class: 'opt' }, h('span', {}, h('b', {}, title)), control)
  const folderName = R.dir.split(/[\\/]/).filter(Boolean).pop() || R.dir
  if (!R.rows.length && !R.err && !R.asked) { R.asked = true; later() }
  return h('main', {}, h('div', { class: 'res rn' },
    h('div', { class: 'rn-where' }, h('span', { class: 'root', title: R.dir }, ico('folder'), h('span', {}, folderName),
      h('button', { 'aria-label': t('Remove'), html: I.x, onclick: () => { R.dir = ''; R.rows = []; R.only = []; C.draw() } })),
      R.only.length ? h('span', { class: 'chip' }, t('{n} files chosen', { n: ctx.num(R.only.length) })) : null),
    h('section', { class: 'opts rn-rule' },
      h('div', { class: 'rn-line' }, pattern),
      h('div', { class: 'rn-tokens' }, ...TOKENS.map(([k, tip]) => h('button', { class: 'chip rn-tok', title: t(tip), onclick: () => insert(k) }, `{${k}}`))),
      h('div', { class: 'nf-row rn-fields' }, input('project', 'Project', { placeholder: 'Ilie mou' }), input('cam', 'Camera', { placeholder: 'A' }), input('card', 'Card', { placeholder: 'C01' }),
        h('div', { class: 'rn-n' }, input('start', 'Counter from', { type: 'number', min: '0' }), input('pad', 'Digits', { type: 'number', min: '1', max: '8' }))),
      opt(t('Which files'), seg([['video', t('Videos')], ['image', t('Photos')], ['audio', t('Sound')], ['all', t('All')]], r.kind, (v) => set('kind', v, true))),
      opt(t('The date from'), seg([['clip', t('The clip itself')], ['file', t('The file')]], r.dateFrom, (v) => set('dateFrom', v, true))),
      opt(t('Date as'), seg([['YYYY-MM-DD', '2026-10-28'], ['YYYYMMDD', '20261028'], ['YYMMDD', '261028'], ['DD-MM-YYYY', '28-10-2026']], r.dateFormat, (v) => set('dateFormat', v, true))),
      opt(t('Letters'), seg([['keep', t('As written')], ['upper', 'ABC'], ['lower', 'abc']], r.case, (v) => set('case', v, true)))),
    sumEl(ctx),
    tableEl(ctx)))
}
function top(ctx) {
  C = ctx
  const { h, t, ico } = ctx
  const c = counts()
  return [h('div', { class: 'title' }, t('Rename clips')), h('div', { class: 'spacer' }),
    R.dir ? h('button', { class: 'btn', disabled: R.busy, onclick: async () => useFolder(await ctx.call('rename-pick').catch(() => null)) }, ico('folder'), h('span', { class: 'lbl' }, t('Another folder…'))) : null,
    R.canUndo ? h('button', { class: 'btn', disabled: R.busy, onclick: undo }, ico('back'), h('span', { class: 'lbl' }, t('Undo last'))) : null,
    R.rows.length ? h('button', { class: 'btn', disabled: R.busy, onclick: csv, title: t('Save the list (CSV)') }, ico('out'), h('span', { class: 'lbl' }, t('Save list'))) : null,
    R.dir ? h('button', { class: 'btn main rn-go', disabled: R.busy || !c.ok || problems() > 0, title: problems() ? t('Some names clash or are taken. Change the rule first.') : '', onclick: apply }, ico('rename'), t('Rename {n}', { n: ctx.num(c.ok || 0) })) : null]
}

/* ---------- in a browser: a made-up card ---------- */
const pad2 = (n) => String(n).padStart(2, '0')
const CARD = Array.from({ length: 14 }, (_, i) => ({ name: `C${String(i + 1).padStart(4, '0')}.MP4`, kind: 'video', t: Date.UTC(2026, 9, 26, 9, 12 + i * 7, 3), tc: `14:${pad2(12 + i)}:03:00`, camera: 'Sony ILME-FX6' }))
  .concat([{ name: 'SOUND_T01.WAV', kind: 'audio', t: Date.UTC(2026, 9, 26, 9, 10), tc: '14:10:00:00', camera: '' }, { name: 'MEDIAPRO.XML', kind: 'other', t: Date.UTC(2026, 9, 26, 9, 9), tc: '', camera: '' }])
function demoPlan(rule) {
  const r = { ...DEFAULT, ...rule }
  const only = r.only?.length ? new Set(r.only) : null
  const DATE = { 'YYYY-MM-DD': (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`, YYYYMMDD: (d) => `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`, YYMMDD: (d) => `${String(d.getFullYear()).slice(2)}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`, 'DD-MM-YYYY': (d) => `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()}` }
  const sel = CARD.filter((f) => (r.kind === 'all' || f.kind === r.kind) && (!only || only.has(f.name))).sort((a, b) => a.t - b.t)
  const rows = sel.map((f, i) => {
    const d = new Date(f.t), ext = f.name.split('.').pop(), base = f.name.slice(0, -ext.length - 1)
    const v = { date: (DATE[r.dateFormat] || DATE['YYYY-MM-DD'])(d), time: `${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`, project: r.project, cam: r.cam, card: r.card, n: String((Number(r.start) || 0) + i).padStart(Math.max(1, Number(r.pad) || 1), '0'), name: base, ext, tc: f.tc.replace(/:/g, ''), camera: f.camera, reel: '' }
    let n = String(r.pattern).replace(/\{(\w+)\}/g, (a, k) => (k in v ? v[k] : a)).replace(/[\\/:*?"<>|]+/g, ' ').replace(/([_\-. ])[_\-. ]*(?=[_\-. ])/g, '').replace(/^[_\-. ]+|[_\-. ]+$/g, '').trim()
    if (r.case === 'upper') n = n.toUpperCase(); else if (r.case === 'lower') n = n.toLowerCase()
    const to = !n ? '' : /\{ext\}/.test(r.pattern) ? n : `${n}.${ext}`
    return { from: f.name, to, status: !to ? 'empty' : to === f.name ? 'same' : 'ok' }
  })
  const seen = new Map()
  rows.forEach((x) => x.to && seen.set(x.to.toLowerCase(), (seen.get(x.to.toLowerCase()) || 0) + 1))
  rows.forEach((x) => { if (x.status === 'ok' && seen.get(x.to.toLowerCase()) > 1) x.status = 'clash' })
  return rows
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const demo = {
  'rename-pick': async () => ({ path: '/Volumes/FX6_CARD_A/PRIVATE/M4ROOT/CLIP', only: [] }),
  'rename-folder': async ({ paths }) => ({ path: '/Volumes/FX6_CARD_A/PRIVATE/M4ROOT/CLIP', only: [] }),
  'rename-scan': async (_a, emit) => { for (let i = 0; i <= CARD.length; i += 4) { emit('rename-progress', { done: i, total: CARD.length }); await wait(60) } return { count: CARD.length } },
  'rename-preview': async ({ rule }) => demoPlan(rule),
  'rename-apply': async ({ rule }) => { const rows = demoPlan(rule).filter((x) => x.status === 'ok'); rows.forEach((x) => { const f = CARD.find((c) => c.name === x.from); f.was = f.name; f.name = x.to }); return { done: rows.length, failed: [] } },
  'rename-undo': async () => { let n = 0; CARD.forEach((f) => { if (f.was) { f.name = f.was; delete f.was; n++ } }); return { done: n, failed: [] } },
  'rename-csv': async () => '/Users/alex/Desktop/Renamed clips.csv',
}

const el = {
  'The day it was shot': 'Η μέρα που γυρίστηκε', 'The time, HHMMSS': 'Η ώρα, ΩΩΛΛΔΔ', 'Camera letter': 'Γράμμα κάμερας', 'A counter': 'Αρίθμηση', 'Its name now': 'Το τωρινό όνομα', 'Start timecode': 'Timecode αρχής', 'Camera make and model': 'Μάρκα και μοντέλο κάμερας', Reel: 'Reel', 'The extension': 'Η κατάληξη',
  'New name': 'Νέο όνομα', Stays: 'Μένει', Clash: 'Σύγκρουση', Taken: 'Υπάρχει ήδη', Nothing: 'Κενό',
  'Reading the clips: {a} of {b}': 'Διαβάζει τα clips: {a} από {b}', 'Reading the clips…': 'Διαβάζει τα clips…', 'Stopped.': 'Σταμάτησε.',
  'Rename {n} files?': 'Μετονομασία {n} αρχείων;', 'Each gets the name shown. Nothing is written over, and Undo puts the old names back.': 'Το καθένα παίρνει το όνομα που φαίνεται. Τίποτα δεν γράφεται από πάνω, και το Αναίρεση φέρνει πίσω τα παλιά ονόματα.',
  Cancel: 'Άκυρο', Rename: 'Μετονομασία', '{n} renamed': 'Μετονομάστηκαν {n}', '{n} renamed, {m} could not be: {e}': 'Μετονομάστηκαν {n}, {m} δεν μπόρεσαν: {e}', '{n} put back': 'Επανήλθαν {n}', '{n} put back, {m} could not be: {e}': 'Επανήλθαν {n}, {m} δεν μπόρεσαν: {e}',
  'Old name': 'Παλιό όνομα', Status: 'Κατάσταση', 'List saved': 'Η λίστα αποθηκεύτηκε',
  '{n} to rename': '{n} για μετονομασία', '{n} stay as they are': '{n} μένουν όπως είναι', '{n} clash': '{n} συγκρούονται', '{n} taken by another file': '{n} υπάρχουν ήδη σε άλλο αρχείο', '{n} with nothing to name them': '{n} μένουν χωρίς όνομα',
  'No files of that kind in this folder.': 'Δεν υπάρχουν τέτοια αρχεία σε αυτόν τον φάκελο.',
  'Drop a folder of clips here, or some of its files': 'Ρίξε εδώ έναν φάκελο με clips, ή κάποια από τα αρχεία του', 'Nothing is renamed until you press Rename, and Undo puts the old names back.': 'Τίποτα δεν μετονομάζεται μέχρι να πατήσεις Μετονομασία, και το Αναίρεση φέρνει πίσω τα παλιά ονόματα.',
  'Choose a folder…': 'Διάλεξε φάκελο…', '<b>Rename</b> the clips.': '<b>Μετονόμασε</b> τα clips.',
  'A card full of C0001.MP4 becomes 2026-10-28_Ilie mou_A_001.MP4: a rule of your own, with the date each clip was shot, its timecode, the camera and a counter.': 'Μια κάρτα γεμάτη C0001.MP4 γίνεται 2026-10-28_Ilie mou_A_001.MP4: ένας δικός σου κανόνας, με τη μέρα που γυρίστηκε κάθε clip, το timecode του, την κάμερα και αρίθμηση.',
  Stop: 'Διακοπή', 'The rule': 'Ο κανόνας', Project: 'Project', Camera: 'Κάμερα', Card: 'Κάρτα', 'Counter from': 'Αρίθμηση από', Digits: 'Ψηφία', Remove: 'Αφαίρεση', '{n} files chosen': '{n} αρχεία επιλεγμένα',
  'Which files': 'Ποια αρχεία', Videos: 'Βίντεο', Photos: 'Φωτογραφίες', Sound: 'Ήχος', All: 'Όλα', 'The date from': 'Η ημερομηνία από', 'The clip itself': 'Το ίδιο το clip', 'The file': 'Το αρχείο', 'Date as': 'Ημερομηνία ως', Letters: 'Γράμματα', 'As written': 'Όπως γράφτηκαν',
  'Rename clips': 'Μετονομασία clips', 'Another folder…': 'Άλλος φάκελος…', 'Undo last': 'Αναίρεση', 'Save the list (CSV)': 'Αποθήκευση λίστας (CSV)', 'Save list': 'Αποθήκευση λίστας', 'Rename {n}': 'Μετονομασία {n}',
  'Some names clash or are taken. Change the rule first.': 'Κάποια ονόματα συγκρούονται ή υπάρχουν ήδη. Άλλαξε πρώτα τον κανόνα.', 'Choose the folder first.': 'Διάλεξε πρώτα τον φάκελο.', 'The old name is taken now.': 'Το παλιό όνομα το έχει πια άλλο αρχείο.',
}

export default { id: 'rename', el, view, top, demo }
