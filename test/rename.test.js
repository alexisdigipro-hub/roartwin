// Rename clips on a made-up folder: the rule's output, clashes and names taken refused, never over a file, Undo.
// node test/rename.test.js (FFMPEG=/path/to/ffmpeg, else ffmpeg-static)
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')
const rename = require('../electron/tools/rename')
const engine = require('../electron/engine')

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roartwin-rename-'))
const put = (n, t) => { fs.writeFileSync(path.join(dir, n), 'x'); fs.utimesSync(path.join(dir, n), t / 1000, t / 1000) }
const T = (d, h) => new Date(2026, 9, d, h, 5, 9).getTime()

;(async () => {
  put('C0002.MP4', T(14, 11)); put('C0001.MP4', T(14, 10)); put('notes.txt', T(14, 9))
  const files = await rename.scanFolder(dir)
  // in the order they were shot; {n} from the start, padded; missing tokens leave no doubled separators
  let rows = rename.plan(files, { pattern: '{date}_{project}_{cam}{card}_{n}', project: 'Ilie mou', cam: 'A', card: '', start: 1, pad: 3, kind: 'video' })
  assert.deepStrictEqual(rows.map((r) => [r.from, r.to, r.status]), [['C0001.MP4', '2026-10-14_Ilie mou_A_001.MP4', 'ok'], ['C0002.MP4', '2026-10-14_Ilie mou_A_002.MP4', 'ok']])
  rows = rename.plan(files, { pattern: '{date}__{time}-{name}', dateFormat: 'YYMMDD', case: 'lower', kind: 'all' })
  assert.deepStrictEqual(rows.map((r) => r.to), ['261014__090509-notes.txt', '261014__100509-c0001.MP4', '261014__110509-c0002.MP4'], 'lower case, the extension as it was, the separators as written')
  // what the rule writes stays; only the separators around a token with nothing in it go (audit, 29 Oct)
  rows = rename.plan(files, { pattern: '{project} - {name}', project: 'Ilie', kind: 'video' })
  assert.deepStrictEqual(rows.map((r) => r.to), ['Ilie - C0001.MP4', 'Ilie - C0002.MP4'])
  rows = rename.plan(files, { pattern: '{project} - {name}', project: '', kind: 'video' })
  assert.deepStrictEqual(rows.map((r) => r.to), ['C0001.MP4', 'C0002.MP4'].map(String), 'an empty project leaves no " - "')
  rows = rename.plan(files, { pattern: '{date}_{reel}_{n}', pad: 1, kind: 'video' })
  assert.deepStrictEqual(rows.map((r) => r.to), ['2026-10-14_1.MP4', '2026-10-14_2.MP4'])
  // the counter starting again each shooting day
  const days = [{ name: 'a.mov', base: 'a', ext: 'mov', kind: 'video', mtime: T(14, 9), meta: {} }, { name: 'b.mov', base: 'b', ext: 'mov', kind: 'video', mtime: T(14, 10), meta: {} }, { name: 'c.mov', base: 'c', ext: 'mov', kind: 'video', mtime: T(15, 9), meta: {} }]
  assert.deepStrictEqual(rename.plan(days, { pattern: '{date}_{n}', pad: 2, perDay: true }).map((r) => r.to), ['2026-10-14_01.mov', '2026-10-14_02.mov', '2026-10-15_01.mov'])
  assert.deepStrictEqual(rename.plan(days, { pattern: '{date}_{n}', pad: 2 }).map((r) => r.to), ['2026-10-14_01.mov', '2026-10-14_02.mov', '2026-10-15_03.mov'])
  // clash: two clips, one name
  rows = rename.plan(files, { pattern: 'Clip', kind: 'video' })
  assert.deepStrictEqual(rows.map((r) => r.status), ['clash', 'clash'])
  await assert.rejects(rename.apply(dir, rows), /clash/)
  // taken: another file of the folder already has the name
  rows = rename.plan(files, { pattern: 'notes', kind: 'video', only: ['C0001.MP4'] })
  assert.strictEqual(rows.length, 1, 'only the files chosen')
  rows = rename.plan(files, { pattern: '{name}', kind: 'all' })
  assert.ok(rows.every((r) => r.status === 'same'))
  rows = rename.plan([files.find((f) => f.name === 'C0001.MP4')], { pattern: 'C0002' }, fs.readdirSync(dir))
  assert.strictEqual(rows[0].status, 'taken')
  rows = rename.plan(files, { pattern: '{reel}', kind: 'video' })
  assert.deepStrictEqual(rows.map((r) => r.status), ['empty', 'empty'])

  // carried out, then undone
  rows = rename.plan(files, { pattern: 'A_{n}', pad: 2, kind: 'video' }, fs.readdirSync(dir))
  const r = await rename.apply(dir, rows)
  assert.deepStrictEqual(r.moves, [{ from: 'C0001.MP4', to: 'A_01.MP4' }, { from: 'C0002.MP4', to: 'A_02.MP4' }])
  assert.deepStrictEqual(fs.readdirSync(dir).sort(), ['A_01.MP4', 'A_02.MP4', 'notes.txt'])
  const u = await rename.undo(dir, r.moves)
  assert.strictEqual(u.done, 2)
  assert.deepStrictEqual(fs.readdirSync(dir).sort(), ['C0001.MP4', 'C0002.MP4', 'notes.txt'])
  // only the case: through a passing name
  rows = rename.plan(await rename.scanFolder(dir), { pattern: '{name}', case: 'lower', kind: 'video' }, fs.readdirSync(dir))
  assert.deepStrictEqual(rows.map((x) => x.to), ['c0001.MP4', 'c0002.MP4'])
  await rename.apply(dir, rows)
  assert.ok(fs.readdirSync(dir).includes('c0001.MP4'))

  // names passing from one file to another in one batch (A_01 to A_02 while A_02 goes to A_03): not "taken", and done
  // in two steps so nothing is written over (audit, 29 Oct: before, every row was refused as taken)
  for (const n of fs.readdirSync(dir)) fs.rmSync(path.join(dir, n))
  put('A_01.MP4', T(14, 10)); put('A_02.MP4', T(14, 11)); fs.writeFileSync(path.join(dir, 'A_02.MP4'), 'second')
  rows = rename.plan(await rename.scanFolder(dir), { pattern: 'A_{n}', start: 2, pad: 2, kind: 'video' }, fs.readdirSync(dir))
  assert.deepStrictEqual(rows.map((x) => [x.from, x.to, x.status]), [['A_01.MP4', 'A_02.MP4', 'ok'], ['A_02.MP4', 'A_03.MP4', 'ok']])
  const shift = await rename.apply(dir, rows)
  assert.strictEqual(shift.moves.length, 2)
  assert.deepStrictEqual(fs.readdirSync(dir).sort(), ['A_02.MP4', 'A_03.MP4'])
  assert.strictEqual(fs.readFileSync(path.join(dir, 'A_03.MP4'), 'utf8'), 'second', 'the right file got the right name')
  assert.strictEqual((await rename.undo(dir, shift.moves)).done, 2)
  assert.deepStrictEqual(fs.readdirSync(dir).sort(), ['A_01.MP4', 'A_02.MP4'])
  assert.strictEqual(fs.readFileSync(path.join(dir, 'A_02.MP4'), 'utf8'), 'second')
  // a name kept by a file that stays may not be taken by another
  rows = rename.plan(await rename.scanFolder(dir), { pattern: 'A_02', kind: 'video', only: ['A_01.MP4'] }, fs.readdirSync(dir))
  assert.strictEqual(rows[0].status, 'taken')
  // a file appearing under the new name between the preview and the rename: refused, the file back under its old name
  rows = rename.plan(await rename.scanFolder(dir), { pattern: 'B_{n}', pad: 1, kind: 'video' }, fs.readdirSync(dir))
  fs.writeFileSync(path.join(dir, 'B_1.MP4'), 'someone else')
  const late = await rename.apply(dir, rows)
  assert.strictEqual(late.failed.length, 1)
  assert.strictEqual(fs.readFileSync(path.join(dir, 'B_1.MP4'), 'utf8'), 'someone else', 'never written over')
  assert.ok(fs.existsSync(path.join(dir, 'A_01.MP4')), 'the refused one keeps its name')
  assert.ok(!fs.readdirSync(dir).some((n) => n.startsWith('.roarkit-')), 'no passing names left behind')
  for (const n of fs.readdirSync(dir)) fs.rmSync(path.join(dir, n))
  put('C0002.MP4', T(14, 11)); put('C0001.MP4', T(14, 10)); put('notes.txt', T(14, 9))

  // the metadata: creation date, timecode, camera, reel
  const m = rename.metaOf({ tags: { creation_time: '2026-03-02T08:00:00Z', 'com.apple.quicktime.make': 'Sony', 'com.apple.quicktime.model': 'ILME-FX6' }, streams: [{ tags: { timecode: '01:00:00:00', reel_name: 'A001' } }], timecode: '01:00:00:00' })
  assert.deepStrictEqual([m.created, m.tc, m.camera, m.reel], [Date.UTC(2026, 2, 2, 8), '01:00:00:00', 'Sony ILME-FX6', 'A001'])
  assert.strictEqual(rename.metaOf({ tags: {}, streams: [] }, { kMDItemAcquisitionMake: 'Canon', kMDItemAcquisitionModel: 'Canon EOS R5' }).camera, 'Canon EOS R5', 'no make twice')

  // a real clip: its own creation date and timecode in the name
  let bin = process.env.FFMPEG
  try { bin = bin || require('ffmpeg-static') } catch { /* none */ }
  if (bin) {
    execFileSync(bin, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=25:duration=1', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
      '-timecode', '14:30:00:00', '-metadata', 'creation_time=2026-05-06T07:08:09Z', path.join(dir, 'shot.mov')])
    const real = await rename.scanFolder(dir, { bin, ff: engine.ff })
    const to = rename.plan(real, { pattern: '{date}_{tc}', kind: 'video', only: ['shot.mov'] })[0].to
    const d = new Date(Date.UTC(2026, 4, 6, 7, 8, 9))
    assert.strictEqual(to, `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}_14300000.mov`)
  } else console.log('(no ffmpeg: the real clip is left out)')

  // the doors: only a folder chosen here
  const doors = {}
  rename.register({ handle: (n, fn) => { doors[n] = fn }, run: (fn) => fn(), stopped: () => false, allow() {}, engine, ffmpeg: () => '' })
  await assert.rejects(doors['rename-preview']({ path: dir, rule: {} }), /Choose the folder/)
  const picked = await doors['rename-folder']({ paths: [path.join(dir, 'notes.txt')] })
  assert.deepStrictEqual(picked, { path: dir, only: ['notes.txt'] })
  const prev = await doors['rename-preview']({ path: dir, rule: { pattern: 'Notes {n}', pad: 1, only: picked.only } })
  assert.deepStrictEqual(prev.map((x) => x.to), ['Notes 1.txt'])
  assert.strictEqual((await doors['rename-apply']({ path: dir, rule: { pattern: 'Notes {n}', pad: 1, only: picked.only } })).done, 1)
  assert.ok(fs.existsSync(path.join(dir, 'Notes 1.txt')))
  assert.strictEqual((await doors['rename-undo']()).done, 1)
  assert.ok(fs.existsSync(path.join(dir, 'notes.txt')))

  // Undo after the app was closed and opened again: the batch is kept in the app's folder (audit, 29 Oct)
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'roarkit-data-'))
  const open = () => { const d = {}; rename.register({ app: { getPath: () => data }, handle: (n, fn) => { d[n] = fn }, run: (fn) => fn(), stopped: () => false, allow() {}, engine, ffmpeg: () => '' }); return d }
  let d1 = open()
  await d1['rename-folder']({ paths: [dir] })
  const videos = fs.readdirSync(dir).filter((n) => /\.(MP4|mov)$/.test(n)).sort()
  assert.strictEqual((await d1['rename-apply']({ path: dir, rule: { pattern: 'X{n}', pad: 1, kind: 'video' } })).done, videos.length)
  const d2 = open() // the app started again
  assert.deepStrictEqual((await d2['rename-last']()).count, videos.length)
  assert.strictEqual((await d2['rename-undo']()).done, videos.length)
  assert.deepStrictEqual(fs.readdirSync(dir).filter((n) => /\.(MP4|mov)$/.test(n)).sort(), videos)
  assert.strictEqual(await open()['rename-last'](), null, 'nothing left to undo')
  fs.rmSync(data, { recursive: true, force: true })

  fs.rmSync(dir, { recursive: true, force: true })
  console.log('rename: all good')
})().catch((e) => { console.error(e); process.exit(1) })
