// Drive health (Alex, 28 Oct): a tile a drive: its name, kind, health as the drive reports it (SMART), free space, file
// system, and the RoarKit copy on it, with Check it now. The Mac/Windows side is electron/tools/drives.js.
let data = null, loading = false, error = '', ejecting = ''

async function load(ctx) {
  loading = true; error = ''; ctx.draw()
  try { data = await ctx.call('drives-list'); seen = null } catch (e) { error = ctx.err(e) } finally { loading = false; ctx.draw() }
}

/* a drive that comes or goes (Alex, 29 Oct): while this page is open the mounted volumes are looked at every few
   seconds, cheaply, and the list is read again when they change */
let timer = null, seen = null
function watch(ctx) {
  if (timer) return
  timer = setInterval(async () => {
    if (ctx.S.mode !== 'drives' || ctx.S.view !== 'home') { clearInterval(timer); timer = null; return }
    if (loading || ejecting) return
    let now
    try { now = (await ctx.call('drives-mounts')).join('|') } catch { return }
    if (seen != null && now !== seen) load(ctx)
    seen = now
  }, 4000)
}

async function eject(ctx, d) {
  const ok = await ctx.sheet(ctx.t('Eject {n}?', { n: d.name }), ctx.t('Every volume on it is unmounted; then it can be unplugged.'), [[ctx.t('Cancel'), false], [ctx.t('Eject'), true, true]])
  if (!ok) return
  ejecting = d.id; ctx.draw()
  try { await ctx.call('drives-eject', { id: d.id }); ctx.toast(ctx.t('{n} can be unplugged now.', { n: d.name })) } catch (e) { ctx.toast(ctx.err(e)) } finally { ejecting = ''; load(ctx) }
}

const HEALTH = {
  ok: ['Healthy', 'var(--ok)', 'The drive checks itself (SMART) and reports no problem.'],
  failing: ['Failing', 'var(--acc)', 'The drive reports it is failing. Copy what is on it to another drive now.'],
  warning: ['Warning', 'var(--warn)', 'The drive warns it may fail. Copy what matters to another drive and replace it soon.'],
  unknown: ['Health not reported', 'var(--dim)', 'Drives in USB cases and card readers often do not pass their health on. That is usual, not a fault.'],
}

function tile(ctx, d) {
  const { h, t, bytes } = ctx
  const [hl, hc, hw] = HEALTH[d.health] || HEALTH.unknown
  const used = d.size ? Math.min(1, Math.max(0, 1 - d.free / d.size)) : 0
  const low = lowOf(d)
  const main = d.mounts[0]
  const canEject = d.ejectable && !d.startup && ctx.platform !== 'win32'
  return h('section', { class: 'group dh' + (d.health === 'failing' ? ' bad' : d.health === 'warning' ? ' warn' : '') },
    h('div', { class: 'g-head' },
      h('span', { class: 'dh-i', html: ctx.I.drive || ctx.I.folder }),
      h('span', { class: 'g-t dh-name', title: d.name }, d.name),
      h('span', { class: 'chip' }, d.kind === 'image' ? t('Disk image') : d.kind === 'internal' ? t('Internal') : t('External')),
      d.startup ? h('span', { class: 'chip' }, t('Start-up disk')) : null,
      d.bus && d.kind !== 'image' ? h('span', { class: 'chip' }, d.bus) : null,
      d.kind !== 'image' ? h('span', { class: 'chip' }, d.ssd ? 'SSD' : t('Hard drive')) : null,
      h('span', { class: 'spacer' }),
      main ? h('button', { class: 'ib sm', title: ctx.revealLabel(), 'aria-label': ctx.revealLabel() + ': ' + d.name, html: ctx.I.reveal, onclick: () => ctx.reveal(main.path) }) : null,
      // eject safely (Alex, 29 Oct): a drive or a disk image outside the computer, never the start-up disk
      canEject ? h('button', { class: 'btn dh-eject', disabled: !!ejecting, onclick: () => eject(ctx, d) }, h('span', { html: EJECT, 'aria-hidden': 'true' }), ejecting === d.id ? t('Ejecting…') : t('Eject')) : null),
    h('div', { class: 'dh-body' },
      h('div', { class: 'dh-health' },
        h('span', { class: 'chip tint', style: { '--c': hc } }, h('i'), t(hl)),
        h('small', {}, t(hw)), d.healthRaw && d.health === 'unknown' ? h('small', { class: 'dh-raw' }, d.healthRaw) : null),
      h('div', { class: 'dh-space' },
        h('div', { class: 'dh-bar' + (low ? ' low' : '') }, h('i', { style: { width: (used * 100).toFixed(1) + '%' } })),
        h('div', { class: 'dh-nums' }, h('b', {}, t('{a} free', { a: bytes(d.free) })), h('span', {}, t('of {b}', { b: bytes(d.size) })),
          low ? h('span', { class: 'chip tint', style: { '--c': 'var(--warn)', height: '22px' } }, h('i'), t('Almost full')) : null,
          h('span', { class: 'dh-pct' }, t('{p}% used', { p: Math.round(used * 100) })))),
      h('div', { class: 'f-meta' },
        ...d.mounts.map((m) => h('span', { class: 'chip', title: m.path }, m.name + (m.fs ? ' · ' + m.fs : ''))),
        d.report ? h('span', { class: 'chip tint', style: { '--c': 'var(--acc)' }, title: d.report.folder }, h('i'), t('Copied and checked on {w}', { w: d.report.when.slice(0, 10) })) : null,
        d.report ? h('button', { class: 'btn dh-check', onclick: () => { Object.assign(ctx.S, { mode: 'backup', bmode: 'report', copyDir: d.report.folder, view: 'home' }); ctx.draw() } }, t('Check it now')) : null)))
}

// over 90% full: a drive this full slows down and leaves no room for a card's copy
const lowOf = (d) => !!d.size && d.free / d.size < 0.1
const EJECT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5 5 13h14z"/><path d="M5 18h14"/></svg>'

export default {
  id: 'drives',
  top: (ctx) => [ctx.h('div', { class: 'title' }, ctx.t('Drive health')), ctx.h('div', { class: 'spacer' }),
    ctx.h('button', { class: 'btn', disabled: loading, onclick: () => load(ctx) }, ctx.ico('search'), ctx.h('span', { class: 'lbl' }, loading ? ctx.t('Looking…') : ctx.t('Refresh')))],
  view(ctx) {
    const { h, t } = ctx
    if (!data && !loading && !error) setTimeout(() => load(ctx))
    watch(ctx)
    const list = data?.drives || []
    const failing = list.filter((d) => d.health === 'failing').length
    const warning = list.filter((d) => d.health === 'warning').length
    const full = list.filter(lowOf).length
    return h('main', {}, h('div', { class: 'res' },
      h('div', { class: 'sum' },
        data ? h('span', { class: 'chip tint', style: { '--c': failing ? 'var(--acc)' : 'var(--ok)' } }, h('i'), failing ? t('{n} failing', { n: ctx.num(failing) }) : t('No drive reports a problem')) : null,
        data && warning ? h('span', { class: 'chip tint', style: { '--c': 'var(--warn)' } }, h('i'), t('{n} warning', { n: ctx.num(warning) })) : null,
        data && full ? h('span', { class: 'chip tint', style: { '--c': 'var(--warn)' } }, h('i'), full === 1 ? t('1 almost full') : t('{n} almost full', { n: ctx.num(full) })) : null,
        data ? h('span', { class: 'chip' }, list.length === 1 ? t('1 drive') : t('{n} drives', { n: ctx.num(list.length) })) : null),
      error ? h('p', { class: 'note' }, error) : null,
      loading && !data ? h('p', { class: 'note' }, t('Looking at the drives…')) : null,
      data && !list.length ? h('p', { class: 'note' }, t('No drives found.')) : null,
      ...list.map((d) => tile(ctx, d)),
      data ? h('p', { class: 'note' }, t('Only read: nothing on a drive is changed. The list follows drives as they come and go.') + (ctx.platform === 'win32' ? ' ' + t('To unplug a drive on Windows, use Safely Remove Hardware in the taskbar.') : '')) : null))
  },
  el: {
    'Internal': 'Εσωτερικός', '1 drive': '1 δίσκος', '{n} drives': '{n} δίσκοι', 'External': 'Εξωτερικός', 'Hard drive': 'Σκληρός δίσκος', 'Healthy': 'Υγιής', 'Failing': 'Χαλάει',
    'Health not reported': 'Δεν αναφέρει υγεία',
    'The drive checks itself (SMART) and reports no problem.': 'Ο δίσκος ελέγχει τον εαυτό του (SMART) και δεν αναφέρει πρόβλημα.',
    'The drive reports it is failing. Copy what is on it to another drive now.': 'Ο δίσκος αναφέρει ότι χαλάει. Αντίγραψε τώρα ό,τι έχει σε άλλον δίσκο.',
    'Drives in USB cases and card readers often do not pass their health on. That is usual, not a fault.': 'Οι δίσκοι σε κουτιά USB και οι αναγνώστες καρτών συχνά δεν δίνουν την υγεία τους. Είναι φυσιολογικό, όχι βλάβη.',
    '{a} free': '{a} ελεύθερα', 'of {b}': 'από {b}', 'Almost full': 'Σχεδόν γεμάτος', 'Copied and checked on {w}': 'Αντιγράφηκε και ελέγχθηκε στις {w}',
    'Check it now': 'Έλεγξέ το τώρα', 'Looking…': 'Ψάχνει…', 'Refresh': 'Ανανέωση', '{n} failing': '{n} χαλάνε', 'No drive reports a problem': 'Κανένας δίσκος δεν αναφέρει πρόβλημα',
    'Looking at the drives…': 'Κοιτάζει τους δίσκους…', 'No drives found.': 'Δεν βρέθηκαν δίσκοι.',
    'Only read: nothing on a drive is changed. The list follows drives as they come and go.': 'Μόνο ανάγνωση: τίποτα δεν αλλάζει σε κανέναν δίσκο. Η λίστα ακολουθεί τους δίσκους όπως μπαίνουν και βγαίνουν.',
    'To unplug a drive on Windows, use Safely Remove Hardware in the taskbar.': 'Για να βγάλεις δίσκο στα Windows, πάτα Ασφαλής κατάργηση υλικού στη γραμμή εργασιών.',
    'Warning': 'Προειδοποίηση', 'The drive warns it may fail. Copy what matters to another drive and replace it soon.': 'Ο δίσκος προειδοποιεί ότι μπορεί να χαλάσει. Αντίγραψε ό,τι μετράει σε άλλον δίσκο και άλλαξέ τον σύντομα.',
    'Disk image': 'Εικόνα δίσκου', 'Start-up disk': 'Δίσκος εκκίνησης', 'Eject': 'Εξαγωγή', 'Ejecting…': 'Εξάγεται…',
    'Eject {n}?': 'Εξαγωγή του {n};', 'Every volume on it is unmounted; then it can be unplugged.': 'Αποσυνδέεται κάθε τόμος του· μετά μπορεί να βγει από την πρίζα.',
    '{n} can be unplugged now.': 'Το {n} μπορεί να βγει τώρα.', '{p}% used': '{p}% γεμάτος',
    '{n} warning': '{n} με προειδοποίηση', '1 almost full': '1 σχεδόν γεμάτος', '{n} almost full': '{n} σχεδόν γεμάτοι',
    'This drive cannot be ejected from here.': 'Αυτός ο δίσκος δεν βγαίνει από εδώ.', 'On Windows, use Safely Remove Hardware in the taskbar.': 'Στα Windows, πάτα Ασφαλής κατάργηση υλικού στη γραμμή εργασιών.',
    'Something is still using this drive. Close what has files open on it and try again.': 'Κάτι χρησιμοποιεί ακόμα τον δίσκο. Κλείσε ό,τι έχει ανοιχτά αρχεία του και ξαναδοκίμασε.',
    'The drive could not be ejected.': 'Ο δίσκος δεν μπόρεσε να βγει.',
  },
  demo: {
    'drives-list': async () => {
      await new Promise((r) => setTimeout(r, 300))
      return { at: Date.now(), drives: [
        { id: 'disk0', name: 'APPLE SSD AP2048Z', kind: 'internal', bus: 'Apple Fabric', ssd: true, size: 2e12, free: 412e9, fs: 'APFS', health: 'ok', healthRaw: 'Verified', startup: true, ejectable: false, mounts: [{ path: '/', name: 'Macintosh HD', fs: 'APFS' }], report: null },
        { id: 'disk4', name: 'Samsung PSSD T7 Shield', kind: 'external', bus: 'USB', ssd: true, size: 4e12, free: 0.31e12, fs: 'ExFAT', health: 'unknown', healthRaw: 'Not Supported', ejectable: true, mounts: [{ path: '/Volumes/SHUTTLE 1', name: 'SHUTTLE 1', fs: 'ExFAT' }], report: { when: '2026-10-25 11:40', folder: '/Volumes/SHUTTLE 1/2026-10-25_Fakinos/Day01/CamA_Card03', path: '' } },
        { id: 'disk5', name: 'LaCie Rugged RAID Pro', kind: 'external', bus: 'Thunderbolt', ssd: false, size: 8e12, free: 5.2e12, fs: 'Mac OS Extended (Journaled)', health: 'ok', healthRaw: 'Verified', ejectable: true, mounts: [{ path: '/Volumes/ARCHIVE 2026', name: 'ARCHIVE 2026', fs: 'Mac OS Extended (Journaled)' }], report: { when: '2026-09-12 18:02', folder: '/Volumes/ARCHIVE 2026/CARD_A', path: '' } },
        { id: 'disk6', name: 'WDC WD40EFRX', kind: 'external', bus: 'SATA', ssd: false, size: 4e12, free: 0.1e12, fs: 'Mac OS Extended (Journaled)', health: 'failing', healthRaw: 'Failing', ejectable: true, mounts: [{ path: '/Volumes/OLD RAID', name: 'OLD RAID', fs: 'Mac OS Extended (Journaled)' }], report: null },
      ] }
    },
    'drives-mounts': async () => ['/', '/Volumes/ARCHIVE 2026', '/Volumes/OLD RAID', '/Volumes/SHUTTLE 1'],
    'drives-eject': async () => { await new Promise((r) => setTimeout(r, 400)); return { ok: true } },
  },
}
