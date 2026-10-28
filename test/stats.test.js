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
assert.deepStrictEqual(net, { rx: 5000001000, tx: 700002000, cards: ['en0', 'en5'] })
assert.deepStrictEqual(s.parseWinNet('[{"Name":"Ethernet","ReceivedBytes":100,"SentBytes":50},{"Name":"Wi-Fi","ReceivedBytes":10,"SentBytes":5}]'), { rx: 110, tx: 55, cards: ['Ethernet', 'Wi-Fi'] })

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

console.log('stats: all good')
