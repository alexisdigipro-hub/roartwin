// The engine on real files: videos made with ffmpeg, copied, re-encoded, renamed; texts copied and changed.
// node test/engine.test.js (FFMPEG=/path/to/ffmpeg, else ffmpeg-static)
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')
const { scan, parseProbe, Stopped } = require('../electron/engine')

const bin = process.env.FFMPEG || require('ffmpeg-static')
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'roartwin-'))
const at = (...p) => { const f = path.join(root, ...p); fs.mkdirSync(path.dirname(f), { recursive: true }); return f }
const make = (args, out) => execFileSync(bin, ['-hide_banner', '-loglevel', 'error', '-y', ...args, at(out)])

make(['-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=25:duration=6', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-preset', 'ultrafast'], 'shoot/A001_C003.mp4')
fs.copyFileSync(at('shoot/A001_C003.mp4'), at('backup/renamed copy.mp4'))
make(['-i', at('shoot/A001_C003.mp4'), '-vf', 'scale=640:360', '-c:v', 'mpeg4', '-q:v', '5'], 'export/A001_C003_small.mov')
// the same name, another picture
make(['-f', 'lavfi', '-i', 'mandelbrot=size=1280x720:rate=25', '-t', '6', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-preset', 'ultrafast'], 'day2/A001_C003.mp4')
// two black clips: flat pictures say nothing
make(['-f', 'lavfi', '-i', 'color=black:size=640x360:rate=25:duration=6', '-c:v', 'libx264', '-preset', 'ultrafast'], 'black/one.mp4')
make(['-f', 'lavfi', '-i', 'color=black:size=320x180:rate=25:duration=6', '-c:v', 'mpeg4'], 'black/two.mp4')
fs.writeFileSync(at('docs/notes.txt'), 'call sheet day 1\n'.repeat(500))
fs.writeFileSync(at('docs/notes (1).txt'), 'call sheet day 1\n'.repeat(500))
fs.writeFileSync(at('docs/other.txt'), 'call sheet day 2\n'.repeat(500)) // same size, other bytes
fs.writeFileSync(at('docs/empty-a.txt'), '')
fs.writeFileSync(at('docs/empty-b.txt'), '')
fs.writeFileSync(at('.hidden/notes.txt'), 'call sheet day 1\n'.repeat(500))

;(async () => {
  const rel = (f) => path.relative(root, f.path)
  const names = (g) => g.files.map(rel).sort()

  // probe text from ffmpeg
  const p = parseProbe('  Duration: 00:01:02.50, start: 0.000000, bitrate: 2000 kb/s\n  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(tv, bt709, progressive), 1920x1080 [SAR 1:1 DAR 16:9], 1998 kb/s, 25 fps, 25 tbr')
  assert.deepStrictEqual([p.dur, p.codec, p.w, p.h, p.fps], [62.5, 'h264', 1920, 1080, 25])

  const progress = new Set()
  const r = await scan({ roots: [root], similar: true, skipHidden: true, minSize: 0, ffmpeg: bin }, (t) => progress.add(t.stage))
  console.log(r.groups.map((g) => `${g.kind}: ${names(g).join(' | ')}`).join('\n'))

  const video = r.groups.find((g) => g.files.some((f) => rel(f) === path.join('shoot', 'A001_C003.mp4')))
  assert.ok(video, 'the shoot clip is in a group')
  assert.strictEqual(video.kind, 'similar')
  assert.deepStrictEqual(names(video), [path.join('backup', 'renamed copy.mp4'), path.join('export', 'A001_C003_small.mov'), path.join('shoot', 'A001_C003.mp4')].sort())
  const keep = video.files.find((f) => f.keep)
  assert.ok(keep.video.w === 1280, 'keeps the biggest picture')
  assert.ok(video.files.every((f) => f.thumb.startsWith('data:image/jpeg')), 'every video has a picture')
  assert.ok(!r.groups.some((g) => g.files.some((f) => rel(f) === path.join('day2', 'A001_C003.mp4'))), 'the same name with another picture is no twin')
  assert.ok(!r.groups.some((g) => g.files.some((f) => f.name === 'one.mp4' || f.name === 'two.mp4')), 'black clips are no twins')
  const docs = r.groups.find((g) => g.files.some((f) => f.name === 'notes.txt'))
  assert.strictEqual(docs.kind, 'exact')
  assert.deepStrictEqual(names(docs), [path.join('docs', 'notes (1).txt'), path.join('docs', 'notes.txt')])
  assert.ok(!r.groups.some((g) => g.files.some((f) => f.name.startsWith('empty'))), 'empty files are left alone')
  assert.ok(!r.groups.some((g) => g.files.some((f) => f.path.includes('.hidden'))), 'hidden folders are skipped')
  assert.strictEqual(r.groups.length, 2)
  assert.ok(['list', 'compare', 'hash', 'video', 'frames', 'thumbs'].every((s) => progress.has(s)), 'every stage reports: ' + [...progress])

  // exact only, with the hidden folder: the copy in it joins; the re-encoded video does not
  const r2 = await scan({ roots: [root], similar: false, skipHidden: false, ffmpeg: bin })
  assert.strictEqual(r2.groups.find((g) => g.files.some((f) => f.name === 'notes.txt')).files.length, 3)
  assert.deepStrictEqual(names(r2.groups.find((g) => g.files.some((f) => f.name.endsWith('.mp4')))), [path.join('backup', 'renamed copy.mp4'), path.join('shoot', 'A001_C003.mp4')])
  // videos only
  const r3 = await scan({ roots: [root], videosOnly: true, similar: false, skipHidden: true, ffmpeg: bin })
  assert.ok(r3.groups.every((g) => g.files.every((f) => /\.(mp4|mov)$/.test(f.name))))
  // the same folder twice, and a folder inside another, count each file once
  const r4 = await scan({ roots: [root, root, path.join(root, 'docs')], similar: false, skipHidden: true, ffmpeg: bin })
  assert.strictEqual(r4.groups.find((g) => g.files.some((f) => f.name === 'notes.txt')).files.length, 2)
  // stop
  await assert.rejects(scan({ roots: [root], similar: true, ffmpeg: bin }, () => {}, () => true), Stopped)

  fs.rmSync(root, { recursive: true, force: true })
  console.log('engine: all good')
})().catch((e) => { console.error(e); fs.rmSync(root, { recursive: true, force: true }); process.exit(1) })
