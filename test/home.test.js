// Overview: what it finds and the score, on made-up readings; the quick cache look on a made-up home folder.
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')

;(async () => {
  const { findings, score } = await import('../app/tools/home.js')
  const GB = 1e9
  const now = (o = {}) => ({ drives: [{ mount: '/', total: 1000 * GB, free: 400 * GB }], mem: { pressure: 'normal' }, therm: { state: 'nominal' }, battery: { health: 95 }, ...o })

  // a healthy computer: nothing to do, a high score
  assert.deepStrictEqual(findings(now(), [], { total: 2 * GB }), [])
  assert.strictEqual(score([]), 100)

  // a full start-up disk and a failing drive come first, as bad
  const f = findings(now({ drives: [{ mount: '/', total: 1000 * GB, free: 50 * GB }], mem: { pressure: 'warning' } }),
    [{ name: 'OLD', health: 'failing', mounts: [{ name: 'OLD RAID' }] }], { total: 80 * GB, top: [{ name: 'Resolve' }] })
  assert.deepStrictEqual(f.map((x) => x.level), ['bad', 'bad', 'warn', 'warn'])
  assert.ok(f.some((x) => x.tool === 'space') && f.some((x) => x.tool === 'drives') && f.some((x) => x.tool === 'clean') && f.some((x) => x.tool === 'stats'))
  assert.ok(score(f) < 50)

  // nothing read yet (no stats, no drives) is not an error
  assert.deepStrictEqual(findings(null, null, null), [])

  // the caches within a time budget, skipping the person's own installers
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'roarkit-home-'))
  const put = (rel, n) => { const p = path.join(home, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, Buffer.alloc(n)) }
  put('Library/Caches/com.app/a', 3000)
  put('Movies/CacheClip/x/f', 5000)
  put('Downloads/Big.dmg', 9000)
  const { caches } = require('../electron/tools/home.js')
  const r = await caches(require('../electron/clean.js'), home, 'darwin', 5000)
  assert.strictEqual(r.total, 8000, 'Resolve and the apps cache, not the installer')
  assert.strictEqual(r.top[0].id, 'resolve')
  assert.strictEqual(r.partial, false)
  fs.rmSync(home, { recursive: true, force: true })
  console.log('home: all good')
})().catch((e) => { console.error(e); process.exit(1) })
