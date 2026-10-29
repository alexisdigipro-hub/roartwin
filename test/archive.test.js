// Archives on real files: made, listed and opened with this computer's tar (GNU tar on Linux: tar kinds only; on a
// Mac or Windows bsdtar does zip, 7z and rar too, and its listing is checked here from a sample of its output).
// node test/archive.test.js
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const zlib = require('zlib')
const { execFileSync } = require('child_process')
const { makeTool, findTar, kindOf, baseOf, unsafe, linkOutside, unsafeEntries, unescapeName, plainPattern, isJunk, freeName, parseList, makeArgs, writable, friendly, Stopped } = require('../electron/tools/archive')

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'roartwin-archive-'))
const put = (rel, text) => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); return f }

;(async () => {
  // what a file is
  assert.strictEqual(kindOf('Shoot.tar.gz').kind, 'tar.gz')
  assert.strictEqual(kindOf('a.TGZ').kind, 'tar.gz')
  assert.strictEqual(kindOf('Day 2.rar').kind, 'rar')
  assert.strictEqual(kindOf('x.7z').kind, '7z')
  assert.strictEqual(kindOf('notes.txt.gz').kind, 'gz')
  assert.strictEqual(kindOf('movie.mov'), null)
  assert.strictEqual(baseOf('/a/Shoot 25 Oct.tar.xz'), 'Shoot 25 Oct')
  assert.strictEqual(baseOf('Cards.zip'), 'Cards')

  // zip-slip and junk
  for (const bad of ['../evil.txt', 'a/../../evil', '/etc/passwd', 'C:\\Windows\\x', '\\\\server\\share\\x', 'a\\..\\..\\b']) assert.ok(unsafe(bad), bad)
  for (const good of ['a/b.txt', 'CLIP/A001.mov', '..hidden', 'a..b/c']) assert.ok(!unsafe(good), good)
  assert.ok(isJunk('__MACOSX/a/._x')); assert.ok(isJunk('Shoot/.DS_Store')); assert.ok(isJunk('._A001.mov')); assert.ok(!isJunk('A001.mov'))

  // the listing, both tars
  const bsd = parseList([
    '-rw-r--r--  0 alex   staff    1234 Oct 28 10:00 Shoot/A001.mov',
    'drwxr-xr-x  0 alex   staff       0 Mar  3  2025 Shoot/',
    'lrwxr-xr-x  0 0      0           0 Oct 28 10:00 Shoot/latest -> A001.mov',
    '-rw-rw-r--  0 0      0          12 Jan  2  2024 ../evil.txt',
  ].join('\n'), new Date(2026, 9, 28, 12, 0))
  assert.strictEqual(bsd.length, 4)
  assert.deepStrictEqual([bsd[0].name, bsd[0].size, new Date(bsd[0].mtime).getFullYear()], ['Shoot/A001.mov', 1234, 2026])
  assert.ok(bsd[1].dir); assert.strictEqual(new Date(bsd[1].mtime).getFullYear(), 2025)
  assert.strictEqual(bsd[2].name, 'Shoot/latest')
  assert.ok(unsafe(bsd[3].name))
  const gnu = parseList('-rw-r--r-- alex/staff 5678 2026-10-28 10:00 dir/file name.wav\ndrwxr-xr-x alex/staff 0 2026-10-27 09:15 dir/')
  assert.deepStrictEqual([gnu[0].name, gnu[0].size], ['dir/file name.wav', 5678]); assert.ok(gnu[1].dir)

  // what bsdtar is asked to do (Mac and Windows)
  const zipArgs = makeArgs({ format: 'zip', level: 'small', out: '/o/A.zip', items: ['/x/Day 1', '/y/notes.txt'], junk: true, flavour: 'bsd', platform: 'darwin' })
  assert.ok(zipArgs.join(' ').includes('--format zip --options zip:compression-level=9'))
  assert.ok(zipArgs.includes('--no-mac-metadata') && zipArgs.includes('._*'))
  assert.deepStrictEqual(zipArgs.slice(-6), ['-C', '/x', 'Day 1', '-C', '/y', 'notes.txt'])
  assert.ok(makeArgs({ format: '7z', level: 'fast', out: 'o.7z', items: ['/a/b'], flavour: 'bsd', platform: 'win32' }).join(' ').includes('--format 7zip --options 7zip:compression-level=1'))
  assert.ok(!makeArgs({ format: 'zip', out: 'o.zip', items: ['/a/b'], junk: false, flavour: 'bsd' }).includes('--exclude'))
  assert.throws(() => makeArgs({ format: 'zip', out: 'o.zip', items: ['/a'], flavour: 'gnu' }))

  // never over anything: a second name
  fs.mkdirSync(path.join(root, 'Taken'))
  assert.strictEqual(path.basename(freeName(root, 'Taken')), 'Taken 2')
  assert.strictEqual(path.basename(freeName(root, 'New', '.zip')), 'New.zip')

  // the real thing with this computer's tar
  const tar = findTar()
  assert.ok(tar.bin, 'a tar on this computer')
  console.log(`  tar: ${tar.bin} (${tar.flavour})`)
  const tool = makeTool({ tar, platform: process.platform })
  put('shoot/Day 1/A001.mov', 'picture one\n'.repeat(200))
  put('shoot/Day 1/.DS_Store', 'junk')
  put('shoot/Day 1/._A001.mov', 'junk')
  put('shoot/notes.txt', 'call sheet\n')
  const ticks = []
  const made = await tool.make([path.join(root, 'shoot')], { format: 'tar.gz', level: 'small', junk: true, tick: (v) => ticks.push(v) })
  assert.strictEqual(path.basename(made.path), 'shoot.tar.gz')
  assert.strictEqual(made.files, 2, 'junk is not counted')
  assert.ok(ticks.length >= 1 && ticks.at(-1).done <= ticks.at(-1).total)
  const again = await tool.make([path.join(root, 'shoot')], { format: 'tar.xz', level: 'fast' })
  assert.strictEqual(path.basename(again.path), 'shoot.tar.xz')
  const third = await tool.make([path.join(root, 'shoot')], { format: 'tar.gz' })
  assert.strictEqual(path.basename(third.path), 'shoot 2.tar.gz', 'never over the first')

  const info = await tool.list(made.path)
  const names = info.entries.map((e) => e.name)
  assert.ok(names.some((n) => n.endsWith('A001.mov')) && names.some((n) => n.endsWith('notes.txt')))
  assert.ok(!names.some(isJunk), 'Mac junk left out: ' + names.join(', '))
  assert.strictEqual(info.unsafe.length, 0)

  const out = await tool.extract(made.path)
  assert.strictEqual(path.basename(out.folder), 'shoot 2', 'the folder "shoot" itself is next to it: a new name')
  assert.strictEqual(fs.readFileSync(path.join(out.folder, 'shoot', 'Day 1', 'A001.mov'), 'utf8'), 'picture one\n'.repeat(200))
  const out2 = await tool.extract(made.path)
  assert.strictEqual(path.basename(out2.folder), 'shoot 3', 'a second time goes to a new folder')

  // zip-slip: an archive with ../ and an absolute path is opened without them
  const evil = path.join(root, 'evil.tar')
  execFileSync('python3', ['-c', `
import tarfile, io, sys
t = tarfile.open(sys.argv[1], 'w')
for name, data in [('ok/inside.txt', b'fine'), ('../outside.txt', b'bad'), ('/tmp/roartwin-abs-${process.pid}.txt', b'bad')]:
    i = tarfile.TarInfo(name); i.size = len(data); t.addfile(i, io.BytesIO(data))
t.close()`, evil])
  const ev = await tool.list(evil)
  assert.strictEqual(ev.unsafe.length, 2)
  const sub = path.join(root, 'into'); fs.mkdirSync(sub)
  const got = await tool.extract(evil, { dest: sub })
  assert.deepStrictEqual(got.skipped.sort(), ['../outside.txt', `/tmp/roartwin-abs-${process.pid}.txt`].sort())
  assert.strictEqual(fs.readFileSync(path.join(got.folder, 'ok', 'inside.txt'), 'utf8'), 'fine')
  assert.ok(!fs.existsSync(path.join(sub, 'outside.txt')) && !fs.existsSync(path.join(got.folder, '..', 'outside.txt')))
  assert.ok(!fs.existsSync(`/tmp/roartwin-abs-${process.pid}.txt`))
  assert.ok(!fs.readdirSync(got.folder).some((n) => n.startsWith('.roartwin-list')), 'its list is gone')

  // one .gz file, by Node itself
  const gz = path.join(root, 'take3.wav.gz')
  fs.writeFileSync(gz, zlib.gzipSync(Buffer.from('boom mic\n'.repeat(300))))
  const one = await tool.extract(gz)
  assert.strictEqual(fs.readFileSync(path.join(one.folder, 'take3.wav'), 'utf8'), 'boom mic\n'.repeat(300))

  // a disk image is not an archive, and says so
  const dmg = put('Installer.dmg', 'x')
  await assert.rejects(tool.list(dmg), /disk image/)

  // Stop ends it, and leaves no half archive behind
  for (let i = 0; i < 400; i++) put(`big/f${i}.bin`, Buffer.alloc(20000, i % 251))
  await assert.rejects(tool.make([path.join(root, 'big')], { format: 'tar.xz', level: 'small', stop: () => true }), /Stopped/)
  assert.ok(!fs.existsSync(path.join(root, 'big.tar.xz')))

  /* ---------- the audit of 29 Oct: each bug it found, kept found ---------- */
  // a link inside the archive pointing outside, and a file stored through it, are left out
  assert.ok(linkOutside('a/link', '/etc') && linkOutside('a/link', '../../x') && !linkOutside('a/b/link', '../c') && !linkOutside('l', 'clip.mov'))
  const linked = parseList([
    'lrwxr-xr-x  0 0      0           0 Oct 28 10:00 shoot/out -> /etc',
    '-rw-r--r--  0 0      0           5 Oct 28 10:00 shoot/out/passwd',
    'lrwxr-xr-x  0 0      0           0 Oct 28 10:00 shoot/latest -> A001.mov',
    'hrw-r--r--  0 0      0           0 Oct 28 10:00 shoot/hard link to ../../secret',
  ].join('\n'), new Date(2026, 9, 28))
  assert.strictEqual(linked[0].target, '/etc'); assert.ok(linked[3].hard)
  assert.deepStrictEqual(unsafeEntries(linked).sort(), ['shoot/hard', 'shoot/out', 'shoot/out/passwd'].sort())
  const evil2 = path.join(root, 'evil2.tar')
  execFileSync('python3', ['-c', `
import tarfile, io, sys
t = tarfile.open(sys.argv[1], 'w')
l = tarfile.TarInfo('pack/escape'); l.type = tarfile.SYMTYPE; l.linkname = sys.argv[2]; t.addfile(l)
for name, data in [('pack/escape/planted.txt', b'bad'), ('pack/fine.txt', b'fine')]:
    i = tarfile.TarInfo(name); i.size = len(data); t.addfile(i, io.BytesIO(data))
t.close()`, evil2, path.join(root, 'victim')])
  fs.mkdirSync(path.join(root, 'victim'))
  const ev2 = await tool.list(evil2)
  assert.deepStrictEqual(ev2.unsafe.sort(), ['pack/escape', 'pack/escape/planted.txt'])
  const got2 = await tool.extract(evil2)
  assert.strictEqual(fs.readFileSync(path.join(got2.folder, 'pack', 'fine.txt'), 'utf8'), 'fine')
  assert.ok(!fs.existsSync(path.join(root, 'victim', 'planted.txt')), 'nothing written through the link')

  // Greek names and names with [ ] * ? come out (bsdtar reads -T as patterns; escapes from the C locale read back)
  assert.strictEqual(unescapeName('\\316\\221\\316\\273\\316\\255\\316\\276\\316\\267\\317\\202/x.mov'), 'Αλέξης/x.mov')
  assert.strictEqual(plainPattern('Take [1] *final?.mov'), 'Take \\[1\\] \\*final\\?.mov')
  const odd = path.join(root, 'odd.tar')
  execFileSync('python3', ['-c', `
import tarfile, io, sys
t = tarfile.open(sys.argv[1], 'w')
for name, data in [('Γύρισμα/Λήψη [1] *τελικό*.mov', b'one'), ('../bad.txt', b'bad')]:
    i = tarfile.TarInfo(name); i.size = len(data); t.addfile(i, io.BytesIO(data))
t.close()`, odd])
  const oddInfo = await tool.list(odd)
  assert.ok(oddInfo.entries.some((e) => e.name === 'Γύρισμα/Λήψη [1] *τελικό*.mov'), oddInfo.entries.map((e) => e.name).join(' | '))
  const oddOut = await tool.extract(odd)
  assert.strictEqual(fs.readFileSync(path.join(oddOut.folder, 'Γύρισμα', 'Λήψη [1] *τελικό*.mov'), 'utf8'), 'one')

  // a damaged archive says so, Test finds it, and nothing at all coming out leaves no empty folder
  const whole = fs.readFileSync(made.path)
  const cut = path.join(root, 'cut.tar.gz'); fs.writeFileSync(cut, whole.subarray(0, Math.floor(whole.length / 2)))
  const good = await tool.test(made.path)
  assert.ok(good.ok && good.count >= 2, JSON.stringify(good))
  const bad = await tool.test(cut)
  assert.ok(!bad.ok && /damaged|cut short/i.test(bad.error), JSON.stringify(bad))
  const junkData = path.join(root, 'junk.tar.gz'); fs.writeFileSync(junkData, Buffer.alloc(4000, 7))
  const before = fs.readdirSync(root).length
  await assert.rejects(tool.extract(junkData))
  assert.strictEqual(fs.readdirSync(root).length, before, 'no empty folder left behind')
  const gzCut = path.join(root, 'cut.wav.gz'); fs.writeFileSync(gzCut, zlib.gzipSync(require('crypto').randomBytes(300000)).subarray(0, 4000))
  assert.strictEqual((await tool.test(gzCut)).ok, false)
  await assert.rejects(tool.extract(gzCut), /damaged|cut short|unexpected end/i)
  assert.ok(!fs.existsSync(path.join(root, 'cut.wav')), 'the half single file went with its folder')

  // Stop while opening takes away the folder the app had just made
  const bigTar = path.join(root, 'bigone.tar'); execFileSync(tar.bin, ['-c', '-f', bigTar, '-C', root, 'big'])
  let calls = 0
  await assert.rejects(tool.extract(bigTar, { stop: () => ++calls >= 2 }), (e) => e instanceof Stopped)
  assert.ok(!fs.existsSync(path.join(root, 'bigone')), 'the half folder is gone')

  // a drive without room is told before anything is written
  const tight = makeTool({ tar, platform: process.platform, freeSpace: async () => 10 })
  await assert.rejects(tight.extract(made.path), /not room enough/)

  // tar's messages in words a person can act on
  assert.match(friendly('tar: write error: No space left on device'), /drive is full/)
  assert.match(friendly('bsdtar: Truncated input file (needed 512 bytes, only 0 available)'), /damaged or cut short/)
  assert.match(friendly('tar: Cannot open: Permission denied'), /may not write/)

  // what each tar can make: Windows' tar.exe without liblzma makes no 7z or tar.xz
  assert.deepStrictEqual(writable('bsd', 'bsdtar 3.5.2 - libarchive 3.5.2 zlib/1.2.5.f-ipp bz2lib/1.0.6'), ['zip', 'tar.gz'])
  assert.deepStrictEqual(writable('bsd', 'bsdtar 3.5.3 - libarchive 3.5.3 zlib/1.2.12 liblzma/5.0.5 bz2lib/1.0.8'), ['zip', '7z', 'tar.gz', 'tar.xz'])
  assert.deepStrictEqual(writable('gnu', 'tar (GNU tar) 1.35', (p) => p === 'gzip'), ['tar.gz'])
  await assert.rejects(makeTool({ tar: { ...tar, formats: ['tar.gz'] }, platform: process.platform }).make([path.join(root, 'shoot')], { format: 'tar.xz' }), /cannot make that kind/)

  // a ZIP with a password: AES-256 through bsdtar; only a ZIP can have one
  const locked = makeArgs({ format: 'zip', out: '/o/A.zip', items: ['/x/a'], flavour: 'bsd', password: 'pa ss' })
  assert.ok(locked.join(' ').includes('zip:encryption=aes256') && locked[locked.indexOf('--passphrase') + 1] === 'pa ss')
  await assert.rejects(tool.make([path.join(root, 'shoot')], { format: 'tar.gz', password: 'x' }), /Only a ZIP/)

  // how long it took
  assert.ok(Number.isFinite(out.took) && Number.isFinite(made.took))

  fs.rmSync(root, { recursive: true, force: true })
  console.log('archive: all good')
})().catch((e) => { console.error(e); process.exit(1) })
