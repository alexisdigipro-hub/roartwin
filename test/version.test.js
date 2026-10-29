// The version a browser shows (app/demo.js) is the one in package.json, and the Mac build makes the old program
// name for the 0.1.x/0.2.x updaters (electron/adhoc-sign.js); every new tool is in the side menu, has a Mac/Windows
// side, its Greek, and a colour.
// node test/version.test.js
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8')
const pkg = JSON.parse(read('package.json'))
assert.strictEqual((read('app/demo.js').match(/export const VERSION = '([\d.]+)'/) || [])[1], pkg.version, 'app/demo.js VERSION is package.json\'s version')
assert.strictEqual(pkg.build.productName, 'RoarKit')
for (const k of ['mac', 'dmg', 'win', 'nsis']) assert.match(pkg.build[k].artifactName, /^RoarKit-\$\{version\}-beta-/)
for (const f of ['electron/jobs.js', 'electron/tray.js']) assert.ok(pkg.build.files.includes(f), f + ' is packed')
const app = read('app/app.js'), css = read('app/design.css'), main = read('electron/tools/index.js')
for (const id of ['uninstall', 'startup']) {
  assert.ok(app.includes(`['${id}', `), id + ' is in the side menu')
  assert.ok(css.includes(`[data-tool="${id}"]`), id + ' has its colour')
  assert.ok(main.includes(`'${id}'`), id + ' has its Mac/Windows side')
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'app', 'tools', id + '.js')))
}
assert.ok(app.includes("'https://themadlions.com/legal/roarkit/'"), 'the privacy link')
console.log('version: all good')
