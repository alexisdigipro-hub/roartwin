// Opened in a browser (no Mac or Windows app around it), a sample shoot stands in for the disk, so the page can be
// seen and tested. Nothing here touches a real file.
const pic = (a, b, c) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient><radialGradient id="l" cx=".7" cy=".3" r=".5"><stop offset="0" stop-color="${c}" stop-opacity=".9"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient></defs><rect width="160" height="90" fill="url(#g)"/><circle cx="112" cy="28" r="40" fill="url(#l)"/><path d="M0 66h160v24H0z" fill="#000" opacity=".45"/><path d="M60 90c0-18 9-27 20-27s20 9 20 27" fill="#07080a"/><circle cx="80" cy="50" r="10" fill="#07080a"/></svg>`)
const day = (d) => new Date(2026, 9, d, 10, 30).getTime()
const V = (w, h, d, codec, fps = 25) => ({ w, h, dur: d, codec, fps })
const SAMPLE = {
  files: 18342, took: 94210,
  groups: [
    { id: 'g0', kind: 'similar', files: [
      { path: '/Volumes/SHOOT_01/Night Shoot/A001_C003.mov', name: 'A001_C003.mov', dir: '/Volumes/SHOOT_01/Night Shoot', size: 18.4e9, mtime: day(14), video: V(3840, 2160, 312.4, 'prores', 25), thumb: pic('#12161f', '#3a1416', '#ffd9a0'), keep: true },
      { path: '/Volumes/BACKUP/Night Shoot copy/A001_C003.mov', name: 'A001_C003.mov', dir: '/Volumes/BACKUP/Night Shoot copy', size: 18.4e9, mtime: day(15), video: V(3840, 2160, 312.4, 'prores', 25), thumb: pic('#12161f', '#3a1416', '#ffd9a0'), keep: false },
      { path: '/Users/alex/Desktop/exports/station_proxy.mp4', name: 'station_proxy.mp4', dir: '/Users/alex/Desktop/exports', size: 412e6, mtime: day(16), video: V(1280, 720, 312.4, 'h264', 25), thumb: pic('#12161f', '#3a1416', '#ffd9a0'), keep: false },
    ] },
    { id: 'g1', kind: 'exact', files: [
      { path: '/Volumes/SHOOT_01/Night Shoot/A001_C007.mov', name: 'A001_C007.mov', dir: '/Volumes/SHOOT_01/Night Shoot', size: 9.2e9, mtime: day(14), video: V(3840, 2160, 156, 'prores'), thumb: pic('#0b0e16', '#1a1f2c', '#ff6b5e'), keep: true },
      { path: '/Volumes/BACKUP/Night Shoot copy/A001_C007 (1).mov', name: 'A001_C007 (1).mov', dir: '/Volumes/BACKUP/Night Shoot copy', size: 9.2e9, mtime: day(15), video: V(3840, 2160, 156, 'prores'), thumb: pic('#0b0e16', '#1a1f2c', '#ff6b5e'), keep: false },
    ] },
    { id: 'g2', kind: 'similar', files: [
      { path: '/Users/alex/Projects/Spring campaign/Spot_30s_FINAL.mov', name: 'Spot_30s_FINAL.mov', dir: '/Users/alex/Projects/Spring campaign', size: 3.1e9, mtime: day(10), video: V(1920, 1080, 30, 'prores', 25), thumb: pic('#1d4a35', '#06110c', '#c8ffd8'), keep: true },
      { path: '/Users/alex/Downloads/Spot_30s_v7_web.mp4', name: 'Spot_30s_v7_web.mp4', dir: '/Users/alex/Downloads', size: 48e6, mtime: day(11), video: V(1920, 1080, 30, 'h264', 25), thumb: pic('#1d4a35', '#06110c', '#c8ffd8'), keep: false },
      { path: '/Users/alex/Downloads/spot instagram.mp4', name: 'spot instagram.mp4', dir: '/Users/alex/Downloads', size: 21e6, mtime: day(12), video: V(1080, 1080, 30, 'hevc', 30), thumb: pic('#1d4a35', '#06110c', '#c8ffd8'), keep: false },
    ] },
    { id: 'g3', kind: 'exact', files: [
      { path: '/Volumes/SHOOT_01/Sound/Day2_Boom.wav', name: 'Day2_Boom.wav', dir: '/Volumes/SHOOT_01/Sound', size: 2.1e9, mtime: day(14), video: null, thumb: '', keep: true },
      { path: '/Volumes/BACKUP/Sound/Day2_Boom.wav', name: 'Day2_Boom.wav', dir: '/Volumes/BACKUP/Sound', size: 2.1e9, mtime: day(15), video: null, thumb: '', keep: false },
      { path: '/Users/alex/Desktop/Day2_Boom copy.wav', name: 'Day2_Boom copy.wav', dir: '/Users/alex/Desktop', size: 2.1e9, mtime: day(18), video: null, thumb: '', keep: false },
    ] },
    { id: 'g4', kind: 'exact', files: [
      { path: '/Users/alex/Pictures/Recce/IMG_4471.JPG', name: 'IMG_4471.JPG', dir: '/Users/alex/Pictures/Recce', size: 6.4e6, mtime: day(2), video: null, thumb: pic('#2c2357', '#0b0916', '#a79bff'), keep: true },
      { path: '/Users/alex/Desktop/station recce.jpg', name: 'station recce.jpg', dir: '/Users/alex/Desktop', size: 6.4e6, mtime: day(9), video: null, thumb: pic('#2c2357', '#0b0916', '#a79bff'), keep: false },
    ] },
  ],
}
export function demoTwin() {
  let stop = false, listeners = []
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  return {
    platform: 'web',
    version: async () => '0.1.0',
    pick: async () => ['/Volumes/SHOOT_01', '/Volumes/BACKUP'],
    pathOf: (f) => f.name,
    isFolder: async () => true,
    onProgress: (fn) => { listeners.push(fn); return () => { listeners = listeners.filter((x) => x !== fn) } },
    scan: async () => {
      stop = false
      const tick = (p) => listeners.forEach((fn) => fn(p))
      for (let i = 0; i <= 10; i++) { if (stop) return { stopped: true }; tick({ stage: 'list', files: i * 1834 }); await wait(60) }
      for (let i = 0; i <= 10; i++) { if (stop) return { stopped: true }; tick({ stage: 'hash', bytesDone: i * 6e9, bytesTotal: 60e9 }); await wait(60) }
      for (let i = 0; i <= 10; i++) { if (stop) return { stopped: true }; tick({ stage: 'frames', done: i * 4, total: 40 }); await wait(60) }
      return structuredClone(SAMPLE)
    },
    stop: async () => { stop = true },
    trash: async (paths) => ({ ok: paths, failed: [] }),
    reveal: async () => {}, open: async () => {},
    exportCSV: async () => true,
  }
}
