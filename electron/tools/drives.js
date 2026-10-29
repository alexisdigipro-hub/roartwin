// Drive health (Alex, 28 Oct): every drive the computer sees, its health as the drive itself reports it (SMART), its
// free space, and when a RoarKit copy on it was last checked. It only reads; nothing is changed.
// Mac: diskutil (list and info, as plists) and df. Windows: PowerShell's Get-PhysicalDisk, Get-Partition, Get-Volume.
// The parsers are plain functions, tested on samples by test/drives.test.js.
const fs = require('fs')
const path = require('path')
const { execFile } = require('child_process')

const run = (cmd, args, ms = 20e3) => new Promise((ok) => {
  execFile(cmd, args, { maxBuffer: 16 << 20, timeout: ms, windowsHide: true }, (err, out) => ok(err ? '' : String(out)))
})

/* ---------- a small plist reader: dict, array, string, integer, real, true, false, date, data ---------- */
function parsePlist(xml) {
  const text = String(xml || '')
  const re = /<(\/?)(dict|array|key|string|integer|real|true|false|date|data)(\s*\/)?>|<(dict|array|string|data)\s*\/>/g
  const unxml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
  const stack = []
  let root, key = null, m, open = null
  const put = (v) => {
    const top = stack[stack.length - 1]
    if (!top) { root = v; return }
    if (Array.isArray(top)) top.push(v)
    else if (key != null) { top[key] = v; key = null }
  }
  while ((m = re.exec(text))) {
    if (m[4]) { put(m[4] === 'dict' ? {} : m[4] === 'array' ? [] : ''); continue }
    const [, close, tag, self] = m
    if (tag === 'true' || tag === 'false') { put(tag === 'true'); continue }
    if (self) { put(tag === 'dict' ? {} : tag === 'array' ? [] : ''); continue }
    if (!close) {
      if (tag === 'dict' || tag === 'array') { const v = tag === 'dict' ? {} : []; put(v); stack.push(v) } else open = { tag, from: re.lastIndex }
      continue
    }
    if (tag === 'dict' || tag === 'array') { stack.pop(); continue }
    if (!open) continue
    const raw = unxml(text.slice(open.from, m.index))
    open = null
    if (tag === 'key') key = raw
    else if (tag === 'integer') put(parseInt(raw, 10))
    else if (tag === 'real') put(parseFloat(raw))
    else put(raw.trim())
  }
  return root
}

/* ---------- df -k: every mounted volume, its size and free space in bytes ---------- */
function parseDf(out) {
  const rows = []
  for (const line of String(out || '').split('\n').slice(1)) {
    // Filesystem 1024-blocks Used Available Capacity [iused ifree %iused] Mounted on; the mount point can hold spaces
    const m = line.match(/^(\S+)\s+(\d+)\s+(\d+)\s+(\d+)\s+\d+%\s+(?:\d+\s+\d+\s+\d+%\s+)?(\/.*)$/)
    if (!m) continue
    rows.push({ device: m[1], size: +m[2] * 1024, used: +m[3] * 1024, free: +m[4] * 1024, mount: m[5].trim() })
  }
  return rows
}

// the volumes a person thinks of: the start-up disk and the drives in /Volumes, not macOS's own hidden ones, nor the
// Time Machine snapshots it mounts there for a moment (audit, 29 Oct)
const quietMount = (p) => (p !== '/' && !p.startsWith('/Volumes/')) || /^\/Volumes\/\./.test(p) || /com\.apple\.TimeMachine/i.test(p)
/* Windows PowerShell 5.1 writes these as numbers in its JSON (audit, 29 Oct: every Windows drive read "not reported"):
   the names of Microsoft's own enumerations */
const WIN_HEALTH = { 0: 'Healthy', 1: 'Warning', 2: 'Unhealthy', 5: 'Unknown' }
const WIN_MEDIA = { 0: 'Unspecified', 3: 'HDD', 4: 'SSD', 5: 'SCM' }
const WIN_BUS = { 1: 'SCSI', 2: 'ATAPI', 3: 'ATA', 4: '1394', 5: 'SSA', 6: 'Fibre Channel', 7: 'USB', 8: 'RAID', 9: 'iSCSI', 10: 'SAS', 11: 'SATA', 12: 'SD', 13: 'MMC', 15: 'File Backed Virtual', 16: 'Storage Spaces', 17: 'NVMe' }
const named = (v, table) => (typeof v === 'number' ? table[v] || '' : String(v ?? ''))
const health = (raw) => {
  const r = String(raw || '').toLowerCase()
  if (/^(verified|healthy|ok)$/.test(r)) return 'ok'
  // Windows' "Warning" is a drive predicting its own failure: a warning, not yet a failure
  if (/^warning$/.test(r)) return 'warning'
  if (/fail|unhealthy|about to fail/.test(r)) return 'failing'
  return 'unknown'
}
const busOf = (p) => {
  const b = String(p || '')
  return /usb/i.test(b) ? 'USB' : /thunderbolt/i.test(b) ? 'Thunderbolt' : /nvme|pci/i.test(b) ? 'PCIe' : /sata/i.test(b) ? 'SATA' : /sas/i.test(b) ? 'SAS' : /sd|secure digital/i.test(b) ? 'SD card' : /disk image|virtual/i.test(b) ? 'Disk image' : b
}

/* Mac: the physical drives from diskutil, the volumes from df, each volume put under the drive it lives on (an APFS
   volume lives in a container, whose physical store is a partition of the real drive). */
function macDrives({ list, infos, df }) {
  const all = list?.AllDisksAndPartitions || []
  // a synthesized APFS container disk -> the whole disk of its physical store
  const storeOf = {}
  for (const d of all) {
    const store = d.APFSPhysicalStores?.[0]?.DeviceIdentifier
    if (store) storeOf[d.DeviceIdentifier] = store.replace(/s\d+$/, '')
  }
  const wholeOf = (dev) => {
    const id = String(dev || '').replace(/^\/dev\//, '').replace(/s\d+(s\d+)?$/, '')
    return storeOf[id] || id
  }
  const drives = new Map()
  for (const d of all) {
    const id = d.DeviceIdentifier
    if (!id || storeOf[id]) continue
    const info = infos[id] || {}
    if (info.VirtualOrPhysical === 'Virtual' && !/disk image/i.test(info.BusProtocol || '')) continue
    const image = /disk image/i.test(info.BusProtocol || '')
    drives.set(id, {
      image,
      id, name: info.MediaName || info.IORegistryEntryName || id, size: info.TotalSize || info.Size || d.Size || 0,
      bus: busOf(info.BusProtocol), ssd: info.SolidState === true, internal: info.Internal === true, removable: info.RemovableMediaOrExternalDevice === true || info.Ejectable === true,
      healthRaw: info.SMARTStatus || '', health: health(info.SMARTStatus), mounts: [], free: 0, fs: '',
    })
  }
  for (const v of df) {
    if (!v.device.startsWith('/dev/disk') || quietMount(v.mount)) continue
    const d = drives.get(wholeOf(v.device))
    if (!d) continue
    const vid = v.device.replace(/^\/dev\//, '')
    const vi = infos[vid] || {}
    // the container (APFS) or partition a volume is on: volumes of one APFS container share its free space
    const whole = vid.replace(/s\d+(s\d+)?$/, '')
    const container = storeOf[whole] ? whole : vid
    d.mounts.push({ path: v.mount, name: v.mount === '/' ? (vi.VolumeName || 'Macintosh HD') : path.basename(v.mount), size: v.size, free: v.free, fs: vi.FilesystemUserVisibleName || vi.FilesystemName || '', container })
  }
  return [...drives.values()].filter((d) => d.mounts.length).map((d) => {
    // APFS volumes share their container's free space (the biggest figure of each container); partitions add up
    // (audit, 29 Oct: a drive with two HFS+ partitions showed only one's free space)
    const byBox = new Map()
    for (const m of d.mounts) byBox.set(m.container, Math.max(byBox.get(m.container) || 0, m.free))
    d.free = [...byBox.values()].reduce((n, f) => n + f, 0)
    for (const m of d.mounts) delete m.container
    d.fs = [...new Set(d.mounts.map((m) => m.fs).filter(Boolean))].join(', ')
    d.startup = d.mounts.some((m) => m.path === '/')
    d.kind = d.image ? 'image' : d.internal ? 'internal' : 'external'
    // what may be ejected: a drive or a disk image outside the computer, never the start-up disk
    d.ejectable = !d.startup && (d.image || !d.internal || d.removable)
    return d
  })
}

/* Windows: one JSON from PowerShell with the physical disks, the partitions (disk number -> letter) and the volumes. */
function winDrives(json) {
  let j = {}
  try { j = JSON.parse(String(json || '{}')) } catch { return [] }
  const arr = (x) => (Array.isArray(x) ? x : x ? [x] : [])
  const vols = new Map(arr(j.vols).filter((v) => v.DriveLetter).map((v) => [String(v.DriveLetter).toUpperCase(), v]))
  const out = []
  for (const d of arr(j.disks)) {
    const letters = arr(j.parts).filter((p) => String(p.DiskNumber) === String(d.DeviceId) && p.DriveLetter).map((p) => String(p.DriveLetter).toUpperCase())
    const mounts = letters.map((l) => vols.get(l)).filter(Boolean).map((v) => ({ path: `${String(v.DriveLetter).toUpperCase()}:\\`, name: v.FileSystemLabel || `${v.DriveLetter}:`, size: +v.Size || 0, free: +v.SizeRemaining || 0, fs: v.FileSystem || '' }))
    if (!mounts.length) continue
    const bus = busOf(named(d.BusType, WIN_BUS))
    const healthRaw = named(d.HealthStatus, WIN_HEALTH)
    const outside = /usb|sd|mmc|1394/i.test(bus)
    out.push({
      id: 'disk' + d.DeviceId, name: d.FriendlyName || 'Disk ' + d.DeviceId, size: +d.Size || 0, bus, ssd: /ssd|scm/i.test(named(d.MediaType, WIN_MEDIA)),
      internal: !outside, removable: outside, healthRaw, health: health(healthRaw),
      mounts, free: mounts.reduce((n, m) => n + m.free, 0), fs: [...new Set(mounts.map((m) => m.fs).filter(Boolean))].join(', '),
      kind: outside ? 'external' : 'internal', startup: mounts.some((m) => /^c:/i.test(m.path)), ejectable: false,
    })
  }
  return out
}

/* the newest RoarTwin copy report in the top two levels of a volume (and the copy folder it sits in) */
const REPORT = /^_RoarTwin copy report (\d{4}-\d{2}-\d{2})(?: (\d{2})-(\d{2}))?\.csv$/i
async function lastReport(mount, limit = 300) {
  let best = null, seen = 0
  const look = async (dir, depth) => {
    let kids = []
    try { kids = await fs.promises.readdir(dir, { withFileTypes: true }) } catch { return }
    for (const k of kids) {
      if (++seen > limit) return
      const m = k.isFile() && k.name.match(REPORT)
      if (m) { const when = m[1] + (m[2] ? ` ${m[2]}:${m[3]}` : ''); if (!best || when > best.when) best = { when, path: path.join(dir, k.name), folder: dir } }
    }
    if (depth >= 2) return
    for (const k of kids) if (k.isDirectory() && !k.name.startsWith('.') && !k.name.startsWith('$') && k.name !== 'System Volume Information') await look(path.join(dir, k.name), depth + 1)
  }
  await look(mount, 0)
  return best
}

async function readDrives(platform = process.platform) {
  if (platform === 'darwin') {
    const list = parsePlist(await run('diskutil', ['list', '-plist'])) || {}
    const ids = new Set()
    for (const d of list.AllDisksAndPartitions || []) {
      ids.add(d.DeviceIdentifier)
      for (const p of d.Partitions || []) ids.add(p.DeviceIdentifier)
      for (const v of d.APFSVolumes || []) ids.add(v.DeviceIdentifier)
    }
    const infos = {}
    await Promise.all([...ids].filter(Boolean).map(async (id) => { infos[id] = parsePlist(await run('diskutil', ['info', '-plist', id])) || {} }))
    return macDrives({ list, infos, df: parseDf(await run('df', ['-k'])) })
  }
  if (platform === 'win32') {
    // the enumerations as their names ("$($_.X)"), so the JSON reads the same on every PowerShell
    const ps = '$d=Get-PhysicalDisk|Select DeviceId,FriendlyName,@{n="HealthStatus";e={"$($_.HealthStatus)"}},@{n="MediaType";e={"$($_.MediaType)"}},@{n="BusType";e={"$($_.BusType)"}},Size;$p=Get-Partition|Select DiskNumber,DriveLetter;$v=Get-Volume|Select DriveLetter,FileSystemLabel,FileSystem,Size,SizeRemaining,DriveType;@{disks=$d;parts=$p;vols=$v}|ConvertTo-Json -Depth 3 -Compress'
    return winDrives(await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], 30e3))
  }
  return []
}

/* the mounted volumes in one cheap look, so the page can tell a drive came or went without asking diskutil everything */
async function mountsNow(platform = process.platform) {
  if (platform === 'darwin') return parseDf(await run('df', ['-k'], 5e3)).filter((v) => v.device.startsWith('/dev/disk') && !quietMount(v.mount)).map((v) => v.mount).sort()
  if (platform === 'win32') {
    const out = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '(Get-Volume | Where-Object DriveLetter | ForEach-Object { $_.DriveLetter }) -join ","'], 10e3)
    return out.trim().split(',').filter(Boolean).sort()
  }
  return []
}

/* why an eject did not happen, in words a person can act on */
function ejectError(out) {
  const s = String(out || '')
  if (/in use|busy|dissent/i.test(s)) return 'Something is still using this drive. Close what has files open on it and try again.'
  return s.trim().split('\n').pop() || 'The drive could not be ejected.'
}

let lastList = []
function register(ctx) {
  ctx.handle('drives-mounts', async () => mountsNow())
  // eject a drive safely (Mac): only one the last list showed as ejectable, never the start-up disk
  ctx.handle('drives-eject', async ({ id }) => {
    const d = lastList.find((x) => x.id === String(id || ''))
    if (!d || !d.ejectable || d.startup) throw new Error('This drive cannot be ejected from here.')
    if (process.platform !== 'darwin') throw new Error('On Windows, use Safely Remove Hardware in the taskbar.')
    const out = await new Promise((ok) => execFile('diskutil', ['eject', d.id], { timeout: 60e3 }, (err, so, se) => ok({ err, text: String(so || '') + String(se || '') })))
    if (out.err) throw new Error(ejectError(out.text))
    return { ok: true, name: d.name }
  })
  ctx.handle('drives-list', async () => {
    const drives = await readDrives()
    lastList = drives
    await Promise.all(drives.map(async (d) => { d.report = null; for (const m of d.mounts) { const r = await lastReport(m.path); if (r && (!d.report || r.when > d.report.when)) d.report = r } }))
    ctx.allow(drives.flatMap((d) => [...d.mounts.map((m) => m.path), d.report?.path, d.report?.folder]))
    return { drives, at: Date.now() }
  })
}

module.exports = { register, parsePlist, parseDf, macDrives, winDrives, lastReport, health, quietMount, ejectError }
