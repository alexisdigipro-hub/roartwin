// Computer stats (Alex, 28 Oct: "important computer statistics, speeds, the speedtest, temperatures"). Read only: the
// machine, the processor, memory, the drives, the network, power and heat, the heaviest programs; plus an internet
// speed test against Cloudflare's public speed endpoints. Every command runs with execFile (no shell) and a timeout;
// anything a computer does not report comes back empty, and the page says "Not reported". The parsers are pure
// functions, tested by test/stats.test.js on what each command prints.
const os = require('os')
const { execFile } = require('child_process')

/* one command, its output as text, '' when it is missing, refused or too slow */
const run = (cmd, args, ms = 4000) => new Promise((done) => {
  try {
    execFile(cmd, args, { timeout: ms, maxBuffer: 16 << 20, windowsHide: true }, (err, out) => done(err && !out ? '' : String(out || '')))
  } catch { done('') }
})
const ps = (script, ms = 6000) => run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], ms)
const json = (text) => { try { const v = JSON.parse(text); return v } catch { return null } }
const list = (v) => (v == null ? [] : Array.isArray(v) ? v : [v])
const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : null }

/* ---------- parsers ---------- */

/* df -kP: one volume a line; the mount point is everything after the capacity (it can hold spaces). Only real drives:
   the start-up disk and what is under /Volumes (Mac) or mounted from a /dev device (elsewhere). */
function parseDf(text) {
  const out = []
  for (const line of String(text).split('\n').slice(1)) {
    const m = line.match(/^(\S+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)%\s+(.+)$/)
    if (!m) continue
    const [, dev, total, used, avail, , mount] = m
    if (!dev.startsWith('/dev/')) continue
    if (/^\/(System\/Volumes|private\/var\/vm|dev|run|boot|snap)(\/|$)/.test(mount)) continue
    if (mount.startsWith('/Volumes/') && /^\/Volumes\/(Recovery|com\.apple\.TimeMachine\.localsnapshots|\.timemachine)/.test(mount)) continue
    out.push({ name: mount === '/' ? 'Macintosh HD' : mount.split('/').pop(), mount, total: +total * 1024, used: +used * 1024, free: +avail * 1024 })
  }
  return out
}
/* Get-PSDrive -PSProvider FileSystem as JSON (Windows): Name, Root, Used, Free */
function parseWinDrives(text) {
  return list(json(text)).filter((d) => d && n(d.Used) != null && n(d.Free) != null && (n(d.Used) + n(d.Free)) > 0)
    .map((d) => ({ name: `${d.Name}:`, mount: d.Root || `${d.Name}:\\`, used: n(d.Used), free: n(d.Free), total: n(d.Used) + n(d.Free) }))
}

/* vm_stat (Mac): pages of each kind and the page size; used is what apps hold (active + wired + compressed) */
function parseVmStat(text) {
  const s = String(text)
  const page = n((s.match(/page size of (\d+) bytes/) || [])[1]) || 4096
  const get = (label) => n((s.match(new RegExp(label + ':\\s+(\\d+)')) || [])[1]) || 0
  const pages = { free: get('Pages free'), active: get('Pages active'), inactive: get('Pages inactive'), speculative: get('Pages speculative'),
    wired: get('Pages wired down'), compressed: get('Pages occupied by compressor'), purgeable: get('Pages purgeable') }
  if (!Object.values(pages).some(Boolean)) return null
  return { page, ...pages, app: (pages.active + pages.wired + pages.compressed) * page, cached: (pages.inactive + pages.purgeable + pages.speculative) * page }
}
/* sysctl kern.memorystatus_vm_pressure_level: 1 normal, 2 warning, 4 critical */
const parsePressure = (text) => ({ 1: 'normal', 2: 'warning', 4: 'critical' })[n(String(text).trim())] || ''
/* sysctl vm.swapusage: "total = 2048.00M  used = 1024.50M  free = 1023.50M  (encrypted)" */
function parseSwap(text) {
  const unit = { K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4 }
  const get = (k) => { const m = String(text).match(new RegExp(k + '\\s*=\\s*([\\d.]+)([KMGT])')); return m ? +m[1] * unit[m[2]] : null }
  const total = get('total'), used = get('used')
  return total == null ? null : { total, used: used || 0 }
}

/* netstat -ibn (Mac): the byte counts of every network card (its <Link#n> row), loopback and tunnels left out */
const SKIP_IF = /^(lo|utun|awdl|llw|gif|stf|anpi|ap|bridge|vmenet|ipsec|ppp|XHC)\d*/
function parseNetstat(text) {
  let rx = 0, tx = 0
  const cards = []
  for (const line of String(text).split('\n').slice(1)) {
    const f = line.trim().split(/\s+/)
    if (f.length < 10 || !/^<Link#\d+>$/.test(f[2])) continue
    const name = f[0].replace(/\*$/, '')
    if (SKIP_IF.test(name)) continue
    // the address column is empty for some cards: 11 columns with it, 10 without
    const [ib, ob] = f.length >= 11 ? [f[6], f[9]] : [f[5], f[8]]
    if (!/^\d+$/.test(ib) || !/^\d+$/.test(ob)) continue
    rx += +ib; tx += +ob; cards.push(name)
  }
  return cards.length ? { rx, tx, cards } : null
}
/* Get-NetAdapterStatistics as JSON (Windows) */
function parseWinNet(text) {
  const a = list(json(text)).filter((x) => x && n(x.ReceivedBytes) != null)
  return a.length ? { rx: a.reduce((s, x) => s + n(x.ReceivedBytes), 0), tx: a.reduce((s, x) => s + (n(x.SentBytes) || 0), 0), cards: a.map((x) => x.Name) } : null
}

/* pmset -g batt (Mac): " -InternalBattery-0 (id=…)	87%; charging; 1:23 remaining present: true" */
function parseBatt(text) {
  const s = String(text)
  const m = s.match(/(\d+)%;\s*([^;]+);\s*([^\n]*)/)
  if (!m) return null
  const time = (m[3].match(/(\d+:\d+)\s*remaining/) || [])[1] || ''
  return { percent: +m[1], state: m[2].trim().toLowerCase(), remaining: time, source: /AC Power/.test(s) ? 'ac' : /Battery Power/.test(s) ? 'battery' : '' }
}
/* ioreg -rn AppleSmartBattery (Mac): cycles, health, the battery's own temperature (hundredths of a degree) */
function parseIoregBattery(text) {
  const s = String(text)
  const get = (k) => n((s.match(new RegExp(`"${k}"\\s*=\\s*(-?\\d+)`)) || [])[1])
  const design = get('DesignCapacity')
  const raw = get('AppleRawMaxCapacity') ?? get('NominalChargeCapacity')
  const max = get('MaxCapacity')
  // Apple silicon gives MaxCapacity as a percentage; Intel Macs in mAh like DesignCapacity
  const health = design && raw ? Math.round((raw / design) * 100) : design && max && max > 100 ? Math.round((max / design) * 100) : max && max <= 100 ? max : null
  const temp = get('Temperature') ?? get('VirtualTemperature')
  const cycles = get('CycleCount')
  if (cycles == null && health == null && temp == null) return null
  return { cycles, health, temp: temp != null ? Math.round(temp) / 100 : null, design, condition: (s.match(/"PermanentFailureStatus"\s*=\s*(\d+)/) || [])[1] === '1' ? 'failure' : '' }
}
/* Win32_Battery as JSON (Windows) */
function parseWinBattery(text) {
  const b = list(json(text))[0]
  if (!b) return null
  return { percent: n(b.EstimatedChargeRemaining), state: n(b.BatteryStatus) === 2 ? 'charging' : n(b.BatteryStatus) === 1 ? 'discharging' : '', remaining: '', source: '' }
}
/* pmset -g therm (Mac): warnings recorded, and the processor's speed limit (under 100 means it is slowed by heat) */
function parseTherm(text) {
  const s = String(text)
  const limit = n((s.match(/CPU_Speed_Limit\s*=\s*(\d+)/) || [])[1])
  const warnings = s.split('\n').filter((l) => /warning level/i.test(l) && !/No (thermal|performance) warning/i.test(l)).map((l) => l.trim())
  return { limit, warnings }
}

/* ps -Aceo pid,pcpu,rss,comm (Mac): the heaviest by processor and by memory; names only */
function parsePs(text) {
  const rows = []
  for (const line of String(text).split('\n').slice(1)) {
    const m = line.match(/^\s*(\d+)\s+([\d.]+)\s+(\d+)\s+(.+?)\s*$/)
    if (m) rows.push({ pid: +m[1], cpu: +m[2], mem: +m[3] * 1024, name: m[4] })
  }
  return rows
}
/* merge processes of the same program (Chrome's helpers, Resolve's workers) and take the top eight each way */
function topProcs(rows, k = 8) {
  const by = new Map()
  for (const r of rows) {
    const key = r.name.replace(/ Helper( \(.+\))?$/, '').replace(/\.exe$/i, '')
    const g = by.get(key) || { name: key, cpu: 0, mem: 0, count: 0 }
    g.cpu += r.cpu || 0; g.mem += r.mem || 0; g.count++
    by.set(key, g)
  }
  const all = [...by.values()].filter((g) => !/^(kernel_task|idle|System Idle Process)$/i.test(g.name) || g.cpu > 0)
  const round = (g) => ({ ...g, cpu: Math.round(g.cpu * 10) / 10 })
  return {
    cpu: [...all].sort((a, b) => b.cpu - a.cpu).slice(0, k).map(round),
    mem: [...all].sort((a, b) => b.mem - a.mem).slice(0, k).map(round),
  }
}

/* system_profiler SPHardwareDataType -json (Mac) */
function parseHardware(text) {
  const h = json(text)?.SPHardwareDataType?.[0]
  if (!h) return null
  const cores = String(h.number_processors || '').match(/(\d+)(?::(\d+):(\d+))?/)
  return { model: h.machine_name || '', modelId: h.machine_model || '', chip: h.chip_type || h.cpu_type || '', memory: h.physical_memory || '',
    cores: cores ? +cores[1] : null, perf: cores?.[2] ? +cores[2] : null, eff: cores?.[3] ? +cores[3] : null }
}
/* cdn-cgi/trace: key=value lines (ip, colo, loc) */
const parseTrace = (text) => Object.fromEntries(String(text).split('\n').map((l) => l.split('=')).filter((p) => p.length >= 2).map(([k, ...v]) => [k.trim(), v.join('=').trim()]))

/* the processor's use from two os.cpus() readings: total and per core, 0..100 */
function cpuUse(prev, now) {
  if (!prev || prev.length !== now.length) return null
  const per = now.map((c, i) => {
    const a = prev[i].times, b = c.times
    const busy = (b.user - a.user) + (b.nice - a.nice) + (b.sys - a.sys) + (b.irq - a.irq)
    const all = busy + (b.idle - a.idle)
    return all > 0 ? Math.max(0, Math.min(100, (busy / all) * 100)) : 0
  })
  return { total: per.reduce((s, x) => s + x, 0) / per.length, per: per.map((x) => Math.round(x)) }
}

/* the speed test's verdict: how long a 10 GB delivery takes to go up, and a 4K proxy to come down */
function verdict(down, up) {
  const mins = (gb, mbps) => (mbps > 0 ? (gb * 8000) / mbps / 60 : null)
  return { upload10GB: mins(10, up), download10GB: mins(10, down) }
}
const jitterOf = (ms) => (ms.length > 1 ? ms.slice(1).reduce((s, x, i) => s + Math.abs(x - ms[i]), 0) / (ms.length - 1) : 0)

/* ---------- the live readings ---------- */
const mac = process.platform === 'darwin', win = process.platform === 'win32'
let lastCpu = null, lastNet = null, lastProcs = null
let slow = { at: 0 } // drives and battery: every ten seconds is enough
let machine = null

async function machineInfo() {
  if (machine) return machine
  const m = { host: os.hostname(), cpu: os.cpus()[0]?.model?.trim() || '', cores: os.cpus().length, memory: os.totalmem(), arch: os.arch(), os: '', model: '', chip: '' }
  if (mac) {
    const [hw, ver, model] = await Promise.all([run('system_profiler', ['SPHardwareDataType', '-json'], 15000), run('sw_vers', ['-productVersion']), run('sysctl', ['-n', 'hw.model'])])
    const h = parseHardware(hw)
    Object.assign(m, { os: ver.trim() ? `macOS ${ver.trim()}` : 'macOS', model: h?.model || model.trim(), modelId: h?.modelId || model.trim(), chip: h?.chip || m.cpu, perf: h?.perf ?? null, eff: h?.eff ?? null })
  } else if (win) {
    const r = json(await ps('Get-CimInstance Win32_ComputerSystem | Select-Object Manufacturer,Model | ConvertTo-Json; '))
    const o = json(await ps('(Get-CimInstance Win32_OperatingSystem).Caption | ConvertTo-Json'))
    Object.assign(m, { os: typeof o === 'string' ? o : `Windows ${os.release()}`, model: [r?.Manufacturer, r?.Model].filter(Boolean).join(' '), chip: m.cpu })
  } else Object.assign(m, { os: `${os.type()} ${os.release()}`, chip: m.cpu })
  machine = m
  return m
}

async function readNet() {
  if (mac) return parseNetstat(await run('netstat', ['-ibn']))
  if (win) return parseWinNet(await ps('Get-NetAdapterStatistics | Select-Object Name,ReceivedBytes,SentBytes | ConvertTo-Json'))
  return null
}
async function readProcs() {
  if (mac) return parsePs(await run('ps', ['-Aceo', 'pid,pcpu,rss,comm']))
  if (win) {
    // processor time is cumulative there: the share since the last reading
    const rows = list(json(await ps('Get-Process | Select-Object Id,Name,CPU,WorkingSet64 | ConvertTo-Json -Compress')))
    const now = Date.now(), cores = os.cpus().length
    const prev = lastProcs
    lastProcs = { at: now, cpu: new Map(rows.map((r) => [r.Id, n(r.CPU) || 0])) }
    return rows.map((r) => ({ pid: r.Id, name: String(r.Name || ''), mem: n(r.WorkingSet64) || 0,
      cpu: prev ? Math.max(0, (((n(r.CPU) || 0) - (prev.cpu.get(r.Id) ?? (n(r.CPU) || 0))) / ((now - prev.at) / 1000) / cores) * 100) : 0 }))
  }
  return []
}
async function readSlow() {
  if (Date.now() - slow.at < 10000 && slow.at) return slow
  const out = { at: Date.now(), drives: [], battery: null, therm: null }
  if (mac) {
    const [df, batt, io, therm] = await Promise.all([run('df', ['-kP']), run('pmset', ['-g', 'batt']), run('ioreg', ['-rn', 'AppleSmartBattery']), run('pmset', ['-g', 'therm'])])
    out.drives = parseDf(df)
    const b = parseBatt(batt), i = parseIoregBattery(io)
    out.battery = b || i ? { ...(b || {}), ...(i || {}) } : null
    out.therm = parseTherm(therm)
  } else if (win) {
    const [d, b] = await Promise.all([ps('Get-PSDrive -PSProvider FileSystem | Select-Object Name,Root,Used,Free | ConvertTo-Json'), ps('Get-CimInstance Win32_Battery | Select-Object EstimatedChargeRemaining,BatteryStatus | ConvertTo-Json')])
    out.drives = parseWinDrives(d)
    out.battery = parseWinBattery(b)
  } else out.drives = parseDf(await run('df', ['-kP']))
  slow = out
  return out
}
function thermalState() {
  try { return require('electron').powerMonitor.getCurrentThermalState?.() || '' } catch { return '' }
}

async function now() {
  const cpus = os.cpus()
  const cpu = cpuUse(lastCpu, cpus)
  lastCpu = cpus
  const [m, net, procs, sl, vm, pressure, swap] = await Promise.all([
    machineInfo(), readNet(), readProcs(), readSlow(),
    mac ? run('vm_stat') : '', mac ? run('sysctl', ['-n', 'kern.memorystatus_vm_pressure_level']) : '', mac ? run('sysctl', ['-n', 'vm.swapusage']) : '',
  ])
  const at = Date.now()
  let rate = null
  if (net && lastNet && at > lastNet.at) {
    const s = (at - lastNet.at) / 1000
    rate = { down: Math.max(0, (net.rx - lastNet.rx) / s), up: Math.max(0, (net.tx - lastNet.tx) / s) }
  }
  if (net) lastNet = { ...net, at }
  const v = parseVmStat(vm)
  const total = os.totalmem()
  const ip = Object.values(os.networkInterfaces()).flat().find((a) => a && a.family === 'IPv4' && !a.internal)?.address || ''
  return {
    at, machine: m, uptime: os.uptime(),
    cpu: cpu || { total: null, per: cpus.map(() => 0) }, load: mac ? os.loadavg() : null,
    mem: { total, used: v ? Math.min(total, v.app) : total - os.freemem(), cached: v?.cached ?? null, pressure: parsePressure(pressure), swap: parseSwap(swap) },
    net: { rate, ip, cards: net?.cards || [] },
    drives: sl.drives, battery: sl.battery, therm: { state: thermalState(), ...(sl.therm || {}) },
    top: topProcs(procs),
  }
}

/* ---------- the internet speed test (Cloudflare's public endpoints) ---------- */
const CF = 'https://speed.cloudflare.com'
async function speedTest(ctx, emit) {
  const stop = () => ctx.stopped()
  const halt = () => { if (stop()) { const e = new ctx.engine.Stopped(); throw e } }
  const ctl = new AbortController()
  const watch = setInterval(() => { if (stop()) ctl.abort() }, 200)
  const opts = { signal: ctl.signal, cache: 'no-store' }
  try {
    // where the test runs from, and this connection's public address
    let where = {}
    try { where = parseTrace(await (await fetch(`${CF}/cdn-cgi/trace`, opts)).text()) } catch { halt() }
    // latency: small requests, the time to the first answer
    const pings = []
    for (let i = 0; i < 10; i++) {
      halt()
      const t0 = performance.now()
      const r = await fetch(`${CF}/__down?bytes=0`, opts); await r.arrayBuffer()
      pings.push(performance.now() - t0)
      emit('stats-speed-tick', { phase: 'ping', ping: Math.min(...pings), done: (i + 1) / 10 })
    }
    pings.sort((a, b) => a - b)
    const ping = pings.slice(0, 7).reduce((s, x) => s + x, 0) / Math.min(7, pings.length)
    const jitter = jitterOf(pings.slice(0, 7))
    // download: bigger and bigger pieces for about ten seconds; the speed of the best pieces
    const measure = async (phase, go, ms = 10000) => {
      const t0 = performance.now(), samples = []
      let size = 1e5
      while (performance.now() - t0 < ms) {
        halt()
        const s0 = performance.now()
        const bytes = await go(size)
        const secs = (performance.now() - s0) / 1000
        if (bytes && secs > 0) samples.push((bytes * 8) / secs / 1e6)
        // pieces that take over a second are big enough
        if (secs < 1 && size < 1e8) size = Math.min(1e8, size * 4)
        const best = [...samples].sort((a, b) => b - a)
        emit('stats-speed-tick', { phase, mbps: best.slice(0, 3).reduce((s, x) => s + x, 0) / Math.min(3, best.length), done: Math.min(1, (performance.now() - t0) / ms) })
      }
      const best = samples.sort((a, b) => b - a).slice(0, Math.max(1, Math.ceil(samples.length / 3)))
      return best.reduce((s, x) => s + x, 0) / best.length
    }
    const down = await measure('down', async (size) => {
      const r = await fetch(`${CF}/__down?bytes=${size}`, opts)
      let got = 0
      for await (const c of r.body) got += c.length
      return got
    })
    const up = await measure('up', async (size) => {
      const body = Buffer.alloc(Math.min(size, 5e7))
      const r = await fetch(`${CF}/__up`, { ...opts, method: 'POST', body, headers: { 'Content-Type': 'application/octet-stream' } })
      await r.arrayBuffer()
      return body.length
    }, 8000)
    return { at: Date.now(), ping, jitter, down, up, ip: where.ip || '', colo: where.colo || '', loc: where.loc || '', ...verdict(down, up) }
  } catch (e) {
    if (stop() || e?.name === 'AbortError') throw new ctx.engine.Stopped()
    throw new Error('The speed test could not reach Cloudflare. Check the internet connection.')
  } finally { clearInterval(watch) }
}

function register(ctx) {
  ctx.handle('stats-now', () => now())
  ctx.handle('stats-speed', (_a, { emit }) => ctx.run(() => speedTest(ctx, emit)))
}

module.exports = { register, parseDf, parseWinDrives, parseVmStat, parsePressure, parseSwap, parseNetstat, parseWinNet, parseBatt, parseIoregBattery, parseWinBattery, parseTherm, parsePs, topProcs, parseHardware, parseTrace, cpuUse, verdict, jitterOf }
