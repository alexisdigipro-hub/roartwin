// Find twins' rules: which copy stays (app/rules.js, an ES module, read here as plain text)
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const src = fs.readFileSync(path.join(__dirname, '../app/rules.js'), 'utf8').replace(/^export /gm, '')
const { keeperOf, chooseByRule } = new Function(src + '\nreturn { keeperOf, chooseByRule }')()

const f = (p, size, mtime, extra = {}) => ({ path: p, size, mtime, ...extra })
const a = f('/A/shoot/c1.mov', 100, 10, { keep: true }), b = f('/Volumes/BACKUP/c1.mov', 100, 30), c = f('/Users/alex/Desktop/c1 copy.mov', 120, 20)
const g = { kind: 'exact', files: [a, b, c] }

assert.strictEqual(keeperOf(g.files), a, 'suggested')
assert.strictEqual(keeperOf(g.files, 'oldest'), a)
assert.strictEqual(keeperOf(g.files, 'newest'), b)
assert.strictEqual(keeperOf(g.files, 'biggest'), c)
assert.strictEqual(keeperOf(g.files, 'shortest'), a)
assert.strictEqual(keeperOf(g.files, 'folder', '/Volumes/BACKUP/'), b, 'the one in the chosen folder')
assert.strictEqual(keeperOf(g.files, 'folder', '/Volumes/BACK'), a, 'a folder name that only starts the same is not inside it')
assert.strictEqual(keeperOf(g.files, 'folder', 'C:\\Shoots'), a, 'none there: the suggested one')
assert.strictEqual(keeperOf([b, c]), b, 'no suggested one left (it went to the Trash): one still stays')

// one of each group always stays, and Masters are never chosen
const m = f('/Masters/c2.mov', 5, 1, { protected: true }), n = f('/Desktop/c2.mov', 5, 2)
const groups = [g, { kind: 'exact', files: [m, n] }, { kind: 'orphan', files: [f('/p/x_proxy.mp4', 1, 1)] }]
for (const rule of ['suggested', 'oldest', 'newest', 'biggest', 'shortest', 'folder']) {
  const sel = chooseByRule(groups, rule, '/Volumes/BACKUP')
  for (const gr of groups.slice(0, 2)) assert.ok(gr.files.some((x) => !sel.has(x.path)), `${rule}: one of each group stays`)
  assert.ok(!sel.has(m.path), `${rule}: Masters never chosen`)
  assert.ok(!sel.has('/p/x_proxy.mp4'), `${rule}: a lone proxy is left to the person`)
}
// newest in a group whose newest is in Masters: the Masters copy stays, the others go
const sel = chooseByRule([{ kind: 'exact', files: [n, f('/Masters/c3.mov', 5, 9, { protected: true }), f('/x/c3.mov', 5, 3)] }], 'newest')
assert.deepStrictEqual([...sel].sort(), ['/Desktop/c2.mov', '/x/c3.mov'])
console.log('rules: all good')
