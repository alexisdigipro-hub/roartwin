// Disk speed test (Alex, 28 Oct): a drive's write and read speed as two gauges, then "Will it play?": which codecs and
// frame sizes it can record and play at 25p. The Mac/Windows side is electron/tools/speed.js.
let dir = '', gb = 2, run = null, result = null

const nice = (v) => { const steps = [500, 1000, 2000, 3000, 5000, 8000]; return steps.find((s) => s >= v) || Math.ceil(v / 1000) * 1000 }
function gauge(ctx, label, mbps, scale, active) {
  const { h, t } = ctx
  const f = Math.max(0, Math.min(1, (mbps || 0) / scale))
  const R = 80, C = Math.PI * R
  const box = h('div', { class: 'sp-g' + (active ? ' on' : '') })
  box.innerHTML = `<svg viewBox="0 0 200 116" aria-hidden="true"><path class="t" d="M20 100a80 80 0 0 1 160 0"/><path class="p" d="M20 100a80 80 0 0 1 160 0" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - f)).toFixed(1)}"/></svg>`
  box.append(h('div', { class: 'sp-n' }, h('b', {}, mbps ? Math.round(mbps).toLocaleString('en-US') : '–'), h('small', {}, 'MB/s')), h('div', { class: 'sp-l' }, t(label)))
  return box
}

async function start(ctx) {
  if (!dir || run) return
  run = { phase: 'write', done: 0, total: gb * 1e9, w: 0, r: 0 }
  result = null
  ctx.busy(true)
  let last = 0
  const off = ctx.on('speed-tick', (k) => {
    if (!run) return
    run.phase = k.phase; run.done = k.done; run.total = k.total
    if (k.phase === 'write') run.w = k.mbps; else run.r = k.mbps
    if (Date.now() - last > 200) { last = Date.now(); ctx.draw() }
  })
  try {
    const r = await ctx.call('speed-run', { path: dir, gb })
    if (r?.stopped) ctx.toast(ctx.t('Test stopped. Its file was removed.'))
    else result = r
  } catch (e) { ctx.toast(ctx.err(e)) } finally { off?.(); run = null; ctx.busy(false) }
}

function table(ctx, r) {
  const { h, t } = ctx
  const head = h('div', { class: 'sp-row sp-head' }, h('span', {}, t('Codec')), ...r.table.sizes.map((s) => h('span', {}, s)))
  const cell = (need) => {
    const w = r.write >= need * 1.1, rd = r.read >= need * 1.1
    const c = w && rd ? 'ok' : !w && !rd ? 'no' : 'half'
    return h('span', { class: 'sp-c ' + c, title: t('Needs {n} MB/s · record {a} · play {b}', { n: need, a: w ? '✓' : '✗', b: rd ? '✓' : '✗' }) },
      h('b', {}, need >= 100 ? Math.round(need) : need), h('small', {}, (w ? '●' : '○') + (rd ? '●' : '○')))
  }
  return h('section', { class: 'group sp-table' },
    h('div', { class: 'g-head' }, h('span', { class: 'g-t' }, t('Will it play?')), h('span', { class: 'g-s' }, t('MB/s each codec needs at 25p · ● record ● play'))),
    h('div', { class: 'sp-grid' }, head, ...r.table.rows.map((row) => h('div', { class: 'sp-row' }, h('span', { class: 'sp-k' }, row.codec), ...row.rates.map(cell)))))
}

// the best it can do, in words: the heaviest ProRes (or BRAW) at the biggest size it both records and plays
function verdict(ctx, r) {
  const { t } = ctx
  const fit = (row, i) => r.write >= row.rates[i] * 1.1 && r.read >= row.rates[i] * 1.1
  for (let i = r.table.sizes.length - 1; i >= 0; i--) {
    const pr = [...r.table.rows].filter((x) => x.codec.startsWith('ProRes')).reverse().find((x) => fit(x, i))
    if (pr) return t('Good for {c} at {s}, recording and playing.', { c: pr.codec, s: r.table.sizes[i] })
  }
  return t('Too slow for ProRes editing; fine for delivery files.')
}

export default {
  id: 'speed',
  top: (ctx) => [ctx.h('div', { class: 'title' }, ctx.t('Disk speed test')), ctx.h('div', { class: 'spacer' }),
    run ? ctx.h('button', { class: 'btn', onclick: () => ctx.stop() }, ctx.ico('stop'), ctx.h('span', { class: 'lbl' }, ctx.t('Stop'))) : null].filter(Boolean),
  view(ctx) {
    const { h, t } = ctx
    const pick = async (paths) => { const p = paths?.[0]; if (!p) return; if (!(await ctx.isFolder(p))) return ctx.toast(t('Choose a drive or a folder.')); dir = p; result = null; ctx.draw() }
    const w = run ? run.w : result?.write, rd = run ? (run.phase === 'read' ? run.r : 0) : result?.read
    const scale = nice(Math.max(w || 0, rd || 0, result?.writePeak || 0, result?.readPeak || 0, 400) * 1.15)
    const frac = run ? (run.phase === 'write' ? 0 : 0.5) + (run.total ? run.done / run.total : 0) / 2 : 0
    return h('main', {}, h('div', { class: 'home' }, h('div', { class: 'card sp' },
      h('div', { class: 'hero' }, h('h1', { html: t('How <b>fast</b> is this drive?') }),
        h('p', {}, t('RoarTwin writes a test file, reads it back and removes it, then shows which codecs the drive can record and play.'))),
      ctx.dropOn(h('div', { class: 'drop' + (dir ? ' set' : '') }, h('div', { class: 'dz-i', html: ctx.I.drive }), h('b', {}, t('The drive to test')), h('small', {}, t('Drop a drive or a folder on it, or choose one.')),
        dir ? h('span', { class: 'root', title: dir }, ctx.ico('folder'), h('span', {}, dir), run ? null : h('button', { 'aria-label': t('Remove'), html: ctx.I.x, onclick: () => { dir = ''; result = null; ctx.draw() } })) : null,
        run ? null : h('button', { class: 'btn', onclick: async () => pick(await ctx.pick()) }, ctx.ico('plus'), dir ? t('Choose another…') : t('Choose…'))), run ? () => {} : pick),
      h('div', { class: 'sp-gauges' }, gauge(ctx, 'Write', w, scale, run?.phase === 'write'), gauge(ctx, 'Read', rd, scale, run?.phase === 'read')),
      run ? h('div', { class: 'sp-prog' }, h('div', { class: 'dh-bar' }, h('i', { style: { width: (frac * 100).toFixed(1) + '%' } })),
        h('small', {}, run.phase === 'write' ? t('Writing {a} of {b}', { a: ctx.bytes(run.done), b: ctx.bytes(run.total) }) : t('Reading {a} of {b}', { a: ctx.bytes(run.done), b: ctx.bytes(run.total) }))) : null,
      run ? null : h('div', { class: 'opts' }, h('div', { class: 'opt' }, h('span', {}, h('b', {}, t('Test file')), h('small', {}, t('Bigger is truer, and takes longer.'))),
        ctx.seg([[1, '1 GB'], [2, '2 GB'], [5, '5 GB']], gb, (v) => { gb = v; ctx.draw() }))),
      run ? null : h('div', { class: 'go' }, h('button', { class: 'btn main big', disabled: !dir, onclick: () => start(ctx) }, ctx.ico('pulse'), result ? t('Test again') : t('Start the test'))),
      result ? h('p', { class: 'sp-say' }, verdict(ctx, result)) : null,
      result ? table(ctx, result) : null,
      h('p', { class: 'note' }, t('The read can come partly from the computer\'s memory, so it may look faster than the drive. A bigger test file gives a truer figure.')))))
  },
  el: {
    'How <b>fast</b> is this drive?': 'Πόσο <b>γρήγορος</b> είναι ο δίσκος;',
    'RoarTwin writes a test file, reads it back and removes it, then shows which codecs the drive can record and play.': 'Το RoarTwin γράφει ένα δοκιμαστικό αρχείο, το ξαναδιαβάζει και το σβήνει, και μετά δείχνει ποια codecs μπορεί να γράψει και να παίξει ο δίσκος.',
    'The drive to test': 'Ο δίσκος για το τεστ', 'Drop a drive or a folder on it, or choose one.': 'Ρίξε εδώ έναν δίσκο ή φάκελο, ή διάλεξε έναν.',
    'Write': 'Εγγραφή', 'Read': 'Ανάγνωση', 'Writing {a} of {b}': 'Γράφει {a} από {b}', 'Reading {a} of {b}': 'Διαβάζει {a} από {b}',
    'Test file': 'Δοκιμαστικό αρχείο', 'Bigger is truer, and takes longer.': 'Όσο μεγαλύτερο, τόσο πιο αληθινό, και αργεί περισσότερο.',
    'Start the test': 'Ξεκίνα το τεστ', 'Test again': 'Ξανά το τεστ', 'Test stopped. Its file was removed.': 'Το τεστ σταμάτησε. Το αρχείο του σβήστηκε.',
    'Codec': 'Codec', 'Will it play?': 'Θα παίξει;', 'MB/s each codec needs at 25p · ● record ● play': 'MB/s που θέλει κάθε codec στα 25p · ● εγγραφή ● αναπαραγωγή',
    'Needs {n} MB/s · record {a} · play {b}': 'Θέλει {n} MB/s · εγγραφή {a} · αναπαραγωγή {b}',
    'Good for {c} at {s}, recording and playing.': 'Κάνει για {c} σε {s}, για εγγραφή και αναπαραγωγή.',
    'Too slow for ProRes editing; fine for delivery files.': 'Πολύ αργός για μοντάζ σε ProRes· κάνει για αρχεία παράδοσης.',
    "The read can come partly from the computer's memory, so it may look faster than the drive. A bigger test file gives a truer figure.": 'Η ανάγνωση μπορεί να έρθει εν μέρει από τη μνήμη του υπολογιστή, οπότε να φαίνεται πιο γρήγορη από τον δίσκο. Μεγαλύτερο δοκιμαστικό αρχείο δίνει πιο αληθινό νούμερο.',
  },
  demo: {
    'speed-run': async ({ gb: g }, emit) => {
      const total = (g || 2) * 1e9, wait = (ms) => new Promise((r) => setTimeout(r, ms))
      for (let i = 1; i <= 10; i++) { await wait(90); emit('speed-tick', { phase: 'write', done: total * i / 10, total, mbps: 880 + i * 12 }) }
      for (let i = 1; i <= 10; i++) { await wait(90); emit('speed-tick', { phase: 'read', done: total * i / 10, total, mbps: 960 + i * 8 }) }
      const sizes = [['HD', 1920, 1080], ['UHD', 3840, 2160], ['6K', 6144, 3456], ['8K', 7680, 4320]], px = (w, h) => w * h
      const pr = { 'ProRes 422 Proxy': 38, 'ProRes 422 LT': 85, 'ProRes 422': 122, 'ProRes 422 HQ': 184, 'ProRes 4444': 275 }
      const rows = [
        ...Object.entries(pr).map(([c, m]) => ({ codec: c, rates: sizes.map(([, w, h]) => Math.round(m / 8 * px(w, h) / px(1920, 1080) * 10) / 10) })),
        ...Object.entries({ 'BRAW Q0': 2.5, 'BRAW 3:1': 3, 'BRAW 5:1': 5, 'BRAW 8:1': 8, 'BRAW 12:1': 12 }).map(([c, r]) => ({ codec: c, rates: sizes.map(([, w, h]) => Math.round(px(w, h) * 1.5 / r * 25 / 1e5) / 10) })),
        { codec: 'H.264 delivery', rates: [3.1, 7.5, 12.5, 18.8] }, { codec: 'H.265 delivery', rates: [1.5, 5, 10, 15] },
      ]
      return { path: '', bytes: total, write: 992, read: 1041, writePeak: 1010, readPeak: 1066, table: { sizes: sizes.map((s) => s[0]), rows } }
    },
  },
}
