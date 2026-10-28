// Clean up on a made-up home folder: what is measured, what may go, and what never does.
// node test/clean.test.js
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { catalogue, measure, allowed, openApps } = require('../electron/clean')

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'roartwin-clean-'))
const put = (rel, bytes) => { const f = path.join(home, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, Buffer.alloc(bytes)) }

put('Movies/CacheClip/a1b2/frame.dvcc', 5000)
put('Movies/CacheClip/c3d4/frame.dvcc', 3000)
put('Library/Application Support/Adobe/Common/Media Cache Files/clip.cfa', 2000)
put('Library/Application Support/Adobe/Common/Media Cache/db.mcdb', 700)
put('Library/Caches/Adobe/After Effects/24.0/Disk Cache/x.aep', 4000)
put('Library/Caches/com.spotify.client/data/blob', 1500)
put('Library/Caches/Google/Chrome/Default/Cache/f', 2500)
put('Library/Logs/old.log', 100)
put('Downloads/Resolve_19.dmg', 9000)
put('Downloads/Contract.pdf', 400)
put('Downloads/Shoot/inside.dmg', 800)
// a link inside a cache folder that points at the person's own work: counted as a link, never followed
put('Projects/Masters/film.mov', 100000)
fs.symlinkSync(path.join(home, 'Projects'), path.join(home, 'Library/Caches/link-to-projects'))

;(async () => {
  const items = catalogue({ home, platform: 'darwin' })
  const r = Object.fromEntries((await measure(items)).map((x) => [x.id, x]))

  assert.strictEqual(r.resolve.size, 8000, 'Resolve cache measured')
  assert.strictEqual(r.resolve.entries.length, 2, 'the two cache folders, not the CacheClip folder itself')
  assert.strictEqual(r['adobe-media'].size, 2700, 'both Adobe cache folders')
  assert.strictEqual(r['ae-disk'].size, 4000, 'After Effects disk cache')
  // the general caches leave out Adobe (counted on its own), and the link is not followed
  assert.strictEqual(r.caches.size, 4000, 'apps cache without Adobe and without what the link points at')
  assert.ok(r.caches.entries.some((e) => e.path.endsWith('link-to-projects')), 'the link itself is listed')
  assert.ok(!r.caches.entries.some((e) => e.path.includes(`${path.sep}Adobe`)), 'Adobe is not in the apps cache')
  assert.strictEqual(r.installers.entries.length, 1, 'only the .dmg straight in Downloads')
  assert.ok(r.installers.entries[0].path.endsWith('Resolve_19.dmg'))
  assert.strictEqual(r.xcode.size, 0, 'a place that is not there is just empty')
  assert.deepStrictEqual(r.xcode.found, [])

  // what may go: only straight inside the places
  assert.ok(allowed(items, path.join(home, 'Movies/CacheClip/a1b2')))
  assert.ok(allowed(items, path.join(home, 'Downloads/Resolve_19.dmg')))
  assert.ok(!allowed(items, path.join(home, 'Movies/CacheClip')), 'never the folder a program expects')
  assert.ok(!allowed(items, path.join(home, 'Downloads/Contract.pdf')), 'never a document in Downloads')
  assert.ok(!allowed(items, path.join(home, 'Downloads/Shoot/inside.dmg')), 'never deeper inside Downloads')
  assert.ok(!allowed(items, path.join(home, 'Projects/Masters/film.mov')), 'never the person\'s work')
  assert.ok(!allowed(items, path.join(home, 'Library/Caches/../Caches/../Logs/../../Projects')), 'no climbing out')
  assert.ok(!allowed(items, path.join(home, 'Library/Caches/Adobe')), 'Adobe goes only as its own places')

  // a program that is open keeps its cache
  assert.deepStrictEqual(openApps(items, ['/Applications/DaVinci Resolve/DaVinci Resolve.app/Contents/MacOS/Resolve', 'Finder']), ['Resolve'])
  assert.deepStrictEqual(openApps(items, ['Finder', 'Dock']), [])
  assert.deepStrictEqual(openApps(items, ['/Library/Application Support/Blackmagic Design/DaVinci Resolve/DaVinciPanelDaemon']), [], 'a helper in its folder is not Resolve')

  // Windows has its own places; another system has none
  assert.ok(catalogue({ home, platform: 'win32', env: {} }).some((i) => i.id === 'adobe-media'))
  assert.deepStrictEqual(catalogue({ home, platform: 'linux' }), [])

  fs.rmSync(home, { recursive: true, force: true })
  console.log('clean: all good')
})().catch((e) => { console.error(e); process.exit(1) })
