// Space map on a made-up drive: sizes, bundles as one, links not followed, the Trash only for what the scan listed.
// node test/space.test.js
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { walk, nodeView, findNode, byKind, biggest, largeOld, parsePlist, volumeFromPlist, parseSnapshots, mayTrash, kindOf, systemSkips, places } = require('../electron/tools/space')

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'roartwin-space-'))
const put = (rel, bytes, ageDays = 0) => {
  const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, Buffer.alloc(bytes))
  if (ageDays) { const t = new Date(Date.now() - ageDays * 864e5); fs.utimesSync(f, t, t) }
  return f
}
put('Shoot/A001_C001.mov', 9000, 400)
put('Shoot/A001_C002.mov', 7000)
put('Shoot/Stills/IMG_1.CR3', 3000)
put('Shoot/Stills/IMG_1.jpg', 500)
put('Sound/boom.wav', 2000)
put('Edit/Film.drp', 300)
put('Edit/Library.fcpbundle/Event/Render Files/x.mov', 4000)
put('Edit/Library.fcpbundle/CurrentVersion.fcpevent', 100)
put('Downloads/old.zip', 1500, 800)
put('.hidden/secret.mov', 5000)
put('Notes.txt', 10)
// a hard link counts once, a symbolic link to elsewhere is not followed
fs.linkSync(path.join(root, 'Shoot/A001_C002.mov'), path.join(root, 'Shoot/same-file.mov'))
const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'roartwin-outside-'))
fs.writeFileSync(path.join(outside, 'big.mov'), Buffer.alloc(50000))
fs.symlinkSync(outside, path.join(root, 'link-out'))

;(async () => {
  const r = await walk(root, { skipHidden: true })
  const total = 9000 + 7000 + 3000 + 500 + 2000 + 300 + 4100 + 1500 + 10
  assert.strictEqual(r.root.size, total, 'sizes add up: hidden left out, hard link once, link not followed')
  const v = nodeView(r.root)
  assert.deepStrictEqual(v.kids.map((k) => k.name), ['Shoot', 'Edit', 'Sound', 'Downloads'], 'folders by size')
  assert.strictEqual(v.loose.length, 1)
  const edit = findNode(r.root, path.join(root, 'Edit'))
  const ev = nodeView(edit)
  assert.strictEqual(ev.kids.length, 0, 'a Final Cut library is not a folder to walk into')
  assert.ok(ev.loose.some((f) => f.bundle && f.name === 'Library.fcpbundle' && f.size === 4100), 'the library is one item with its size')
  assert.ok(!r.files.some((f) => f.path.includes('Render Files')), 'nothing inside the library is a loose file')
  const withHidden = await walk(root, { skipHidden: false })
  assert.strictEqual(withHidden.root.size, total + 5000, 'hidden folders counted when asked')

  const k = byKind(r.files)
  assert.strictEqual(k.video.size, 16000)
  assert.strictEqual(k.raw.size, 3000)
  assert.strictEqual(k.photo.size, 500)
  assert.strictEqual(k.project.size, 4400, '.drp and the .fcpbundle')
  assert.strictEqual(k.archive.size, 1500)
  assert.strictEqual(kindOf('clip.BRAW'), 'raw')
  assert.strictEqual(biggest(r.files, 2)[0].size, 9000)
  const old = largeOld(r.files, 1000, 6)
  assert.deepStrictEqual(old.list.map((f) => f.name), ['A001_C001.mov', 'old.zip'], 'large and untouched for six months')
  assert.strictEqual(old.size, 10500)

  // the Trash: only what the scan listed, never in a Masters folder, never a path made up
  const last = { byPath: new Map(r.files.map((f) => [f.path, f])) }
  assert.ok(mayTrash(last, path.join(root, 'Downloads/old.zip'), []))
  assert.ok(!mayTrash(last, path.join(root, 'Shoot/A001_C001.mov'), [path.join(root, 'Shoot')]), 'Masters refused')
  assert.ok(!mayTrash(last, path.join(outside, 'big.mov'), []), 'not from the scan')
  assert.ok(!mayTrash(last, path.join(root, 'Shoot'), []), 'a folder is not a listed file')
  assert.ok(!mayTrash(last, root + '/Downloads/../Downloads/old.zip', []), 'no tricks with ..')
  assert.ok(!mayTrash(null, path.join(root, 'Downloads/old.zip'), []), 'no scan, nothing')

  // a Mac's drive: diskutil and tmutil, read defensively
  const plist = `<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict>
    <key>APFSContainerFree</key><integer>120000000000</integer><key>FilesystemName</key><string>APFS</string>
    <key>FreeSpace</key><integer>118000000000</integer><key>Internal</key><true/><key>MountPoint</key><string>/</string>
    <key>SolidState</key><true/><key>Stuff</key><array><string>x</string></array>
    <key>TotalSize</key><integer>494384795648</integer><key>VolumeName</key><string>Macintosh HD</string></dict></plist>`
  const vol = volumeFromPlist(parsePlist(plist))
  assert.deepStrictEqual([vol.name, vol.mount, vol.total, vol.free, vol.containerFree, vol.internal, vol.ssd], ['Macintosh HD', '/', 494384795648, 118000000000, 120000000000, true, true])
  assert.deepStrictEqual(volumeFromPlist(parsePlist('nonsense')), { name: '', mount: '', fs: '', total: null, free: null, containerFree: null, internal: false, ssd: false })
  assert.deepStrictEqual(parseSnapshots('Snapshots for disk /:\ncom.apple.TimeMachine.2026-10-27-101530.local\ncom.apple.os.update-ABC\n\n'), ['com.apple.TimeMachine.2026-10-27-101530.local', 'com.apple.os.update-ABC'])
  assert.deepStrictEqual(parseSnapshots(''), [])

  // This Mac (29 Oct): other drives and macOS's second view of the same data are left out, so nothing counts twice
  assert.ok(systemSkips('/', 'darwin').includes('/Volumes') && systemSkips('/', 'darwin').includes('/System/Volumes'))
  assert.ok(systemSkips('/', 'linux').includes('/proc'))
  assert.deepStrictEqual(systemSkips('/Users/alex', 'darwin'), [], 'a folder of your own is walked whole')
  const skipped = await walk(root, { skipHidden: true, skipPaths: [path.join(root, 'Shoot')] })
  assert.strictEqual(skipped.root.size, total - 19500, 'a path to skip is left out (Shoot: 9000 + 7000 + 3000 + 500)')
  assert.deepStrictEqual(r.denied, [], 'every folder here could be read')
  // the quick starts: home and the computer's own drive, always there
  const pl = await places()
  assert.strictEqual(pl.home, os.homedir())
  assert.ok(pl.disk && Array.isArray(pl.drives))
  const win = await places('win32')
  assert.ok(/^[A-Z]:\\$/i.test(win.disk), 'Windows starts on its system drive')

  fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(outside, { recursive: true, force: true })
  console.log('space: all good')
})().catch((e) => { console.error(e); process.exit(1) })
