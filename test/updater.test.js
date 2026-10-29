// The updater across the new name (RoarTwin -> RoarKit, 0.4.2): it finds the installer of this computer among a
// release's files whatever the app is called, reads the version from the release's name, and the Mac's swap script
// takes the new app by its own program's name. The old 0.1.x/0.2.x script asks for Contents/MacOS/RoarTwin, which the
// Mac build adds as a link to RoarKit (electron/adhoc-sign.js). Electron is stood in for; nothing is downloaded.
// node test/updater.test.js
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const Module = require('module')
const { execFileSync } = require('child_process')

const real = Module._load
Module._load = function (req, ...rest) { if (req === 'electron') return { app: {}, BrowserWindow: { getAllWindows: () => [] }, Notification: {}, net: {}, shell: {} }; return real.call(this, req, ...rest) }
const u = require('../electron/updater')
Module._load = real

const release = ['RoarKit-0.5.0-beta-Mac-arm64.dmg', 'RoarKit-0.5.0-beta-Mac-x64.dmg', 'RoarKit-0.5.0-beta-Windows-Setup.exe', 'RoarKit-Mac-arm64.dmg', 'RoarKit-Mac-x64.dmg', 'RoarKit-Windows-Setup.exe', 'RoarTwin-Mac-arm64.dmg', 'RoarTwin-Mac-x64.dmg', 'RoarTwin-Windows-Setup.exe'].map((name) => ({ name, size: 1 }))
const as = (platform, arch, fn) => { const p = Object.getOwnPropertyDescriptor(process, 'platform'), a = Object.getOwnPropertyDescriptor(process, 'arch'); Object.defineProperty(process, 'platform', { value: platform }); Object.defineProperty(process, 'arch', { value: arch }); try { return fn() } finally { Object.defineProperty(process, 'platform', p); Object.defineProperty(process, 'arch', a) } }
assert.strictEqual(as('darwin', 'arm64', () => u.pick(release)).name, 'RoarKit-0.5.0-beta-Mac-arm64.dmg', 'the versioned file first')
assert.strictEqual(as('darwin', 'x64', () => u.pick(release)).name, 'RoarKit-0.5.0-beta-Mac-x64.dmg')
assert.strictEqual(as('win32', 'x64', () => u.pick(release)).name, 'RoarKit-0.5.0-beta-Windows-Setup.exe')
// the same rule as the 0.2.0 updater: by the end of the name only
const old = /Mac-arm64\.dmg$/
assert.ok(release.filter((a) => old.test(a.name)).length === 3)
// the version from the release's name, as the workflow writes it
assert.strictEqual(('RoarKit 0.5.0 beta · v0.5.0'.match(/(\d+\.\d+\.\d+)/) || [])[1], '0.5.0')
assert.ok(u.newer('0.5.0', '0.4.2') && u.newer('0.5.0', '0.2.0') && !u.newer('0.4.2', '0.5.0') && !u.newer('0.5.0', '0.5.0'))

// the swap script, its file part, on made-up bundles (no disk image on Linux: the part after the mount, as it runs)
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'roarkit-upd-'))
const bundle = (dir, exe, link) => {
  fs.mkdirSync(path.join(dir, 'Contents', 'MacOS'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'Contents', 'MacOS', exe), '#!/bin/sh\n', { mode: 0o755 })
  if (link) fs.symlinkSync(exe, path.join(dir, 'Contents', 'MacOS', link))
}
const swap = u.MAC_SWAP.split('\n')
const from = swap.findIndex((l) => l.startsWith('  SRC=')), to = swap.findIndex((l) => l.startsWith('  hdiutil detach'))
assert.ok(from > 0 && to > from)
// the body between mounting and unmounting, with `defaults read` and ditto stood in for (as on a Mac)
const body = swap.slice(from, to).join('\n')
const script = (mnt, app) => `set -u\nMNT="${mnt}"; APP="${app}"; DMG="${path.join(root, 'x.dmg')}"\ndefaults() { cat "$2.exe" 2>/dev/null; }\nditto() { cp -R "$1" "$2"; }\nxattr() { :; }\n${body}\necho "$APP"`
// 0.4.2+: RoarTwin.app becomes RoarKit.app beside it
bundle(path.join(root, 'mnt1', 'RoarKit.app'), 'RoarKit', 'RoarTwin')
fs.writeFileSync(path.join(root, 'mnt1', 'RoarKit.app', 'Contents', 'Info.exe'), 'RoarKit')
bundle(path.join(root, 'Applications', 'RoarTwin.app'), 'RoarTwin')
const out = execFileSync('/bin/bash', ['-c', script(path.join(root, 'mnt1'), path.join(root, 'Applications', 'RoarTwin.app'))], { encoding: 'utf8' }).trim()
assert.strictEqual(out, path.join(root, 'Applications', 'RoarKit.app'))
assert.ok(fs.existsSync(path.join(root, 'Applications', 'RoarKit.app', 'Contents', 'MacOS', 'RoarKit')))
assert.ok(!fs.existsSync(path.join(root, 'Applications', 'RoarTwin.app')), 'the old one is not left beside it')
// the 0.2.0 script's test for the new app: Contents/MacOS/RoarTwin must be there and runnable; the link makes it so
const oldTest = (app) => { try { execFileSync('/bin/bash', ['-c', `[ -x "${app}/Contents/MacOS/RoarTwin" ]`]); return true } catch { return false } }
assert.ok(oldTest(path.join(root, 'mnt1', 'RoarKit.app')), 'with the link, the old updater takes RoarKit.app')
bundle(path.join(root, 'mnt2', 'RoarKit.app'), 'RoarKit')
assert.ok(!oldTest(path.join(root, 'mnt2', 'RoarKit.app')), 'without it, it would not')
// the link is made by the Mac build, before signing
const sign = fs.readFileSync(path.join(__dirname, '..', 'electron', 'adhoc-sign.js'), 'utf8')
assert.ok(/symlinkSync\(name, old\)/.test(sign) && sign.indexOf('symlinkSync') < sign.indexOf("'codesign'"))
fs.rmSync(root, { recursive: true, force: true })
console.log('updater: all good')
