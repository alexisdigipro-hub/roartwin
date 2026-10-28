// Archives on real files: made, listed and opened with this computer's tar (GNU tar on Linux: tar kinds only; on a
// Mac or Windows bsdtar does zip, 7z and rar too, and its listing is checked here from a sample of its output).
// node test/archive.test.js
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const zlib = require('zlib')
const { execFileSync } = require('child_process')
const { makeTool, findTar, kindOf, baseOf, unsafe, isJunk, freeName, parseList, makeArgs } = require('../electron/tools/archive')

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

  fs.rmSync(root, { recursive: true, force: true })
  console.log('archive: all good')
})().catch((e) => { console.error(e); process.exit(1) })
