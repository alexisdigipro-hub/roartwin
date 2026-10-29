// Startup items: the login items, launch agents and Run values read from what the computer prints, and turning one off
// and on again (what is kept in RoarKit's folder, and what is asked of launchctl, System Events and reg) on a made-up home.
// node test/startup.test.js
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const s = require('../electron/tools/startup')

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'roarkit-startup-'))
const put = (rel, text) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); return p }
const agent = (label, extra = '') => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array><string>/Applications/Spotify.app/Contents/MacOS/Spotify</string><string>--autostart</string></array>
<key>RunAtLoad</key><true/>${extra}</dict></plist>`

;(async () => {
  // AppleScript's lists
  assert.deepStrictEqual(s.parseAppleScript('{{"Dropbox", "Say \\"hi\\""}, {"/Applications/Dropbox.app", missing value}, {false, true}}'), [['Dropbox', 'Say "hi"'], ['/Applications/Dropbox.app', null], [false, true]])
  assert.deepStrictEqual(s.parseLoginItems('{{"Dropbox", "Spotify"}, {"/Applications/Dropbox.app", "/Applications/Spotify.app"}, {false, true}}\n'), [
    { name: 'Dropbox', path: '/Applications/Dropbox.app', hidden: false }, { name: 'Spotify', path: '/Applications/Spotify.app', hidden: true }])
  assert.deepStrictEqual(s.parseLoginItems('{{}, {}, {}}'), [])
  assert.deepStrictEqual(s.parseLoginItems(''), [])
  // a plist
  const a = s.parseAgent(agent('com.spotify.webhelper', '<key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>'))
  assert.deepStrictEqual([a.label, a.program, a.runAtLoad, a.keepAlive, a.disabled], ['com.spotify.webhelper', '/Applications/Spotify.app/Contents/MacOS/Spotify', true, true, false])
  assert.strictEqual(s.parseAgent('<plist><dict><key>Program</key><string>/usr/local/bin/x</string><key>Disabled</key><true/></dict></plist>', '/L/com.x.y.plist').label, 'com.x.y', 'no Label: the file name')
  assert.strictEqual(s.parseAgent('not a plist'), null)
  const loaded = s.parseLaunchctl('PID\tStatus\tLabel\n-\t0\tcom.apple.x\n812\t0\tcom.spotify.webhelper\n')
  assert.deepStrictEqual(loaded.get('com.spotify.webhelper'), { pid: 812, status: 0 })
  assert.deepStrictEqual(loaded.get('com.apple.x'), { pid: null, status: 0 })
  // Run values
  const runs = s.parseRun('\r\nHKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\r\n    OneDrive    REG_SZ    "C:\\Users\\a\\AppData\\Local\\Microsoft\\OneDrive\\OneDrive.exe" /background\r\n    Spotify    REG_EXPAND_SZ    %APPDATA%\\Spotify\\Spotify.exe --autostart\r\n')
  assert.deepStrictEqual(runs.map((r) => [r.name, r.type]), [['OneDrive', 'REG_SZ'], ['Spotify', 'REG_EXPAND_SZ']])
  assert.strictEqual(runs[0].data, '"C:\\Users\\a\\AppData\\Local\\Microsoft\\OneDrive\\OneDrive.exe" /background')
  assert.strictEqual(s.programOf(runs[0].data), 'OneDrive')
  assert.strictEqual(s.programOf(runs[1].data), 'Spotify')

  // the agents in a folder: a person's can be switched, the computer's not
  const user = path.join(root, 'home/Library/LaunchAgents'), sys = path.join(root, 'Library/LaunchDaemons')
  put('home/Library/LaunchAgents/com.spotify.webhelper.plist', agent('com.spotify.webhelper'))
  put('home/Library/LaunchAgents/.hidden.plist', agent('x'))
  put('Library/LaunchDaemons/com.adobe.acc.installer.v2.plist', agent('com.adobe.acc.installer.v2'))
  const mine = await s.agentsIn(user, 'user', 'agent', loaded)
  assert.strictEqual(mine.length, 1)
  assert.ok(mine[0].canSwitch && mine[0].loaded && mine[0].on && mine[0].pid === 812)
  const theirs = await s.agentsIn(sys, 'system', 'daemon', loaded)
  assert.ok(!theirs[0].canSwitch && theirs[0].note && !theirs[0].loaded)

  // turning off and on again, with the computer's side recorded
  const calls = []
  const fake = {
    now: () => 1000, trash: async (p) => calls.push(['trash', p]),
    bootout: async (f) => calls.push(['bootout', f]), bootstrap: async (f) => calls.push(['bootstrap', f]),
    loginRemove: async (n) => { if (n === 'Locked') throw new Error('not allowed'); calls.push(['loginRemove', n]) }, loginAdd: async (r) => calls.push(['loginAdd', r.from, r.hidden]),
    regDelete: async (k, n) => calls.push(['regDelete', k, n]), regAdd: async (k, n, t, d) => calls.push(['regAdd', k, n, t, d]),
  }
  const st = s.store(path.join(root, 'userData', 'Disabled startup items'))
  // a launch agent: stopped, then its plist kept in RoarKit's folder (not deleted)
  await s.disable(mine[0], st, fake)
  assert.deepStrictEqual(calls.shift(), ['bootout', mine[0].path])
  assert.ok(!fs.existsSync(mine[0].path), 'out of LaunchAgents')
  const rec = st.get(mine[0].id)
  assert.ok(fs.existsSync(rec.file) && rec.file.startsWith(st.dir), 'kept in the Disabled startup items folder')
  assert.strictEqual(fs.readFileSync(rec.file, 'utf8'), agent('com.spotify.webhelper'))
  // shown, switched off
  const listed = s.withKept(await s.agentsIn(user, 'user', 'agent', loaded), st)
  assert.deepStrictEqual(listed.map((i) => [i.id, i.on, i.kept]), [[mine[0].id, false, true]])
  // a second agent of the same file name gets its own place
  put('home/Library/LaunchAgents/com.spotify.webhelper.plist', agent('com.spotify.webhelper'))
  const again = (await s.agentsIn(user, 'user', 'agent', loaded))[0]
  assert.throws(() => fs.accessSync(path.join(st.dir, 'com.spotify.webhelper 2.plist')))
  const p2 = st.place('com.spotify.webhelper.plist')
  assert.strictEqual(path.basename(p2), 'com.spotify.webhelper 2.plist')
  // on again refuses while something is in its place
  await assert.rejects(s.restore(mine[0].id, st, fake), /already/)
  fs.renameSync(again.path, path.join(root, 'moved-away.plist'))
  const back = await s.restore(mine[0].id, st, fake)
  assert.strictEqual(back.label, 'com.spotify.webhelper')
  assert.ok(fs.existsSync(mine[0].path) && !fs.existsSync(rec.file), 'back in LaunchAgents')
  assert.deepStrictEqual(calls.shift(), ['bootstrap', mine[0].path])
  assert.strictEqual(st.get(mine[0].id), null)
  // the computer's items are never changed
  await assert.rejects(s.disable(theirs[0], st, fake), /every user/)
  assert.ok(fs.existsSync(theirs[0].path))

  // a login item: remembered, then removed; added back from what was remembered
  const li = { id: 'login:Spotify', kind: 'login', name: 'Spotify', path: '/Applications/Spotify.app', hidden: true, canSwitch: true, on: true }
  await s.disable(li, st, fake)
  assert.deepStrictEqual(calls.shift(), ['loginRemove', 'Spotify'])
  assert.strictEqual(st.get(li.id).from, '/Applications/Spotify.app')
  await s.restore(li.id, st, fake)
  assert.deepStrictEqual(calls.shift(), ['loginAdd', '/Applications/Spotify.app', true])
  // when macOS says no, nothing is remembered as off
  await assert.rejects(s.disable({ ...li, id: 'login:Locked', name: 'Locked' }, st, fake), /not allowed/)
  assert.strictEqual(st.get('login:Locked'), null)

  // a Run value: saved before it is taken out, put back as it was
  const rv = { id: 'run:x', kind: 'run', name: 'Spotify', key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', type: 'REG_EXPAND_SZ', data: runs[1].data, canSwitch: true, on: true }
  await s.disable(rv, st, fake)
  assert.deepStrictEqual(calls.shift(), ['regDelete', rv.key, 'Spotify'])
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(st.dir, 'list.json'), 'utf8')).map((r) => [r.kind, r.data]), [['run', runs[1].data]], 'the value is on the disk')
  await s.restore('run:x', st, fake)
  assert.deepStrictEqual(calls.shift(), ['regAdd', rv.key, 'Spotify', 'REG_EXPAND_SZ', runs[1].data])
  assert.deepStrictEqual(st.all(), [])
  await assert.rejects(s.restore('run:x', st, fake), /nothing kept/)
  assert.deepStrictEqual(calls, [])

  fs.rmSync(root, { recursive: true, force: true })
  console.log('startup: all good')
})().catch((e) => { console.error(e); fs.rmSync(root, { recursive: true, force: true }); process.exit(1) })
