// The menu bar: the icon is a real PNG of the right size, the menu's lines, and each alert told once when it begins
// (the start-up disk under 10%, a drive failing, the computer seriously hot), not again until it has passed.
// node test/tray.test.js
const assert = require('assert')
const zlib = require('zlib')
const { iconPNG, png, crc32, alerts, lines, gb, bootSpace } = require('../electron/tray')

// the icon
assert.strictEqual(crc32(Buffer.from('123456789')), 0xcbf43926, 'the PNG checksum')
for (const size of [18, 36]) {
  const b = iconPNG(size)
  assert.ok(b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
  assert.strictEqual(b.readUInt32BE(16), size); assert.strictEqual(b.readUInt32BE(20), size)
  const idat = b.subarray(b.indexOf('IDAT') + 4, b.indexOf('IEND') - 8)
  const raw = zlib.inflateSync(idat)
  assert.strictEqual(raw.length, (size * 4 + 1) * size)
  let ink = 0, rgb = 0
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const i = y * (size * 4 + 1) + 1 + x * 4; if (raw[i + 3] > 128) ink++; rgb += raw[i] + raw[i + 1] + raw[i + 2] }
  assert.ok(ink > size * size * 0.25 && ink < size * size * 0.75, 'a shape, not empty and not full: ' + ink)
  assert.strictEqual(rgb, 0, 'black only: macOS colours a template image')
}
assert.strictEqual(png(1, 1, Buffer.from([255, 0, 0, 255])).length > 50, true)

// the lines
const GB = 1e9
const r = (free, o = {}) => ({ boot: { free: free * GB, total: 1000 * GB }, pressure: 'normal', heat: 'nominal', drives: [], ...o })
assert.deepStrictEqual(lines(r(212)), { disk: 'Start-up disk: 212 GB free (21%)', mem: 'Memory: normal', heat: 'Heat: normal', title: '212 GB' })
assert.strictEqual(lines(r(212, { pressure: 'warning', heat: 'serious' }), 'el').mem, 'Μνήμη: πιέζεται')
assert.strictEqual(lines(null).disk, 'Start-up disk: not read yet')
assert.strictEqual(lines(r(212, { heat: '' })).heat, 'Heat: not reported')
assert.strictEqual(gb(1.45e12), '1.4 TB')

// the alerts: once when it begins
let a = alerts(null, r(212))
assert.deepStrictEqual(a.notes, [])
a = alerts(a.state, r(80))
assert.deepStrictEqual(a.notes.map((n) => [n.id, n.tool]), [['low', 'space']])
assert.match(a.notes[0].body, /80 GB free \(8%\)/)
a = alerts(a.state, r(70))
assert.deepStrictEqual(a.notes, [], 'still low: not told again')
a = alerts(a.state, r(150))
assert.deepStrictEqual(a.notes, [], 'room again: nothing to tell')
a = alerts(a.state, r(90))
assert.deepStrictEqual(a.notes.map((n) => n.id), ['low'], 'low again: told again')
// a failing drive, once; another one later, once; the drives not read this time keep what was known
const failing = (name) => ({ name: 'disk' + name, health: 'failing', mounts: [{ name }] })
a = alerts(a.state, r(90, { drives: [failing('OLD RAID'), { name: 'x', health: 'ok', mounts: [] }] }))
assert.deepStrictEqual(a.notes.map((n) => n.id), ['fail:OLD RAID'])
a = alerts(a.state, r(90, { drives: undefined }))
assert.deepStrictEqual(a.notes, [], 'not read again: nothing new')
a = alerts(a.state, r(90, { drives: [failing('OLD RAID'), failing('SHUTTLE')] }))
assert.deepStrictEqual(a.notes.map((n) => n.id), ['fail:SHUTTLE'])
// heat: serious or critical, once
a = alerts(a.state, r(90, { heat: 'fair', drives: [] }))
assert.deepStrictEqual(a.notes, [])
a = alerts(a.state, r(90, { heat: 'serious' }))
assert.deepStrictEqual(a.notes.map((n) => [n.id, n.tool]), [['hot', 'stats']])
a = alerts(a.state, r(90, { heat: 'critical' }))
assert.deepStrictEqual(a.notes, [], 'hotter still: the same state')
assert.strictEqual(alerts(null, r(5, { heat: 'critical' }), 'el').notes[1].title, 'Ο υπολογιστής ζεστάθηκε')
// the start-up disk is read by the file system's own numbers
const b = bootSpace('/')
assert.ok(b && b.total > 0 && b.free >= 0 && b.free <= b.total)
console.log('tray: all good')
