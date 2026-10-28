// Drive health's readers on samples of what diskutil, df and PowerShell print, and the copy-report finder on a folder.
// node test/drives.test.js
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { parsePlist, parseDf, macDrives, winDrives, lastReport, health } = require('../electron/tools/drives')

const plist = (body) => `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n${body}\n</plist>`
const dict = (o) => '<dict>' + Object.entries(o).map(([k, v]) => `<key>${k}</key>` + val(v)).join('') + '</dict>'
const val = (v) => (Array.isArray(v) ? '<array>' + v.map(val).join('') + '</array>' : typeof v === 'object' ? dict(v) : typeof v === 'boolean' ? (v ? '<true/>' : '<false/>') : typeof v === 'number' ? `<integer>${v}</integer>` : `<string>${String(v).replace(/&/g, '&amp;')}</string>`)

;(async () => {
  // the reader itself
  const p = parsePlist(plist(dict({ A: 'x & y', N: 12, T: true, F: false, L: [1, { B: 'c' }], E: '' }).replace('<string></string>', '<string/>')))
  assert.deepStrictEqual(p, { A: 'x & y', N: 12, T: true, F: false, L: [1, { B: 'c' }], E: '' })
  assert.strictEqual(parsePlist(''), undefined)

  // a Mac: the internal SSD (APFS, its volumes in container disk3), a USB drive (exFAT, SMART not reported), a failing one
  const list = parsePlist(plist(dict({ AllDisksAndPartitions: [
    { DeviceIdentifier: 'disk0', Size: 1000555581440, Partitions: [{ DeviceIdentifier: 'disk0s1' }, { DeviceIdentifier: 'disk0s2' }] },
    { DeviceIdentifier: 'disk3', Size: 994662584320, APFSPhysicalStores: [{ DeviceIdentifier: 'disk0s2' }], APFSVolumes: [{ DeviceIdentifier: 'disk3s1', MountPoint: '/' }, { DeviceIdentifier: 'disk3s5', MountPoint: '/System/Volumes/Data' }] },
    { DeviceIdentifier: 'disk4', Size: 2000398934016, Partitions: [{ DeviceIdentifier: 'disk4s2', MountPoint: '/Volumes/SHUTTLE 1' }] },
    { DeviceIdentifier: 'disk6', Size: 4000787030016, Partitions: [{ DeviceIdentifier: 'disk6s2', MountPoint: '/Volumes/OLD RAID' }] },
  ] })))
  const infos = {
    disk0: { MediaName: 'APPLE SSD AP1024Z', BusProtocol: 'Apple Fabric', SolidState: true, Internal: true, SMARTStatus: 'Verified', TotalSize: 1000555581440, VirtualOrPhysical: 'Physical' },
    disk3: { VirtualOrPhysical: 'Virtual' },
    'disk3s1': { VolumeName: 'Macintosh HD', FilesystemUserVisibleName: 'APFS' },
    'disk3s5': { VolumeName: 'Data', FilesystemUserVisibleName: 'APFS' },
    disk4: { MediaName: 'Samsung PSSD T7', BusProtocol: 'USB', SolidState: true, Internal: false, SMARTStatus: 'Not Supported', TotalSize: 2000398934016, RemovableMediaOrExternalDevice: true, VirtualOrPhysical: 'Physical' },
    'disk4s2': { VolumeName: 'SHUTTLE 1', FilesystemUserVisibleName: 'ExFAT' },
    disk6: { MediaName: 'WDC WD40EFRX', BusProtocol: 'SATA', SolidState: false, Internal: false, SMARTStatus: 'Failing', TotalSize: 4000787030016, VirtualOrPhysical: 'Physical' },
    'disk6s2': { FilesystemUserVisibleName: 'Mac OS Extended (Journaled)' },
  }
  const df = parseDf(`Filesystem     1024-blocks      Used Available Capacity iused      ifree %iused  Mounted on
/dev/disk3s1s1   971350180  10586580 412377208     3%  404167 4123772080    0%   /
devfs                  204       204         0   100%     706          0  100%   /dev
/dev/disk3s5     971350180 540112344 412377208    57% 2401234 4123772080    0%   /System/Volumes/Data
/dev/disk4s2    1953513472 1203513472 750000000    62%       1          0  100%   /Volumes/SHUTTLE 1
/dev/disk6s2    3906837504 3806837504 100000000    98%       1          0  100%   /Volumes/OLD RAID`)
  assert.strictEqual(df.length, 5)
  assert.strictEqual(df[3].mount, '/Volumes/SHUTTLE 1', 'a mount point with a space')
  const mac = macDrives({ list, infos, df })
  assert.deepStrictEqual(mac.map((d) => [d.id, d.health, d.kind, d.bus]), [['disk0', 'ok', 'internal', 'Apple Fabric'], ['disk4', 'unknown', 'external', 'USB'], ['disk6', 'failing', 'external', 'SATA']])
  assert.deepStrictEqual(mac[0].mounts.map((m) => m.name), ['Macintosh HD'], 'only the start-up volume, not macOS\'s hidden ones')
  assert.strictEqual(mac[0].free, 412377208 * 1024, 'APFS: the container\'s free space')
  assert.strictEqual(mac[1].fs, 'ExFAT')
  assert.strictEqual(mac[2].mounts[0].path, '/Volumes/OLD RAID')

  // Windows
  const win = winDrives(JSON.stringify({
    disks: [{ DeviceId: '0', FriendlyName: 'Samsung SSD 980 PRO', HealthStatus: 'Healthy', MediaType: 'SSD', BusType: 'NVMe', Size: 1e12 }, { DeviceId: '1', FriendlyName: 'SanDisk Extreme', HealthStatus: 'Warning', MediaType: 'SSD', BusType: 'USB', Size: 2e12 }],
    parts: [{ DiskNumber: 0, DriveLetter: 'C' }, { DiskNumber: 0, DriveLetter: null }, { DiskNumber: 1, DriveLetter: 'E' }],
    vols: [{ DriveLetter: 'C', FileSystemLabel: 'Windows', FileSystem: 'NTFS', Size: 9.9e11, SizeRemaining: 4e11 }, { DriveLetter: 'E', FileSystemLabel: 'SHOOT', FileSystem: 'exFAT', Size: 2e12, SizeRemaining: 1.5e12 }],
  }))
  assert.deepStrictEqual(win.map((d) => [d.name, d.health, d.kind, d.mounts[0].path]), [['Samsung SSD 980 PRO', 'ok', 'internal', 'C:\\'], ['SanDisk Extreme', 'failing', 'external', 'E:\\']])
  // one disk alone comes as an object, not a list; bad JSON is nothing
  assert.strictEqual(winDrives(JSON.stringify({ disks: { DeviceId: 0, FriendlyName: 'X', Size: 1 }, parts: { DiskNumber: 0, DriveLetter: 'D' }, vols: { DriveLetter: 'D', Size: 1, SizeRemaining: 1 } })).length, 1)
  assert.deepStrictEqual(winDrives('not json'), [])
  assert.strictEqual(health('Not Supported'), 'unknown')

  // the newest copy report two levels down; deeper ones are not looked for
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'roartwin-drives-'))
  const put = (rel) => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, 'x') }
  put('CARD_A/_RoarTwin copy report 2026-03-14 18-02.csv')
  put('2026-10-25_Shoot/CARD_B/_RoarTwin copy report 2026-10-25 11-40.csv')
  put('a/b/c/_RoarTwin copy report 2027-01-01 00-00.csv')
  const r = await lastReport(root)
  assert.strictEqual(r.when, '2026-10-25 11:40')
  assert.strictEqual(r.folder, path.join(root, '2026-10-25_Shoot', 'CARD_B'))
  assert.strictEqual(await lastReport(path.join(root, 'nothing')), null)
  fs.rmSync(root, { recursive: true, force: true })
  console.log('drives: all good')
})().catch((e) => { console.error(e); process.exit(1) })
