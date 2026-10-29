// RoarKit's Clean up (Alex, 28 Oct: "a tab that tidies the Mac: caches, junk, the cache of DaVinci, After Effects,
// Premiere and the other programs that gather a lot"). Plain Node, tested by test/clean.test.js.
//
// Only a fixed list of places, the ones each program keeps its cache in by default (catalogue). What is inside them is
// measured, and moved to the Trash only when the person chooses it: never a file outside these places, never the
// folder a program expects to find (only what is inside it), never through a link (lstat, links are not followed).
const fs = require('fs')
const path = require('path')

class Stopped extends Error {}

/* The places, per computer. kind:
     inside  everything inside the folder goes (the folder itself stays, the program fills it again)
     match   only the files directly in the folder whose name matches `match` (old installers in Downloads)
   apps: the program(s) that use it; while one is open it is left alone (a cache in use).
   on: chosen at first. */
function catalogue({ home, platform = process.platform, env = process.env } = {}) {
  const at = (...p) => path.join(home, ...p)
  if (platform === 'darwin') {
    const lib = (...p) => at('Library', ...p)
    const adobe = lib('Application Support', 'Adobe', 'Common')
    return [
      { id: 'resolve', name: 'DaVinci Resolve render cache', what: 'CacheClip: the frames Resolve renders to play smoothly. Made again when needed.', kind: 'inside', on: true,
        paths: [at('Movies', 'CacheClip'), lib('Application Support', 'Blackmagic Design', 'DaVinci Resolve', 'CacheClip')], apps: ['Resolve'] },
      { id: 'resolve-logs', name: 'DaVinci Resolve logs', what: 'Old log files Resolve writes for its support team.', kind: 'inside', on: true,
        paths: [lib('Application Support', 'Blackmagic Design', 'DaVinci Resolve', 'logs')], apps: ['Resolve'] },
      { id: 'adobe-media', name: 'Adobe media cache', what: 'Premiere Pro, After Effects, Media Encoder and Audition: the conformed audio and indexes of every clip ever imported. Made again when a project opens.', kind: 'inside', on: true,
        paths: [path.join(adobe, 'Media Cache Files'), path.join(adobe, 'Media Cache'), path.join(adobe, 'Peak Files')], apps: ['Adobe Premiere Pro', 'After Effects', 'Adobe Media Encoder', 'Adobe Audition'] },
      { id: 'adobe-team', name: 'Adobe Team Projects cache', what: 'Local copies of Premiere and After Effects team projects.', kind: 'inside', on: false,
        paths: [path.join(adobe, 'Team Projects Cache'), path.join(adobe, 'Team Projects Local Hub')], apps: ['Adobe Premiere Pro', 'After Effects'] },
      { id: 'ae-disk', name: 'After Effects disk cache', what: 'The frames After Effects keeps to preview faster. Made again when needed.', kind: 'inside', on: true,
        paths: [lib('Caches', 'Adobe', 'After Effects')], apps: ['After Effects'] },
      { id: 'c4d', name: 'Cinema 4D and Redshift cache', what: 'Texture and shader caches of Cinema 4D and Redshift.', kind: 'inside', on: true,
        paths: [lib('Caches', 'Maxon'), lib('Application Support', 'Redshift', 'cache'), at('Library', 'Preferences', 'Redshift', 'Cache')], apps: ['Cinema 4D', 'Redshift'] },
      { id: 'caches', name: 'Apps cache', what: 'What every other program keeps to start faster: browsers, Spotify, Slack, Final Cut and the rest. Each makes it again.', kind: 'inside', on: true,
        paths: [lib('Caches')], skip: [lib('Caches', 'Adobe'), lib('Caches', 'Maxon')] },
      { id: 'logs', name: 'Logs', what: 'Old diagnostic files programs and macOS write.', kind: 'inside', on: true, paths: [lib('Logs')] },
      { id: 'ios-updates', name: 'iPhone and iPad updates', what: 'iOS installers the Mac downloaded once to update a phone or a tablet.', kind: 'inside', on: true,
        paths: [lib('iTunes', 'iPhone Software Updates'), lib('iTunes', 'iPad Software Updates')] },
      { id: 'xcode', name: 'Xcode build files', what: 'DerivedData: what Xcode builds, made again on the next build.', kind: 'inside', on: true,
        paths: [lib('Developer', 'Xcode', 'DerivedData')], apps: ['Xcode'] },
      { id: 'installers', name: 'Installers in Downloads', what: '.dmg and .pkg files left in Downloads after a program was installed. Look before you choose them.', kind: 'match', on: false,
        paths: [at('Downloads')], match: /\.(dmg|pkg|mpkg)$/i },
    ]
  }
  if (platform === 'win32') {
    const roaming = env.APPDATA || at('AppData', 'Roaming')
    const local = env.LOCALAPPDATA || at('AppData', 'Local')
    const adobe = path.join(roaming, 'Adobe', 'Common')
    return [
      { id: 'resolve', name: 'DaVinci Resolve render cache', what: 'CacheClip: the frames Resolve renders to play smoothly. Made again when needed.', kind: 'inside', on: true,
        paths: [at('Videos', 'CacheClip'), path.join(roaming, 'Blackmagic Design', 'DaVinci Resolve', 'Support', 'CacheClip')], apps: ['Resolve'] },
      { id: 'resolve-logs', name: 'DaVinci Resolve logs', what: 'Old log files Resolve writes for its support team.', kind: 'inside', on: true,
        paths: [path.join(roaming, 'Blackmagic Design', 'DaVinci Resolve', 'Support', 'logs')], apps: ['Resolve'] },
      { id: 'adobe-media', name: 'Adobe media cache', what: 'Premiere Pro, After Effects, Media Encoder and Audition: the conformed audio and indexes of every clip ever imported. Made again when a project opens.', kind: 'inside', on: true,
        paths: [path.join(adobe, 'Media Cache Files'), path.join(adobe, 'Media Cache'), path.join(adobe, 'Peak Files')], apps: ['Adobe Premiere Pro', 'AfterFX', 'Adobe Media Encoder', 'Adobe Audition'] },
      { id: 'ae-disk', name: 'After Effects disk cache', what: 'The frames After Effects keeps to preview faster. Made again when needed.', kind: 'inside', on: true,
        paths: [path.join(local, 'Temp', 'Adobe', 'After Effects Disk Cache'), path.join(local, 'Adobe', 'After Effects')], apps: ['AfterFX'] },
      { id: 'temp', name: 'Temporary files', what: 'What programs leave in the Temp folder. Files still in use stay.', kind: 'inside', on: true, paths: [path.join(local, 'Temp')] },
      { id: 'installers', name: 'Installers in Downloads', what: '.exe and .msi files left in Downloads after a program was installed. Look before you choose them.', kind: 'match', on: false,
        paths: [at('Downloads')], match: /\.(exe|msi)$/i },
    ]
  }
  return []
}

/* The size of one thing on the disk, a folder with everything in it; links are counted as themselves, never followed. */
async function sizeOf(p, stop) {
  let st
  try { st = await fs.promises.lstat(p) } catch { return { size: 0, files: 0 } }
  if (!st.isDirectory()) return { size: st.isFile() ? st.size : 0, files: st.isFile() ? 1 : 0 }
  let size = 0, files = 0
  let kids = []
  try { kids = await fs.promises.readdir(p) } catch { return { size, files } }
  for (const k of kids) {
    if (stop?.()) throw new Stopped()
    const r = await sizeOf(path.join(p, k), stop)
    size += r.size; files += r.files
  }
  return { size, files }
}

/* What one place would send to the Trash: the things directly inside its folders (or the matching files). */
async function entriesOf(item, stop) {
  const out = []
  const skip = (item.skip || []).map((s) => path.resolve(s))
  for (const dir of item.paths) {
    let st
    try { st = await fs.promises.lstat(dir) } catch { continue }
    if (!st.isDirectory()) continue
    let kids = []
    try { kids = await fs.promises.readdir(dir, { withFileTypes: true }) } catch { continue }
    for (const k of kids) {
      if (stop?.()) throw new Stopped()
      const p = path.join(dir, k.name)
      if (skip.includes(path.resolve(p))) continue
      if (k.name === '.DS_Store' || k.name === '.localized') continue
      if (item.kind === 'match' && !(k.isFile() && item.match.test(k.name))) continue
      const r = await sizeOf(p, stop)
      out.push({ path: p, size: r.size, files: r.files })
    }
  }
  return out
}

/* Every place, measured: [{ id, size, files, entries, found }], told one by one through tick. */
async function measure(items, tick, stop) {
  const out = []
  for (const item of items) {
    if (stop?.()) throw new Stopped()
    const entries = await entriesOf(item, stop)
    const found = item.paths.filter((p) => { try { return fs.lstatSync(p).isDirectory() } catch { return false } })
    const r = { id: item.id, size: entries.reduce((n, e) => n + e.size, 0), files: entries.reduce((n, e) => n + e.files, 0), entries, found }
    out.push(r)
    tick?.(r)
  }
  return out
}

/* Is this path one a place may send to the Trash? Straight inside one of its folders, never the folder itself. */
function allowed(items, p) {
  const abs = path.resolve(String(p))
  return items.some((item) => !(item.skip || []).some((s) => path.resolve(s) === abs) && item.paths.some((dir) => {
    if (path.dirname(abs) !== path.resolve(dir)) return false
    return item.kind !== 'match' || item.match.test(path.basename(abs))
  }))
}

/* Which of these programs are open now, by the names their processes run under (the program itself, not a helper
   that only lives in its folder, like Resolve's panel daemon). */
function openApps(items, processes) {
  const names = processes.map((n) => String(n).split(/[\\/]/).pop().toLowerCase())
  const open = new Set()
  for (const item of items) for (const a of item.apps || []) if (names.some((n) => n.includes(a.toLowerCase()))) open.add(a)
  return [...open]
}

module.exports = { catalogue, measure, entriesOf, sizeOf, allowed, openApps, Stopped }
