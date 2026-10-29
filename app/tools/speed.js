// Disk speed test (Alex, 28 Oct): a drive's write and read speed as two gauges, then "Will it play?": which codecs and
// frame sizes it can record and play at 25p. The Mac/Windows side is electron/tools/speed.js.
let dir = '', gb = 2, run = null, result = null, long = false

/* every drive's last results (Alex, 29 Oct), kept on this computer: a drive slowing down over the months shows */
const KEEP = 6
const history = (ctx) => ctx.load('speed', 'history', {}) || {}
const keyOf = (p) => String(p || '').replace(/[\\/]+$/, '') || '/'
function remember(ctx, r) {
  const all = history(ctx)
  const k = keyOf(r.path || dir)
  all[k] = [{ at: Date.now(), write: Math.round(r.write), read: Math.round(r.read), settled: r.settled || 0, gb: Math.round((r.bytes || 0) / 1e9 * 10) / 10, long: !!r.sustained }, ...(all[k] || [])].slice(0, KEEP)
  ctx.save('speed', 'history', all)
}

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
  run = { phase: 'write', done: 0, total: long ? 50e9 : gb * 1e9, w: 0, r: 0, samples: [] }
  result = null
  ctx.busy(true)
  let last = 0
  const off = ctx.on('speed-tick', (k) => {
    if (!run) return
    run.phase = k.phase; run.done = k.done; run.total = k.total
    if (k.phase === 'write') { run.w = k.mbps; if (long && k.done < k.total) run.samples.push({ at: k.done, mbps: k.mbps }) } else run.r = k.mbps
    if (Date.now() - last > 200) { last = Date.now(); ctx.draw() }
  })
  try {
    const r = await ctx.call('speed-run', { path: dir, gb, sustained: long })
    if (r?.stopped) ctx.toast(ctx.t('Test stopped. Its file was removed.'))
    else { result = r; remember(ctx, r) }
  } catch (e) { ctx.toast(ctx.err(e)) } finally { off?.(); run = null; ctx.busy(false) }
}

function table(ctx, r) {
  const { h, t } = ctx
  const head = h('div', { class: 'sp-row sp-head' }, h('span', {}, t('Codec')), ...r.table.sizes.map((s) => h('span', {}, s)))
  const wr = r.sustained && r.settled ? Math.min(r.write, r.settled) : r.write
  const cell = (need) => {
    const w = wr >= need * 1.1, rd = r.read >= need * 1.1
    const c = w && rd ? 'ok' : !w && !rd ? 'no' : 'half'
    return h('span', { class: 'sp-c ' + c, title: t('Needs {n} MB/s · record {a} · play {b}', { n: need, a: w ? '✓' : '✗', b: rd ? '✓' : '✗' }) },
      h('b', {}, need >= 100 ? Math.round(need) : need), h('small', {}, (w ? '●' : '○') + (rd ? '●' : '○')))
  }
  return h('section', { class: 'group sp-table' },
    h('div', { class: 'g-head' }, h('span', { class: 'g-t' }, t('Will it play?')), h('span', { class: 'g-s' }, t('MB/s each codec needs at 25p · ● record ● play'))),
    h('div', { class: 'sp-grid' }, head, ...r.table.rows.map((row) => h('div', { class: 'sp-row' }, h('span', { class: 'sp-k' }, row.codec), ...row.rates.map(cell)))))
}

/* the long write as a line: the speed every half second over the gigabytes written, and where it settled */
function curve(ctx, samples, settled, dropAt) {
  const { h, t, bytes } = ctx
  if (!samples?.length) return null
  const W = 600, H = 150, maxX = samples[samples.length - 1].at || 1, maxY = Math.max(...samples.map((x) => x.mbps), settled || 0, 1) * 1.15
  const pt = (x) => `${((x.at / maxX) * W).toFixed(1)},${(H - (x.mbps / maxY) * H).toFixed(1)}`
  const line = samples.map(pt).join(' ')
  const box = h('div', { class: 'sp-curve' })
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H + 4}" preserveAspectRatio="none" aria-hidden="true">` +
    `<polygon class="a" points="0,${H} ${line} ${W},${H}"/><polyline class="l" points="${line}"/>` +
    (settled ? `<line class="s" x1="0" x2="${W}" y1="${(H - (settled / maxY) * H).toFixed(1)}" y2="${(H - (settled / maxY) * H).toFixed(1)}"/>` : '') + '</svg>'
  return h('section', { class: 'group sp-long' },
    h('div', { class: 'g-head' }, h('span', { class: 'g-t' }, t('Long write')),
      h('span', { class: 'g-s' }, settled ? (dropAt ? t('Drops after {a}, then holds {n} MB/s', { a: bytes(dropAt), n: ctx.num(settled) }) : t('Holds {n} MB/s the whole way', { n: ctx.num(settled) })) : t('{a} written', { a: bytes(maxX) }))),
    box)
}

// the drive's past results, newest first
function past(ctx) {
  const { h, t } = ctx
  const list = (history(ctx)[keyOf(dir)] || []).filter((x, i) => !(result && i === 0))
  if (!list.length) return null
  return h('section', { class: 'group sp-past' },
    h('div', { class: 'g-head' }, h('span', { class: 'g-t' }, t('Before on this drive'))),
    h('div', { class: 'files' }, ...list.map((x) => h('div', { class: 'sp-pr' },
      h('span', {}, ctx.dateOf(x.at)), h('span', { class: 'chip' }, t('Write') + ' ' + ctx.num(x.write) + ' MB/s'), h('span', { class: 'chip' }, t('Read') + ' ' + ctx.num(x.read) + ' MB/s'),
      x.long && x.settled ? h('span', { class: 'chip tint', style: { '--c': 'var(--warn)' } }, h('i'), t('Holds {n} MB/s', { n: ctx.num(x.settled) })) : null,
      h('span', { class: 'sp-gb' }, x.long ? t('Long write') : x.gb + ' GB')))))
}

// the best it can do, in words: the heaviest ProRes (or BRAW) at the biggest size it both records and plays; after a
// long write, what it holds once its cache is full counts, not its first burst
function verdict(ctx, r) {
  const { t } = ctx
  const wr = r.sustained && r.settled ? Math.min(r.write, r.settled) : r.write
  const fit = (row, i) => wr >= row.rates[i] * 1.1 && r.read >= row.rates[i] * 1.1
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
        h('p', {}, t('A test file is written, read back and removed; then you see which codecs the drive can record and play.'))),
      ctx.dropOn(h('div', { class: 'drop' + (dir ? ' set' : '') }, h('div', { class: 'dz-i', html: ctx.I.drive }), h('b', {}, t('The drive to test')), h('small', {}, t('Drop a drive or a folder on it, or choose one.')),
        dir ? h('span', { class: 'root', title: dir }, ctx.ico('folder'), h('span', {}, dir), run ? null : h('button', { 'aria-label': t('Remove'), html: ctx.I.x, onclick: () => { dir = ''; result = null; ctx.draw() } })) : null,
        run ? null : h('button', { class: 'btn', onclick: async () => pick(await ctx.pick()) }, ctx.ico('plus'), dir ? t('Choose another…') : t('Choose…'))), run ? () => {} : pick),
      h('div', { class: 'sp-gauges' }, gauge(ctx, 'Write', w, scale, run?.phase === 'write'), gauge(ctx, 'Read', rd, scale, run?.phase === 'read')),
      run ? h('div', { class: 'sp-prog' }, h('div', { class: 'dh-bar' }, h('i', { style: { width: (frac * 100).toFixed(1) + '%' } })),
        h('small', {}, run.phase === 'write' ? t('Writing {a} of {b}', { a: ctx.bytes(run.done), b: ctx.bytes(run.total) }) : t('Reading {a} of {b}', { a: ctx.bytes(run.done), b: ctx.bytes(run.total) }))) : null,
      run ? null : h('div', { class: 'opts' },
        h('div', { class: 'opt' }, h('span', {}, h('b', {}, t('The test')), h('small', {}, long ? t('Up to 90 seconds of writing (or 50 GB): shows the speed an SSD falls to once its fast cache is full, as on a long take.') : t('A quick write and read of one file.'))),
          ctx.seg([[false, t('Quick')], [true, t('Long write')]], long, (v) => { long = v; ctx.draw() })),
        long ? null : h('div', { class: 'opt' }, h('span', {}, h('b', {}, t('Test file')), h('small', {}, t('Bigger is truer, and takes longer.'))),
          ctx.seg([[1, '1 GB'], [2, '2 GB'], [5, '5 GB'], [10, '10 GB']], gb, (v) => { gb = v; ctx.draw() }))),
      run ? null : h('div', { class: 'go' }, h('button', { class: 'btn main big', disabled: !dir, onclick: () => start(ctx) }, ctx.ico('pulse'), result ? t('Test again') : t('Start the test'))),
      run && long ? curve(ctx, run.samples, 0, 0) : null,
      result ? h('p', { class: 'sp-say' }, verdict(ctx, result)) : null,
      result?.sustained ? curve(ctx, result.samples, result.settled, result.dropAt) : null,
      result ? table(ctx, result) : null,
      dir && !run ? past(ctx) : null,
      h('p', { class: 'note' }, t('The read can come partly from the computer\'s memory, so it may look faster than the drive. A bigger test file gives a truer figure.') + ' ' + t('1 MB = 1,000,000 bytes.')))))
  },
  el: {
    'How <b>fast</b> is this drive?': 'Πόσο <b>γρήγορος</b> είναι ο δίσκος;',
    'A test file is written, read back and removed; then you see which codecs the drive can record and play.': 'Γράφεται ένα δοκιμαστικό αρχείο, ξαναδιαβάζεται και σβήνεται· μετά βλέπεις ποια codecs μπορεί να γράψει και να παίξει ο δίσκος.',
    'The drive to test': 'Ο δίσκος για το τεστ', 'Drop a drive or a folder on it, or choose one.': 'Ρίξε εδώ έναν δίσκο ή φάκελο, ή διάλεξε έναν.',
    'Write': 'Εγγραφή', 'Read': 'Ανάγνωση', 'Writing {a} of {b}': 'Γράφει {a} από {b}', 'Reading {a} of {b}': 'Διαβάζει {a} από {b}',
    'Test file': 'Δοκιμαστικό αρχείο', 'Bigger is truer, and takes longer.': 'Όσο μεγαλύτερο, τόσο πιο αληθινό, και αργεί περισσότερο.',
    'Start the test': 'Ξεκίνα το τεστ', 'Test again': 'Ξανά το τεστ', 'Test stopped. Its file was removed.': 'Το τεστ σταμάτησε. Το αρχείο του σβήστηκε.',
    'The test': 'Το τεστ', 'Quick': 'Γρήγορο', 'Long write': 'Μεγάλη εγγραφή',
    'Up to 90 seconds of writing (or 50 GB): shows the speed an SSD falls to once its fast cache is full, as on a long take.': 'Έως 90 δευτερόλεπτα εγγραφής (ή 50 GB): δείχνει πού πέφτει η ταχύτητα ενός SSD όταν γεμίσει η γρήγορη μνήμη του, όπως σε ένα μεγάλο πλάνο.',
    'A quick write and read of one file.': 'Μια γρήγορη εγγραφή και ανάγνωση ενός αρχείου.',
    'Drops after {a}, then holds {n} MB/s': 'Πέφτει μετά από {a}, μετά κρατάει {n} MB/s', 'Holds {n} MB/s the whole way': 'Κρατάει {n} MB/s σε όλη τη διαδρομή',
    '{a} written': 'Γράφτηκαν {a}', 'Before on this drive': 'Παλιότερα σε αυτόν τον δίσκο', 'Holds {n} MB/s': 'Κρατάει {n} MB/s',
    '1 MB = 1,000,000 bytes.': '1 MB = 1.000.000 bytes.',
    'This drive cannot be written to: it is read-only, locked, or the app may not write there.': 'Σε αυτόν τον δίσκο δεν γίνεται εγγραφή: είναι μόνο για ανάγνωση, κλειδωμένος, ή η εφαρμογή δεν έχει άδεια εκεί.',
    'The drive filled up during the test. Free some space and try a smaller test file.': 'Ο δίσκος γέμισε στη διάρκεια του τεστ. Άδειασε λίγο χώρο και δοκίμασε μικρότερο αρχείο.',
    'The drive gave a read or write error during the test. Copy what matters off it.': 'Ο δίσκος έβγαλε σφάλμα ανάγνωσης ή εγγραφής στο τεστ. Αντίγραψε ό,τι μετράει από αυτόν.',
    'The drive is not there any more.': 'Ο δίσκος δεν υπάρχει πια.', 'Not enough free space on this drive for the test.': 'Δεν υπάρχει αρκετός ελεύθερος χώρος στον δίσκο για το τεστ.',
    'Codec': 'Codec', 'Will it play?': 'Θα παίξει;', 'MB/s each codec needs at 25p · ● record ● play': 'MB/s που θέλει κάθε codec στα 25p · ● εγγραφή ● αναπαραγωγή',
    'Needs {n} MB/s · record {a} · play {b}': 'Θέλει {n} MB/s · εγγραφή {a} · αναπαραγωγή {b}',
    'Good for {c} at {s}, recording and playing.': 'Κάνει για {c} σε {s}, για εγγραφή και αναπαραγωγή.',
    'Too slow for ProRes editing; fine for delivery files.': 'Πολύ αργός για μοντάζ σε ProRes· κάνει για αρχεία παράδοσης.',
    "The read can come partly from the computer's memory, so it may look faster than the drive. A bigger test file gives a truer figure.": 'Η ανάγνωση μπορεί να έρθει εν μέρει από τη μνήμη του υπολογιστή, οπότε να φαίνεται πιο γρήγορη από τον δίσκο. Μεγαλύτερο δοκιμαστικό αρχείο δίνει πιο αληθινό νούμερο.',
  },
  demo: {
    'speed-run': async ({ gb: g, sustained }, emit) => {
      const total = sustained ? 50e9 : (g || 2) * 1e9, wait = (ms) => new Promise((r) => setTimeout(r, ms))
      const samples = []
      if (sustained) {
        // a portable SSD: fast for its first 18 GB, then its cache is full
        for (let i = 1; i <= 40; i++) { await wait(40); const at = i * 0.9e9, mbps = at < 18e9 ? 960 + (i % 3) * 14 : 410 + (i % 4) * 9; samples.push({ at, mbps }); emit('speed-tick', { phase: 'write', done: at, total, mbps }) }
      } else for (let i = 1; i <= 10; i++) { await wait(90); emit('speed-tick', { phase: 'write', done: total * i / 10, total, mbps: 880 + i * 12 }) }
      for (let i = 1; i <= 10; i++) { await wait(90); emit('speed-tick', { phase: 'read', done: total * i / 10, total, mbps: 960 + i * 8 }) }
      const sizes = [['HD', 1920, 1080], ['UHD', 3840, 2160], ['6K', 6144, 3456], ['8K', 7680, 4320]], px = (w, h) => w * h
      const pr = { 'ProRes 422 Proxy': 38, 'ProRes 422 LT': 85, 'ProRes 422': 122, 'ProRes 422 HQ': 184, 'ProRes 4444': 275 }
      const rows = [
        ...Object.entries(pr).map(([c, m]) => ({ codec: c, rates: sizes.map(([, w, h]) => Math.round(m / 8 * px(w, h) / px(1920, 1080) * 10) / 10) })),
        ...Object.entries({ 'BRAW Q0': 2.5, 'BRAW 3:1': 3, 'BRAW 5:1': 5, 'BRAW 8:1': 8, 'BRAW 12:1': 12 }).map(([c, r]) => ({ codec: c, rates: sizes.map(([, w, h]) => Math.round(px(w, h) * 1.5 / r * 25 / 1e5) / 10) })),
        { codec: 'H.264 delivery', rates: [3.1, 7.5, 12.5, 18.8] }, { codec: 'H.265 delivery', rates: [1.5, 5, 10, 15] },
      ]
      if (sustained) return { path: '', bytes: 36e9, write: 640, read: 1041, writePeak: 990, readPeak: 1066, sustained: true, samples, settled: 421, dropAt: 18e9, table: { sizes: sizes.map((s) => s[0]), rows } }
      return { path: '', bytes: total, write: 992, read: 1041, writePeak: 1010, readPeak: 1066, table: { sizes: sizes.map((s) => s[0]), rows } }
    },
  },
}
