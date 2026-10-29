// Uninstall apps on a made-up Mac: the apps and what they are, which are refused, what each leaves in ~/Library
// (by bundle id and by name, never another app's), and the Windows list of installed programs.
// node test/uninstall.test.js
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const u = require('../electron/tools/uninstall')

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'roarkit-uninstall-'))
const put = (rel, text = 'x') => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); return p }
const plist = (o) => `<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0"><dict>${Object.entries(o).map(([k, v]) => `<key>${k}</key><string>${v}</string>`).join('')}</dict></plist>`
const app = (rel, info) => { put(path.join(rel, 'Contents', 'Info.plist'), plist(info)); put(path.join(rel, 'Contents', 'MacOS', info.CFBundleExecutable || 'x'), 'bin'); return path.join(root, rel) }

;(async () => {
  const A = path.join(root, 'Applications')
  app('Applications/Spotify.app', { CFBundleName: 'Spotify', CFBundleIdentifier: 'com.spotify.client', CFBundleShortVersionString: '1.2.48', CFBundleExecutable: 'Spotify' })
  app('Applications/Bar.app', { CFBundleName: 'Bar', CFBundleIdentifier: 'com.foo.bar', CFBundleShortVersionString: '2.0', CFBundleExecutable: 'Bar' })
  app('Applications/Bar Pro.app', { CFBundleName: 'Bar Pro', CFBundleIdentifier: 'com.foo.bar.pro', CFBundleShortVersionString: '3.0', CFBundleExecutable: 'Bar Pro' })
  app('Applications/Adobe Photoshop 2025/Adobe Photoshop 2025.app', { CFBundleName: 'Adobe Photoshop 2025', CFBundleIdentifier: 'com.adobe.Photoshop', CFBundleShortVersionString: '26.0', CFBundleExecutable: 'Adobe Photoshop 2025' })
  app('Applications/Safari.app', { CFBundleName: 'Safari', CFBundleIdentifier: 'com.apple.Safari', CFBundleExecutable: 'Safari' })
  app('Applications/RoarKit.app', { CFBundleName: 'RoarKit', CFBundleIdentifier: 'com.themadlions.roartwin', CFBundleExecutable: 'RoarKit' })
  put('Applications/notes.txt')

  // the apps, one folder deeper too
  const bundles = (await u.findBundles([A])).map((b) => path.relative(A, b)).sort()
  assert.deepStrictEqual(bundles, ['Adobe Photoshop 2025/Adobe Photoshop 2025.app', 'Bar Pro.app', 'Bar.app', 'RoarKit.app', 'Safari.app', 'Spotify.app'])
  const spotify = await u.appInfo(path.join(A, 'Spotify.app'))
  assert.deepStrictEqual([spotify.name, spotify.id, spotify.version, spotify.exe], ['Spotify', 'com.spotify.client', '1.2.48', 'Spotify'])
  const bar = await u.appInfo(path.join(A, 'Bar.app'))

  // refused: Apple's, macOS's, RoarKit itself, an open app
  assert.strictEqual(u.refusal(await u.appInfo(path.join(A, 'Safari.app'))), 'It is one of Apple\'s own apps.')
  assert.strictEqual(u.refusal({ path: '/System/Applications/Chess.app', id: 'x.y.z', name: 'Chess' }), 'It is part of macOS.')
  assert.strictEqual(u.refusal(await u.appInfo(path.join(A, 'RoarKit.app'))), 'RoarKit cannot remove itself.')
  assert.strictEqual(u.refusal({ path: '/Applications/RoarTwin.app', id: 'other.id.x', file: 'RoarTwin' }), 'RoarKit cannot remove itself.')
  assert.strictEqual(u.refusal(spotify, { running: [path.join(A, 'Spotify.app', 'Contents', 'MacOS', 'Spotify')] }), 'It is open. Quit it first.')
  assert.strictEqual(u.refusal(spotify, { running: [path.join(A, 'Spotify Helper.app', 'Contents', 'MacOS', 'x')] }), '', 'another app of a longer name is not this one')
  assert.strictEqual(u.refusal(spotify), '')
  assert.strictEqual(u.parseMdlsDate('2026-10-20 08:12:44 +0000'), Date.parse('2026-10-20T08:12:44Z'))
  assert.strictEqual(u.parseMdlsDate('(null)'), 0)

  // a made-up ~/Library
  const home = path.join(root, 'home'), L = (p, n = 1) => put(path.join('home', 'Library', p), 'x'.repeat(n))
  L('Application Support/Spotify/PersistentCache/a', 5000)
  L('Application Support/com.spotify.client/x', 100)
  L('Caches/com.spotify.client/Cache.db', 3000)
  L('Caches/com.spotify.client.helper/x', 50)
  L('Preferences/com.spotify.client.plist', 10)
  L('Preferences/com.spotify.client.helper.plist', 10)
  L('Saved Application State/com.spotify.client.savedState/data', 20)
  L('HTTPStorages/com.spotify.client/x', 30)
  L('WebKit/com.spotify.client/x', 30)
  L('LaunchAgents/com.spotify.client.startuphelper.plist', 10)
  L('Logs/Spotify/log.txt', 40)
  L('Group Containers/2FNC3A47ZF.com.spotify.client/x', 60)
  L('Containers/com.spotify.client/Data/x', 70)
  // not Spotify's
  L('Preferences/com.spotify.clientele.plist', 10)
  L('Application Support/Spotify Helper Tool/x', 10)
  L('Preferences/Spotify.plist', 10) // a name in Preferences is not enough
  L('Application Support/Google/x', 10)
  // com.foo.bar and com.foo.bar.pro are two apps
  L('Preferences/com.foo.bar.plist', 10)
  L('Preferences/com.foo.bar.pro.plist', 10)
  L('Caches/com.foo.bar.pro/x', 10)
  L('Application Support/Bar/x', 10)
  L('Application Support/Bar Pro/x', 10)

  const left = await u.leftoversFor(home, spotify, ['com.spotify.client', 'com.foo.bar', 'com.foo.bar.pro'])
  const rel = (l) => path.relative(path.join(home, 'Library'), l.path)
  assert.deepStrictEqual(left.map(rel).sort(), [
    'Application Support/Spotify', 'Application Support/com.spotify.client', 'Caches/com.spotify.client', 'Caches/com.spotify.client.helper',
    'Containers/com.spotify.client', 'Group Containers/2FNC3A47ZF.com.spotify.client', 'HTTPStorages/com.spotify.client', 'LaunchAgents/com.spotify.client.startuphelper.plist',
    'Logs/Spotify', 'Preferences/com.spotify.client.helper.plist', 'Preferences/com.spotify.client.plist', 'Saved Application State/com.spotify.client.savedState', 'WebKit/com.spotify.client',
  ].sort())
  assert.strictEqual(left[0].size, 5000, 'biggest first, each with its size')
  assert.strictEqual(left.find((l) => rel(l) === 'Logs/Spotify').by, 'name')
  assert.strictEqual(left.find((l) => rel(l) === 'Caches/com.spotify.client').by, 'id')
  const barLeft = (await u.leftoversFor(home, bar, ['com.spotify.client', 'com.foo.bar', 'com.foo.bar.pro'])).map(rel).sort()
  assert.deepStrictEqual(barLeft, ['Application Support/Bar', 'Preferences/com.foo.bar.plist'], 'not what is Bar Pro\'s')
  assert.strictEqual(u.matchOf('Google', 'Application Support', { id: 'com.google.Chrome', name: 'Google' }), '', 'a name many share')
  assert.strictEqual(u.matchOf('group.com.foo.bar', 'Group Containers', bar), 'id')
  assert.strictEqual(u.matchOf('com.foo', 'Preferences', { id: 'com.foo', name: 'Foo' }), '', 'too short an id to go by')

  // only what was found may go, never a place itself
  assert.ok(u.mayTrashLeftover(left, left[0].path, home))
  assert.ok(!u.mayTrashLeftover(left, path.join(home, 'Library', 'Caches'), home))
  assert.ok(!u.mayTrashLeftover(left, path.join(home, 'Library', 'Preferences', 'com.foo.bar.plist'), home), 'not found for this app')
  assert.ok(!u.mayTrashLeftover(left, path.join(home, 'Library', 'Caches', 'com.spotify.client', '..', '..', 'Preferences'), home))

  // Windows: the Uninstall keys
  const reg = [
    'HKEY_LOCAL_MACHINE\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{AC76BA86-7AD7-1033-7B44-AC0F074E4100}',
    '    DisplayName    REG_SZ    Adobe Acrobat Reader',
    '    DisplayVersion    REG_SZ    24.002.20759',
    '    Publisher    REG_SZ    Adobe',
    '    EstimatedSize    REG_DWORD    0x7a120',
    '    InstallDate    REG_SZ    20260912',
    '    UninstallString    REG_EXPAND_SZ    MsiExec.exe /I{AC76BA86-7AD7-1033-7B44-AC0F074E4100}',
    '',
    'HKEY_LOCAL_MACHINE\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\KB5034441',
    '    DisplayName    REG_SZ    Security Update for Windows',
    '    ParentKeyName    REG_SZ    OperatingSystem',
    '    UninstallString    REG_SZ    x.exe',
    '',
    'HKEY_LOCAL_MACHINE\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Hidden',
    '    DisplayName    REG_SZ    Some Runtime',
    '    SystemComponent    REG_DWORD    0x1',
    '    UninstallString    REG_SZ    y.exe',
    '',
    'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\com.themadlions.roartwin',
    '    DisplayName    REG_SZ    RoarKit 0.4.2',
    '    UninstallString    REG_SZ    "C:\\Users\\a\\AppData\\Local\\Programs\\roartwin\\Uninstall RoarKit.exe" /currentuser',
    '    Empty    REG_SZ    ',
    '',
    'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\NoUninstaller',
    '    DisplayName    REG_SZ    Left Behind',
  ].join('\r\n')
  const blocks = u.parseRegQuery(reg)
  assert.strictEqual(blocks.length, 5)
  assert.strictEqual(blocks[3].values.Empty, '')
  const win = u.winApps(blocks)
  assert.deepStrictEqual(win.map((a) => a.name), ['Adobe Acrobat Reader', 'RoarKit 0.4.2'], 'no updates, no hidden parts, no entry without an uninstaller')
  assert.strictEqual(win[0].size, 0x7a120 * 1024)
  assert.strictEqual(win[0].installed, Date.parse('2026-09-12T12:00:00'))
  assert.ok(win[1].user)
  assert.strictEqual(u.winRefusal(win[1]), 'RoarKit cannot remove itself.')
  assert.strictEqual(u.winRefusal(win[0]), '')
  assert.strictEqual(u.uninstallCommand(win[0].uninstall), 'MsiExec.exe /X{AC76BA86-7AD7-1033-7B44-AC0F074E4100}', 'an MSI is removed, not changed')
  assert.strictEqual(u.uninstallCommand('"C:\\x\\unins000.exe"'), '"C:\\x\\unins000.exe"')

  fs.rmSync(root, { recursive: true, force: true })
  console.log('uninstall: all good')
})().catch((e) => { console.error(e); fs.rmSync(root, { recursive: true, force: true }); process.exit(1) })
