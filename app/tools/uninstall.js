// Uninstall apps (Alex, 29 Oct): every app on the computer with its version, size and the last time it was opened.
// Mac: choose one, and what it left in ~/Library is found (its settings, caches, containers, saved state, logs, login
// agents), each with its size; the app and the leftovers chosen go to the Trash together. Windows: the program's own
// uninstaller runs after a confirm. macOS's and Apple's own apps, RoarKit itself and an app that is open are refused.
// Doors: uninstall-list, uninstall-leftovers, uninstall-trash, uninstall-run (electron/tools/uninstall.js).
const st = { res: null, busy: false, prog: null, q: '', sort: null, app: null, left: null, leftBusy: false, pick: new Map(), gone: new Set() }
const WHERE = { 'Application Support': '#5e9bff', Caches: '#30b0c7', Preferences: '#bf5af2', Containers: '#ff9f0a', 'Group Containers': '#ff9f0a', 'Saved Application State': '#8e8e93', Logs: '#8e8e93', HTTPStorages: '#64d2ff', WebKit: '#64d2ff', LaunchAgents: '#ff453a' }
const APP_I = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="4.5"/><path d="M9 15.5 12 8l3 7.5M10 13.5h4"/></svg>'
const tint = (s) => { let n = 0; for (const c of String(s)) n = (n * 31 + c.charCodeAt(0)) >>> 0; return `hsl(${n % 360} 62% 52%)` }

function init(ctx) { if (st.sort == null) st.sort = ctx.load('uninstall', 'sort', 'size') }
const apps = () => (st.res?.apps || []).filter((a) => !st.gone.has(a.path || a.id))
function shown() {
  const q = st.q.trim().toLowerCase()
  const list = apps().filter((a) => !q || a.name.toLowerCase().includes(q) || (a.id || '').toLowerCase().includes(q) || (a.publisher || '').toLowerCase().includes(q))
  const by = { size: (a, b) => (b.size || 0) - (a.size || 0), name: (a, b) => a.name.localeCompare(b.name), used: (a, b) => (a.lastUsed || 0) - (b.lastUsed || 0) }
  return list.sort(by[st.sort] || by.size)
}
async function list(ctx) {
  st.busy = true; st.prog = null; st.app = null
  ctx.busy(true)
  const off = ctx.on('uninstall-progress', (p) => { st.prog = p; ctx.draw() })
  try {
    const r = await ctx.call('uninstall-list')
    if (!r?.stopped) { st.res = r; st.gone.clear() }
  } catch (e) { ctx.toast(ctx.err(e)) } finally { off?.(); st.busy = false; ctx.busy(false) }
}
function open(ctx, a) { st.app = a; st.left = null; st.pick.clear(); ctx.draw() }
/* what the chosen app left: looked for when its page is first drawn (also when Back brings it again) */
async function loadLeft(ctx) {
  const a = st.app
  if (!a || st.leftBusy || st.left) return
  st.leftBusy = true; ctx.draw()
  try {
    const r = await ctx.call('uninstall-leftovers', { path: a.path })
    if (st.app !== a) return
    st.left = r.found
    if (!a.refusal) for (const f of r.found) st.pick.set(f.path, f)
  } catch (e) { if (st.app === a) st.left = []; ctx.toast(ctx.err(e)) } finally { st.leftBusy = false; ctx.draw() }
}
const pickedSize = () => [...st.pick.values()].reduce((n, f) => n + f.size, 0)
async function trash(ctx) {
  const { t, bytes, plural } = ctx
  const a = st.app
  const n = st.pick.size
  const ok = await ctx.sheet(t('Move {a} to the Trash?', { a: a.name }), (n ? t('With {n} it left, {s} in all.', { n: plural(n, 'leftover'), s: bytes((a.size || 0) + pickedSize()) }) + ' ' : '') + t('Empty the Trash to free the space. Until then it can be put back.'), [[t('Cancel'), false], [t('Move to Trash'), true, true]])
  if (!ok) return
  try {
    const r = await ctx.call('uninstall-trash', { path: a.path, leftovers: [...st.pick.keys()] })
    st.gone.add(a.path); st.app = null
    ctx.toast(t('{a} is in the Trash, {s} with what it left.', { a: a.name, s: bytes(r.freed) }) + (r.failed.length ? ' ' + t('{n} stayed: in use or kept by macOS.', { n: plural(r.failed.length, 'leftover') }) : ''))
  } catch (e) { ctx.toast(ctx.err(e)) }
  ctx.draw()
}
async function runUninstaller(ctx, a) {
  const { t } = ctx
  const ok = await ctx.sheet(t('Uninstall {a}?', { a: a.name }), t('Its own uninstaller opens and takes it from here. Windows may ask for permission.'), [[t('Cancel'), false], [t('Uninstall'), true, true]])
  if (!ok) return
  try { await ctx.call('uninstall-run', { id: a.id }); ctx.toast(t('The uninstaller of {a} is open.', { a: a.name })) } catch (e) { ctx.toast(ctx.err(e)) }
}

function appIcon(ctx, a) { return ctx.h('span', { class: 'un-ic', style: { '--c': tint(a.id || a.name) }, html: APP_I }) }
function row(ctx, a) {
  const { h, t, bytes, dateOf, I } = ctx
  const win = st.res.platform === 'win32'
  const meta = h('span', { class: 'sp-meta' },
    a.refusal ? h('span', { class: 'chip tint', style: { '--c': 'var(--warn)' }, title: t(a.refusal) }, h('i'), t(a.refusal)) : null,
    win ? (a.installed ? h('span', { class: 'chip' }, t('Installed {d}', { d: dateOf(a.installed) })) : null)
      : h('span', { class: 'chip', title: t('The last time it was opened') }, a.lastUsed ? t('Opened {d}', { d: dateOf(a.lastUsed) }) : t('Never opened')),
    h('span', { class: 'chip sp-size' }, a.size ? bytes(a.size) : '—'))
  const name = h('span', { class: 'sp-name' }, h('b', {}, a.name, a.version ? h('em', { class: 'un-v' }, ' ' + a.version) : null), h('small', { class: 'sp-path', title: a.path || a.publisher }, '‎' + (a.path || a.publisher || '')))
  if (win) {
    return h('div', { class: 'sp-file un-row' }, appIcon(ctx, a), name, meta,
      h('button', { class: 'btn', disabled: !!a.refusal, onclick: () => runUninstaller(ctx, a) }, ctx.ico('trash'), h('span', { class: 'lbl' }, t('Uninstall'))))
  }
  return h('button', { class: 'sp-file un-row' + (a.refusal ? ' off' : ''), onclick: () => open(ctx, a) }, appIcon(ctx, a), name, meta, h('span', { class: 'un-go', html: I.back }))
}
function viewList(ctx) {
  const { h, t, bytes, plural, seg, ico } = ctx
  const all = apps(), list = shown()
  const total = all.reduce((n, a) => n + (a.size || 0), 0)
  const old = all.filter((a) => a.lastUsed && a.lastUsed < Date.now() - 365 * 864e5)
  return h('main', {}, h('div', { class: 'res sp un' },
    h('div', { class: 'sum' },
      h('span', { class: 'chip tint' }, h('i'), t('{n} · {s}', { n: plural(all.length, 'app'), s: bytes(total) })),
      st.res.platform !== 'win32' && old.length ? h('span', { class: 'chip', title: t('Not opened for a year or more') }, t('{n} not opened for a year', { n: plural(old.length, 'app') })) : null),
    h('div', { class: 'rp-tools' },
      h('label', { class: 'rp-q' }, ico('search'), h('input', { type: 'search', value: st.q, placeholder: t('Search the apps'), 'aria-label': t('Search the apps'),
        oninput: (e) => { st.q = e.target.value; const pos = e.target.selectionStart; ctx.draw(); const q = document.querySelector('.un .rp-q input'); if (q) { q.focus(); q.setSelectionRange(pos, pos) } } })),
      seg([['size', t('Biggest')], ['name', t('By name')], ...(st.res.platform === 'win32' ? [] : [['used', t('Least used')]])], st.sort, (v) => { st.sort = v; ctx.save('uninstall', 'sort', v); ctx.draw() })),
    list.length ? h('section', { class: 'group sp-list' }, ...list.map((a) => row(ctx, a))) : h('p', { class: 'note' }, t('Nothing matches.')),
    h('p', { class: 'note' }, st.res.platform === 'win32' ? t('Each program is removed by its own uninstaller, as Windows does it.') : t('macOS\'s own apps and Apple\'s are not offered. What goes, goes to the Trash.'))))
}
function viewApp(ctx) {
  const { h, t, bytes, plural, dateOf, I, ico } = ctx
  const a = st.app
  if (!st.left && !st.leftBusy) queueMicrotask(() => loadLeft(ctx))
  const left = st.left || []
  const items = left.map((f) => {
    const on = st.pick.has(f.path)
    return h('div', { class: 'sp-file' + (on ? ' sel' : '') },
      h('button', { class: 'check' + (on ? ' on' : ''), html: I.check, disabled: !!a.refusal, 'aria-label': f.path, title: on ? t('Keep it') : t('Move to the Trash'), onclick: () => { on ? st.pick.delete(f.path) : st.pick.set(f.path, f); ctx.draw() } }),
      h('span', { class: 'sp-ic', html: /\.plist$/i.test(f.name) ? I.file : I.folder }),
      h('span', { class: 'sp-name' }, h('b', { title: f.name }, f.name), h('small', { class: 'sp-path', title: f.path }, '‎' + f.path)),
      h('span', { class: 'sp-meta' },
        h('span', { class: 'chip tint', style: { '--c': WHERE[f.where] || 'var(--acc)' } }, h('i'), t(f.where)),
        f.by === 'name' ? h('span', { class: 'chip', title: t('Found by the app\'s name, not its id: look before it goes') }, t('By name')) : null,
        h('span', { class: 'chip sp-size' }, bytes(f.size))),
      h('button', { class: 'ib sm', title: ctx.revealLabel(), 'aria-label': ctx.revealLabel(), html: I.reveal, onclick: () => ctx.reveal(f.path) }))
  })
  const total = (a.size || 0) + pickedSize()
  const foot = !a.refusal ? h('div', { class: 'foot show sp-foot' },
    h('span', {}, h('b', {}, a.name), st.pick.size ? [' + ', h('b', {}, plural(st.pick.size, 'leftover'))] : null, ' · ', h('b', {}, bytes(total))),
    h('button', { class: 'btn main', disabled: st.leftBusy, onclick: () => trash(ctx) }, ico('trash'), t('Move to Trash'))) : null
  return h('main', {}, h('div', { class: 'res sp un' },
    h('div', { class: 'un-head' }, appIcon(ctx, a),
      h('span', { class: 'sp-name' }, h('b', {}, a.name, a.version ? h('em', { class: 'un-v' }, ' ' + a.version) : null), h('small', { class: 'sp-path', title: a.path }, '‎' + a.path)),
      h('span', { class: 'sp-meta' },
        h('span', { class: 'chip' }, a.lastUsed ? t('Opened {d}', { d: dateOf(a.lastUsed) }) : t('Never opened')),
        a.id ? h('span', { class: 'chip', title: t('Its bundle id') }, a.id) : null,
        h('span', { class: 'chip sp-size' }, bytes(a.size || 0))),
      h('button', { class: 'ib sm', title: ctx.revealLabel(), 'aria-label': ctx.revealLabel(), html: I.reveal, onclick: () => ctx.reveal(a.path) })),
    a.refusal ? h('div', { class: 'un-no' }, ico('warn'), h('span', {}, h('b', {}, t(a.refusal)), h('small', {}, t('RoarKit leaves it where it is.')))) : null,
    h('div', { class: 'sp-head' }, h('b', {}, t('What it left on this Mac')), h('small', {}, st.leftBusy ? t('Looking…') : left.length ? t('{n}, {s}', { n: plural(left.length, 'leftover'), s: bytes(left.reduce((n, f) => n + f.size, 0)) }) : t('Nothing in ~/Library under its name.'))),
    items.length ? h('section', { class: 'group sp-list' }, ...items) : null,
    h('p', { class: 'note' }, t('Found by its bundle id ({id}) and its name in ~/Library: settings, caches, containers, saved state, logs, login agents. Your own documents are never looked at.', { id: a.id || '—' }))), foot)
}
function viewBusy(ctx) {
  const { h, t, ico } = ctx
  const p = st.prog || {}
  const ring = h('div', { class: 'ring spin', html: '<svg viewBox="0 0 100 100"><circle class="t" cx="50" cy="50" r="44"/><circle class="p" cx="50" cy="50" r="44" stroke-dasharray="276.5" stroke-dashoffset="276.5"/></svg><b></b>' })
  return h('main', {}, h('div', { class: 'scan' }, h('div', { class: 'card' }, ring,
    h('div', { class: 'stage-t' }, t('Looking at the apps')),
    h('div', { class: 'stage-s' }, p.total ? t('{a} of {b}', { a: p.done, b: p.total }) + (p.name ? ' · ' + p.name : '') : t('Starting')),
    h('button', { class: 'btn', onclick: () => ctx.stop() }, ico('stop'), t('Stop')))))
}
function viewStart(ctx) {
  const { h, t, ico } = ctx
  return h('main', {}, h('div', { class: 'home' }, h('div', { class: 'card' },
    h('div', { class: 'hero' }, h('h1', { html: t('Take an app off, <b>all of it</b>.') }),
      h('p', {}, t('Every app with its size and the last time it was opened. On a Mac, what an app leaves behind in the Library goes with it: its settings, caches and helpers. On Windows, its own uninstaller runs.'))),
    h('div', { class: 'go' }, h('button', { class: 'btn main big', onclick: () => list(ctx) }, ico('search'), t('List the apps'))),
    h('p', { class: 'note' }, t('macOS\'s own apps and Apple\'s, RoarKit itself and an app that is open are never offered. Nothing is deleted: it goes to the Trash.')))))
}

export default {
  nav: { get: () => ({ res: st.res, app: st.app }), set: (s) => { st.res = s.res; if (s.app !== st.app) { st.app = s.app; st.left = null; st.pick.clear() } } },
  id: 'uninstall',
  el: {
    'Uninstall apps': 'Απεγκατάσταση',
    'Take an app off, <b>all of it</b>.': 'Βγάλε μια εφαρμογή, <b>ολόκληρη</b>.',
    'Every app with its size and the last time it was opened. On a Mac, what an app leaves behind in the Library goes with it: its settings, caches and helpers. On Windows, its own uninstaller runs.': 'Κάθε εφαρμογή με το μέγεθός της και την τελευταία φορά που άνοιξε. Σε Mac, ό,τι αφήνει πίσω της μια εφαρμογή στη Library φεύγει μαζί της: ρυθμίσεις, cache και βοηθητικά. Σε Windows, τρέχει το δικό της πρόγραμμα απεγκατάστασης.',
    'List the apps': 'Δείξε τις εφαρμογές',
    'macOS\'s own apps and Apple\'s, RoarKit itself and an app that is open are never offered. Nothing is deleted: it goes to the Trash.': 'Οι εφαρμογές του macOS και της Apple, το ίδιο το RoarKit και μια εφαρμογή που είναι ανοιχτή δεν προτείνονται ποτέ. Τίποτα δεν σβήνεται: πάει στον Κάδο.',
    'Looking at the apps': 'Κοιτάζει τις εφαρμογές',
    '{n} · {s}': '{n} · {s}', '{n} not opened for a year': '{n} δεν άνοιξαν για έναν χρόνο', 'Not opened for a year or more': 'Δεν άνοιξαν για έναν χρόνο ή περισσότερο',
    'Search the apps': 'Ψάξε στις εφαρμογές', 'Biggest': 'Μεγαλύτερες', 'By name': 'Με όνομα', 'Least used': 'Λιγότερο χρησιμοποιημένες', 'Nothing matches.': 'Τίποτα δεν ταιριάζει.',
    'Each program is removed by its own uninstaller, as Windows does it.': 'Κάθε πρόγραμμα αφαιρείται από το δικό του πρόγραμμα απεγκατάστασης, όπως το κάνουν τα Windows.',
    'macOS\'s own apps and Apple\'s are not offered. What goes, goes to the Trash.': 'Οι εφαρμογές του macOS και της Apple δεν προτείνονται. Ό,τι φεύγει, πάει στον Κάδο.',
    'Opened {d}': 'Άνοιξε {d}', 'Never opened': 'Δεν άνοιξε ποτέ', 'The last time it was opened': 'Η τελευταία φορά που άνοιξε', 'Installed {d}': 'Εγκαταστάθηκε {d}',
    'Uninstall': 'Απεγκατάσταση', 'Uninstall {a}?': 'Απεγκατάσταση του {a};',
    'Its own uninstaller opens and takes it from here. Windows may ask for permission.': 'Ανοίγει το δικό του πρόγραμμα απεγκατάστασης και συνεχίζει από εκεί. Τα Windows μπορεί να ζητήσουν άδεια.',
    'The uninstaller of {a} is open.': 'Το πρόγραμμα απεγκατάστασης του {a} άνοιξε.',
    'It is part of macOS.': 'Είναι μέρος του macOS.', 'It is one of Apple\'s own apps.': 'Είναι εφαρμογή της ίδιας της Apple.', 'RoarKit cannot remove itself.': 'Το RoarKit δεν αφαιρεί τον εαυτό του.', 'It is open. Quit it first.': 'Είναι ανοιχτή. Κλείσ\' την πρώτα.',
    'RoarKit leaves it where it is.': 'Το RoarKit την αφήνει εκεί που είναι.',
    'What it left on this Mac': 'Τι άφησε σε αυτόν τον Mac', '{n}, {s}': '{n}, {s}', 'Nothing in ~/Library under its name.': 'Τίποτα στη ~/Library με το όνομά της.',
    'Found by its bundle id ({id}) and its name in ~/Library: settings, caches, containers, saved state, logs, login agents. Your own documents are never looked at.': 'Βρέθηκαν με το bundle id της ({id}) και το όνομά της στη ~/Library: ρυθμίσεις, cache, containers, αποθηκευμένη κατάσταση, logs, login agents. Τα δικά σου έγγραφα δεν τα κοιτάζει ποτέ.',
    'Its bundle id': 'Το bundle id της', 'Found by the app\'s name, not its id: look before it goes': 'Βρέθηκε με το όνομα της εφαρμογής, όχι με το id της: κοίτα πριν φύγει',
    'Application Support': 'Application Support', 'Caches': 'Caches', 'Preferences': 'Ρυθμίσεις', 'Containers': 'Containers', 'Group Containers': 'Group Containers', 'Saved Application State': 'Αποθηκευμένη κατάσταση', 'HTTPStorages': 'HTTPStorages', 'WebKit': 'WebKit', 'LaunchAgents': 'LaunchAgents',
    'Move {a} to the Trash?': 'Στον Κάδο το {a};', 'With {n} it left, {s} in all.': 'Μαζί με {n} που άφησε, {s} συνολικά.',
    'Empty the Trash to free the space. Until then it can be put back.': 'Άδειασε τον Κάδο για να ελευθερωθεί ο χώρος. Μέχρι τότε μπορεί να επιστρέψει.',
    '{a} is in the Trash, {s} with what it left.': 'Το {a} είναι στον Κάδο, {s} μαζί με ό,τι άφησε.', '{n} stayed: in use or kept by macOS.': '{n} έμειναν: σε χρήση ή τα κρατάει το macOS.',
    'Only what was found for this app.': 'Μόνο ό,τι βρέθηκε για αυτή την εφαρμογή.', 'List the apps again.': 'Δείξε ξανά τις εφαρμογές.',
    'macOS did not let RoarKit move it. Drag it to the Trash in the Finder.': 'Το macOS δεν άφησε το RoarKit να τη μετακινήσει. Σύρε την στον Κάδο από το Finder.',
    'This program has no uninstaller.': 'Αυτό το πρόγραμμα δεν έχει απεγκατάσταση.', 'All apps': 'Όλες οι εφαρμογές', 'Refresh': 'Ανανέωση',
  },
  top(ctx) {
    const { h, t, I, ico } = ctx
    init(ctx)
    if (st.busy || !st.res) return null
    if (st.app) return [h('button', { class: 'btn', onclick: () => { st.app = null; ctx.draw() } }, h('span', { class: 'un-back', html: I.back }), h('span', { class: 'lbl' }, t('All apps'))), h('div', { class: 'title' }, st.app.name), h('div', { class: 'spacer' })]
    return [h('div', { class: 'title' }, t('Uninstall apps')), h('div', { class: 'spacer' }),
      h('button', { class: 'btn', onclick: () => list(ctx) }, ico('search'), h('span', { class: 'lbl' }, t('Refresh')))]
  },
  view(ctx) {
    init(ctx)
    if (st.busy) return viewBusy(ctx)
    if (st.res && st.app) return viewApp(ctx)
    if (st.res) return viewList(ctx)
    return viewStart(ctx)
  },
  demo: {
    'uninstall-list': async (_a, emit) => {
      const D = (d) => Date.now() - d * 864e5
      const A = (name, id, version, size, used, extra = {}) => ({ path: `/Applications/${name}.app`, name, file: name, id, version, size, lastUsed: used == null ? 0 : D(used), refusal: '', ...extra })
      const apps = [
        A('DaVinci Resolve', 'com.blackmagic-design.DaVinciResolve', '19.1.2', 6.1e9, 0),
        A('Adobe Premiere Pro 2025', 'com.adobe.PremierePro.25', '25.0', 4.4e9, 2, { path: '/Applications/Adobe Premiere Pro 2025/Adobe Premiere Pro 2025.app' }),
        A('Final Cut Pro', 'com.apple.FinalCut', '11.0', 6.9e9, 40, { refusal: 'It is one of Apple\'s own apps.' }),
        A('Spotify', 'com.spotify.client', '1.2.48', 0.62e9, 0, { refusal: 'It is open. Quit it first.' }),
        A('Cinema 4D', 'net.maxon.cinema4d', '2025.1', 3.8e9, 420),
        A('Frame.io Transfer', 'io.frame.transfer', '1.9.3', 0.31e9, 610),
        A('Handbrake', 'fr.handbrake.HandBrake', '1.8.2', 0.11e9, 95),
        A('Zoom', 'us.zoom.xos', '6.2.5', 0.52e9, 12),
        A('Kyno', 'com.lesspain.Kyno', '1.8.7', 0.42e9, 760),
        A('RoarKit', 'com.themadlions.roartwin', '0.5.0', 0.39e9, 0, { refusal: 'RoarKit cannot remove itself.' }),
        A('Safari', 'com.apple.Safari', '18.1', 0.03e9, 1, { refusal: 'It is one of Apple\'s own apps.' }),
        A('ShotPut Pro', 'com.imagineproducts.ShotPutPro', '2024.2', 0.21e9, 300),
      ]
      for (let i = 1; i <= apps.length; i += 3) { emit('uninstall-progress', { done: i, total: apps.length, name: apps[i - 1].name }); await new Promise((r) => setTimeout(r, 70)) }
      return { apps, platform: 'web', at: Date.now() }
    },
    'uninstall-leftovers': async ({ path: p }) => {
      const L = '/Users/alex/Library'
      const n = p.split('/').pop().replace(/\.app$/, '')
      const id = n === 'Cinema 4D' ? 'net.maxon.cinema4d' : 'com.example.' + n.replace(/\W/g, '')
      return { found: [
        { path: `${L}/Application Support/${n}`, name: n, where: 'Application Support', by: 'name', size: 2.4e9 },
        { path: `${L}/Caches/${id}`, name: id, where: 'Caches', by: 'id', size: 812e6 },
        { path: `${L}/Containers/${id}`, name: id, where: 'Containers', by: 'id', size: 96e6 },
        { path: `${L}/Saved Application State/${id}.savedState`, name: id + '.savedState', where: 'Saved Application State', by: 'id', size: 1.2e6 },
        { path: `${L}/LaunchAgents/${id}.updater.plist`, name: id + '.updater.plist', where: 'LaunchAgents', by: 'id', size: 1200 },
        { path: `${L}/Preferences/${id}.plist`, name: id + '.plist', where: 'Preferences', by: 'id', size: 18e3 },
      ] }
    },
    'uninstall-trash': async ({ leftovers }) => ({ ok: leftovers, failed: [], freed: 7.2e9 }),
    'uninstall-run': async () => ({ started: true }),
  },
}
