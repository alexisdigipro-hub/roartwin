// Drive health (Alex, 28 Oct): a tile a drive: its name, kind, health as the drive reports it (SMART), free space, file
// system, and the RoarTwin copy on it, with Check it now. The Mac/Windows side is electron/tools/drives.js.
let data = null, loading = false, error = ''

async function load(ctx) {
  loading = true; error = ''; ctx.draw()
  try { data = await ctx.call('drives-list') } catch (e) { error = ctx.err(e) } finally { loading = false; ctx.draw() }
}

const HEALTH = {
  ok: ['Healthy', 'var(--ok)', 'The drive checks itself (SMART) and reports no problem.'],
  failing: ['Failing', 'var(--acc)', 'The drive reports it is failing. Copy what is on it to another drive now.'],
  unknown: ['Health not reported', 'var(--dim)', 'Drives in USB cases and card readers often do not pass their health on. That is usual, not a fault.'],
}

function tile(ctx, d) {
  const { h, t, bytes } = ctx
  const [hl, hc, hw] = HEALTH[d.health] || HEALTH.unknown
  const used = d.size ? Math.min(1, Math.max(0, 1 - d.free / d.size)) : 0
  const low = d.size && d.free / d.size < 0.1
  const main = d.mounts[0]
  return h('section', { class: 'group dh' + (d.health === 'failing' ? ' bad' : '') },
    h('div', { class: 'g-head' },
      h('span', { class: 'dh-i', html: ctx.I.drive || ctx.I.folder }),
      h('span', { class: 'g-t' }, d.name),
      h('span', { class: 'chip' }, d.kind === 'internal' ? t('Internal') : t('External')),
      d.bus ? h('span', { class: 'chip' }, d.bus) : null,
      h('span', { class: 'chip' }, d.ssd ? 'SSD' : t('Hard drive')),
      h('span', { class: 'spacer' }),
      main ? h('button', { class: 'ib sm', title: ctx.revealLabel(), 'aria-label': ctx.revealLabel() + ': ' + d.name, html: ctx.I.reveal, onclick: () => ctx.reveal(main.path) }) : null),
    h('div', { class: 'dh-body' },
      h('div', { class: 'dh-health' },
        h('span', { class: 'chip tint', style: { '--c': hc } }, h('i'), t(hl)),
        h('small', {}, t(hw)), d.healthRaw && d.health === 'unknown' ? h('small', { class: 'dh-raw' }, d.healthRaw) : null),
      h('div', { class: 'dh-space' },
        h('div', { class: 'dh-bar' + (low ? ' low' : '') }, h('i', { style: { width: (used * 100).toFixed(1) + '%' } })),
        h('div', { class: 'dh-nums' }, h('b', {}, t('{a} free', { a: bytes(d.free) })), h('span', {}, t('of {b}', { b: bytes(d.size) })),
          low ? h('span', { class: 'chip tint', style: { '--c': 'var(--warn)', height: '22px' } }, h('i'), t('Almost full')) : null)),
      h('div', { class: 'f-meta' },
        ...d.mounts.map((m) => h('span', { class: 'chip', title: m.path }, m.name + (m.fs ? ' · ' + m.fs : ''))),
        d.report ? h('span', { class: 'chip tint', style: { '--c': '#64d2ff' }, title: d.report.folder }, h('i'), t('Copied and checked on {w}', { w: d.report.when.slice(0, 10) })) : null,
        d.report ? h('button', { class: 'btn dh-check', onclick: () => { Object.assign(ctx.S, { mode: 'backup', bmode: 'report', copyDir: d.report.folder, view: 'home' }); ctx.draw() } }, t('Check it now')) : null)))
}

export default {
  id: 'drives',
  top: (ctx) => [ctx.h('div', { class: 'title' }, ctx.t('Drive health')), ctx.h('div', { class: 'spacer' }),
    ctx.h('button', { class: 'btn', disabled: loading, onclick: () => load(ctx) }, ctx.ico('search'), ctx.h('span', { class: 'lbl' }, loading ? ctx.t('Looking…') : ctx.t('Refresh')))],
  view(ctx) {
    const { h, t } = ctx
    if (!data && !loading && !error) setTimeout(() => load(ctx))
    const list = data?.drives || []
    const failing = list.filter((d) => d.health === 'failing').length
    return h('main', {}, h('div', { class: 'res' },
      h('div', { class: 'sum' },
        data ? h('span', { class: 'chip tint', style: { '--c': failing ? 'var(--acc)' : 'var(--ok)' } }, h('i'), failing ? t('{n} failing', { n: ctx.num(failing) }) : t('No drive reports a problem')) : null,
        data ? h('span', { class: 'chip' }, list.length === 1 ? t('1 drive') : t('{n} drives', { n: ctx.num(list.length) })) : null),
      error ? h('p', { class: 'note' }, error) : null,
      loading && !data ? h('p', { class: 'note' }, t('Looking at the drives…')) : null,
      data && !list.length ? h('p', { class: 'note' }, t('No drives found.')) : null,
      ...list.map((d) => tile(ctx, d)),
      data ? h('p', { class: 'note' }, t('Only read: nothing on a drive is changed.')) : null))
  },
  el: {
    'Internal': 'Εσωτερικός', '1 drive': '1 δίσκος', '{n} drives': '{n} δίσκοι', 'External': 'Εξωτερικός', 'Hard drive': 'Σκληρός δίσκος', 'Healthy': 'Υγιής', 'Failing': 'Χαλάει',
    'Health not reported': 'Δεν αναφέρει υγεία',
    'The drive checks itself (SMART) and reports no problem.': 'Ο δίσκος ελέγχει τον εαυτό του (SMART) και δεν αναφέρει πρόβλημα.',
    'The drive reports it is failing. Copy what is on it to another drive now.': 'Ο δίσκος αναφέρει ότι χαλάει. Αντίγραψε τώρα ό,τι έχει σε άλλον δίσκο.',
    'Drives in USB cases and card readers often do not pass their health on. That is usual, not a fault.': 'Οι δίσκοι σε κουτιά USB και οι αναγνώστες καρτών συχνά δεν δίνουν την υγεία τους. Είναι φυσιολογικό, όχι βλάβη.',
    '{a} free': '{a} ελεύθερα', 'of {b}': 'από {b}', 'Almost full': 'Σχεδόν γεμάτος', 'Copied and checked on {w}': 'Αντιγράφηκε και ελέγχθηκε στις {w}',
    'Check it now': 'Έλεγξέ το τώρα', 'Looking…': 'Ψάχνει…', 'Refresh': 'Ανανέωση', '{n} failing': '{n} χαλάνε', 'No drive reports a problem': 'Κανένας δίσκος δεν αναφέρει πρόβλημα',
    'Looking at the drives…': 'Κοιτάζει τους δίσκους…', 'No drives found.': 'Δεν βρέθηκαν δίσκοι.', 'Only read: nothing on a drive is changed.': 'Μόνο ανάγνωση: τίποτα δεν αλλάζει σε κανέναν δίσκο.',
  },
  demo: {
    'drives-list': async () => {
      await new Promise((r) => setTimeout(r, 300))
      return { at: Date.now(), drives: [
        { id: 'disk0', name: 'APPLE SSD AP2048Z', kind: 'internal', bus: 'Apple Fabric', ssd: true, size: 2e12, free: 412e9, fs: 'APFS', health: 'ok', healthRaw: 'Verified', mounts: [{ path: '/', name: 'Macintosh HD', fs: 'APFS' }], report: null },
        { id: 'disk4', name: 'Samsung PSSD T7 Shield', kind: 'external', bus: 'USB', ssd: true, size: 4e12, free: 0.31e12, fs: 'ExFAT', health: 'unknown', healthRaw: 'Not Supported', mounts: [{ path: '/Volumes/SHUTTLE 1', name: 'SHUTTLE 1', fs: 'ExFAT' }], report: { when: '2026-10-25 11:40', folder: '/Volumes/SHUTTLE 1/2026-10-25_Fakinos/Day01/CamA_Card03', path: '' } },
        { id: 'disk5', name: 'LaCie Rugged RAID Pro', kind: 'external', bus: 'Thunderbolt', ssd: false, size: 8e12, free: 5.2e12, fs: 'Mac OS Extended (Journaled)', health: 'ok', healthRaw: 'Verified', mounts: [{ path: '/Volumes/ARCHIVE 2026', name: 'ARCHIVE 2026', fs: 'Mac OS Extended (Journaled)' }], report: { when: '2026-09-12 18:02', folder: '/Volumes/ARCHIVE 2026/CARD_A', path: '' } },
        { id: 'disk6', name: 'WDC WD40EFRX', kind: 'external', bus: 'SATA', ssd: false, size: 4e12, free: 0.1e12, fs: 'Mac OS Extended (Journaled)', health: 'failing', healthRaw: 'Failing', mounts: [{ path: '/Volumes/OLD RAID', name: 'OLD RAID', fs: 'Mac OS Extended (Journaled)' }], report: null },
      ] }
    },
  },
}
