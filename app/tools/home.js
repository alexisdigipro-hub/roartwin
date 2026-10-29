// Overview (Alex, 29 Oct: "a first page that sees what the computer needs"): a score for the computer, what needs
// care first, each with the tool that fixes it, and the computer's numbers at a glance. It reads what the other tools
// tell (stats-now, drives-list) and a quick look at the caches (home-caches, electron/tools/home.js). Reads only.
const st = { now: null, drives: null, caches: null, at: 0, busy: false, err: '' }

async function load(ctx) {
  if (st.busy) return
  st.busy = true; ctx.draw()
  const got = await Promise.allSettled([ctx.call('stats-now'), ctx.call('drives-list'), ctx.call('home-caches')])
  st.now = got[0].status === 'fulfilled' ? got[0].value : st.now
  st.drives = got[1].status === 'fulfilled' ? got[1].value?.drives || [] : st.drives
  st.caches = got[2].status === 'fulfilled' ? got[2].value : st.caches
  st.err = got.every((g) => g.status === 'rejected') ? ctx.err(got[0].reason) : ''
  st.at = Date.now(); st.busy = false
  if (ctx.S.mode === 'home') ctx.draw()
}

const GB = 1e9
/* what needs care, most urgent first: { level: bad|warn|ok, icon, title, text, vars, tool, action } */
export function findings(now, drives, caches, update) {
  const out = []
  const boot = now?.drives?.find((d) => d.mount === '/' || /^[a-z]:\\?$/i.test(d.mount || ''))
  if (boot?.total) {
    const free = boot.free / boot.total
    if (free < 0.1) out.push({ level: 'bad', icon: 'pie', title: 'The start-up disk is nearly full', text: 'Only {a} free. Below 10% the computer slows down and programs can stop.', vars: { a: boot.free }, tool: 'space', action: 'Find what fills it' })
    else if (free < 0.2) out.push({ level: 'warn', icon: 'pie', title: 'The start-up disk is filling up', text: '{a} free. A look at the Space map shows where it went.', vars: { a: boot.free }, tool: 'space', action: 'Space map' })
  }
  for (const d of drives || []) {
    if (d.health === 'failing') out.push({ level: 'bad', icon: 'drive', title: 'A drive is failing', text: '{a} reports it is failing. Copy what is on it to another drive now.', vars: { a: d.mounts?.[0]?.name || d.name }, tool: 'drives', action: 'Drive health' })
    else if (d.health === 'warning') out.push({ level: 'warn', icon: 'drive', title: 'A drive has a warning', text: '{a} reports a problem. Worth a backup and a check.', vars: { a: d.mounts?.[0]?.name || d.name }, tool: 'drives', action: 'Drive health' })
    else if (!d.startup && d.size && d.free / d.size < 0.1) out.push({ level: 'warn', icon: 'drive', title: 'A drive is almost full', text: '{a} has {b} free.', vars: { a: d.mounts?.[0]?.name || d.name, b: d.free }, tool: 'drives', action: 'Drive health' })
  }
  if (caches?.total > 50 * GB) out.push({ level: 'warn', icon: 'broom', title: 'Caches can be cleared', text: '{a} of caches, most of it {b}. The programs make them again when they need them.', vars: { a: caches.total, b: caches.top?.[0]?.name || '' }, tool: 'clean', action: 'Clean up' })
  else if (caches?.total > 10 * GB) out.push({ level: 'ok', icon: 'broom', title: 'Some room in the caches', text: '{a} of caches could be cleared.', vars: { a: caches.total }, tool: 'clean', action: 'Clean up' })
  const p = now?.mem?.pressure
  if (p === 'critical') out.push({ level: 'bad', icon: 'chip', title: 'Memory is full', text: 'The computer is out of memory: close some programs.', tool: 'stats', action: 'See what uses it' })
  else if (p === 'warning') out.push({ level: 'warn', icon: 'chip', title: 'Memory is under pressure', text: 'Programs are squeezing the memory; the computer may feel slow.', tool: 'stats', action: 'See what uses it' })
  const th = now?.therm?.state
  if (th === 'critical' || th === 'serious') out.push({ level: th === 'critical' ? 'bad' : 'warn', icon: 'pulse', title: 'The computer is hot', text: 'It slows itself down to cool off. Give it air; close what works hard.', tool: 'stats', action: 'Computer stats' })
  const bat = now?.battery
  if (bat?.health != null && bat.health < 80) out.push({ level: 'warn', icon: 'pulse', title: 'The battery is worn', text: 'It holds {a}% of its first charge: worth a service.', vars: { a: bat.health + '' }, tool: 'stats', action: 'Computer stats' })
  if (update === 'ready') out.push({ level: 'ok', icon: 'out', title: 'A new version is ready', text: 'Restart the app to have it.', tool: 'update', action: 'Restart to update' })
  const rank = { bad: 0, warn: 1, ok: 2 }
  return out.sort((a, b) => rank[a.level] - rank[b.level])
}
/* a score out of 100 from what was found */
export function score(list) {
  const cost = { bad: 25, warn: 9, ok: 2 }
  return Math.max(5, 100 - list.reduce((n, f) => n + cost[f.level], 0))
}
const verdict = (n) => (n >= 90 ? 'in great shape' : n >= 75 ? 'in good shape' : n >= 50 ? 'in need of some care' : 'in need of care now')

/* numbers that count up to their value when they appear */
function countUp(el, to, fmt) {
  const t0 = performance.now(), from = 0, ms = 900
  const step = (t) => {
    const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3)
    el.textContent = fmt(from + (to - from) * e)
    if (k < 1 && el.isConnected) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
  return el
}

function view(ctx) {
  const { h, t, bytes } = ctx
  if (!st.at && !st.busy) load(ctx)
  else if (st.at && Date.now() - st.at > 60e3 && !st.busy) load(ctx)
  const list = st.at ? findings(st.now, st.drives, st.caches, ctx.S.update?.status) : []
  const sc = score(list)
  const words = (f) => t(f.text, Object.fromEntries(Object.entries(f.vars || {}).map(([k, v]) => [k, typeof v === 'number' ? bytes(v) : t(v)])))
  const go = (f) => { if (f.tool === 'update') return ctx.T.update?.install(); ctx.S.mode = f.tool; ctx.S.view = 'home'; ctx.draw() }

  // the score as a ring that fills when the page opens
  const R = 52, C = 2 * Math.PI * R
  const ring = h('div', { class: 'ov-ring' + (st.at ? '' : ' wait'), style: { '--k': st.at ? sc / 100 : 0, '--C': C } })
  ring.innerHTML = `<svg viewBox="0 0 120 120"><circle class="t" cx="60" cy="60" r="${R}"/><circle class="p" cx="60" cy="60" r="${R}" stroke-dasharray="${C}" stroke-dashoffset="${C}"/></svg>`
  const num = h('b', {}, st.at ? '0' : '…')
  ring.append(num)
  if (st.at) { countUp(num, sc, (v) => String(Math.round(v))); requestAnimationFrame(() => ring.querySelector('.p').style.strokeDashoffset = String(C * (1 - sc / 100))) }
  const model = st.now?.machine?.model || t('This computer')
  const hero = h('section', { class: 'ov-hero' }, ring,
    h('div', { class: 'ov-head' },
      h('small', {}, model + (st.now?.machine?.chip ? ' · ' + st.now.machine.chip : '')),
      h('h1', { html: st.at ? t('Your computer is <b>{a}</b>.', { a: t(verdict(sc)) }) : t('Having a <b>look</b>…') }),
      h('p', {}, st.at ? (list.filter((f) => f.level !== 'ok').length ? t('{n} things need a look. Each has the tool that sorts it out.', { n: list.filter((f) => f.level !== 'ok').length }) : t('Nothing needs you right now.')) : t('The disks, the memory, the heat and the caches, in a few seconds.')),
      h('div', { class: 'ov-acts' },
        h('button', { class: 'btn', disabled: st.busy, onclick: () => load(ctx) }, ctx.ico('search'), st.busy ? t('Looking…') : t('Look again')),
        st.at ? h('span', { class: 'chip' }, t('Checked {a}', { a: new Date(st.at).toLocaleTimeString(ctx.S.lang === 'el' ? 'el-GR' : 'en-GB', { hour: '2-digit', minute: '2-digit' }) })) : null)))

  const COL = { bad: 'var(--acc)', warn: 'var(--warn)', ok: 'var(--ok)' }
  const cards = list.length
    ? h('section', { class: 'ov-cards' }, ...list.map((f, i) => h('div', { class: 'ov-card lvl-' + f.level, style: { '--c': COL[f.level], '--i': i } },
      h('span', { class: 'ov-ic', html: ctx.I[f.icon] || ctx.I.done }),
      h('div', { class: 'ov-txt' }, h('b', {}, t(f.title)), h('small', {}, words(f))),
      h('button', { class: f.level === 'bad' ? 'btn main' : 'btn', onclick: () => go(f) }, t(f.action)))))
    : st.at ? h('section', { class: 'ov-cards' }, h('div', { class: 'ov-card lvl-ok', style: { '--c': 'var(--ok)', '--i': 0 } }, h('span', { class: 'ov-ic', html: ctx.I.done }),
      h('div', { class: 'ov-txt' }, h('b', {}, t('All good')), h('small', {}, t('Disks, memory, heat and caches are fine.'))))) : null

  // the numbers at a glance
  const n = st.now
  const boot = n?.drives?.find((d) => d.mount === '/') || n?.drives?.[0]
  const tile = (label, value, sub, pct, tool, i) => h('button', { class: 'ov-tile', style: { '--i': i }, onclick: () => { ctx.S.mode = tool; ctx.S.view = 'home'; ctx.draw() } },
    h('small', {}, t(label)), h('b', {}, value), sub ? h('span', {}, sub) : null,
    pct != null ? h('i', { class: 'ov-bar' }, h('em', { style: { width: Math.max(2, Math.min(100, pct)) + '%' } })) : null)
  const tiles = n ? h('section', { class: 'ov-tiles' },
    boot ? tile('Start-up disk', bytes(boot.free), t('free of {a}', { a: bytes(boot.total) }), (1 - boot.free / boot.total) * 100, 'space', 0) : null,
    n.mem ? tile('Memory', Math.round((n.mem.used / n.mem.total) * 100) + '%', t('in use'), (n.mem.used / n.mem.total) * 100, 'stats', 1) : null,
    n.cpu ? tile('Processor', Math.round(n.cpu.total) + '%', t('busy now'), n.cpu.total, 'stats', 2) : null,
    st.caches ? tile('Caches', bytes(st.caches.total), st.caches.partial ? t('at least') : t('to clear'), null, 'clean', 3) : null,
    st.drives ? tile('Drives', String(st.drives.length), t('connected'), null, 'drives', 4) : null,
    n.battery?.percent != null ? tile('Battery', n.battery.percent + '%', n.battery.health != null ? t('health {a}%', { a: n.battery.health }) : '', n.battery.percent, 'stats', 5) : null) : null

  // the tools a shoot needs most, one click away
  const QUICK = [['copy', 'Make a twin', 'shield'], ['report', 'Media report', 'list'], ['clipcheck', 'Clip check', 'pulse'], ['speed', 'Disk speed test', 'gauge'], ['twins', 'Find twins', 'twins'], ['vault', 'Vault', 'lock']]
  const quick = h('section', { class: 'ov-quick' }, h('h3', {}, t('Jump to')),
    h('div', { class: 'ov-q' }, ...QUICK.map(([id, label, icon], i) => h('button', { class: 'ov-qb', 'data-tool': id, style: { '--i': i }, onclick: () => { ctx.S.mode = id; ctx.S.view = 'home'; ctx.draw() } },
      h('span', { class: 'tile-ic', 'data-tool': id, html: ctx.I[icon] }), h('span', {}, t(label))))))

  return h('main', {}, h('div', { class: 'ov' }, hero, st.err ? h('p', { class: 'note' }, st.err) : null, cards, tiles, quick))
}

export default {
  id: 'home',
  el: {
    'This computer': 'Αυτός ο υπολογιστής', 'Your computer is <b>{a}</b>.': 'Ο υπολογιστής σου είναι <b>{a}</b>.',
    'in great shape': 'σε άριστη κατάσταση', 'in good shape': 'σε καλή κατάσταση', 'in need of some care': 'σε κατάσταση που θέλει λίγη φροντίδα', 'in need of care now': 'σε κατάσταση που θέλει φροντίδα τώρα',
    'Having a <b>look</b>…': 'Ρίχνω μια <b>ματιά</b>…', '{n} things need a look. Each has the tool that sorts it out.': '{n} πράγματα θέλουν μια ματιά. Το καθένα έχει το εργαλείο που το φτιάχνει.',
    'Nothing needs you right now.': 'Τίποτα δεν σε χρειάζεται αυτή τη στιγμή.', 'The disks, the memory, the heat and the caches, in a few seconds.': 'Οι δίσκοι, η μνήμη, η ζέστη και τα cache, σε λίγα δευτερόλεπτα.',
    'Look again': 'Κοίτα ξανά', 'Looking…': 'Κοιτάζει…', 'Checked {a}': 'Ελέγχθηκε {a}',
    'The start-up disk is nearly full': 'Ο δίσκος εκκίνησης σχεδόν γέμισε', 'Only {a} free. Below 10% the computer slows down and programs can stop.': 'Μόνο {a} ελεύθερα. Κάτω από 10% ο υπολογιστής αργεί και τα προγράμματα μπορεί να σταματήσουν.',
    'Find what fills it': 'Βρες τι τον γεμίζει', 'The start-up disk is filling up': 'Ο δίσκος εκκίνησης γεμίζει', '{a} free. A look at the Space map shows where it went.': '{a} ελεύθερα. Ο Χάρτης χώρου δείχνει πού πήγε ο χώρος.',
    'A drive is failing': 'Ένας δίσκος χαλάει', '{a} reports it is failing. Copy what is on it to another drive now.': 'Ο δίσκος {a} δηλώνει ότι χαλάει. Αντίγραψε ό,τι έχει σε άλλο δίσκο τώρα.',
    'A drive has a warning': 'Ένας δίσκος έχει προειδοποίηση', '{a} reports a problem. Worth a backup and a check.': 'Ο δίσκος {a} δηλώνει πρόβλημα. Αξίζει ένα backup και ένας έλεγχος.',
    'A drive is almost full': 'Ένας δίσκος σχεδόν γέμισε', '{a} has {b} free.': 'Ο δίσκος {a} έχει {b} ελεύθερα.',
    'Caches can be cleared': 'Τα cache μπορούν να καθαριστούν', '{a} of caches, most of it {b}. The programs make them again when they need them.': '{a} σε cache, τα περισσότερα από {b}. Τα προγράμματα τα ξαναφτιάχνουν όταν τα χρειαστούν.',
    'Some room in the caches': 'Λίγος χώρος στα cache', '{a} of caches could be cleared.': '{a} σε cache μπορούν να καθαριστούν.',
    'Memory is full': 'Η μνήμη γέμισε', 'The computer is out of memory: close some programs.': 'Ο υπολογιστής έμεινε από μνήμη: κλείσε κάποια προγράμματα.',
    'Memory is under pressure': 'Η μνήμη πιέζεται', 'Programs are squeezing the memory; the computer may feel slow.': 'Τα προγράμματα πιέζουν τη μνήμη· ο υπολογιστής μπορεί να αργεί.',
    'See what uses it': 'Δες τι τη χρησιμοποιεί', 'The computer is hot': 'Ο υπολογιστής ζεστάθηκε', 'It slows itself down to cool off. Give it air; close what works hard.': 'Κόβει ταχύτητα για να κρυώσει. Δώσ\' του αέρα· κλείσε ό,τι δουλεύει πολύ.',
    'The battery is worn': 'Η μπαταρία έχει φθαρεί', 'It holds {a}% of its first charge: worth a service.': 'Κρατάει το {a}% της αρχικής της χωρητικότητας: αξίζει ένα service.',
    'A new version is ready': 'Μια νέα έκδοση είναι έτοιμη', 'Restart the app to have it.': 'Ξανάνοιξε την εφαρμογή για να την πάρεις.',
    'All good': 'Όλα καλά', 'Disks, memory, heat and caches are fine.': 'Δίσκοι, μνήμη, ζέστη και cache είναι εντάξει.',
    'Start-up disk': 'Δίσκος εκκίνησης', 'free of {a}': 'ελεύθερα από {a}', 'Memory': 'Μνήμη', 'in use': 'σε χρήση', 'Processor': 'Επεξεργαστής', 'busy now': 'απασχολημένος τώρα',
    'Caches': 'Cache', 'at least': 'τουλάχιστον', 'to clear': 'για καθάρισμα', 'Drives': 'Δίσκοι', 'connected': 'συνδεδεμένοι', 'Battery': 'Μπαταρία', 'health {a}%': 'υγεία {a}%',
    'Jump to': 'Πήγαινε σε', 'Overview': 'Επισκόπηση',
  },
  view,
  demo: {
    'home-caches': async () => { await new Promise((r) => setTimeout(r, 500)); return { at: Date.now(), total: 64.2e9, top: [{ id: 'resolve', name: 'DaVinci Resolve render cache', size: 38.1e9 }, { id: 'adobe-media', name: 'Adobe media cache', size: 17.4e9 }], partial: false } },
  },
}
