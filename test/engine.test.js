// The engine on real files: videos made with ffmpeg, copied, re-encoded, renamed; texts copied and changed.
// node test/engine.test.js (FFMPEG=/path/to/ffmpeg, else ffmpeg-static)
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')
const { scan, backupCheck, makeTwin, recheck, looksLikeCard, readCsv, parseProbe, parseAudio, Stopped } = require('../electron/engine')

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
// a photo and a sound, each twice
fs.writeFileSync(at('stills/IMG_0001.CR3'), 'raw picture\n'.repeat(400))
fs.writeFileSync(at('stills/copy/IMG_0001.CR3'), 'raw picture\n'.repeat(400))
fs.writeFileSync(at('sound/take1.wav'), 'boom mic\n'.repeat(600))
fs.writeFileSync(at('sound/take1 copy.wav'), 'boom mic\n'.repeat(600))
fs.writeFileSync(at('docs/empty-a.txt'), '')
fs.writeFileSync(at('docs/empty-b.txt'), '')
fs.writeFileSync(at('.hidden/notes.txt'), 'call sheet day 1\n'.repeat(500))
// a cloud drive's folder: left out by default, looked in when asked, or when chosen by hand
fs.writeFileSync(at('pCloud Drive/notes.txt'), 'call sheet day 1\n'.repeat(500))

;(async () => {
  const rel = (f) => path.relative(root, f.path)
  const names = (g) => g.files.map(rel).sort()

  // probe text from ffmpeg
  const p = parseProbe('  Duration: 00:01:02.50, start: 0.000000, bitrate: 2000 kb/s\n  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(tv, bt709, progressive), 1920x1080 [SAR 1:1 DAR 16:9], 1998 kb/s, 25 fps, 25 tbr')
  assert.deepStrictEqual([p.dur, p.codec, p.w, p.h, p.fps], [62.5, 'h264', 1920, 1080, 25])

  const progress = new Set()
  const r = await scan({ roots: [root], similar: true, skipHidden: true, skipCloud: true, minSize: 0, ffmpeg: bin }, (t) => progress.add(t.stage))
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
  assert.ok(!r.groups.some((g) => g.files.some((f) => f.path.includes('pCloud Drive'))), 'cloud drives are skipped')
  assert.deepStrictEqual(r.cloud, [path.join(root, 'pCloud Drive')], 'and named')
  assert.strictEqual(r.groups.length, 4) // the video, the notes, the photo, the sound
  assert.ok(['list', 'compare', 'hash', 'video', 'frames', 'thumbs'].every((s) => progress.has(s)), 'every stage reports: ' + [...progress])

  // exact only, with the hidden folder: the copy in it joins; the re-encoded video does not
  const r2 = await scan({ roots: [root], similar: false, skipHidden: false, skipCloud: true, ffmpeg: bin })
  assert.strictEqual(r2.groups.find((g) => g.files.some((f) => f.name === 'notes.txt')).files.length, 3)
  // the cloud drive looked in: its copy joins too; chosen by hand, it is looked in whatever the switch says
  const rc = await scan({ roots: [root], similar: false, skipHidden: true, skipCloud: false, ffmpeg: bin })
  assert.strictEqual(rc.groups.find((g) => g.files.some((f) => f.name === 'notes.txt')).files.length, 3)
  const rh = await scan({ roots: [path.join(root, 'pCloud Drive'), path.join(root, 'docs')], similar: false, skipHidden: true, skipCloud: true, ffmpeg: bin })
  assert.strictEqual(rh.groups.find((g) => g.files.some((f) => f.name === 'notes.txt')).files.length, 3)
  assert.deepStrictEqual(names(r2.groups.find((g) => g.files.some((f) => f.name.endsWith('.mp4')))), [path.join('backup', 'renamed copy.mp4'), path.join('shoot', 'A001_C003.mp4')])
  // videos only
  const r3 = await scan({ roots: [root], videosOnly: true, similar: false, skipHidden: true, ffmpeg: bin })
  assert.ok(r3.groups.length && r3.groups.every((g) => g.files.every((f) => /\.(mp4|mov)$/.test(f.name))))
  // images only, audio only
  const ri = await scan({ roots: [root], kind: 'image', similar: false, skipHidden: true, skipCloud: true, ffmpeg: bin })
  assert.deepStrictEqual(ri.groups.map((g) => g.files.length), [2]); assert.ok(ri.groups[0].files.every((f) => f.name === 'IMG_0001.CR3'))
  const ra = await scan({ roots: [root], kind: 'audio', similar: false, skipHidden: true, skipCloud: true, ffmpeg: bin })
  assert.deepStrictEqual(ra.groups.map((g) => g.files.map((f) => f.name).sort()), [['take1 copy.wav', 'take1.wav']])
  // the same folder twice, and a folder inside another, count each file once
  const r4 = await scan({ roots: [root, root, path.join(root, 'docs')], similar: false, skipHidden: true, skipCloud: true, ffmpeg: bin })
  assert.strictEqual(r4.groups.find((g) => g.files.some((f) => f.name === 'notes.txt')).files.length, 2)
  // stop
  await assert.rejects(scan({ roots: [root], similar: true, ffmpeg: bin }, () => {}, () => true), Stopped)

  await more()
  fs.rmSync(root, { recursive: true, force: true })
  console.log('engine: all good')
})().catch((e) => { console.error(e); fs.rmSync(root, { recursive: true, force: true }); process.exit(1) })

/* Alex, 25 Oct: folders twice, Masters, a part of a longer video, similar photos, the same sound, proxies, the backup check */
async function more() {
  const r2 = fs.mkdtempSync(path.join(os.tmpdir(), 'roartwin2-'))
  const at2 = (...p) => { const f = path.join(r2, ...p); fs.mkdirSync(path.dirname(f), { recursive: true }); return f }
  const make2 = (args, out) => execFileSync(bin, ['-hide_banner', '-loglevel', 'error', '-y', ...args, at2(out)])
  const rel2 = (f) => path.relative(r2, f.path)
  try {
    // a card copied whole, twice; a third folder with one file changed is no twin
    for (const d of ['CARD_A', 'old/CARD_A copy']) { fs.writeFileSync(at2(d, 'C001.mov'), 'clip one\n'.repeat(3000)); fs.writeFileSync(at2(d, 'sub', 'C002.mov'), 'clip two\n'.repeat(2000)) }
    fs.writeFileSync(at2('CARD_B', 'C001.mov'), 'clip one\n'.repeat(3000)); fs.writeFileSync(at2('CARD_B', 'sub', 'C002.mov'), 'clip 2!!\n'.repeat(2000))
    // a long video and a part cut out of it, re-encoded smaller
    make(['-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=25:duration=40', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-preset', 'ultrafast'], '../' + path.basename(r2) + '/edit/full.mp4')
    make2(['-ss', '12', '-i', at2('edit/full.mp4'), '-t', '8', '-vf', 'scale=320:180', '-c:v', 'mpeg4', '-q:v', '4'], 'edit/teaser.mov')
    // photos: one saved again smaller, one of something else
    make2(['-f', 'lavfi', '-i', 'testsrc2=size=1600x900', '-frames:v', '1'], 'stills/still.png')
    make2(['-i', at2('stills/still.png'), '-vf', 'scale=800:450', '-q:v', '3'], 'stills/still small.jpg')
    make2(['-f', 'lavfi', '-i', 'mandelbrot=size=1600x900', '-frames:v', '1'], 'stills/other.png')
    // a sound as WAV and as AAC, and another sound as long
    const tone = (f1, f2) => `aevalsrc='0.4*sin(2*PI*(${f1}+200*sin(2*PI*0.3*t))*t)+0.3*sin(2*PI*(${f2}+300*sin(2*PI*0.7*t))*t)':s=44100:d=30`
    make2(['-f', 'lavfi', '-i', tone(300, 800)], 'mix/song.wav')
    make2(['-i', at2('mix/song.wav'), '-c:a', 'aac', '-b:a', '128k'], 'mix/song web.m4a')
    make2(['-f', 'lavfi', '-i', tone(520, 1400)], 'mix/other song.wav')
    // a proxy of the full video (never a twin of it) and a proxy whose original is not here
    make2(['-i', at2('edit/full.mp4'), '-vf', 'scale=320:180', '-c:v', 'mpeg4', '-q:v', '6'], 'edit/Proxy/full.mov')
    make2(['-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=25:duration=4', '-c:v', 'mpeg4'], 'edit/Proxy/B002_C001_Proxy.mov')

    const r = await scan({ roots: [r2], protect: [at2('old')], similar: true, parts: true, photos: true, sounds: true, proxies: true, skipHidden: true, skipCloud: true, minSize: 0, ffmpeg: bin })
    const of = (k) => r.groups.filter((g) => g.kind === k)
    const names = (g) => g.files.map(rel2).sort()
    console.log(r.groups.map((g) => `${g.kind}: ${names(g).join(' | ')}`).join('\n'))
    // folders
    assert.deepStrictEqual(of('folder').map(names), [['CARD_A', path.join('old', 'CARD_A copy')]])
    assert.ok(!of('exact').some((g) => g.files.every((f) => /CARD_A/.test(f.path))), 'the files of twin folders are shown with the folders')
    // Masters: the copy under old/ is kept and protected
    const fold = of('folder')[0].files
    assert.ok(fold.find((f) => f.keep).protected && fold.find((f) => f.keep).path.includes('old'), 'the Masters copy is the one kept')
    // the part
    assert.deepStrictEqual(of('part').map(names), [[path.join('edit', 'full.mp4'), path.join('edit', 'teaser.mov')]])
    const teaser = of('part')[0].files.find((f) => f.name === 'teaser.mov')
    assert.ok(Math.abs(teaser.partAt - 12) <= 1, 'starts about 12 s in: ' + teaser.partAt)
    // photos
    assert.deepStrictEqual(of('photo').map(names), [[path.join('stills', 'still small.jpg'), path.join('stills', 'still.png')]])
    assert.strictEqual(of('photo')[0].files.find((f) => f.keep).name, 'still.png', 'keeps the most pixels')
    // sound
    assert.deepStrictEqual(of('sound').map(names), [[path.join('mix', 'song web.m4a'), path.join('mix', 'song.wav')]])
    assert.strictEqual(of('sound')[0].files.find((f) => f.keep).name, 'song.wav')
    // proxies: the proxy of the full video is no twin of it; the one without an original is listed apart
    assert.ok(!r.groups.some((g) => g.kind !== 'orphan' && g.files.some((f) => f.path.includes('Proxy'))), 'proxies are left alone')
    assert.deepStrictEqual(of('orphan').map(names), [[path.join('edit', 'Proxy', 'B002_C001_Proxy.mov')]])
    // proxies off: the proxy is the same video again
    const r3 = await scan({ roots: [path.join(r2, 'edit')], similar: true, proxies: false, photos: false, sounds: false, ffmpeg: bin })
    assert.ok(r3.groups.some((g) => g.kind === 'similar' && g.files.some((f) => f.path.includes('Proxy'))))
    // audio probe
    assert.deepStrictEqual(parseAudio('  Duration: 00:03:05.20, start: 0.0, bitrate: 1411 kb/s\n  Stream #0:0: Audio: pcm_s16le ([1][0][0][0] / 0x0001), 44100 Hz, stereo, s16, 1411 kb/s'), { dur: 185.2, codec: 'pcm_s16le', rate: 44100, kbps: 1411 })

    // the backup check: one file missing, one different, the rest there (wherever and whatever they are called)
    fs.writeFileSync(at2('card/A.mov'), 'take a\n'.repeat(4000)); fs.writeFileSync(at2('card/B.mov'), 'take b\n'.repeat(4000))
    fs.writeFileSync(at2('card/sub/C.wav'), 'take c\n'.repeat(4000)); fs.writeFileSync(at2('card/D.mov'), 'take d\n'.repeat(4000))
    fs.writeFileSync(at2('bak/day1/A renamed.mov'), 'take a\n'.repeat(4000)); fs.writeFileSync(at2('bak/day1/x/C.wav'), 'take c\n'.repeat(4000))
    fs.writeFileSync(at2('bak/B.mov'), 'take B\n'.repeat(4000))
    const b = await backupCheck({ source: at2('card'), backup: at2('bak') })
    assert.strictEqual(b.total, 4); assert.strictEqual(b.safe, 2)
    assert.deepStrictEqual(b.missing.map((m) => [m.name, m.why]).sort(), [['B.mov', 'differs'], ['D.mov', 'missing']])
    await assert.rejects(backupCheck({ source: at2('card'), backup: at2('card/sub') }), /inside/)

    // make a twin: the card to two drives, every copy checked; a file already there with the same bytes counts, one with
    // other bytes is left alone and reported; dates kept; nothing half-written left behind
    const old = new Date('2026-10-20T10:00:00Z')
    fs.utimesSync(at2('card/A.mov'), old, old)
    fs.writeFileSync(at2('driveB/card/D.mov'), 'take d\n'.repeat(4000)) // already there, the same
    fs.writeFileSync(at2('driveB/card/sub/C.wav'), 'other!\n'.repeat(4000)) // already there, other bytes
    fs.writeFileSync(at2('card/empty.txt'), '')
    const tw = await makeTwin({ source: at2('card'), targets: [at2('driveA'), at2('driveB')] })
    assert.strictEqual(tw.total, 5)
    assert.strictEqual(fs.readFileSync(at2('driveA/card/sub/C.wav'), 'utf8'), fs.readFileSync(at2('card/sub/C.wav'), 'utf8'))
    assert.strictEqual(fs.statSync(at2('driveA/card/A.mov')).mtimeMs, old.getTime(), 'the clip keeps its date')
    assert.strictEqual(fs.readFileSync(at2('driveB/card/sub/C.wav'), 'utf8'), 'other!\n'.repeat(4000), 'never written over')
    assert.deepStrictEqual(tw.failed.map((x) => [x.name, path.basename(path.dirname(x.target))]), [['C.wav', 'driveB']])
    assert.strictEqual(tw.verified, 4); assert.strictEqual(tw.already, 1)
    assert.ok(fs.existsSync(at2('driveA/card/empty.txt')), 'empty files come too')
    assert.strictEqual(tw.reports.length, 2); assert.ok(fs.readFileSync(tw.reports[0], 'utf8').includes('verified'))
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [e.name])
    assert.ok(!walk(at2('driveA')).some((n) => n.endsWith('.roartwin-part')), 'no half copies')
    await assert.rejects(makeTwin({ source: at2('card'), targets: [at2('card/sub')] }), /inside/)

    // the naming rule: the card goes into Date_Project/Day01/CamA_Card03, unsafe characters made safe
    const tn = await makeTwin({ source: at2('card'), targets: [at2('driveC')], folder: '2026-10-25_Fakinos: Mataria/Day01/CamA_Card03' })
    assert.strictEqual(tn.targets[0], at2('driveC', '2026-10-25_Fakinos- Mataria', 'Day01', 'CamA_Card03'))
    assert.ok(fs.existsSync(at2('driveC', '2026-10-25_Fakinos- Mataria', 'Day01', 'CamA_Card03', 'sub', 'C.wav')))
    // months later: the drive against its report; one file changed on the shelf, one gone
    fs.writeFileSync(at2('driveA/card/B.mov'), 'take b\n'.repeat(3999) + 'tAke b\n')
    fs.rmSync(at2('driveA/card/D.mov'))
    const rc = await recheck({ folder: at2('driveA/card') })
    assert.strictEqual(rc.total, 5); assert.strictEqual(rc.safe, 3)
    assert.deepStrictEqual(rc.missing.map((m) => [m.name, m.why]).sort(), [['B.mov', 'changed'], ['D.mov', 'gone']])
    await assert.rejects(recheck({ folder: at2('card') }), /no RoarTwin copy report/)
    assert.deepStrictEqual(readCsv('"a","b ""c"" d"\r\n1,2\r\n'), [['a', 'b "c" d'], ['1', '2']])
    // cards
    fs.mkdirSync(at2('vol/SONY/PRIVATE/M4ROOT'), { recursive: true }); fs.mkdirSync(at2('vol/DOCS/letters'), { recursive: true })
    fs.writeFileSync(at2('vol/BMPCC/A001_C001.braw'), 'x'); fs.writeFileSync(at2('vol/DOCS/letters/a.txt'), 'x')
    assert.ok(await looksLikeCard(at2('vol/SONY'))); assert.ok(await looksLikeCard(at2('vol/BMPCC'))); assert.ok(!(await looksLikeCard(at2('vol/DOCS'))))
  } finally { fs.rmSync(r2, { recursive: true, force: true }) }
}
