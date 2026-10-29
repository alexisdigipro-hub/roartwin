// Disk speed test (Alex, 28 Oct): how fast a drive writes and reads, and so which codecs it can record and play.
// A test file of its own is written in big blocks (synced to the drive before the clock stops), then read back; it is
// RoarKit's own temporary file, the only thing this tool ever removes, at the end and on Stop or an error.
// The read can come partly from the computer's memory (Node cannot ask the system to skip its cache): the file is
// written fresh each time, and the page says so. Tested by test/speed.test.js.
const fs = require('fs')
const path = require('path')

const BLOCK = 64 * 1024 * 1024
const NAME = '.roartwin-speedtest'
const testFile = (dir) => path.join(dir, `${NAME}-${process.pid}-${Date.now()}.tmp`)

/* Data rates in MB/s at 25 frames a second. ProRes from Apple's white paper (29.97p figures scaled to 25p and to the
   frame size); BRAW from its 12-bit picture and ratio (Q0 about 2.5:1); H.264 / H.265 as typical delivery files. */
const SIZES = [['HD', 1920, 1080], ['UHD', 3840, 2160], ['6K', 6144, 3456], ['8K', 7680, 4320]]
const PRORES_HD = { 'ProRes 422 Proxy': 38, 'ProRes 422 LT': 85, 'ProRes 422': 122, 'ProRes 422 HQ': 184, 'ProRes 4444': 275 } // Mb/s, 1080p25
const BRAW = { 'BRAW Q0': 2.5, 'BRAW 3:1': 3, 'BRAW 5:1': 5, 'BRAW 8:1': 8, 'BRAW 12:1': 12 }
const DELIVERY = { 'H.264 delivery': [25, 60, 100, 150], 'H.265 delivery': [12, 40, 80, 120] } // Mb/s per size
function codecTable(fps = 25) {
  const px = (w, h) => w * h
  const rows = []
  for (const [name, mb] of Object.entries(PRORES_HD)) rows.push({ codec: name, rates: SIZES.map(([, w, h]) => (mb / 8) * (px(w, h) / px(1920, 1080)) * (fps / 25)) })
  for (const [name, r] of Object.entries(BRAW)) rows.push({ codec: name, rates: SIZES.map(([, w, h]) => (px(w, h) * 1.5 / r) * fps / 1e6) })
  for (const [name, mbs] of Object.entries(DELIVERY)) rows.push({ codec: name, rates: mbs.map((m) => (m / 8) * (fps / 25)) })
  return { sizes: SIZES.map((s) => s[0]), rows: rows.map((r) => ({ ...r, rates: r.rates.map((x) => Math.round(x * 10) / 10) })) }
}

/* what went wrong, in words a person can act on (audit, 29 Oct: a locked card said "EROFS: read-only file system…") */
function plainError(e) {
  const c = e?.code
  if (c === 'EROFS' || c === 'EACCES' || c === 'EPERM') return new Error('This drive cannot be written to: it is read-only, locked, or the app may not write there.')
  if (c === 'ENOSPC' || c === 'EDQUOT') return new Error('The drive filled up during the test. Free some space and try a smaller test file.')
  if (c === 'EIO') return new Error('The drive gave a read or write error during the test. Copy what matters off it.')
  if (c === 'ENOENT' || c === 'ENOTDIR') return new Error('The drive is not there any more.')
  return e
}

/* write then read `bytes` in `dir`; tick({ phase, done, total, mbps }); stop() true ends it (the file still goes).
   sustained (Alex, 29 Oct, from AJA System Test): a long write, as far as `bytes` or `seconds`, its speed kept every
   half second, so an SSD that slows down once its fast cache is full shows it; then only the first `readBytes` are
   read back. */
async function speedTest(dir, bytes, tick = () => {}, stop = () => false, { sustained = false, seconds = 90, readBytes = 2e9 } = {}) {
  try { return await runTest(dir, bytes, tick, stop, { sustained, seconds, readBytes }) } catch (e) { throw e?.name === 'Stopped' ? e : plainError(e) }
}
async function runTest(dir, bytes, tick, stop, { sustained, seconds, readBytes }) {
  const st = await fs.promises.statfs(dir)
  const room = st.bavail * st.bsize - 512 * 1024 * 1024
  // a long write takes what room there is, up to its size; a normal one needs all of it
  if (sustained) bytes = Math.min(bytes, Math.floor(room / BLOCK) * BLOCK)
  if (room < bytes || bytes < BLOCK) throw new Error('Not enough free space on this drive for the test.')
  const file = testFile(dir)
  const buf = Buffer.alloc(Math.min(BLOCK, bytes))
  // not zeros: some drives (and file systems) make light work of empty blocks
  for (let i = 0; i < buf.length; i += 4) buf.writeUInt32LE((i * 2654435761) >>> 0, i)
  const out = { file, bytes, write: 0, read: 0, writePeak: 0, readPeak: 0, sustained, samples: [] }
  const until = Date.now() + seconds * 1000
  const stopped = () => { if (stop()) { const e = new Error('Stopped'); e.name = 'Stopped'; throw e } }
  try {
    // write
    let fh = await fs.promises.open(file, 'wx')
    let done = 0
    const t0 = process.hrtime.bigint()
    let lastT = t0, lastD = 0
    try {
      while (done < bytes && !(sustained && Date.now() > until)) {
        stopped()
        const n = Math.min(buf.length, bytes - done)
        await fh.write(buf, 0, n)
        done += n
        const now = process.hrtime.bigint(), dt = Number(now - lastT) / 1e9
        // the long write is synced as it goes, or the computer's memory would hide the drive's real pace
        if (sustained && dt > 0.5) await fh.datasync()
        const dt2 = Number(process.hrtime.bigint() - lastT) / 1e9
        if (dt2 > (sustained ? 0.5 : 0.25)) {
          const mbps = (done - lastD) / 1e6 / dt2
          out.writePeak = Math.max(out.writePeak, mbps)
          if (sustained) out.samples.push({ at: done, mbps: Math.round(mbps) })
          tick({ phase: 'write', done, total: bytes, mbps }); lastT = process.hrtime.bigint(); lastD = done
        }
      }
      await fh.sync()
    } finally { await fh.close() }
    out.write = done / 1e6 / (Number(process.hrtime.bigint() - t0) / 1e9)
    out.bytes = done
    tick({ phase: 'write', done, total: done, mbps: out.write })
    // the long write: where the speed settled (the slowest stretch after the first fifth) and when it dropped
    if (sustained && out.samples.length >= 5) {
      const later = out.samples.slice(Math.floor(out.samples.length / 5))
      out.settled = Math.round(later.reduce((n, x) => n + x.mbps, 0) / later.length)
      const first = out.samples.slice(0, Math.max(2, Math.floor(out.samples.length / 10)))
      const fast = first.reduce((n, x) => n + x.mbps, 0) / first.length
      const drop = out.samples.find((x) => x.mbps < fast * 0.6)
      out.dropAt = drop && out.settled < fast * 0.7 ? drop.at : 0
    }
    const toRead = sustained ? Math.min(done, readBytes) : done
    // read
    fh = await fs.promises.open(file, 'r')
    done = 0
    const r0 = process.hrtime.bigint()
    lastT = r0; lastD = 0
    try {
      while (done < toRead) {
        stopped()
        const { bytesRead } = await fh.read(buf, 0, Math.min(buf.length, toRead - done), done)
        if (!bytesRead) break
        done += bytesRead
        const now = process.hrtime.bigint(), dt = Number(now - lastT) / 1e9
        if (dt > 0.25) { const mbps = (done - lastD) / 1e6 / dt; out.readPeak = Math.max(out.readPeak, mbps); tick({ phase: 'read', done, total: toRead, mbps }); lastT = now; lastD = done }
      }
    } finally { await fh.close() }
    out.read = done / 1e6 / (Number(process.hrtime.bigint() - r0) / 1e9)
    tick({ phase: 'read', done, total: bytes, mbps: out.read })
    return out
  } finally {
    // the test file only, always
    if (path.basename(file).startsWith(NAME)) await fs.promises.rm(file, { force: true })
  }
}

function register(ctx) {
  ctx.handle('speed-table', async () => codecTable())
  ctx.handle('speed-run', async (args, { emit }) => {
    const dir = String(args.path || '')
    try { if (!fs.statSync(dir).isDirectory()) throw new Error() } catch { throw new Error('Choose a drive or a folder.') }
    const sustained = !!args.sustained
    // the long write: up to 50 GB or 90 seconds, whichever comes first
    const bytes = sustained ? 50e9 : [1, 2, 5, 10].includes(Number(args.gb)) ? Number(args.gb) * 1e9 : 2e9
    return ctx.run(async () => ({ ...(await speedTest(dir, bytes, (t) => emit('speed-tick', t), ctx.stopped, { sustained })), path: dir, table: codecTable() }))
  })
}

module.exports = { register, speedTest, codecTable, plainError, NAME }
