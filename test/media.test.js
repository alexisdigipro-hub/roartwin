// Media report, Clip check and Contact sheet on real clips made with ffmpeg: what a clip is, a broken one found, the
// PDF pages. node test/media.test.js (FFMPEG=/path/to/ffmpeg, else ffmpeg-static)
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')
const engine = require('../electron/engine')
const media = require('../electron/tools/media')

const bin = process.env.FFMPEG || require('ffmpeg-static')
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'roartwin-media-'))
const at = (...p) => { const f = path.join(root, ...p); fs.mkdirSync(path.dirname(f), { recursive: true }); return f }
const make = (args, out) => execFileSync(bin, ['-hide_banner', '-loglevel', 'error', '-y', ...args, at(out)])

// a log as ffmpeg writes it, for the parser alone
const LOG = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'A001_C003.mov':
  Metadata:
    major_brand     : qt
    creation_time   : 2026-10-14T10:30:00.000000Z
    com.apple.quicktime.make: Blackmagic Design
    encoder         : Blackmagic Design DaVinci Resolve
  Duration: 00:05:12.40, start: 0.000000, bitrate: 471321 kb/s
  Stream #0:0[0x1](und): Video: prores (HQ) (apch / 0x68637061), yuv422p10le(tv, bt709/bt709/bt709, progressive), 3840x2160, 470000 kb/s, SAR 1:1 DAR 16:9, 25 fps, 25 tbr, 12800 tbn (default)
    Metadata:
      timecode        : 14:02:11:07
  Stream #0:1[0x2](und): Audio: pcm_s24le (in24 / 0x34326E69), 48000 Hz, stereo, s32 (24 bit), 2304 kb/s (default)
  Stream #0:2[0x3](und): Audio: pcm_s24le (in24 / 0x34326E69), 48000 Hz, mono, s32 (24 bit), 1152 kb/s
  Stream #0:3[0x4](eng): Data: none (tmcd / 0x64636D74), 0 kb/s`

;(async () => {
  const m = media.parseMedia(LOG)
  assert.strictEqual(m.dur, 312.4)
  assert.strictEqual(m.bitrate, 471321)
  assert.strictEqual(m.tc, '14:02:11:07')
  assert.strictEqual(m.video.name, 'ProRes 422 HQ')
  assert.deepStrictEqual([m.video.w, m.video.h, m.video.fps], [3840, 2160, 25])
  assert.strictEqual(m.video.pix, 'yuv422p10le')
  assert.strictEqual(m.video.color, 'bt709/bt709/bt709')
  assert.strictEqual(m.audio.length, 2)
  assert.deepStrictEqual([m.audio[0].channels, m.audio[0].rate, m.audio[0].bits], [2, 48000, 24])
  assert.strictEqual(m.audio[1].channels, 1)
  assert.strictEqual(m.meta.make, 'Blackmagic Design')
  assert.strictEqual(m.meta.creation_time, '2026-10-14T10:30:00.000000Z')
  assert.strictEqual(media.codecName('h264', 'High'), 'H.264 High')
  assert.strictEqual(media.codecName('prores', '4444 XQ'), 'ProRes 4444 XQ')
  assert.ok(media.parseMedia('Stream #0:0: Video: hevc (Main 10), yuv420p10le(tv, bt2020nc/bt2020/smpte2084), 3840x2160, 25 fps').video.hdr === 'HDR PQ')

  // real clips: a ProRes with timecode and sound, a good H.264, and one cut short
  make(['-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=25:duration=3', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3:sample_rate=48000', '-ac', '2',
    '-c:v', 'prores_ks', '-profile:v', '3', '-c:a', 'pcm_s24le', '-timecode', '01:00:00:00'], 'CARD/A001_C001.mov')
  make(['-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=25:duration=4', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-preset', 'ultrafast'], 'CARD/A001_C002.mp4')
  make(['-f', 'lavfi', '-i', 'sine=frequency=220:duration=2:sample_rate=48000', '-c:a', 'pcm_s16le'], 'CARD/SOUND/T001.wav')
  fs.writeFileSync(at('CARD/notes.txt'), 'not a clip')
  // the camera stopped before the file was closed: no moov atom at the end
  make(['-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=25:duration=4', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-preset', 'ultrafast'], 'CARD/A001_C003.mp4')
  const whole = fs.readFileSync(at('CARD/A001_C003.mp4'))
  fs.writeFileSync(at('CARD/A001_C003.mp4'), whole.subarray(0, Math.floor(whole.length * 0.6)))

  const stop = () => false
  const f = (rel) => { const p = at(rel); const st = fs.statSync(p); return { path: p, name: path.basename(p), dir: path.dirname(p), size: st.size, mtime: st.mtimeMs } }
  const pro = await media.describe(engine, bin, f('CARD/A001_C001.mov'), stop)
  assert.strictEqual(pro.tc, '01:00:00:00', 'timecode read')
  assert.strictEqual(pro.video.name, 'ProRes 422 HQ')
  assert.strictEqual(Math.round(pro.dur), 3)
  assert.strictEqual(pro.audio[0].channels, 2)
  assert.ok(pro.thumb.startsWith('data:image/jpeg;base64,'), 'a thumbnail')
  const wav = await media.describe(engine, bin, f('CARD/SOUND/T001.wav'), stop)
  assert.strictEqual(wav.video, null)
  assert.strictEqual(wav.audio[0].channels, 1)

  const good = await media.checkClip(engine, bin, f('CARD/A001_C002.mp4'), stop)
  assert.ok(good.ok, 'a good clip is OK')
  const bad = await media.checkClip(engine, bin, f('CARD/A001_C003.mp4'), stop)
  assert.ok(!bad.ok, 'a clip cut short is found')
  assert.ok(/Cut short/.test(bad.why), bad.why)
  assert.ok(bad.lines.length > 0)

  const frame = await media.frameAt(engine, bin, at('CARD/A001_C002.mp4'), 2, stop)
  assert.ok(frame.startsWith('data:image/jpeg;base64,'))

  // the pages that become PDFs
  const html = media.reportHTML({ root: at('CARD'), clips: [pro, wav], at: Date.now() }, { title: 'Αναφορά', report: 'media' })
  assert.ok(html.includes('A001_C001.mov') && html.includes('T001.wav') && html.includes('ProRes 422 HQ') && html.includes('01:00:00:00'))
  assert.ok(html.includes('Αναφορά'))
  assert.strictEqual((html.match(/<tr>/g) || []).length, 3, 'a header row and a row a clip')
  assert.ok(!media.reportHTML({ root: '<x>', clips: [{ ...wav, name: '<script>' }] }).includes('<script>'), 'names are escaped')
  const sheet = media.contactHTML({ root: at('CARD'), clips: [{ name: 'A001_C002.mp4', dur: 4, tc: '', frames: [frame, frame, frame] }] }, { cols: 6 })
  assert.ok(sheet.includes('repeat(6,1fr)') && sheet.includes('A001_C002.mp4'))

  fs.rmSync(root, { recursive: true, force: true })
  console.log('media: all good')
})().catch((e) => { console.error(e); process.exit(1) })
