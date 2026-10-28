// Disk speed test (Alex, 28 Oct): how fast a drive writes and reads, and so which codecs it can record and play.
// A test file of its own is written in big blocks (synced to the drive before the clock stops), then read back; it is
// RoarTwin's own temporary file, the only thing this tool ever removes, at the end and on Stop or an error.
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

/* write then read `bytes` in `dir`; tick({ phase, done, total, mbps }); stop() true ends it (the file still goes) */
async function speedTest(dir, bytes, tick = () => {}, stop = () => false) {
  const st = await fs.promises.statfs(dir)
  if (st.bavail * st.bsize < bytes + 512 * 1024 * 1024) throw new Error('Not enough free space on this drive for the test.')
  const file = testFile(dir)
  const buf = Buffer.alloc(Math.min(BLOCK, bytes))
  // not zeros: some drives (and file systems) make light work of empty blocks
  for (let i = 0; i < buf.length; i += 4) buf.writeUInt32LE((i * 2654435761) >>> 0, i)
  const out = { file, bytes, write: 0, read: 0, writePeak: 0, readPeak: 0 }
  const stopped = () => { if (stop()) { const e = new Error('Stopped'); e.name = 'Stopped'; throw e } }
  try {
    // write
    let fh = await fs.promises.open(file, 'wx')
    let done = 0
    const t0 = process.hrtime.bigint()
    let lastT = t0, lastD = 0
    try {
      while (done < bytes) {
        stopped()
        const n = Math.min(buf.length, bytes - done)
        await fh.write(buf, 0, n)
        done += n
        const now = process.hrtime.bigint(), dt = Number(now - lastT) / 1e9
        if (dt > 0.25) { const mbps = (done - lastD) / 1e6 / dt; out.writePeak = Math.max(out.writePeak, mbps); tick({ phase: 'write', done, total: bytes, mbps }); lastT = now; lastD = done }
      }
      await fh.sync()
    } finally { await fh.close() }
    out.write = bytes / 1e6 / (Number(process.hrtime.bigint() - t0) / 1e9)
    tick({ phase: 'write', done: bytes, total: bytes, mbps: out.write })
    // read
    fh = await fs.promises.open(file, 'r')
    done = 0
    const r0 = process.hrtime.bigint()
    lastT = r0; lastD = 0
    try {
      while (done < bytes) {
        stopped()
        const { bytesRead } = await fh.read(buf, 0, buf.length, done)
        if (!bytesRead) break
        done += bytesRead
        const now = process.hrtime.bigint(), dt = Number(now - lastT) / 1e9
        if (dt > 0.25) { const mbps = (done - lastD) / 1e6 / dt; out.readPeak = Math.max(out.readPeak, mbps); tick({ phase: 'read', done, total: bytes, mbps }); lastT = now; lastD = done }
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
    const bytes = [1, 2, 5].includes(Number(args.gb)) ? Number(args.gb) * 1e9 : 2e9
    return ctx.run(async () => ({ ...(await speedTest(dir, bytes, (t) => emit('speed-tick', t), ctx.stopped)), path: dir, table: codecTable() }))
  })
}

module.exports = { register, speedTest, codecTable, NAME }
