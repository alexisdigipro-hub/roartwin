/* Computer stats (Alex, 28 Oct: "important computer statistics, speeds, the speedtest, temperatures"): a live board
   read every 1.5 s while it is on the screen (electron/tools/stats.js, 'stats-now'), and the internet speed test
   against Cloudflare ('stats-speed', its progress as 'stats-speed-tick'). Read only: nothing on the computer changes. */
const POLL = 1500
const KEEP = 40 // a minute of readings for the small graphs
const st = { now: null, cpu: [], down: [], up: [], timer: null, root: null, speed: null, live: null, running: false, err: '' }

const pct = (x) => (x == null ? '–' : Math.round(x) + '%')
const rate = (ctx, b) => (b == null ? '–' : ctx.bytes(Math.round(b)) + '/s')
const mbps = (x) => (x == null ? '–' : (x >= 100 ? Math.round(x) : x >= 10 ? x.toFixed(1) : x.toFixed(2)) + ' Mbps')
const upFor = (s) => { const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return (d ? d + 'd ' : '') + (d || h ? h + 'h ' : '') + m + 'm' }
/* memory as the computer itself counts it (64 GB, not 68.7): in 1024s; drives stay in 1000s, as Finder shows them */
const ram = (b) => { if (b == null) return '–'; const g = b / 1024 ** 3; return g >= 100 ? Math.round(g) + ' GB' : g >= 10 ? (Math.round(g * 10) / 10) + ' GB' : g >= 1 ? g.toFixed(2) + ' GB' : Math.round(b / 1024 ** 2) + ' MB' }
const mins = (ctx, m) => (m == null ? '–' : m < 1 ? ctx.t('under a minute') : m < 90 ? ctx.t('about {n} min', { n: Math.round(m) }) : ctx.t('about {n} h', { n: (m / 60).toFixed(1) }))

/* a small line graph of the last minute, 0..max */
function spark(values, max, cls = '') {
  const w = 240, hgt = 44, v = values.length ? values : [0]
  const top = Math.max(max || 0, ...v, 1e-9)
  const pts = v.map((x, i) => [v.length === 1 ? w : (i / (v.length - 1)) * w, hgt - 2 - ((x || 0) / top) * (hgt - 6)])
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ')
  const area = line + ` L${pts[pts.length - 1][0].toFixed(1)} ${hgt} L${pts[0][0].toFixed(1)} ${hgt} Z`
  return `<svg class="spark ${cls}" viewBox="0 0 ${w} ${hgt}" preserveAspectRatio="none" aria-hidden="true"><path class="a" d="${area}"/><path class="l" d="${line}"/></svg>`
}
const bar = (h, frac, c) => h('div', { class: 'st-bar' }, h('i', { style: { width: Math.max(0, Math.min(100, (frac || 0) * 100)) + '%', ...(c ? { background: c } : {}) } }))
const chip = (h, text, c) => h('span', { class: 'chip tint', style: { '--c': c } }, h('i'), text)
const row = (h, k, v) => h('div', { class: 'st-row' }, h('span', {}, k), h('b', {}, v))

const THERM = {
  nominal: ['Cool', 'var(--ok)'], fair: ['Warm', 'var(--warn)'],
  serious: ['Hot: it may slow down', '#ff9f0a'], critical: ['Very hot: it is slowing down', 'var(--acc)'],
}
const PRESSURE = { normal: ['Normal', 'var(--ok)'], warning: ['Under pressure', 'var(--warn)'], critical: ['Critical: close some programs', 'var(--acc)'] }

function tiles(ctx) {
  const { h, t, bytes } = ctx
  const n = st.now
  if (!n) return [h('div', { class: 'st-tile st-wait' }, h('p', { class: 'note' }, st.err || t('Reading the computer…')))]
  const m = n.machine || {}
  const nr = t('Not reported')
  const cores = (n.cpu.per || []).length
  // the machine
  const machine = h('section', { class: 'st-tile st-machine' },
    h('div', { class: 'st-k' }, t('This computer')),
    h('div', { class: 'st-name' }, m.model || m.host || nr),
    h('div', { class: 'st-sub' }, [m.chip, m.os].filter(Boolean).join(' · ')),
    h('div', { class: 'st-rows' },
      row(h, t('Cores'), m.perf ? t('{a} ({p} performance, {e} efficiency)', { a: m.cores, p: m.perf, e: m.eff }) : String(m.cores || cores || '–')),
      row(h, t('Memory'), ram(m.memory || n.mem.total)),
      row(h, t('On for'), upFor(n.uptime || 0)),
      n.net.ip ? row(h, t('Local address'), n.net.ip) : null))
  // the processor
  const cpu = h('section', { class: 'st-tile' },
    h('div', { class: 'st-k' }, t('Processor')),
    h('div', { class: 'st-big' }, pct(n.cpu.total)),
    h('div', { html: spark(st.cpu, 100, 'acc') }),
    h('div', { class: 'st-cores', title: t('Each core') }, ...(n.cpu.per || []).map((x) => h('i', { style: { '--v': x / 100 } }))),
    n.load ? h('div', { class: 'st-sub' }, t('Load {a} · {b} · {c}', { a: n.load[0].toFixed(2), b: n.load[1].toFixed(2), c: n.load[2].toFixed(2) })) : null)
  // memory
  const p = PRESSURE[n.mem.pressure]
  const mem = h('section', { class: 'st-tile' },
    h('div', { class: 'st-k' }, t('Memory')),
    h('div', { class: 'st-big' }, ram(n.mem.used), h('small', {}, ' / ' + ram(n.mem.total))),
    bar(h, n.mem.used / n.mem.total, p ? p[1] : null),
    h('div', { class: 'st-chips' },
      p ? chip(h, t(p[0]), p[1]) : null,
      n.mem.swap ? h('span', { class: 'chip' }, t('Swap {a}', { a: ram(n.mem.swap.used) })) : null,
      n.mem.cached != null ? h('span', { class: 'chip' }, t('Cached {a}', { a: ram(n.mem.cached) })) : null))
  // the network, now
  const r = n.net.rate
  const net = h('section', { class: 'st-tile' },
    h('div', { class: 'st-k' }, t('Network now')),
    h('div', { class: 'st-pair' },
      h('div', {}, h('small', {}, '↓ ' + t('Down')), h('b', {}, rate(ctx, r?.down))),
      h('div', {}, h('small', {}, '↑ ' + t('Up')), h('b', {}, rate(ctx, r?.up)))),
    h('div', { class: 'st-sparks', html: spark(st.down, Math.max(...st.down, ...st.up, 1), 'ok') + spark(st.up, Math.max(...st.down, ...st.up, 1), 'up') }),
    h('div', { class: 'st-sub' }, n.net.cards?.length ? n.net.cards.join(', ') : nr))
  // the internet speed test
  const s = st.speed, live = st.live
  const phase = { ping: t('Ping'), down: t('Download'), up: t('Upload') }
  const internet = h('section', { class: 'st-tile st-net' },
    h('div', { class: 'st-k' }, t('Internet speed')),
    st.running && live
      ? h('div', { class: 'st-live' },
        h('div', { class: 'st-big' }, live.phase === 'ping' ? Math.round(live.ping) + ' ms' : mbps(live.mbps)),
        h('div', { class: 'st-sub' }, phase[live.phase] || ''),
        bar(h, live.done, 'var(--acc)'))
      : s ? h('div', { class: 'st-result' },
        h('div', { class: 'st-pair' },
          h('div', {}, h('small', {}, '↓ ' + t('Download')), h('b', {}, mbps(s.down))),
          h('div', {}, h('small', {}, '↑ ' + t('Upload')), h('b', {}, mbps(s.up))),
          h('div', {}, h('small', {}, t('Ping')), h('b', {}, Math.round(s.ping) + ' ms')),
          h('div', {}, h('small', {}, t('Jitter')), h('b', {}, Math.round(s.jitter) + ' ms'))),
        h('p', { class: 'st-verdict' }, t('A 10 GB delivery goes up in {a} and comes down in {b}.', { a: mins(ctx, s.upload10GB), b: mins(ctx, s.download10GB) })),
        h('div', { class: 'st-sub' }, [s.ip && t('Public address {a}', { a: s.ip }), s.colo && t('via Cloudflare {a}', { a: s.colo + (s.loc ? ', ' + s.loc : '') })].filter(Boolean).join(' · ')))
        : h('p', { class: 'st-sub' }, st.running ? t('Starting…') : t('Press Internet speed test above.')),
    h('p', { class: 'st-fine' }, t('The test talks to Cloudflare\'s public speed servers (speed.cloudflare.com); nothing else leaves the computer.')))
  // heat and power
  const th = THERM[n.therm?.state]
  const bt = n.battery
  const heat = h('section', { class: 'st-tile' },
    h('div', { class: 'st-k' }, t('Heat and power')),
    h('div', { class: 'st-chips' },
      th ? chip(h, t(th[0]), th[1]) : h('span', { class: 'chip' }, t('Heat: not reported')),
      n.therm?.limit != null && n.therm.limit < 100 ? chip(h, t('Processor slowed to {a}%', { a: n.therm.limit }), 'var(--warn)') : null,
      ...(n.therm?.warnings || []).slice(0, 2).map((w) => chip(h, w, 'var(--warn)'))),
    bt ? h('div', { class: 'st-rows' },
      bt.percent != null ? row(h, t('Battery'), bt.percent + '%' + (bt.state ? ' · ' + t(bt.state) : '') + (bt.remaining ? ' · ' + bt.remaining : '')) : null,
      bt.health != null ? row(h, t('Battery health'), bt.health + '%') : null,
      bt.cycles != null ? row(h, t('Charge cycles'), String(bt.cycles)) : null,
      bt.temp != null ? row(h, t('Battery temperature'), bt.temp.toFixed(1) + ' °C') : null)
      : h('div', { class: 'st-sub' }, t('No battery')),
    h('p', { class: 'st-fine' }, ctx.platform === 'win32' ? t('Windows shows the processor\'s degrees only to administrators, so they are not shown here.')
      : t('A Mac shows the processor\'s own degrees only with an administrator password, so they are not shown here; the heat level above is the Mac\'s own.')))
  // drives
  const drives = h('section', { class: 'st-tile' },
    h('div', { class: 'st-k' }, t('Drives')),
    n.drives?.length ? h('div', { class: 'st-drives' }, ...n.drives.map((d) => h('div', { class: 'st-drive' },
      h('div', { class: 'st-row' }, h('span', { title: d.mount }, d.name), h('b', {}, t('{a} free of {b}', { a: bytes(d.free), b: bytes(d.total) }))),
      bar(h, d.used / d.total, d.free / d.total < 0.1 ? 'var(--acc)' : d.free / d.total < 0.2 ? 'var(--warn)' : null))))
      : h('div', { class: 'st-sub' }, nr))
  // the heaviest programs
  const procs = (list, kind) => h('ol', { class: 'st-procs' }, ...list.map((x) => h('li', {},
    h('span', { title: x.name }, x.name + (x.count > 1 ? ` ×${x.count}` : '')), h('b', {}, kind === 'cpu' ? x.cpu.toFixed(1) + '%' : ram(x.mem)))))
  const top = h('section', { class: 'st-tile st-wide' },
    h('div', { class: 'st-k' }, t('Heaviest programs')),
    n.top?.cpu?.length ? h('div', { class: 'st-two' },
      h('div', {}, h('small', {}, t('Processor')), procs(n.top.cpu, 'cpu')),
      h('div', {}, h('small', {}, t('Memory')), procs(n.top.mem, 'mem'))) : h('div', { class: 'st-sub' }, nr))
  return [machine, cpu, mem, net, internet, heat, drives, top]
}

function paint(ctx) {
  const grid = st.root?.querySelector('.st-grid')
  if (grid) grid.replaceChildren(...tiles(ctx))
}
/* read while the board is on the screen; leaving it (another tool, another window) stops the reading */
async function tick(ctx) {
  if (ctx.S.mode !== 'stats' || !st.root?.isConnected) { clearInterval(st.timer); st.timer = null; return }
  try {
    const n = await ctx.call('stats-now')
    st.now = n; st.err = ''
    st.cpu = [...st.cpu, n.cpu.total ?? 0].slice(-KEEP)
    if (n.net.rate) { st.down = [...st.down, n.net.rate.down].slice(-KEEP); st.up = [...st.up, n.net.rate.up].slice(-KEEP) }
  } catch (e) { st.err = ctx.err(e) }
  paint(ctx)
}
async function speedTest(ctx) {
  if (st.running) return
  st.running = true; st.live = null
  const off = ctx.on('stats-speed-tick', (p) => { st.live = p; paint(ctx) })
  ctx.busy(true)
  try {
    const r = await ctx.call('stats-speed')
    if (r?.stopped) ctx.toast(ctx.t('Speed test stopped.'))
    else st.speed = r
  } catch (e) { ctx.toast(ctx.err(e)) } finally { off?.(); st.running = false; st.live = null; ctx.busy(false) }
}

export default {
  id: 'stats',
  top: (ctx) => {
    const { h, t, ico } = ctx
    return [h('div', { class: 'title' }, t('Computer stats')), h('div', { class: 'spacer' }),
      st.running
        ? h('button', { class: 'btn', onclick: () => ctx.stop() }, ico('stop'), t('Stop'))
        : h('button', { class: 'btn main', onclick: () => speedTest(ctx) }, ico('gauge'), h('span', { class: 'lbl' }, t('Internet speed test')))]
  },
  view: (ctx) => {
    const { h } = ctx
    st.root = h('main', {}, h('div', { class: 'st-grid' }, ...tiles(ctx)))
    if (!st.timer) { st.timer = setInterval(() => tick(ctx), POLL); setTimeout(() => tick(ctx), 0) }
    return st.root
  },
  el: {
    'Computer stats': 'Στατιστικά υπολογιστή', 'Internet speed test': 'Τεστ ταχύτητας internet', 'Stop': 'Διακοπή',
    'Reading the computer…': 'Διαβάζει τον υπολογιστή…', 'Not reported': 'Δεν αναφέρεται', 'This computer': 'Αυτός ο υπολογιστής',
    'Cores': 'Πυρήνες', '{a} ({p} performance, {e} efficiency)': '{a} ({p} επιδόσεων, {e} οικονομίας)', 'Memory': 'Μνήμη', 'On for': 'Ανοιχτός εδώ και',
    'Local address': 'Τοπική διεύθυνση', 'Processor': 'Επεξεργαστής', 'Each core': 'Κάθε πυρήνας', 'Load {a} · {b} · {c}': 'Φόρτος {a} · {b} · {c}',
    'Normal': 'Κανονική', 'Under pressure': 'Πιέζεται', 'Critical: close some programs': 'Κρίσιμη: κλείσε κάποια προγράμματα',
    'Swap {a}': 'Swap {a}', 'Cached {a}': 'Cache {a}', 'Network now': 'Δίκτυο τώρα', 'Down': 'Κατέβασμα', 'Up': 'Ανέβασμα',
    'Internet speed': 'Ταχύτητα internet', 'Ping': 'Ping', 'Download': 'Download', 'Upload': 'Upload', 'Jitter': 'Jitter',
    'A 10 GB delivery goes up in {a} and comes down in {b}.': 'Ένα παραδοτέο 10 GB ανεβαίνει σε {a} και κατεβαίνει σε {b}.',
    'under a minute': 'λιγότερο από ένα λεπτό', 'about {n} min': 'περίπου {n} λεπτά', 'about {n} h': 'περίπου {n} ώρες',
    'Public address {a}': 'Δημόσια διεύθυνση {a}', 'via Cloudflare {a}': 'μέσω Cloudflare {a}', 'Starting…': 'Ξεκινάει…',
    'Press Internet speed test above.': 'Πάτα Τεστ ταχύτητας internet επάνω.',
    'The test talks to Cloudflare\'s public speed servers (speed.cloudflare.com); nothing else leaves the computer.': 'Το τεστ μιλάει με τους δημόσιους servers ταχύτητας της Cloudflare (speed.cloudflare.com)· τίποτε άλλο δεν φεύγει από τον υπολογιστή.',
    'Heat and power': 'Θερμοκρασία και ενέργεια', 'Cool': 'Δροσερός', 'Warm': 'Ζεστός', 'Hot: it may slow down': 'Καυτός: μπορεί να επιβραδυνθεί',
    'Very hot: it is slowing down': 'Πολύ καυτός: επιβραδύνεται', 'Heat: not reported': 'Θερμοκρασία: δεν αναφέρεται', 'Processor slowed to {a}%': 'Ο επεξεργαστής έπεσε στο {a}%',
    'Battery': 'Μπαταρία', 'Battery health': 'Υγεία μπαταρίας', 'Charge cycles': 'Κύκλοι φόρτισης', 'Battery temperature': 'Θερμοκρασία μπαταρίας', 'No battery': 'Χωρίς μπαταρία',
    'charging': 'φορτίζει', 'discharging': 'αποφορτίζεται', 'charged': 'γεμάτη', 'finishing charge': 'τελειώνει τη φόρτιση', 'ac attached': 'στο ρεύμα',
    'A Mac shows the processor\'s own degrees only with an administrator password, so they are not shown here; the heat level above is the Mac\'s own.': 'Ο Mac δείχνει τους βαθμούς του επεξεργαστή μόνο με κωδικό διαχειριστή, γι\' αυτό δεν φαίνονται εδώ· το επίπεδο θερμοκρασίας επάνω είναι του ίδιου του Mac.',
    'Windows shows the processor\'s degrees only to administrators, so they are not shown here.': 'Τα Windows δείχνουν τους βαθμούς του επεξεργαστή μόνο σε διαχειριστές, γι\' αυτό δεν φαίνονται εδώ.',
    'Drives': 'Δίσκοι', '{a} free of {b}': '{a} ελεύθερα από {b}', 'Heaviest programs': 'Τα πιο βαριά προγράμματα', 'Speed test stopped.': 'Το τεστ ταχύτητας σταμάτησε.',
  },
  /* in a browser: a MacBook Pro that breathes, and a speed test that runs in a few seconds */
  demo: {
    'stats-now': async () => {
      const k = (Date.now() / 1000) % 3600
      const wave = (a, f) => Math.max(0, a * (0.55 + 0.45 * Math.sin(k * f)) + Math.random() * a * 0.25)
      const per = Array.from({ length: 16 }, (_, i) => Math.min(100, Math.round(wave(i < 12 ? 55 : 20, 0.3 + i * 0.07))))
      return {
        at: Date.now(), uptime: 3 * 86400 + 5 * 3600 + 1200,
        machine: { model: 'MacBook Pro', chip: 'Apple M3 Max', os: 'macOS 15.1', cores: 16, perf: 12, eff: 4, memory: 64 * 1024 ** 3, host: 'Alex MacBook Pro' },
        cpu: { total: per.reduce((s, x) => s + x, 0) / per.length, per }, load: [5.42, 4.81, 3.97],
        mem: { total: 64 * 1024 ** 3, used: 41.3 * 1024 ** 3 + wave(1e9, 0.2), cached: 14.2 * 1024 ** 3, pressure: 'normal', swap: { total: 4 * 1024 ** 3, used: 0.8 * 1024 ** 3 } },
        net: { rate: { down: wave(48e6, 0.5), up: wave(9e6, 0.35) }, ip: '192.168.1.24', cards: ['en0'] },
        drives: [
          { name: 'Macintosh HD', mount: '/', total: 2e12, used: 1.42e12, free: 0.58e12 },
          { name: 'SHOOT_01', mount: '/Volumes/SHOOT_01', total: 4e12, used: 3.71e12, free: 0.29e12 },
          { name: 'BACKUP', mount: '/Volumes/BACKUP', total: 8e12, used: 3.2e12, free: 4.8e12 },
        ],
        battery: { percent: 86, state: 'charging', remaining: '0:42', cycles: 212, health: 94, temp: 31.4 },
        therm: { state: 'fair', limit: null, warnings: [] },
        top: {
          cpu: [{ name: 'DaVinci Resolve', cpu: 182.4, mem: 21.4e9, count: 1 }, { name: 'Adobe Premiere Pro 2025', cpu: 64.1, mem: 9.8e9, count: 1 }, { name: 'Google Chrome', cpu: 22.7, mem: 4.1e9, count: 14 },
            { name: 'WindowServer', cpu: 14.2, mem: 1.2e9, count: 1 }, { name: 'RoarKit', cpu: 3.1, mem: 0.4e9, count: 4 }, { name: 'Spotify', cpu: 1.9, mem: 0.6e9, count: 3 }, { name: 'Finder', cpu: 0.6, mem: 0.3e9, count: 1 }, { name: 'Slack', cpu: 0.5, mem: 0.9e9, count: 5 }],
          mem: [{ name: 'DaVinci Resolve', cpu: 182.4, mem: 21.4e9, count: 1 }, { name: 'Adobe Premiere Pro 2025', cpu: 64.1, mem: 9.8e9, count: 1 }, { name: 'Google Chrome', cpu: 22.7, mem: 4.1e9, count: 14 },
            { name: 'WindowServer', cpu: 14.2, mem: 1.2e9, count: 1 }, { name: 'Slack', cpu: 0.5, mem: 0.9e9, count: 5 }, { name: 'Spotify', cpu: 1.9, mem: 0.6e9, count: 3 }, { name: 'RoarKit', cpu: 3.1, mem: 0.4e9, count: 4 }, { name: 'Finder', cpu: 0.6, mem: 0.3e9, count: 1 }],
        },
      }
    },
    'stats-speed': async (_a, emit) => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms))
      for (let i = 1; i <= 5; i++) { emit('stats-speed-tick', { phase: 'ping', ping: 14 + Math.random() * 4, done: i / 5 }); await wait(120) }
      for (let i = 1; i <= 12; i++) { emit('stats-speed-tick', { phase: 'down', mbps: 480 * Math.min(1, i / 6) + Math.random() * 30, done: i / 12 }); await wait(120) }
      for (let i = 1; i <= 10; i++) { emit('stats-speed-tick', { phase: 'up', mbps: 92 * Math.min(1, i / 5) + Math.random() * 8, done: i / 10 }); await wait(120) }
      return { at: Date.now(), ping: 14.2, jitter: 2.1, down: 486.3, up: 94.7, ip: '203.0.113.42', colo: 'ATH', loc: 'GR', upload10GB: (10 * 8000) / 94.7 / 60, download10GB: (10 * 8000) / 486.3 / 60 }
    },
  },
}
