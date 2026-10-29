// Computer stats: each parser on what its command prints. node test/stats.test.js
const assert = require('assert')
const s = require('../electron/tools/stats')

// df -kP on a Mac: the start-up disk and a drive; the system's own volumes left out; a name with spaces kept
const df = `Filesystem     1024-blocks      Used Available Capacity  Mounted on
/dev/disk3s1s1   971350180  10750000 600000000     2%    /
devfs                  204       204         0   100%    /dev
/dev/disk3s6     971350180   2097172 600000000     1%    /System/Volumes/VM
/dev/disk3s5     971350180 350000000 600000000    37%    /System/Volumes/Data
map auto_home            0         0         0   100%    /System/Volumes/Data/home
/dev/disk5s2    1953182840 953182840 1000000000    49%    /Volumes/SHOOT 01`
const d = s.parseDf(df)
assert.deepStrictEqual(d.map((x) => x.mount), ['/', '/Volumes/SHOOT 01'])
assert.strictEqual(d[1].name, 'SHOOT 01')
assert.strictEqual(d[1].free, 1000000000 * 1024)
assert.deepStrictEqual(s.parseWinDrives('[{"Name":"C","Root":"C:\\\\","Used":200,"Free":800},{"Name":"D","Root":"D:\\\\","Used":null,"Free":null}]').map((x) => [x.name, x.total]), [['C:', 1000]])

// vm_stat: pages and their size
const vm = s.parseVmStat(`Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                               12000.
Pages active:                            300000.
Pages inactive:                          290000.
Pages speculative:                         5000.
Pages wired down:                        150000.
Pages purgeable:                           3000.
Pages occupied by compressor:            100000.`)
assert.strictEqual(vm.page, 16384)
assert.strictEqual(vm.app, (300000 + 150000 + 100000) * 16384)
assert.strictEqual(s.parseVmStat('nothing'), null)
// macOS 10.13 on: the apps' memory is the anonymous pages; files read lately are cache, as Activity Monitor counts it
const vm2 = s.parseVmStat(`Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                               12000.
Pages active:                            300000.
Pages inactive:                          290000.
Pages speculative:                         5000.
Pages wired down:                        150000.
Pages purgeable:                           3000.
File-backed pages:                       350000.
Anonymous pages:                         245000.
Pages occupied by compressor:            100000.`)
assert.strictEqual(vm2.app, (245000 - 3000 + 150000 + 100000) * 16384)
assert.strictEqual(vm2.cached, (350000 + 3000) * 16384)
assert.strictEqual(s.parsePressure('1\n'), 'normal')
assert.strictEqual(s.parsePressure('4'), 'critical')
assert.strictEqual(s.parsePressure(''), '')
assert.deepStrictEqual(s.parseSwap('total = 2048.00M  used = 1024.50M  free = 1023.50M  (encrypted)'), { total: 2048 * 1024 ** 2, used: 1024.5 * 1024 ** 2 })

// netstat -ibn: the cards' byte counts, with and without the address column; loopback and tunnels left out
const ns = `Name       Mtu   Network       Address            Ipkts Ierrs     Ibytes    Opkts Oerrs     Obytes  Coll
lo0        16384 <Link#1>                         4545     0     999999     4545     0     999999     0
lo0        16384 127           127.0.0.1          4545     -     999999     4545     -     999999     -
en0        1500  <Link#11>   a4:83:e7:00:00:01  1000000     0 5000000000   800000     0  700000000     0
en0        1500  192.168.1     192.168.1.20      1000000     -  5000000000   800000     -  700000000     -
en5*       1500  <Link#12>                          10     0       1000       10     0       2000     0
utun3      1380  <Link#20>                         100     0     777777      100     0     777777     0`
const net = s.parseNetstat(ns)
assert.deepStrictEqual([net.rx, net.tx, net.cards], [5000001000, 700002000, ['en0', 'en5']])
assert.deepStrictEqual(net.per.en0, { rx: 5000000000, tx: 700000000 })
// a port with no traffic is not named (a Mac's Thunderbolt ports are cards too)
assert.deepStrictEqual(s.parseNetstat(ns.replace('en5*       1500  <Link#12>                          10     0       1000       10     0       2000     0', 'en5*       1500  <Link#12>                           0     0          0        0     0          0     0')).cards, ['en0'])
// the rate card by card: Wi-Fi coming up between two readings is no spike, a counter starting again is no minus
const r1 = { per: { en0: { rx: 1000, tx: 500 } } }
assert.deepStrictEqual(s.netRate(r1, { per: { en0: { rx: 3000, tx: 900 }, en1: { rx: 9e12, tx: 9e12 } } }, 2), { down: 1000, up: 200 })
assert.deepStrictEqual(s.netRate(r1, { per: { en0: { rx: 10, tx: 10 } } }, 1), { down: 0, up: 0 })
assert.strictEqual(s.netRate(null, r1, 1), null)
const wn = s.parseWinNet('[{"Name":"Ethernet","ReceivedBytes":100,"SentBytes":50},{"Name":"Wi-Fi","ReceivedBytes":10,"SentBytes":5}]')
assert.deepStrictEqual([wn.rx, wn.tx, wn.cards, wn.per['Wi-Fi']], [110, 55, ['Ethernet', 'Wi-Fi'], { rx: 10, tx: 5 }])

// the battery
const b = s.parseBatt(`Now drawing from 'AC Power'
 -InternalBattery-0 (id=4653155)	87%; charging; 1:23 remaining present: true`)
assert.deepStrictEqual(b, { percent: 87, state: 'charging', remaining: '1:23', source: 'ac' })
assert.strictEqual(s.parseBatt('Now drawing from \'AC Power\''), null)
const io = s.parseIoregBattery(`  "CycleCount" = 312
  "DesignCapacity" = 4382
  "AppleRawMaxCapacity" = 3900
  "MaxCapacity" = 100
  "Temperature" = 3051`)
assert.deepStrictEqual([io.cycles, io.health, io.temp], [312, 89, 30.51])
assert.strictEqual(s.parseIoregBattery(''), null)
assert.strictEqual(s.parseWinBattery('{"EstimatedChargeRemaining":55,"BatteryStatus":2}').percent, 55)

// heat: no warning; a slowed processor
assert.deepStrictEqual(s.parseTherm(`Note: No thermal warning level has been recorded
Note: No performance warning level has been recorded
Note: No CPU power status has been recorded`), { limit: null, warnings: [] })
const hot = s.parseTherm(`CPU_Scheduler_Limit 	= 100
CPU_Available_CPUs 	= 8
CPU_Speed_Limit 	= 70
Thermal warning level set to 2.`)
assert.strictEqual(hot.limit, 70)

// programs: a name with spaces, helpers counted with their program
const rows = s.parsePs(`  PID  %CPU    RSS COMM
    1   0.2  20000 launchd
  420  45.0 800000 DaVinci Resolve
  612  12.5 300000 Google Chrome
  613   8.0 200000 Google Chrome Helper (Renderer)
  700   1.0 900000 Adobe Premiere Pro 2025`)
assert.strictEqual(rows[1].name, 'DaVinci Resolve')
const top = s.topProcs(rows, 3)
assert.deepStrictEqual(top.cpu.map((x) => x.name), ['DaVinci Resolve', 'Google Chrome', 'Adobe Premiere Pro 2025'])
assert.strictEqual(top.cpu[1].cpu, 20.5)
assert.strictEqual(top.mem[0].name, 'Adobe Premiere Pro 2025')

// the machine
const hw = s.parseHardware(JSON.stringify({ SPHardwareDataType: [{ machine_name: 'MacBook Pro', machine_model: 'Mac15,9', chip_type: 'Apple M3 Max', number_processors: 'proc 16:12:4', physical_memory: '64 GB' }] }))
assert.deepStrictEqual([hw.model, hw.chip, hw.cores, hw.perf, hw.eff], ['MacBook Pro', 'Apple M3 Max', 16, 12, 4])
assert.strictEqual(s.parseHardware('{}'), null)
assert.deepStrictEqual(s.parseTrace('fl=1\nip=203.0.113.9\ncolo=ATH\nloc=GR\n'), { fl: '1', ip: '203.0.113.9', colo: 'ATH', loc: 'GR' })

// processor use between two readings
const t = (user, idle) => ({ times: { user, nice: 0, sys: 0, irq: 0, idle } })
assert.deepStrictEqual(s.cpuUse([t(0, 0), t(0, 0)], [t(50, 50), t(100, 0)]), { total: 75, per: [50, 100] })
assert.strictEqual(s.cpuUse(null, [t(1, 1)]), null)

// the verdict: 10 GB up at 100 Mbit/s is about 13.3 minutes
assert.strictEqual(Math.round(s.verdict(500, 100).upload10GB * 10) / 10, 13.3)
assert.strictEqual(s.verdict(0, 0).upload10GB, null)
assert.strictEqual(s.jitterOf([10, 12, 11]), 1.5)
// jitter in the order the pings were sent: sorted it would read 6.7 ms for a line that swings by 20
assert.strictEqual(s.pingOf([30, 10, 30, 10]).jitter, 20)
assert.strictEqual(s.pingOf([50, 10, 12, 11, 13, 14, 12, 15, 90, 80]).ping, (10 + 11 + 12 + 12 + 13 + 14 + 15) / 7)
// a phase's speed: the warm-up left out
assert.strictEqual(s.rateOf([{ t: 0, bytes: 0 }, { t: 1500, bytes: 1e6 }, { t: 2500, bytes: 13.5e6 }]), 100)
assert.strictEqual(s.rateOf([{ t: 0, bytes: 0 }]), 0)

// the address of the card that carries the traffic, not a virtual machine's bridge
assert.strictEqual(s.localAddress({ lo0: [{ family: 'IPv4', internal: true, address: '127.0.0.1' }], bridge100: [{ family: 'IPv4', internal: false, address: '192.168.64.1' }], en0: [{ family: 'IPv4', internal: false, address: '192.168.1.20' }] }), '192.168.1.20')
assert.strictEqual(s.localAddress({}), '')

// the graphics
assert.deepStrictEqual(s.parseGpu(JSON.stringify({ SPDisplaysDataType: [{ _name: 'Apple M3 Max', sppci_model: 'Apple M3 Max', sppci_cores: '40' }] })), { name: 'Apple M3 Max', cores: 40 })
assert.strictEqual(s.parseGpu('{}'), null)
assert.strictEqual(s.parseGpuUse('+-o AGXAcceleratorG15X  <class AGXAcceleratorG15X>\n    "PerformanceStatistics" = {"In use system memory"=123,"Device Utilization %"=37,"Renderer Utilization %"=35}'), 37)
assert.strictEqual(s.parseGpuUse(''), null)

// why it is slow, in plain words
const calm = { mem: { pressure: 'normal', swap: { used: 0 } }, therm: { state: 'nominal' }, top: { cpu: [{ name: 'Finder', cpu: 1 }] }, drives: [{ mount: '/', total: 100, free: 50 }], cpu: { total: 12 }, battery: { health: 95 } }
assert.deepStrictEqual(s.advice(calm), [])
const busy = s.advice({ ...calm, mem: { pressure: 'critical', swap: { used: 12 * 1024 ** 3 } }, therm: { state: 'serious' }, top: { cpu: [{ name: 'DaVinci Resolve', cpu: 182.4 }, { name: 'kernel_task', cpu: 300 }] }, drives: [{ mount: '/', total: 100, free: 6 }], cpu: { total: 95 }, battery: { health: 72 } })
assert.deepStrictEqual(busy.map((x) => x.level), ['bad', 'warn', 'bad', 'warn', 'bad', 'warn'])
assert.deepStrictEqual(busy[3].vars, { a: 'DaVinci Resolve', b: 182 })
assert.ok(!busy.some((x) => x.vars.a === 'kernel_task'), 'kernel_task is heat, not a program')
assert.deepStrictEqual(s.advice({ ...calm, cpu: { total: 95 } }).map((x) => x.vars.a), [95])
assert.deepStrictEqual(s.advice(null), [])

// the internet speed test against a stand-in for Cloudflare on this computer: it measures, it stops, it says when the
// line is not there, and a line that stalls ends its phase instead of hanging
const http = require('http')
class Stopped extends Error { constructor() { super('Stopped') } }
const ctxOf = (stopAt = Infinity) => { const t0 = Date.now(); return { stopped: () => Date.now() - t0 > stopAt, engine: { Stopped } } }
;(async () => {
  let stall = false
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x')
    if (u.pathname === '/cdn-cgi/trace') return res.end('ip=203.0.113.9\ncolo=ATH\nloc=GR\n')
    if (u.pathname === '/__down') {
      const n = +u.searchParams.get('bytes') || 0
      res.writeHead(200, { 'Content-Length': n })
      if (stall && n) { res.write(Buffer.alloc(1000)); return } // then nothing more
      let left = n
      const piece = Buffer.alloc(64 * 1024)
      const more = () => { while (left > 0) { const k = Math.min(left, piece.length); left -= k; if (!res.write(piece.subarray(0, k))) return res.once('drain', more) } res.end() }
      return more()
    }
    if (u.pathname === '/__up') { req.on('data', () => {}); req.on('end', () => res.end('ok')); return }
    res.statusCode = 404; res.end()
  })
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
  const base = `http://127.0.0.1:${server.address().port}`
  const ticks = []
  const quick = { down: 1800, up: 1500, streams: [2, 2] }
  const r = await s.speedTest(ctxOf(), (ev, v) => ticks.push(v.phase), { base, times: quick })
  assert.ok(r.down > 1 && r.up > 1, 'measured both ways: ' + r.down.toFixed(0) + ' / ' + r.up.toFixed(0))
  assert.ok(r.ping >= 0 && r.jitter >= 0 && r.ip === '203.0.113.9' && r.colo === 'ATH')
  assert.ok(['ping', 'down', 'up'].every((p) => ticks.includes(p)), 'live progress for every phase')
  assert.ok(r.upload10GB > 0)
  // Stop in the middle of the download
  await assert.rejects(s.speedTest(ctxOf(900), () => {}, { base, times: quick }), (e) => e instanceof Stopped)
  // no line: a closed port
  const closed = http.createServer(); await new Promise((ok) => closed.listen(0, '127.0.0.1', ok)); const dead = `http://127.0.0.1:${closed.address().port}`; await new Promise((ok) => closed.close(ok))
  await assert.rejects(s.speedTest(ctxOf(), () => {}, { base: dead, times: quick }), /could not reach Cloudflare/)
  // a line that stalls: the phase ends at its time plus a grace, not never
  stall = true
  const t0 = Date.now()
  await assert.rejects(s.speedTest(ctxOf(), () => {}, { base, times: { down: 600, up: 400, streams: [1, 1] } }), /could not reach Cloudflare/)
  assert.ok(Date.now() - t0 < 12000, 'it did not hang')
  server.close()
  console.log('stats: all good')
})().catch((e) => { console.error(e); process.exit(1) })
