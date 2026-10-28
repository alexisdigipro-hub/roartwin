// Project leftovers on a made-up drive: which folders are found, their dates, and what may go to the Trash.
// node test/leftovers.test.js
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { find, untouched, mayTrash, kindFor } = require('../electron/tools/leftovers')

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'roartwin-left-'))
const put = (rel, bytes, ageDays = 0) => {
  const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, Buffer.alloc(bytes))
  const t = new Date(Date.now() - ageDays * 864e5); fs.utimesSync(f, t, t)
}
put('Projects/Fakinos/OptimizedMedia/A001.mov', 6000, 200)
put('Projects/Fakinos/OptimizedMedia/A002.mov', 4000, 150)
put('Projects/Fakinos/ProxyMedia/A001.mov', 1000, 10)
put('Projects/Spot/Adobe Premiere Pro Video Previews/Spot.PRV/a.mxf', 3000, 400)
put('Projects/Spot/Adobe Premiere Pro Auto-Save/Spot.prproj', 900, 400)
put('Projects/Spot/Adobe Premiere Pro Audio Previews/a.cfa', 200, 400)
put('Edit/Doc.fcpbundle/Day 1/Render Files/High Quality Media/r.mov', 5000, 100)
put('Edit/Doc.fcpbundle/Day 1/Transcoded Media/Proxy Media/p.mov', 700, 100)
put('Edit/Doc.fcpbundle/Day 1/Original Media/A.mov', 9000, 100)
put('Elsewhere/Render Files/keep.mov', 800, 300) // not in a Final Cut library: someone's own folder
put('Mine/CacheClip/x.dvcc', 100, 1)
// a link to a leftover elsewhere is not followed
const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'roartwin-left-out-'))
fs.mkdirSync(path.join(outside, 'OptimizedMedia'))
fs.writeFileSync(path.join(outside, 'OptimizedMedia', 'x.mov'), Buffer.alloc(100))
fs.symlinkSync(outside, path.join(root, 'link-out'))

;(async () => {
  const items = await find([root], { skipHidden: true })
  const by = Object.fromEntries(items.map((i) => [path.relative(root, i.path), i]))
  assert.deepStrictEqual(Object.keys(by).sort(), [
    'Edit/Doc.fcpbundle/Day 1/Render Files', 'Edit/Doc.fcpbundle/Day 1/Transcoded Media', 'Mine/CacheClip',
    'Projects/Fakinos/OptimizedMedia', 'Projects/Fakinos/ProxyMedia',
    'Projects/Spot/Adobe Premiere Pro Audio Previews', 'Projects/Spot/Adobe Premiere Pro Video Previews',
  ], 'the leftovers, no Auto-Save, no Render Files outside a library, no link followed')
  assert.strictEqual(by['Projects/Fakinos/OptimizedMedia'].size, 10000)
  assert.strictEqual(by['Projects/Fakinos/OptimizedMedia'].files, 2)
  assert.strictEqual(by['Projects/Fakinos/OptimizedMedia'].project, 'Fakinos')
  assert.strictEqual(by['Edit/Doc.fcpbundle/Day 1/Render Files'].project, 'Doc', 'a Final Cut leftover belongs to its library')
  assert.strictEqual(by['Edit/Doc.fcpbundle/Day 1/Render Files'].app, 'Final Cut')
  const days = (i) => Math.round((Date.now() - i.newest) / 864e5)
  assert.strictEqual(days(by['Projects/Fakinos/OptimizedMedia']), 150, 'the newest change inside')
  assert.strictEqual(items[0].path, by['Projects/Fakinos/OptimizedMedia'].path, 'biggest first')

  const old = untouched(items, 3).map((i) => path.relative(root, i.path)).sort()
  assert.deepStrictEqual(old, ['Edit/Doc.fcpbundle/Day 1/Render Files', 'Edit/Doc.fcpbundle/Day 1/Transcoded Media', 'Projects/Fakinos/OptimizedMedia', 'Projects/Spot/Adobe Premiere Pro Audio Previews', 'Projects/Spot/Adobe Premiere Pro Video Previews'])
  assert.strictEqual(untouched(items, 12).length, 2, 'the two Premiere previews, a year old')

  const last = { byPath: new Map(items.map((i) => [i.path, i])) }
  assert.ok(mayTrash(last, path.join(root, 'Projects/Fakinos/OptimizedMedia'), []))
  assert.ok(!mayTrash(last, path.join(root, 'Projects/Spot/Adobe Premiere Pro Auto-Save'), []), 'never Auto-Save')
  assert.ok(!mayTrash(last, path.join(root, 'Projects/Fakinos/OptimizedMedia'), [path.join(root, 'Projects')]), 'Masters refused')
  assert.ok(!mayTrash(last, path.join(root, 'Projects/Fakinos'), []), 'never the project itself')
  assert.ok(!mayTrash(last, path.join(outside, 'OptimizedMedia'), []), 'not from the scan')
  assert.strictEqual(kindFor('Adobe Premiere Pro Auto-Save', false), null)
  assert.strictEqual(kindFor('Render Files', false), null)
  assert.strictEqual(kindFor('render files', true).app, 'Final Cut')

  fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(outside, { recursive: true, force: true })
  console.log('leftovers: all good')
})().catch((e) => { console.error(e); process.exit(1) })
