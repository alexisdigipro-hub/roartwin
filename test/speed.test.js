// Disk speed test on a temporary folder: it measures, cleans up after itself (also on Stop), and the codec table holds.
// node test/speed.test.js
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { speedTest, codecTable, NAME } = require('../electron/tools/speed')

;(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roartwin-speed-'))
  fs.writeFileSync(path.join(dir, 'keep.txt'), 'mine')
  const ticks = []
  const r = await speedTest(dir, 200e6, (t) => ticks.push(t))
  assert.ok(r.write > 0 && r.read > 0, 'both speeds measured')
  assert.ok(ticks.some((t) => t.phase === 'write') && ticks.some((t) => t.phase === 'read'))
  assert.deepStrictEqual(fs.readdirSync(dir), ['keep.txt'], 'the test file is gone, nothing else touched')

  // Stop half way: an error named Stopped, and the file still goes
  let n = 0
  await assert.rejects(speedTest(dir, 400e6, () => {}, () => ++n > 2), (e) => e.name === 'Stopped')
  assert.deepStrictEqual(fs.readdirSync(dir), ['keep.txt'])
  assert.ok(!fs.readdirSync(dir).some((f) => f.startsWith(NAME)))

  // a long write (sustained): speed kept every half second, stops at its time, reads back only the first part, cleans up
  const long = await speedTest(dir, 3e9, () => {}, () => false, { sustained: true, seconds: 1.2, readBytes: 64 * 1024 * 1024 })
  assert.ok(long.sustained && long.samples.length >= 1, 'samples kept')
  assert.ok(long.bytes > 0 && long.bytes <= 3e9)
  assert.ok(long.read > 0)
  assert.deepStrictEqual(fs.readdirSync(dir), ['keep.txt'])

  // a drive without room: a plain message, and nothing left behind
  await assert.rejects(speedTest(dir, 1e15), /Not enough free space/)
  assert.deepStrictEqual(fs.readdirSync(dir), ['keep.txt'])
  // errors a person can act on
  const { plainError } = require('../electron/tools/speed')
  assert.match(plainError(Object.assign(new Error('EROFS: read-only file system'), { code: 'EROFS' })).message, /cannot be written/)
  assert.match(plainError(Object.assign(new Error('x'), { code: 'ENOSPC' })).message, /filled up/)
  assert.match(plainError(Object.assign(new Error('x'), { code: 'ENOENT' })).message, /not there/)
  // a folder that is gone says so too, through the test itself
  await assert.rejects(speedTest(path.join(dir, 'gone'), 100e6), /not there/)

  // the table: ProRes grows with the picture, BRAW 3:1 UHD about 104 MB/s at 25p
  const t = codecTable()
  assert.deepStrictEqual(t.sizes, ['HD', 'UHD', '6K', '8K'])
  const row = (c) => t.rows.find((x) => x.codec === c).rates
  assert.strictEqual(row('ProRes 422 HQ')[0], 23)
  assert.ok(row('ProRes 422 HQ')[1] > 90 && row('ProRes 422 HQ')[1] < 93)
  assert.ok(Math.abs(row('BRAW 3:1')[1] - 103.7) < 0.2)
  assert.ok(row('ProRes 4444')[3] > row('ProRes 4444')[2])

  fs.rmSync(dir, { recursive: true, force: true })
  console.log('speed: all good')
})().catch((e) => { console.error(e); process.exit(1) })
