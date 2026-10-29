// File manager on made-up folders: listing, copy and move never over a file, folders opened here only, the template,
// the compare, and the media info read from ffmpeg's report (a fixture, then a real clip made with ffmpeg).
// node test/files.test.js (FFMPEG=/path/to/ffmpeg, else ffmpeg-static)
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')
const files = require('../electron/tools/files')
const engine = require('../electron/engine')

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'roartwin-files-'))
const at = (...p) => path.join(root, ...p)
const put = (rel, text) => { fs.mkdirSync(path.dirname(at(rel)), { recursive: true }); fs.writeFileSync(at(rel), text) }

const LOG = `ffmpeg version 6.1 Copyright (c) 2000-2023 the FFmpeg developers
Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'A001_C003.mov':
  Metadata:
    major_brand     : qt
    creation_time   : 2026-10-14T10:30:00.000000Z
    com.apple.quicktime.make: Blackmagic Design
    com.apple.quicktime.model: Pocket Cinema Camera 6K
    timecode        : 01:02:03:04
    comment         : first line
                    : second line
  Duration: 00:05:12.40, start: 0.000000, bitrate: 734205 kb/s
  Chapters:
    Chapter #0:0: start 0.000000, end 60.000000
      Metadata:
        title           : Scene 1
  Stream #0:0[0x1](eng): Video: prores (HQ) (apch / 0x68637061), yuv422p10le(tv, bt2020nc/bt2020/arib-std-b67, progressive), 3840x2160 [SAR 1:1 DAR 16:9], 730000 kb/s, 25 fps, 25 tbr, 12800 tbn (default)
    Metadata:
      handler_name    : Core Media Video
      vendor_id       : appl
    Side data:
      Mastering Display Metadata, has_primaries:1 has_luminance:1
  Stream #0:1[0x2](und): Audio: pcm_s24le (in24 / 0x34326E69), 48000 Hz, 4 channels, s32 (24 bit), 4608 kb/s (default)
  Stream #0:2[0x3](und): Data: none (tmcd / 0x64636D74), 0 kb/s (default)
    Metadata:
      timecode        : 01:02:03:04
At least one output file must be specified`

;(async () => {
  // the media info parser
  const info = files.parseInfo(LOG)
  assert.strictEqual(info.container, 'mov,mp4,m4a,3gp,3g2,mj2')
  assert.ok(Math.abs(info.duration - 312.4) < 1e-6)
  assert.strictEqual(info.bitrate, 734205)
  assert.strictEqual(info.timecode, '01:02:03:04')
  assert.strictEqual(info.tags.comment, 'first line\nsecond line', 'a value on two lines')
  assert.strictEqual(info.tags['com.apple.quicktime.make'], 'Blackmagic Design')
  assert.strictEqual(info.chapters.length, 1)
  assert.strictEqual(info.chapters[0].tags.title, 'Scene 1')
  const [v, a, d] = info.streams
  assert.deepStrictEqual([v.type, v.codec, v.profile, v.fourcc, v.lang], ['video', 'prores', 'HQ', 'apch', 'eng'])
  assert.deepStrictEqual([v.width, v.height, v.sar, v.dar, v.fps], [3840, 2160, '1:1', '16:9', 25])
  assert.deepStrictEqual([v.pix, v.bitDepth, v.range, v.matrix, v.primaries, v.transfer, v.scan, v.hdr], ['yuv422p10le', 10, 'Limited (tv)', 'bt2020nc', 'bt2020', 'arib-std-b67', 'Progressive', 'HLG'])
  assert.strictEqual(v.bitrate, 730000)
  assert.ok(v.flags.includes('default'))
  assert.strictEqual(v.side.length, 1)
  assert.strictEqual(v.tags.vendor_id, 'appl')
  assert.deepStrictEqual([a.codec, a.rate, a.channels, a.bitDepth, a.sampleFormat, a.bitrate], ['pcm_s24le', 48000, 4, 24, 's32', 4608])
  assert.strictEqual(d.fourcc, 'tmcd')
  const secs = files.sectionsOf(info, { name: 'A001_C003.mov', dir: '/Volumes/CARD', size: 28.6e9, mtime: Date.UTC(2026, 9, 14) })
  assert.deepStrictEqual(secs.map((s) => s.title), ['File', 'Container', 'Video #1', 'Audio #1', 'Data #1', 'Chapters', 'Metadata'])
  assert.ok(files.textOf(secs).includes('HDR: HLG'))
  assert.strictEqual(files.parseInfo('Stream #0:0: Video: h264 (High), yuv420p(tv, bt709), 1920x1080, 25 fps').streams[0].width, 1920, 'no Input line, still read')
  assert.deepStrictEqual(files.parseInfo('').streams, [], 'nothing, no crash')
  // bt709 alone means all three
  const s709 = files.parseInfo("Input #0, mov, from 'x':\n  Stream #0:0: Video: h264 (High) (avc1 / 0x31637661), yuv420p(tv, bt709, progressive), 1920x1080 [SAR 1:1 DAR 16:9], 8000 kb/s, 23.98 fps, 23.98 tbr").streams[0]
  assert.deepStrictEqual([s709.matrix, s709.primaries, s709.transfer, s709.fps, s709.bitDepth, s709.hdr], ['bt709', 'bt709', 'bt709', 23.98, 8, ''])
  // a photo's Spotlight fields
  const md = files.parseMdls('kMDItemAcquisitionMake         = "Canon"\nkMDItemAcquisitionModel        = "Canon EOS R5"\nkMDItemFNumber                 = 2.8\nkMDItemExposureTimeSeconds     = 0.004\nkMDItemAuthors                 = (\n    "Alex",\n    "Eva"\n)\nkMDItemLensModel = (null)')
  assert.deepStrictEqual(md, { kMDItemAcquisitionMake: 'Canon', kMDItemAcquisitionModel: 'Canon EOS R5', kMDItemFNumber: '2.8', kMDItemExposureTimeSeconds: '0.004', kMDItemAuthors: 'Alex, Eva' })
  const photo = files.sectionsOf(null, { name: 'IMG.CR3', dir: '/x', size: 1 }, md).find((s) => s.title === 'Photo')
  assert.deepStrictEqual(photo.rows.slice(0, 3), [['Camera', 'Canon Canon EOS R5'], ['Shutter', '1/250 s'], ['Aperture', 'ƒ/2.8']])

  // the folders
  put('A/Day 1/clip.mov', 'x'.repeat(1000))
  put('A/notes.txt', 'hello')
  put('B/notes.txt', 'other!')
  fs.symlinkSync(at('A/Day 1'), at('A/link'))
  const list = await files.listDir(at('A'))
  const by = Object.fromEntries(list.map((x) => [x.name, x]))
  assert.ok(by['Day 1'].dir && by.link.link && !by.link.dir, 'a link is listed as a link')
  assert.strictEqual(by['notes.txt'].kind, 'doc')
  assert.strictEqual(files.kindOf('A.mov'), 'video')
  assert.strictEqual(await files.freeName(at('B'), 'notes.txt'), at('B', 'notes 2.txt'))

  // copy, never over a file: the clash gets " 2"
  let r = await files.transfer({ paths: [at('A/notes.txt'), at('A/Day 1')], to: at('B') })
  assert.deepStrictEqual(r.ok, [at('B/notes 2.txt'), at('B/Day 1')])
  assert.strictEqual(fs.readFileSync(at('B/notes.txt'), 'utf8'), 'other!', 'the file there is untouched')
  assert.strictEqual(fs.readFileSync(at('B/Day 1/clip.mov'), 'utf8').length, 1000)
  assert.ok(fs.existsSync(at('A/notes.txt')), 'a copy leaves the original')
  // move: a rename on the same drive
  r = await files.transfer({ paths: [at('A/notes.txt')], to: at('B'), move: true })
  assert.deepStrictEqual(r.ok, [at('B/notes 3.txt')])
  assert.ok(!fs.existsSync(at('A/notes.txt')))
  r = await files.transfer({ paths: [at('B/Day 1')], to: at('B/Day 1'), move: true })
  assert.strictEqual(r.failed.length, 1, 'never a folder into itself')

  // Stop in the middle of copying a folder: what was half made of it goes to the Trash, the original stays (audit, 29 Oct)
  put('S/Shoot/a.mov', 'x'.repeat(300000)); put('S/Shoot/b.mov', 'y'.repeat(300000)); fs.mkdirSync(at('T'))
  const binned = []
  let seen = 0
  await assert.rejects(files.transfer({ paths: [at('S/Shoot')], to: at('T') }, {
    stop: () => seen > 400000, onProgress: (x) => { seen = x.done },
    trash: async (p) => { binned.push(p); fs.rmSync(p, { recursive: true, force: true }) },
  }), /Stopped/)
  assert.deepStrictEqual(binned, [at('T/Shoot')], 'the half copied folder, whole')
  assert.ok(!fs.existsSync(at('T/Shoot')) && fs.readdirSync(at('T')).length === 0, 'nothing half copied is left')
  assert.ok(fs.existsSync(at('S/Shoot/b.mov')), 'the original stays')
  // a part file left behind by a crash does not block the next copy
  fs.writeFileSync(at('T/a.mov.roartwin-part'), 'old')
  r = await files.transfer({ paths: [at('S/Shoot/a.mov')], to: at('T') }, { trash: async () => {} })
  assert.deepStrictEqual(r.failed, [])
  assert.strictEqual(fs.readFileSync(at('T/a.mov'), 'utf8').length, 300000)

  // a rename that changes only the case: never onto a second file of that spelling (a case-sensitive disk holds both)
  put('K/Clip.mov', 'one'); put('K/clip.mov', 'two')
  const caseSensitive = fs.readdirSync(at('K')).length === 2
  if (caseSensitive) {
    await assert.rejects(files.renameSafe(at('K/Clip.mov'), at('K/clip.mov')), /taken/)
    assert.strictEqual(fs.readFileSync(at('K/clip.mov'), 'utf8'), 'two', 'the other file untouched')
  }
  fs.rmSync(at('K/clip.mov'))
  assert.strictEqual(await files.renameSafe(at('K/Clip.mov'), at('K/CLIP.mov')), at('K/CLIP.mov'))
  assert.deepStrictEqual(fs.readdirSync(at('K')), ['CLIP.mov'])

  // a big folder lists whole, in order of nothing in particular but every item there
  for (let i = 0; i < 300; i++) fs.writeFileSync(at('S/' + String(i).padStart(3, '0') + '.txt'), '')
  assert.strictEqual((await files.listDir(at('S'))).filter((x) => x.name.endsWith('.txt')).length, 300)

  // compare
  const c = await files.compare(at('A'), at('B'))
  assert.ok(c.onlyRight.some((x) => x.rel === 'notes 2.txt'))
  assert.strictEqual(c.same, 1, 'Day 1/clip.mov on both sides')

  // the template
  assert.strictEqual(await files.makeTemplate(at('B'), ['01_Footage', '05_Project Files/Resolve', '../escape', '01_Footage']), 4)
  assert.ok(fs.existsSync(at('B/05_Project Files/Resolve')) && fs.existsSync(at('B/escape')) && !fs.existsSync(at('escape')), 'no climbing out')

  // the doors: only inside a folder opened here
  const doors = {}
  const trashed = []
  files.register({ handle: (n, fn) => { doors[n] = fn }, run: (fn) => fn(), stopped: () => false, allow() {}, shell: { trashItem: async (p) => { trashed.push(p); fs.renameSync(p, at('trashed-' + path.basename(p))) } }, engine, ffmpeg: () => '' })
  await assert.rejects(doors['files-size']({ path: at('B') }), /not in a folder opened here/)
  const o = await doors['files-open']({ path: at('B') })
  assert.ok(o.items.some((x) => x.name === 'notes 2.txt'))
  await assert.rejects(doors['files-trash']({ paths: [at('A/Day 1/clip.mov')] }).then((x) => { if (x.failed.length) throw new Error(x.failed[0].error) }), /not in a folder opened here/)
  await assert.rejects(doors['files-rename']({ path: at('B/notes.txt'), name: 'notes 2.txt' }), /taken/)
  assert.strictEqual(await doors['files-rename']({ path: at('B/notes.txt'), name: 'a/b' }), at('B/a b'), 'no slash in a name')
  assert.strictEqual(await doors['files-mkdir']({ path: at('B'), name: 'Day 1' }), at('B/Day 1 2'))
  await assert.rejects(doors['files-transfer']({ paths: [at('A/link')], to: at('B') }), /not in a folder opened here/)
  const tr = await doors['files-trash']({ paths: [at('B/notes 3.txt')] })
  assert.deepStrictEqual(tr.ok, [at('B/notes 3.txt')])
  // dragged in from the Finder: those exact paths may be copied in, nothing beside them
  await assert.rejects(doors['files-transfer']({ paths: [at('S/Shoot/a.mov')], to: at('B') }), /not in a folder opened here/)
  assert.deepStrictEqual(await doors['files-dropped']({ paths: [at('S/Shoot/a.mov'), at('nothing-here')] }), [at('S/Shoot/a.mov')])
  assert.strictEqual((await doors['files-transfer']({ paths: [at('S/Shoot/a.mov')], to: at('B') })).ok.length, 1)
  await assert.rejects(doors['files-transfer']({ paths: [at('S/Shoot/b.mov')], to: at('B') }), /not in a folder opened here/)

  // a real clip read through ffmpeg
  let bin = process.env.FFMPEG
  try { bin = bin || require('ffmpeg-static') } catch { /* none */ }
  if (bin) {
    execFileSync(bin, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=25:duration=2', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-timecode', '10:00:00:00', '-metadata', 'creation_time=2026-10-28T09:00:00Z', at('B/real.mov')])
    const live = files.register
    const d2 = {}
    live({ handle: (n, fn) => { d2[n] = fn }, run: (fn) => fn(), stopped: () => false, allow() {}, shell: {}, engine, ffmpeg: () => bin })
    await d2['files-open']({ path: at('B') })
    const got = await d2['files-info']({ path: at('B/real.mov') })
    const t = got.text
    assert.ok(/Codec: h264/.test(t) && /Resolution: 640 × 360/.test(t) && /Frame rate: 25 fps/.test(t), 'video read')
    assert.ok(/Sample rate: 44\.1 kHz|Sample rate: 48 kHz/.test(t) && /Timecode: 10:00:00:00/.test(t), 'audio and timecode read')
    assert.ok((await d2['files-thumb']({ path: at('B/real.mov') })).startsWith('data:image/jpeg'))
    assert.strictEqual((await d2['files-frames']({ path: at('B/real.mov') })).length > 0, true)
  } else console.log('(no ffmpeg: the real clip is left out)')

  fs.rmSync(root, { recursive: true, force: true })
  console.log('files: all good')
})().catch((e) => { console.error(e); process.exit(1) })
