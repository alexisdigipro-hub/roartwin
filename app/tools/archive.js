// Archives (Alex, 28 Oct: "zip, rar and every kind of compression"). Open: look inside an archive, then take it all
// out into a new folder next to it. Make: files and folders into a ZIP, 7z, tar.gz or tar.xz. The Mac/Windows side is
// electron/tools/archive.js (the computer's own tar); in a browser the `demo` below stands in.
const A = { mode: '', items: [], info: null, dest: '', busy: false, prog: null, done: null, format: '', level: '', junk: null, name: '', shown: 200 }
let progEl = null

const KIND_LABEL = { 'tar.gz': 'TAR.GZ', 'tar.bz2': 'TAR.BZ2', 'tar.xz': 'TAR.XZ', 'tar.zst': 'TAR.ZST', zip: 'ZIP', rar: 'RAR', '7z': '7Z', tar: 'TAR', iso: 'ISO', cab: 'CAB', cpio: 'CPIO', xar: 'XAR / PKG', gz: 'GZ', bz2: 'BZ2', xz: 'XZ', zst: 'ZST' }
const base = (p) => String(p).split(/[\\/]/).filter(Boolean).pop() || p
// an entry that would land outside the folder (the same rule as electron/tools/archive.js)
const unsafe = (n) => { const x = String(n).replace(/\\/g, '/'); return x.startsWith('/') || /^[a-z]:/i.test(x) || x.split('/').includes('..') }
const dirOf = (p) => { const s = String(p); const i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\')); return i > 0 ? s.slice(0, i) : s }

function init(ctx) {
  if (A.mode) return
  A.mode = ctx.load('archive', 'mode', 'open')
  A.format = ctx.load('archive', 'format', 'zip')
  A.level = ctx.load('archive', 'level', 'normal')
  A.junk = ctx.load('archive', 'junk', true)
}

/* a job with its progress: the side menu waits, Stop ends it */
async function job(ctx, name, args) {
  A.busy = true; A.prog = { done: 0, total: 0 }; ctx.busy(true)
  const off = ctx.on('archive-progress', (p) => { A.prog = p; drawProg(ctx) })
  try { return await ctx.call(name, args) } finally { off?.(); A.busy = false; A.prog = null; ctx.busy(false) }
}
function drawProg(ctx) {
  if (!progEl) return
  const p = A.prog || {}
  const frac = p.total ? Math.min(1, p.done / p.total) : 0
  progEl.querySelector('i').style.width = Math.round(frac * 100) + '%'
  progEl.querySelector('span').textContent = p.total ? (p.bytes ? ctx.t('{a} of {b}', { a: ctx.bytes(p.done), b: ctx.bytes(p.total) }) : ctx.t('{a} of {b}', { a: ctx.num(p.done), b: ctx.num(p.total) })) : ctx.t('Starting')
}
function progress(ctx) {
  const { h, t } = ctx
  progEl = h('div', { class: 'ar-prog' }, h('div', { class: 'ar-bar' }, h('i')), h('div', { class: 'ar-prog-row' }, h('span', {}, t('Starting')),
    h('button', { class: 'btn', onclick: () => ctx.stop() }, ctx.ico('stop'), t('Stop'))))
  requestAnimationFrame(() => drawProg(ctx))
  return progEl
}

/* the password, asked in the shared glass window */
function askPassword(ctx, wrong) {
  const { h, t } = ctx
  return new Promise((done) => {
    const input = h('input', { class: 'ar-input', type: 'password', autocomplete: 'off', placeholder: t('Password') })
    const close = (v) => { veil.remove(); done(v) }
    const veil = h('div', { class: 'veil', onclick: (e) => { if (e.target === veil) close(null) } },
      h('form', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', onsubmit: (e) => { e.preventDefault(); close(input.value) } },
        h('h3', {}, wrong ? t('That password did not open it.') : t('This archive has a password.')),
        h('p', {}, t('Type it to open the archive. It is used only for this and kept nowhere.')),
        input,
        h('div', { class: 'row', style: { marginTop: '16px' } }, h('button', { type: 'button', class: 'btn', onclick: () => close(null) }, t('Cancel')), h('button', { type: 'submit', class: 'btn main' }, t('Open')))))
    veil.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(null) })
    document.body.append(veil)
    input.focus()
  })
}

/* ---------- Open ---------- */
async function openArchive(ctx, p) {
  if (!p) return
  A.done = null; A.info = null; A.dest = ''; A.shown = 200
  try {
    const r = await job(ctx, 'archive-list', { path: p })
    if (r?.stopped) return ctx.toast(ctx.t('Stopped.'))
    A.info = r
  } catch (e) { ctx.toast(ctx.err(e)) }
  ctx.draw()
}
async function extract(ctx, password = '') {
  try {
    const r = await job(ctx, 'archive-extract', { path: A.info.path, dest: A.dest, password })
    if (r?.stopped) { ctx.toast(ctx.t('Stopped. What was taken out so far stays in its folder.')); return ctx.draw() }
    if (r?.needPassword) {
      const pw = await askPassword(ctx, r.wrong)
      if (pw) return extract(ctx, pw)
      return ctx.draw()
    }
    A.done = { kind: 'open', ...r }
  } catch (e) { ctx.toast(ctx.err(e)) }
  ctx.draw()
}
function viewOpen(ctx) {
  const { h, t, bytes, num, dateOf } = ctx
  const take = async (paths) => {
    const ok = await ctx.call('archive-add', { paths }).catch(() => [])
    if (!ok.length) return ctx.toast(t('Drop an archive, not a folder.'))
    openArchive(ctx, ok[0])
  }
  if (A.done?.kind === 'open') {
    const r = A.done
    return [h('section', { class: 'group verdict ok' },
      h('div', { class: 'big-i', html: ctx.I.done }),
      h('div', {},
        h('h2', { html: t('Opened into a <b>new folder</b>.') }),
        h('div', { class: 'sum' },
          h('span', { class: 'chip tint', style: { '--c': 'var(--ok)' } }, h('i'), ctx.plural(r.count, 'file')),
          r.skipped?.length ? h('span', { class: 'chip tint', style: { '--c': 'var(--warn)' }, title: r.skipped.join('\n') }, h('i'), t('{n} left out: outside the folder', { n: num(r.skipped.length) })) : null),
        h('div', { class: 'paths' }, h('div', { class: 'dest' }, h('span', { title: r.folder }, r.folder),
          h('button', { class: 'btn', style: { height: '28px', padding: '0 10px', fontSize: '12px' }, onclick: () => ctx.reveal(r.folder) }, ctx.ico('reveal'), ctx.revealLabel()))))),
    h('div', { class: 'go' }, h('button', { class: 'btn', onclick: () => { A.done = null; A.info = null; ctx.draw() } }, ctx.ico('back'), t('Open another')))]
  }
  if (!A.info) {
    return [ctx.dropOn(h('div', { class: 'drop' },
      h('div', { class: 'dz-i', html: ctx.I.zip }),
      h('b', {}, t('Drop an archive here')),
      h('small', {}, t('ZIP, RAR, 7z, TAR, TAR.GZ, TAR.XZ, TAR.BZ2, GZ, ISO, CAB, CPIO, PKG and more.')),
      h('button', { class: 'btn', disabled: A.busy, onclick: async () => { const ps = await ctx.call('archive-pick', { mode: 'open' }).catch((e) => { ctx.toast(ctx.err(e)); return [] }); if (ps[0]) openArchive(ctx, ps[0]) } }, ctx.ico('plus'), t('Choose an archive…'))), take),
    A.busy ? progress(ctx) : null,
    h('p', { class: 'note' }, t('It opens into a new folder next to the archive. Nothing already there is written over.'))]
  }
  const i = A.info
  const list = i.entries.filter((e) => !e.dir)
  const shown = list.slice(0, A.shown)
  return [
    h('section', { class: 'group ar-head' },
      h('div', { class: 'ar-head-row' },
        h('div', { class: 'dz-i ar-ico', html: ctx.I.zip }),
        h('div', { class: 'f-main' },
          h('div', { class: 'f-name', title: i.path }, base(i.path)),
          h('div', { class: 'f-dir', title: dirOf(i.path) }, '‎' + dirOf(i.path)),
          h('div', { class: 'f-meta' },
            h('span', { class: 'chip tint' }, h('i'), KIND_LABEL[i.kind] || i.kind.toUpperCase()),
            h('span', { class: 'chip' }, ctx.plural(i.files, 'file')),
            i.size ? h('span', { class: 'chip' }, t('{a} inside, {b} packed', { a: bytes(i.size), b: bytes(i.packed) })) : h('span', { class: 'chip' }, t('{b} packed', { b: bytes(i.packed) })),
            i.unsafe?.length ? h('span', { class: 'chip tint', style: { '--c': 'var(--warn)' }, title: i.unsafe.join('\n') }, h('i'), t('{n} would land outside the folder: left out', { n: num(i.unsafe.length) })) : null,
            i.junk ? h('span', { class: 'chip' }, t('{n} Mac leftovers inside', { n: num(i.junk) })) : null)),
        h('button', { class: 'ib', title: t('Open another'), 'aria-label': t('Open another'), html: ctx.I.x, disabled: A.busy, onclick: () => { A.info = null; ctx.draw() } })),
      h('div', { class: 'ar-dest' },
        h('span', {}, h('b', {}, t('Where it goes')), h('small', { title: A.dest || dirOf(i.path) }, '‎' + (A.dest ? A.dest : t('Next to the archive, in a new folder')) + '‎')),
        A.dest ? h('button', { class: 'btn', disabled: A.busy, onclick: () => { A.dest = ''; ctx.draw() } }, t('Next to the archive')) : null,
        h('button', { class: 'btn', disabled: A.busy, onclick: async () => { const d = await ctx.call('archive-dest', {}).catch(() => ''); if (d) { A.dest = d; ctx.draw() } } }, ctx.ico('folder'), t('Choose…')))),
    A.busy ? progress(ctx) : h('div', { class: 'go' }, h('button', { class: 'btn main big', onclick: () => extract(ctx) }, ctx.ico('out'), t('Open into a folder'))),
    shown.length ? h('section', { class: 'group' }, h('div', { class: 'files ar-list' }, ...shown.map((e) => h('div', { class: 'ar-entry' + (unsafe(e.name) ? ' bad' : '') },
      ctx.ico('file', 'ar-e-i'),
      h('span', { class: 'ar-e-name', title: e.name }, '‎' + e.name + '‎'),
      h('span', { class: 'ar-e-size' }, e.size ? bytes(e.size) : ''),
      h('span', { class: 'ar-e-date' }, e.mtime ? dateOf(e.mtime) : ''))))) : null,
    list.length > shown.length ? h('button', { class: 'btn more', onclick: () => { A.shown += 400; ctx.draw() } }, t('Show {n} more', { n: num(Math.min(400, list.length - shown.length)) })) : null,
    i.count > i.entries.length ? h('p', { class: 'note' }, t('The first {a} of {b} are listed; every one is taken out.', { a: num(i.entries.length), b: num(i.count) })) : null,
  ]
}

/* ---------- Make ---------- */
const FORMATS = [['zip', 'ZIP'], ['7z', '7z'], ['tar.gz', 'TAR.GZ'], ['tar.xz', 'TAR.XZ']]
const FORMAT_NOTE = {
  zip: 'Opens with a double click on every Mac, PC and phone.',
  '7z': 'Smaller than ZIP. On a PC it needs 7-Zip; a Mac opens it with this app.',
  'tar.gz': 'The usual one for servers and Linux; opens on a Mac with a double click.',
  'tar.xz': 'The smallest, and the slowest to make.',
}
async function addItems(ctx, paths) {
  const ok = await ctx.call('archive-add', { paths }).catch(() => [])
  const add = ok.filter((p) => !A.items.includes(p))
  if (add.length) { A.items = [...A.items, ...add]; A.done = null; ctx.draw() }
}
async function makeNow(ctx) {
  try {
    const r = await job(ctx, 'archive-make', { items: A.items, format: A.format, level: A.level, junk: A.junk, name: A.name.trim(), dest: A.dest })
    if (r?.stopped) { ctx.toast(ctx.t('Stopped. Nothing was left half made.')); return ctx.draw() }
    A.done = { kind: 'make', ...r }
  } catch (e) { ctx.toast(ctx.err(e)) }
  ctx.draw()
}
function viewMake(ctx) {
  const { h, t, bytes } = ctx
  const opt = (title, sub, control) => h('div', { class: 'opt' }, h('span', {}, h('b', {}, title), h('small', {}, sub)), control)
  if (A.done?.kind === 'make') {
    const r = A.done
    const saved = r.original ? Math.max(0, Math.round((1 - r.size / r.original) * 100)) : 0
    return [h('section', { class: 'group verdict ok' },
      h('div', { class: 'big-i', html: ctx.I.done }),
      h('div', {},
        h('h2', { html: t('The archive is <b>ready</b>.') }),
        h('div', { class: 'sum' },
          h('span', { class: 'chip tint', style: { '--c': 'var(--ok)' } }, h('i'), bytes(r.size)),
          h('span', { class: 'chip' }, ctx.plural(r.files, 'file')),
          r.original ? h('span', { class: 'chip' }, t('{n}% smaller', { n: saved })) : null),
        h('div', { class: 'paths' }, h('div', { class: 'dest' }, h('span', { title: r.path }, r.path),
          h('button', { class: 'btn', style: { height: '28px', padding: '0 10px', fontSize: '12px' }, onclick: () => ctx.reveal(r.path) }, ctx.ico('reveal'), ctx.revealLabel()))))),
    h('div', { class: 'go' }, h('button', { class: 'btn', onclick: () => { A.done = null; A.items = []; A.name = ''; ctx.draw() } }, ctx.ico('plus'), t('Make another')))]
  }
  const pickFiles = async () => addItems(ctx, await ctx.call('archive-pick', { mode: 'make' }).catch((e) => { ctx.toast(ctx.err(e)); return [] }))
  const pickFolders = async () => addItems(ctx, await ctx.call('archive-pick-folders', {}).catch(() => []))
  const name = h('input', { class: 'ar-input', value: A.name, placeholder: A.items.length === 1 ? base(A.items[0]).replace(/\.[^.]+$/, '') : t('Archive'), oninput: (e) => { A.name = e.target.value } })
  return [
    ctx.dropOn(h('div', { class: 'drop' + (A.items.length ? ' set' : '') },
      h('div', { class: 'dz-i', html: ctx.I.plus }),
      h('b', {}, A.items.length ? t('Drop more files or folders') : t('Drop files or folders here')),
      h('small', {}, t('Everything dropped goes into one archive.')),
      h('div', { class: 'row-btns' },
        h('button', { class: 'btn', disabled: A.busy, onclick: pickFiles }, ctx.ico('plus'), ctx.platform === 'darwin' ? t('Choose…') : t('Choose files…')),
        ctx.platform !== 'darwin' ? h('button', { class: 'btn', disabled: A.busy, onclick: pickFolders }, ctx.ico('folder'), t('Choose folders…')) : null),
      A.items.length ? h('div', { class: 'roots' }, ...A.items.map((p) => h('span', { class: 'root', title: p }, ctx.ico('file'), h('span', {}, base(p)),
        h('button', { 'aria-label': t('Remove'), html: ctx.I.x, disabled: A.busy, onclick: () => { A.items = A.items.filter((x) => x !== p); ctx.draw() } })))) : null), (ps) => addItems(ctx, ps)),
    h('div', { class: 'opts' },
      opt(t('Kind'), t(FORMAT_NOTE[A.format] || ''), ctx.seg(FORMATS, A.format, (v) => { A.format = v; ctx.save('archive', 'format', v); ctx.draw() })),
      opt(t('Squeeze'), t('Fast makes it sooner, Smallest makes it smaller. Videos and photos hardly shrink: they are packed already.'),
        ctx.seg([['fast', t('Fast')], ['normal', t('Normal')], ['small', t('Smallest')]], A.level, (v) => { A.level = v; ctx.save('archive', 'level', v); ctx.draw() })),
      opt(t('Leave out Mac leftovers'), t('.DS_Store, __MACOSX and ._ files, which mean nothing on another computer.'),
        ctx.switchEl(A.junk, (v) => { A.junk = v; ctx.save('archive', 'junk', v); ctx.draw() }, t('Leave out Mac leftovers'))),
      opt(t('Name'), t('The archive\'s name; the ending is added.'), name),
      opt(t('Where it goes'), A.dest || (A.items[0] ? t('Next to {n}', { n: base(A.items[0]) }) : t('Next to the first one')),
        h('span', { class: 'row-btns' },
          A.dest ? h('button', { class: 'btn', disabled: A.busy, onclick: () => { A.dest = ''; ctx.draw() } }, t('Next to them')) : null,
          h('button', { class: 'btn', disabled: A.busy, onclick: async () => { const d = await ctx.call('archive-dest', {}).catch(() => ''); if (d) { A.dest = d; ctx.draw() } } }, ctx.ico('folder'), t('Choose…'))))),
    A.busy ? progress(ctx) : h('div', { class: 'go' }, h('button', { class: 'btn main big', disabled: !A.items.length, onclick: () => makeNow(ctx) }, ctx.ico('zip'), t('Make the archive'))),
    h('p', { class: 'note' }, t('Nothing is written over: a name already taken gets a number.')),
  ]
}

export default {
  id: 'archive',
  top(ctx) {
    init(ctx)
    const { h, t } = ctx
    return [h('div', { class: 'title' }, t('Archives')),
      ctx.seg([['open', t('Open')], ['make', t('Make')]], A.mode, (v) => { if (A.busy) return; A.mode = v; ctx.save('archive', 'mode', v); ctx.draw() }),
      h('div', { class: 'spacer' })]
  },
  view(ctx) {
    init(ctx)
    const { h, t } = ctx
    const hero = A.mode === 'make'
      ? h('div', { class: 'hero' }, h('h1', { html: t('Pack it <b>up</b>.') }), h('p', {}, t('Files and folders into one ZIP, 7z, TAR.GZ or TAR.XZ, to send or to keep.')))
      : h('div', { class: 'hero' }, h('h1', { html: t('Open any <b>archive</b>.') }), h('p', {}, t('Look inside first, then take it all out into a new folder. ZIP, RAR, 7z, TAR and the rest.')))
    const body = A.mode === 'make' ? viewMake(ctx) : viewOpen(ctx)
    return h('main', {}, h('div', { class: 'home' }, h('div', { class: 'card ar' }, A.info && A.mode === 'open' && !A.done ? null : hero, ...body)))
  },
  el: {
    'Archives': 'Συμπιεσμένα', 'Open': 'Άνοιγμα', 'Make': 'Δημιουργία',
    'Open any <b>archive</b>.': 'Άνοιξε κάθε <b>αρχείο συμπίεσης</b>.',
    'Look inside first, then take it all out into a new folder. ZIP, RAR, 7z, TAR and the rest.': 'Δες πρώτα τι έχει μέσα, μετά βγάλ\' τα όλα σε έναν νέο φάκελο. ZIP, RAR, 7z, TAR και τα υπόλοιπα.',
    'Pack it <b>up</b>.': '<b>Συμπίεσέ</b> τα.',
    'Files and folders into one ZIP, 7z, TAR.GZ or TAR.XZ, to send or to keep.': 'Αρχεία και φάκελοι σε ένα ZIP, 7z, TAR.GZ ή TAR.XZ, για αποστολή ή για αρχείο.',
    'Drop an archive here': 'Ρίξε εδώ ένα αρχείο συμπίεσης',
    'ZIP, RAR, 7z, TAR, TAR.GZ, TAR.XZ, TAR.BZ2, GZ, ISO, CAB, CPIO, PKG and more.': 'ZIP, RAR, 7z, TAR, TAR.GZ, TAR.XZ, TAR.BZ2, GZ, ISO, CAB, CPIO, PKG και άλλα.',
    'Choose an archive…': 'Διάλεξε αρχείο…',
    'It opens into a new folder next to the archive. Nothing already there is written over.': 'Ανοίγει σε έναν νέο φάκελο δίπλα στο αρχείο. Τίποτα από όσα υπάρχουν ήδη δεν γράφεται από πάνω.',
    'Drop an archive, not a folder.': 'Ρίξε ένα αρχείο συμπίεσης, όχι φάκελο.',
    '{a} inside, {b} packed': '{a} μέσα, {b} συμπιεσμένο', '{b} packed': '{b} συμπιεσμένο',
    '{n} would land outside the folder: left out': '{n} θα έβγαιναν έξω από τον φάκελο: παραλείπονται',
    '{n} Mac leftovers inside': 'Άχρηστα αρχεία Mac μέσα: {n}',
    'Open another': 'Άνοιξε άλλο', 'Where it goes': 'Πού πάει', 'Next to the archive, in a new folder': 'Δίπλα στο αρχείο, σε νέο φάκελο',
    'Next to the archive': 'Δίπλα στο αρχείο', 'Open into a folder': 'Άνοιγμα σε φάκελο',
    'The first {a} of {b} are listed; every one is taken out.': 'Φαίνονται τα πρώτα {a} από {b}· βγαίνουν όλα.',
    'Opened into a <b>new folder</b>.': 'Άνοιξε σε <b>νέο φάκελο</b>.',
    '{n} left out: outside the folder': '{n} παραλείφθηκαν: έξω από τον φάκελο',
    'This archive has a password.': 'Αυτό το αρχείο έχει κωδικό.', 'That password did not open it.': 'Αυτός ο κωδικός δεν το άνοιξε.',
    'Type it to open the archive. It is used only for this and kept nowhere.': 'Γράψ\' τον για να ανοίξει. Χρησιμοποιείται μόνο γι\' αυτό και δεν κρατιέται πουθενά.',
    'Password': 'Κωδικός', 'Stopped.': 'Σταμάτησε.',
    'Stopped. What was taken out so far stays in its folder.': 'Σταμάτησε. Ό,τι βγήκε ως τώρα μένει στον φάκελό του.',
    'Stopped. Nothing was left half made.': 'Σταμάτησε. Δεν έμεινε τίποτα μισοφτιαγμένο.',
    'Drop files or folders here': 'Ρίξε εδώ αρχεία ή φακέλους', 'Drop more files or folders': 'Ρίξε κι άλλα αρχεία ή φακέλους',
    'Everything dropped goes into one archive.': 'Όλα όσα ρίχνεις μπαίνουν σε ένα αρχείο.',
    'Choose files…': 'Διάλεξε αρχεία…',
    'Opens with a double click on every Mac, PC and phone.': 'Ανοίγει με διπλό κλικ σε κάθε Mac, PC και κινητό.',
    'Smaller than ZIP. On a PC it needs 7-Zip; a Mac opens it with this app.': 'Μικρότερο από το ZIP. Σε PC θέλει το 7-Zip· ένας Mac το ανοίγει με αυτή την εφαρμογή.',
    'The usual one for servers and Linux; opens on a Mac with a double click.': 'Το συνηθισμένο για servers και Linux· σε Mac ανοίγει με διπλό κλικ.',
    'The smallest, and the slowest to make.': 'Το πιο μικρό, και το πιο αργό να φτιαχτεί.',
    'Squeeze': 'Συμπίεση', 'Fast': 'Γρήγορη', 'Normal': 'Κανονική', 'Smallest': 'Μέγιστη',
    'Fast makes it sooner, Smallest makes it smaller. Videos and photos hardly shrink: they are packed already.': 'Η Γρήγορη τελειώνει νωρίτερα, η Μέγιστη το κάνει μικρότερο. Βίντεο και φωτογραφίες σχεδόν δεν μικραίνουν: είναι ήδη συμπιεσμένα.',
    'Leave out Mac leftovers': 'Χωρίς τα άχρηστα του Mac',
    '.DS_Store, __MACOSX and ._ files, which mean nothing on another computer.': '.DS_Store, __MACOSX και αρχεία ._ , που δεν σημαίνουν τίποτα σε άλλον υπολογιστή.',
    'Name': 'Όνομα', 'The archive\'s name; the ending is added.': 'Το όνομα του αρχείου· η κατάληξη μπαίνει μόνη της.',
    'Archive': 'Αρχείο', 'Next to {n}': 'Δίπλα στο {n}', 'Next to the first one': 'Δίπλα στο πρώτο', 'Next to them': 'Δίπλα τους',
    'Make the archive': 'Φτιάξε το αρχείο', 'Nothing is written over: a name already taken gets a number.': 'Τίποτα δεν γράφεται από πάνω: ένα όνομα που υπάρχει ήδη παίρνει αριθμό.',
    'The archive is <b>ready</b>.': 'Το αρχείο είναι <b>έτοιμο</b>.', '{n}% smaller': '{n}% μικρότερο', 'Make another': 'Φτιάξε άλλο',
    'This is not an archive RoarTwin knows.': 'Αυτό δεν είναι αρχείο συμπίεσης που ξέρει το RoarTwin.',
    'A .dmg is a disk image, not an archive: open it with a double click and it shows up as a drive.': 'Το .dmg είναι εικόνα δίσκου, όχι αρχείο συμπίεσης: άνοιξέ το με διπλό κλικ και εμφανίζεται σαν δίσκος.',
    'A disk image, not an archive: open it with a double click.': 'Εικόνα δίσκου, όχι αρχείο συμπίεσης: άνοιξέ τη με διπλό κλικ.',
    'This archive is locked with a password.': 'Αυτό το αρχείο είναι κλειδωμένο με κωδικό.',
    'Choose or drop it here first.': 'Διάλεξέ το ή ρίξ\' το εδώ πρώτα.', 'Choose files or folders first.': 'Διάλεξε πρώτα αρχεία ή φακέλους.',
    'The archive could not be read.': 'Το αρχείο δεν διαβάστηκε.', 'The archive could not be opened.': 'Το αρχείο δεν άνοιξε.', 'The archive could not be made.': 'Το αρχείο δεν φτιάχτηκε.',
  },
  demo: {
    'archive-pick': async ({ mode }) => (mode === 'make' ? ['/Users/alex/Projects/Spring campaign/Exports', '/Users/alex/Projects/Spring campaign/Credits.pdf'] : ['/Users/alex/Downloads/Ilie mou - Final deliverables.zip']),
    'archive-pick-folders': async () => ['/Users/alex/Projects/Spring campaign/Stills'],
    'archive-add': async ({ paths }) => paths || [],
    'archive-dest': async () => '/Volumes/BACKUP/Deliveries',
    'archive-list': async ({ path }) => {
      const at = (d) => new Date(2026, 9, d, 18, 20).getTime()
      const entries = [
        { name: 'Ilie mou - Final deliverables/', size: 0, mtime: at(22), dir: true },
        { name: 'Ilie mou - Final deliverables/Ilie mou_YouTube_4K.mov', size: 6.42e9, mtime: at(22) },
        { name: 'Ilie mou - Final deliverables/Ilie mou_TV_1080p50.mxf', size: 3.1e9, mtime: at(22) },
        { name: 'Ilie mou - Final deliverables/Ilie mou_Social_9x16.mp4', size: 212e6, mtime: at(23) },
        { name: 'Ilie mou - Final deliverables/Ilie mou_Social_1x1.mp4', size: 188e6, mtime: at(23) },
        { name: 'Ilie mou - Final deliverables/Thumbnail.jpg', size: 2.4e6, mtime: at(23) },
        { name: 'Ilie mou - Final deliverables/Credits.txt', size: 1800, mtime: at(23) },
        { name: '__MACOSX/Ilie mou - Final deliverables/._Thumbnail.jpg', size: 220, mtime: at(23) },
      ]
      return { path, kind: 'zip', entries, count: entries.length, files: 7, size: 9.92e9, packed: 9.81e9, unsafe: [], junk: 1 }
    },
    'archive-extract': async (_a, emit) => {
      for (let i = 0; i <= 8; i++) { emit('archive-progress', { done: i, total: 8 }); await new Promise((r) => setTimeout(r, 120)) }
      return { folder: '/Users/alex/Downloads/Ilie mou - Final deliverables', count: 8, skipped: [] }
    },
    'archive-make': async ({ items }, emit) => {
      for (let i = 0; i <= 10; i++) { emit('archive-progress', { done: i * 4, total: 40 }); await new Promise((r) => setTimeout(r, 100)) }
      return { path: '/Users/alex/Projects/Spring campaign/Exports.zip', size: 1.92e9, files: 40, original: 2.31e9, items }
    },
  },
}
