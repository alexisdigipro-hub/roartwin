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
    wired: get('Pages wired down'), compressed: get('Pages occupied by compressor'), purgeable: get('Pages purgeable'),
    anonymous: get('Anonymous pages'), file: get('File-backed pages') }
  if (!Object.values(pages).some(Boolean)) return null
  /* used as Activity Monitor counts it: the apps' own memory (anonymous pages, less what may be thrown away), wired and
     compressed. Active pages also hold files read lately, which macOS frees at once when it needs them, so with
     "Anonymous pages" (macOS 10.13 on) those are cached, not used; older systems fall back to active pages. */
  const apps = pages.anonymous ? Math.max(0, pages.anonymous - pages.purgeable) : pages.active
  const cached = pages.file ? pages.file + pages.purgeable : pages.inactive + pages.purgeable + pages.speculative
  return { page, ...pages, app: (apps + pages.wired + pages.compressed) * page, cached: cached * page }
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
  const cards = [], per = {}
  for (const line of String(text).split('\n').slice(1)) {
    const f = line.trim().split(/\s+/)
    if (f.length < 10 || !/^<Link#\d+>$/.test(f[2])) continue
    const name = f[0].replace(/\*$/, '')
    if (SKIP_IF.test(name)) continue
    // the address column is empty for some cards: 11 columns with it, 10 without
    const [ib, ob] = f.length >= 11 ? [f[6], f[9]] : [f[5], f[8]]
    if (!/^\d+$/.test(ib) || !/^\d+$/.test(ob)) continue
    if (per[name]) continue
    rx += +ib; tx += +ob; per[name] = { rx: +ib, tx: +ob }
    // a port with nothing on it (the Mac's Thunderbolt ports are cards too) is not named
    if (+ib + +ob > 0) cards.push(name)
  }
  return Object.keys(per).length ? { rx, tx, cards, per } : null
}
/* Get-NetAdapterStatistics as JSON (Windows) */
function parseWinNet(text) {
  const a = list(json(text)).filter((x) => x && n(x.ReceivedBytes) != null)
  if (!a.length) return null
  const per = Object.fromEntries(a.map((x) => [String(x.Name), { rx: n(x.ReceivedBytes), tx: n(x.SentBytes) || 0 }]))
  return { rx: a.reduce((s, x) => s + n(x.ReceivedBytes), 0), tx: a.reduce((s, x) => s + (n(x.SentBytes) || 0), 0), cards: a.filter((x) => n(x.ReceivedBytes) + (n(x.SentBytes) || 0) > 0).map((x) => String(x.Name)), per }
}
/* bytes a second between two readings, card by card: a card that came, went or started again from zero adds nothing */
function netRate(prev, now, secs) {
  if (!prev?.per || !now?.per || !(secs > 0)) return null
  let down = 0, up = 0
  for (const [k, c] of Object.entries(now.per)) {
    const p = prev.per[k]
    if (!p) continue
    if (c.rx >= p.rx) down += c.rx - p.rx
    if (c.tx >= p.tx) up += c.tx - p.tx
  }
  return { down: down / secs, up: up / secs }
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
/* system_profiler SPDisplaysDataType -json (Mac): the graphics, and its cores on Apple silicon */
function parseGpu(text) {
  const g = list(json(text)?.SPDisplaysDataType).filter(Boolean)
  if (!g.length) return null
  return { name: g.map((x) => x.sppci_model || x._name).filter(Boolean).join(' + '), cores: n(g[0].sppci_cores) }
}
/* ioreg -r -d 1 -w 0 -c IOAccelerator (Mac): "Device Utilization %"=37, readable without an administrator */
function parseGpuUse(text) {
  const all = [...String(text).matchAll(/"Device Utilization %"\s*=\s*(\d+)/g)].map((m) => +m[1])
  return all.length ? Math.max(...all) : null
}
/* the address of the card that carries the traffic, not a virtual machine's bridge or a VPN */
function localAddress(ifaces) {
  const all = Object.entries(ifaces || {}).flatMap(([name, a]) => (a || []).filter((x) => x && x.family === 'IPv4' && !x.internal).map((x) => ({ name, address: x.address })))
  const real = all.find((x) => /^(en|eth|wl|wlan|Wi-?Fi|Ethernet)/i.test(x.name) && !/^(bridge|vmnet|vEthernet|utun|docker|veth)/i.test(x.name))
  return (real || all.find((x) => !/^(bridge|vmnet|vEthernet|utun|docker|veth|tailscale|zt)/i.test(x.name)) || all[0])?.address || ''
}
/* "Why is it slow?" in plain words, from what the readings show; the page translates each line (its English is the key) */
function advice(nw) {
  const out = []
  const add = (level, text, vars) => out.push({ level, text, vars: vars || {} })
  const p = nw?.mem?.pressure
  if (p === 'critical') add('bad', 'Memory is full: close a program you are not using.')
  else if (p === 'warning') add('warn', 'Memory is under pressure: the computer is squeezing and swapping it.')
  const swap = nw?.mem?.swap?.used || 0
  if (swap > 8 * 1024 ** 3) add('warn', 'A lot of memory has gone to the disk ({a} GB of swap): a restart clears it.', { a: Math.round(swap / 1024 ** 3) })
  const th = nw?.therm
  const kernel = (nw?.top?.cpu || []).find((x) => x.name === 'kernel_task')
  if (th?.state === 'serious' || th?.state === 'critical' || (th?.limit != null && th.limit < 100) || (kernel && kernel.cpu > 150))
    add('bad', 'It is hot and slows itself down: give it air, keep it on a hard surface.')
  for (const x of (nw?.top?.cpu || []).filter((x) => x.cpu >= 90 && !/^(kernel_task|WindowServer)$/.test(x.name)).slice(0, 2))
    add('warn', '{a} is using {b}% of the processor.', { a: x.name, b: Math.round(x.cpu) })
  const start = (nw?.drives || []).find((d) => d.mount === '/' || /^C:/i.test(d.name))
  if (start && start.total && start.free / start.total < 0.1) add('bad', 'The start-up disk is nearly full ({a}% free): below 10% the computer slows down. Space map and Clean up free room.', { a: Math.round((start.free / start.total) * 100) })
  if (nw?.cpu?.total != null && nw.cpu.total > 85 && !out.some((x) => x.text.includes('processor.'))) add('warn', 'The processor is busy ({a}%).', { a: Math.round(nw.cpu.total) })
  const b = nw?.battery
  if (b?.health != null && b.health < 80) add('warn', 'The battery holds {a}% of its first charge: worth a service.', { a: b.health })
  return out
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
// jitter: how much one ping differs from the one before it, in the order they were sent (sorted, it would hide it)
const jitterOf = (ms) => (ms.length > 1 ? ms.slice(1).reduce((s, x, i) => s + Math.abs(x - ms[i]), 0) / (ms.length - 1) : 0)
/* ping: the mean of the quickest seven of ten (the first pays for the connection); jitter over all, in their order */
function pingOf(seq) {
  const fast = [...seq].sort((a, b) => a - b).slice(0, Math.min(7, seq.length))
  return { ping: fast.reduce((s, x) => s + x, 0) / (fast.length || 1), jitter: jitterOf(seq) }
}
/* the speed of a phase from its byte count over time: the first stretch (a connection warming up) left out */
function rateOf(marks, warm = 1500) {
  if (marks.length < 2) return 0
  const t0 = marks[0].t, last = marks[marks.length - 1]
  const from = marks.find((m) => m.t - t0 >= warm && last.t - m.t >= 500) || marks[0]
  const secs = (last.t - from.t) / 1000
  return secs > 0 ? ((last.bytes - from.bytes) * 8) / secs / 1e6 : 0
}

/* ---------- the live readings ---------- */
const mac = process.platform === 'darwin', win = process.platform === 'win32'
let lastCpu = null, lastNet = null, lastProcs = null, lastTop = { at: 0, rows: [] }
let slow = { at: 0 } // drives and battery: every ten seconds is enough
let machine = null

async function machineInfo() {
  if (machine) return machine
  const m = { host: os.hostname(), cpu: os.cpus()[0]?.model?.trim() || '', cores: os.cpus().length, memory: os.totalmem(), arch: os.arch(), os: '', model: '', chip: '' }
  if (mac) {
    const [hw, ver, model, gpu] = await Promise.all([run('system_profiler', ['SPHardwareDataType', '-json'], 15000), run('sw_vers', ['-productVersion']), run('sysctl', ['-n', 'hw.model']), run('system_profiler', ['SPDisplaysDataType', '-json'], 15000)])
    const h = parseHardware(hw)
    Object.assign(m, { os: ver.trim() ? `macOS ${ver.trim()}` : 'macOS', model: h?.model || model.trim(), modelId: h?.modelId || model.trim(), chip: h?.chip || m.cpu, perf: h?.perf ?? null, eff: h?.eff ?? null, gpu: parseGpu(gpu) })
  } else if (win) {
    const r = json(await ps('Get-CimInstance Win32_ComputerSystem | Select-Object Manufacturer,Model | ConvertTo-Json; '))
    const o = json(await ps('(Get-CimInstance Win32_OperatingSystem).Caption | ConvertTo-Json'))
    const g = list(json(await ps('Get-CimInstance Win32_VideoController | Select-Object Name | ConvertTo-Json'))).map((x) => x?.Name).filter(Boolean)
    Object.assign(m, { os: typeof o === 'string' ? o : `Windows ${os.release()}`, model: [r?.Manufacturer, r?.Model].filter(Boolean).join(' '), chip: m.cpu, gpu: g.length ? { name: g.join(' + '), cores: null } : null })
  } else Object.assign(m, { os: `${os.type()} ${os.release()}`, chip: m.cpu })
  machine = m
  return m
}

async function readNet() {
  if (mac) return parseNetstat(await run('netstat', ['-ibn']))
  if (win) return parseWinNet(await ps('Get-NetAdapterStatistics | Select-Object Name,ReceivedBytes,SentBytes | ConvertTo-Json'))
  return null
}
/* the heaviest programs: every three seconds is enough, and Windows' PowerShell is slow to start */
async function readTop() {
  if (Date.now() - lastTop.at < (win ? 4500 : 2500) && lastTop.at) return lastTop.rows
  const rows = await readProcs()
  lastTop = { at: Date.now(), rows }
  return rows
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
  const [m, net, procs, sl, vm, pressure, swap, gpuUse] = await Promise.all([
    machineInfo(), readNet(), readTop(), readSlow(),
    mac ? run('vm_stat') : '', mac ? run('sysctl', ['-n', 'kern.memorystatus_vm_pressure_level']) : '', mac ? run('sysctl', ['-n', 'vm.swapusage']) : '',
    mac ? run('ioreg', ['-r', '-d', '1', '-w', '0', '-c', 'IOAccelerator']) : '',
  ])
  const at = Date.now()
  const rate = net && lastNet ? netRate(lastNet, net, (at - lastNet.at) / 1000) : null
  if (net) lastNet = { ...net, at }
  const v = parseVmStat(vm)
  const total = os.totalmem()
  const out = {
    at, machine: m, uptime: os.uptime(),
    cpu: cpu || { total: null, per: cpus.map(() => 0) }, load: mac ? os.loadavg() : null,
    mem: { total, used: v ? Math.min(total, v.app) : total - os.freemem(), cached: v?.cached ?? null, pressure: parsePressure(pressure), swap: parseSwap(swap) },
    gpu: { name: m.gpu?.name || '', cores: m.gpu?.cores ?? null, use: mac ? parseGpuUse(gpuUse) : null },
    net: { rate, ip: localAddress(os.networkInterfaces()), cards: net?.cards || [] },
    drives: sl.drives, battery: sl.battery, therm: { state: thermalState(), ...(sl.therm || {}) },
    top: topProcs(procs),
  }
  out.advice = advice(out)
  return out
}
/* one reading at a time: a slow computer never piles readings up; a second ask waits for the one under way */
let reading = null
const nowOnce = () => reading || (reading = now().finally(() => { reading = null }))

/* ---------- the internet speed test (Cloudflare's public endpoints) ----------
   Through Electron's own network (net.fetch: the computer's proxy settings count), else Node's fetch (the tests).
   Several downloads and uploads side by side, as the big speed tests do, so a fast line is measured in full; the bytes
   are counted as they arrive and the speed is that count over time, the warm-up left out. Every request has a
   deadline: a line that stalls ends its phase with what it measured, instead of hanging. */
const CF = 'https://speed.cloudflare.com'
const http = (() => { try { const { net } = require('electron'); return typeof net?.fetch === 'function' ? net.fetch.bind(net) : fetch } catch { return fetch } })()
async function speedTest(ctx, emit, o = {}) {
  const base = o.base || CF, get = o.fetch || http
  const T = { down: 10000, up: 8000, streams: [4, 3], ...o.times }
  const stop = () => ctx.stopped()
  const halt = () => { if (stop()) throw new ctx.engine.Stopped() }
  const ctl = new AbortController()
  const watch = setInterval(() => { if (stop()) ctl.abort() }, 150)
  const bust = () => `r=${Math.random().toString(36).slice(2)}`
  const offline = () => new Error('The speed test could not reach Cloudflare. Check the internet connection; a firewall or proxy may also block it.')
  try {
    // where the test runs from, and this connection's public address
    let where = {}
    try { where = parseTrace(await (await get(`${base}/cdn-cgi/trace?${bust()}`, { signal: AbortSignal.any([ctl.signal, AbortSignal.timeout(8000)]) })).text()) } catch { halt(); throw offline() }
    // latency: ten small requests, one after the other
    const seq = []
    for (let i = 0; i < 10; i++) {
      halt()
      const t0 = performance.now()
      try {
        const r = await get(`${base}/__down?bytes=0&${bust()}`, { signal: AbortSignal.any([ctl.signal, AbortSignal.timeout(5000)]) }); await r.arrayBuffer()
      } catch (e) { halt(); if (!seq.length) throw offline(); continue }
      seq.push(performance.now() - t0)
      emit('stats-speed-tick', { phase: 'ping', ping: Math.min(...seq), done: (i + 1) / 10 })
    }
    const { ping, jitter } = pingOf(seq)
    // a phase: `streams` workers side by side until the time is up, the bytes counted as they move
    const phase = async (name, ms, streams, once) => {
      const t0 = performance.now(), end = t0 + ms
      const lane = new AbortController() // ends whatever is still under way when the time is up (plus a grace)
      const cut = setTimeout(() => lane.abort(), ms + 4000)
      const signal = AbortSignal.any([ctl.signal, lane.signal])
      let bytes = 0
      const marks = [{ t: t0, bytes: 0 }]
      const tick = setInterval(() => {
        marks.push({ t: performance.now(), bytes })
        const last = marks.slice(-6)
        const live = last.length > 1 ? ((last[last.length - 1].bytes - last[0].bytes) * 8) / ((last[last.length - 1].t - last[0].t) / 1000) / 1e6 : 0
        emit('stats-speed-tick', { phase: name, mbps: live, done: Math.min(1, (performance.now() - t0) / ms) })
      }, 250)
      const worker = async () => {
        let size = 1e6
        try {
          while (performance.now() < end) {
            halt()
            const s0 = performance.now()
            await once(size, (b) => { bytes += b }, signal)
            // pieces that take under a second grow, up to 100 MB
            if (performance.now() - s0 < 1000) size = Math.min(1e8, size * 4)
          }
        } catch (e) { if (stop()) throw new ctx.engine.Stopped(); if (!lane.signal.aborted && !bytes) throw e }
      }
      try { await Promise.all(Array.from({ length: streams }, worker)) } finally { clearInterval(tick); clearTimeout(cut) }
      marks.push({ t: performance.now(), bytes })
      return rateOf(marks)
    }
    const down = await phase('down', T.down, T.streams[0], async (size, add, signal) => {
      const r = await get(`${base}/__down?bytes=${size}&${bust()}`, { signal })
      if (!r.ok) throw new Error(`Cloudflare answered ${r.status}`)
      for await (const c of r.body) add(c.length)
    })
    if (!(down > 0)) throw offline()
    const bodies = new Map()
    const up = await phase('up', T.up, T.streams[1], async (size, add, signal) => {
      const n = Math.min(size, 2.5e7)
      if (!bodies.has(n)) bodies.set(n, Buffer.alloc(n, 7))
      const r = await get(`${base}/__up?${bust()}`, { signal, method: 'POST', body: bodies.get(n), headers: { 'Content-Type': 'application/octet-stream' } })
      await r.arrayBuffer()
      add(n)
    })
    return { at: Date.now(), ping, jitter, down, up, ip: where.ip || '', colo: where.colo || '', loc: where.loc || '', ...verdict(down, up) }
  } catch (e) {
    if (stop() || e?.name === 'AbortError' && ctl.signal.aborted) throw new ctx.engine.Stopped()
    if (e instanceof ctx.engine.Stopped) throw e
    throw /could not reach|answered/.test(e?.message || '') ? e : offline()
  } finally { clearInterval(watch) }
}

function register(ctx) {
  ctx.handle('stats-now', () => nowOnce())
  ctx.handle('stats-speed', (_a, { emit }) => ctx.run(() => speedTest(ctx, emit)))
}

module.exports = { register, speedTest, netRate, parseGpu, parseGpuUse, localAddress, advice, pingOf, rateOf, parseDf, parseWinDrives, parseVmStat, parsePressure, parseSwap, parseNetstat, parseWinNet, parseBatt, parseIoregBattery, parseWinBattery, parseTherm, parsePs, topProcs, parseHardware, parseTrace, cpuUse, verdict, jitterOf }
