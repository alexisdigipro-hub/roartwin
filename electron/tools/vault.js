// Vault (Alex, 28 Oct: "a vault for passwords"). The passwords live in one file on this computer, sealed with a key
// made from the master password; nothing is ever sent anywhere and nothing secret is logged.
//
// Format (vault.bin): "RTVAULT" (7 bytes) + version (1) + salt (16) + scrypt log2 N, r, p (1 each) + IV (12) +
// GCM tag (16) + AES-256-GCM ciphertext of the JSON { v, entries, created, updated }. The key: scrypt(master, salt,
// N = 2^17, r = 8, p = 1, 32 bytes). A wrong password and a changed file look the same: the tag does not match.
// Every save has a new IV, is written to a temp file and renamed, and the copy before it is kept as vault.bin.bak.
//
// The pure functions (seal, open, parseCsv, generate…) need no Electron, so test/vault.test.js runs them as they are.
// The page (app/tools/vault.js) never gets the key, the file or the list's passwords: it asks for one password, by
// entry id, to show it or copy it, and the copy is cleared from the clipboard after 30 s (and when the vault locks).
// Audit, 29 Oct: a crafted file's scrypt cost is bounded (it could ask for gigabytes), every write is flushed to the
// disk before the rename, a second unlock wipes the first key, UTF-16 CSVs (Excel) and re-imports without duplicates;
// new: two-factor codes (TOTP, RFC 6238) per entry, and password health (weak, reused, old) worked out here.
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const MAGIC = Buffer.from('RTVAULT')
const VERSION = 1
const PARAMS = { logN: 17, r: 8, p: 1 }
const HEAD = MAGIC.length + 1 + 16 + 3 + 12 + 16

const maxmem = ({ logN, r }) => 128 * (2 ** logN) * r * 2
function deriveKey(password, salt, params = PARAMS) {
  return new Promise((ok, no) => crypto.scrypt(String(password).normalize('NFC'), salt, 32,
    { N: 2 ** params.logN, r: params.r, p: params.p, maxmem: maxmem(params) }, (e, k) => (e ? no(e) : ok(k))))
}

/* the data sealed with a key: a new IV every time */
function sealWith(data, key, salt, params = PARAMS) {
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv('aes-256-gcm', key, iv)
  const head = Buffer.concat([MAGIC, Buffer.from([VERSION]), salt, Buffer.from([params.logN, params.r, params.p])])
  c.setAAD(head)
  const body = Buffer.concat([c.update(Buffer.from(JSON.stringify(data), 'utf8')), c.final()])
  return Buffer.concat([head, iv, c.getAuthTag(), body])
}
/* a new vault, or one with a new master password: a new salt, a new key */
async function seal(data, password, params = PARAMS) {
  const salt = crypto.randomBytes(16)
  const key = await deriveKey(password, salt, params)
  return { buf: sealWith(data, key, salt, params), key, salt, params }
}
function readHead(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < HEAD || !buf.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Not a vault file.')
  let at = MAGIC.length
  const version = buf[at++]
  if (version !== VERSION) throw new Error('This vault was made by a newer version.')
  const salt = buf.subarray(at, at + 16); at += 16
  const params = { logN: buf[at], r: buf[at + 1], p: buf[at + 2] }; at += 3
  // only what this app writes and a little more: a made-up header must not make scrypt ask for gigabytes
  if (params.logN < 14 || params.logN > 20 || params.r < 1 || params.r > 16 || params.p < 1 || params.p > 4 || maxmem(params) > 1 << 30) throw new Error('Not a vault file.')
  return { head: buf.subarray(0, at), salt: Buffer.from(salt), params, iv: buf.subarray(at, at + 12), tag: buf.subarray(at + 12, at + 28), body: buf.subarray(at + 28) }
}
function openWith(buf, key) {
  const { head, iv, tag, body } = readHead(buf)
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', key, iv)
    d.setAAD(head); d.setAuthTag(tag)
    return JSON.parse(Buffer.concat([d.update(body), d.final()]).toString('utf8'))
  } catch { throw new Error('Wrong password') }
}
/* the file opened with the master password: its data and the key, kept for the next saves */
async function open(buf, password) {
  const { salt, params } = readHead(buf)
  const key = await deriveKey(password, salt, params)
  return { data: openWith(buf, key), key, salt, params }
}

/* written whole or not at all; the one before is kept as .bak */
function writeAtomic(file, buf) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  // on the disk before it takes the vault's place: a power cut cannot leave an empty vault.bin
  const fd = fs.openSync(tmp, 'w', 0o600)
  try { fs.writeSync(fd, buf); fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
  if (fs.existsSync(file)) fs.copyFileSync(file, file + '.bak')
  fs.renameSync(tmp, file)
}

/* ---------- entries ---------- */
const FIELDS = ['title', 'username', 'password', 'website', 'notes', 'tag', 'totp']
const clip = (v, n) => String(v ?? '').slice(0, n)
function cleanEntry(e, old = {}) {
  const out = { id: old.id || e.id || crypto.randomUUID(), created: old.created || Date.now(), updated: Date.now() }
  for (const k of FIELDS) out[k] = e[k] !== undefined ? clip(e[k], k === 'notes' ? 8000 : 400) : (old[k] ?? '')
  out.totp = out.totp.trim()
  if (out.totp && !parseTotp(out.totp)) throw new Error('That two-factor key is not a valid one.')
  // when the password itself changed (for "old" in the health check)
  out.changed = e.password !== undefined && e.password !== old.password ? Date.now() : old.changed || old.created || out.created
  out.title = out.title.trim() || out.website.replace(/^https?:\/\//, '').split('/')[0] || 'Untitled'
  out.fav = e.fav !== undefined ? !!e.fav : !!old.fav
  return out
}
// the list as the page sees it: never a password
const shown = (e, health = []) => ({ id: e.id, title: e.title, username: e.username, website: e.website, notes: e.notes, tag: e.tag, fav: !!e.fav, updated: e.updated, hasPassword: !!e.password, hasTotp: !!e.totp, health })

/* a CSV export of Chrome, Safari, Firefox, 1Password, Bitwarden: name/title, url, username, password, note(s) */
function parseCsv(text) {
  const rows = []
  let row = [], cell = '', q = false
  const s = String(text).replace(/^\ufeff/, '')
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (q) {
      if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++ } else q = false } else cell += ch
    } else if (ch === '"') q = true
    else if (ch === ',') { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = '' }
    else cell += ch
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  const lines = rows.filter((r) => r.some((c) => c.trim()))
  if (lines.length < 2) return []
  const head = lines[0].map((h) => h.trim().toLowerCase())
  const col = (...names) => head.findIndex((h) => names.includes(h))
  const at = { title: col('name', 'title'), website: col('url', 'website', 'login_uri', 'login uri'), username: col('username', 'login_username', 'login name', 'user'),
    password: col('password', 'login_password'), notes: col('note', 'notes', 'extra'), tag: col('folder', 'group', 'category') }
  if (at.password < 0) return []
  return lines.slice(1).map((r) => Object.fromEntries(Object.entries(at).map(([k, i]) => [k, i >= 0 ? (r[i] || '').trim() : '']))).filter((e) => e.password || e.username)
}

/* a CSV file as text: UTF-8, or UTF-16 as Excel saves it ("Unicode text") */
function csvText(buf) {
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString('utf16le')
  if (buf[0] === 0xfe && buf[1] === 0xff) { const b = Buffer.from(buf.subarray(2)); b.swap16(); return b.toString('utf16le') }
  return buf.toString('utf8')
}
/* the rows of an import that are not in the vault already (the same name, username and password) */
function newRows(rows, entries) {
  const key = (e) => [e.title, e.website, e.username, e.password].map((x) => String(x || '').trim().toLowerCase()).join('\u0000')
  const have = new Set(entries.map(key))
  return rows.filter((r) => { const k = key({ ...r, title: cleanEntry(r).title }); if (have.has(k)) return false; have.add(k); return true })
}

/* ---------- two-factor codes (TOTP, RFC 6238) ---------- */
function base32(str) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const s = String(str).toUpperCase().replace(/[\s=-]/g, '')
  if (!s || /[^A-Z2-7]/.test(s)) return null
  let bits = 0, val = 0
  const out = []
  for (const ch of s) { val = (val << 5) | A.indexOf(ch); bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8 } }
  return out.length ? Buffer.from(out) : null
}
/* a key as a site shows it (base32, spaces and all) or its otpauth:// link (the QR code's text) */
function parseTotp(input) {
  const s = String(input || '').trim()
  if (!s) return null
  let secret = s, digits = 6, period = 30, algo = 'sha1'
  if (/^otpauth:\/\//i.test(s)) {
    let u
    try { u = new URL(s) } catch { return null }
    if (u.host.toLowerCase() !== 'totp') return null
    secret = u.searchParams.get('secret') || ''
    digits = Number(u.searchParams.get('digits') || 6)
    period = Number(u.searchParams.get('period') || 30)
    algo = String(u.searchParams.get('algorithm') || 'SHA1').toLowerCase()
  }
  const key = base32(secret)
  // at least 80 bits, as every site gives (a word typed by mistake is not a key)
  if (!key || key.length < 10 || ![6, 7, 8].includes(digits) || !(period >= 10 && period <= 120) || !['sha1', 'sha256', 'sha512'].includes(algo)) return null
  return { key, digits, period, algo }
}
/* the code at a moment: HMAC of the time step, dynamic truncation */
function totpAt(t, ms = Date.now()) {
  const step = Math.floor(ms / 1000 / t.period)
  const msg = Buffer.alloc(8)
  msg.writeBigUInt64BE(BigInt(step))
  const mac = crypto.createHmac(t.algo, t.key).update(msg).digest()
  const o = mac[mac.length - 1] & 15
  const n = ((mac[o] & 127) << 24) | (mac[o + 1] << 16) | (mac[o + 2] << 8) | mac[o + 3]
  return { code: String(n % 10 ** t.digits).padStart(t.digits, '0'), left: t.period - (Math.floor(ms / 1000) % t.period), period: t.period }
}

/* ---------- password health ---------- */
const bitsOf = (p) => {
  const pool = (/[a-z]/.test(p) ? 26 : 0) + (/[A-Z]/.test(p) ? 26 : 0) + (/\d/.test(p) ? 10 : 0) + (/[^a-zA-Z0-9]/.test(p) ? 20 : 0) || 26
  // a run of one character or a plain sequence counts for little
  const plain = /^(.)\1+$/.test(p) || /^(0123456789|1234567890|abcdefghij|qwertyuiop|asdfghjkl|password|passw0rd|letmein|welcome)/i.test(p)
  return plain ? 10 : p.length * Math.log2(pool)
}
const YEAR = 365 * 864e5
/* for every entry: 'weak' (short or guessable), 'reused' (the same password in another entry), 'old' (not changed for a year) */
function healthOf(entries, now = Date.now()) {
  const count = new Map()
  for (const e of entries) if (e.password) count.set(e.password, (count.get(e.password) || 0) + 1)
  const out = {}
  for (const e of entries) {
    const h = []
    if (e.password) {
      if (e.password.length < 10 || bitsOf(e.password) < 50) h.push('weak')
      if (count.get(e.password) > 1) h.push('reused')
      if (now - (e.changed || e.created || now) > YEAR) h.push('old')
    }
    out[e.id] = h
  }
  return out
}

/* ---------- the generator ---------- */
const LOWER = 'abcdefghijklmnopqrstuvwxyz', UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', DIGITS = '0123456789', SYMBOLS = '!@#$%^&*-_=+?.:;~'
const LOOKALIKE = /[Il1O0o|`'"]/g
const WORDS = ('amber anchor apple arrow atlas autumn badge banner basil beacon berry blossom bridge bronze cactus camera candle canyon ' +
  'carbon castle cedar chalk cherry cinema citrus clover cobalt comet copper coral cotton crater crimson crystal dancer delta desert ' +
  'dolphin dragon dune eagle ember emerald falcon fern fiesta forest fossil fresco galaxy garden garnet ginger glacier granite harbor ' +
  'hazel horizon indigo island ivory jasmine jungle kernel kettle lagoon lantern lemon lily lotus magnet mango maple marble meadow ' +
  'melon meteor mint mirror monsoon mosaic nectar noble nova oasis ocean olive onyx orbit orchid palace panda paper pearl pepper ' +
  'pilot planet plaza poppy prism pulse quartz quill radar raven reef ribbon river rocket saffron safari sapphire scarlet shadow ' +
  'silver sketch spice spiral spring studio summit sunset tango temple thunder tiger timber topaz tulip tundra valley velvet violet ' +
  'voyage walnut willow window winter wonder zebra zenith').split(' ')
const pickFrom = (s) => s[crypto.randomInt(s.length)]
function generate({ length = 20, lower = true, upper = true, digits = true, symbols = true, plain = true, words = 0 } = {}) {
  if (words) {
    const n = Math.max(3, Math.min(10, Number(words) || 5))
    return Array.from({ length: n }, () => pickFrom(WORDS)).join('-') + '-' + crypto.randomInt(10, 100)
  }
  const n = Math.max(12, Math.min(64, Math.round(Number(length) || 20)))
  const sets = [lower && LOWER, upper && UPPER, digits && DIGITS, symbols && SYMBOLS].filter(Boolean).map((x) => (plain ? x.replace(LOOKALIKE, '') : x))
  if (!sets.length) sets.push(plain ? LOWER.replace(LOOKALIKE, '') : LOWER)
  const all = sets.join('')
  // one of each kind chosen, then the rest, shuffled (Fisher-Yates with crypto.randomInt)
  const out = sets.map(pickFrom)
  while (out.length < n) out.push(pickFrom(all))
  for (let i = out.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [out[i], out[j]] = [out[j], out[i]] }
  return out.join('')
}

/* ---------- the doors (main process) ---------- */
function register(ctx) {
  const { app, dialog } = ctx
  const { clipboard, powerMonitor } = require('electron')
  const FILE = () => path.join(app.getPath('userData'), 'vault.bin')
  // the open vault: in this process's memory only, never sent to the page as a whole
  let v = null // { key, salt, params, data }
  let idleMin = 5
  let idleTimer = null
  let clipTimer = null
  let secretOnClip = '' // the last password copied, taken off the clipboard when the vault locks
  const notify = (ev, val) => { try { ctx.win()?.webContents.send('tool:' + ev, val) } catch { /* no window */ } }
  const clearSecret = () => { try { if (secretOnClip && clipboard.readText() === secretOnClip) clipboard.clear() } catch { /* no clipboard */ } secretOnClip = ''; clearTimeout(clipTimer) }
  const lock = () => {
    if (!v) return
    v.key.fill(0)
    v = null
    clearTimeout(idleTimer)
    clearSecret()
    notify('vault-locked', true)
  }
  /* to the clipboard from here (never from the page) and off it again after 30 s, if nothing else was copied since */
  const toClip = (val, secret) => {
    clipboard.writeText(String(val))
    clearTimeout(clipTimer)
    secretOnClip = secret ? String(val) : ''
    if (secret) clipTimer = setTimeout(clearSecret, 30e3)
  }
  const touch = () => { clearTimeout(idleTimer); if (v) idleTimer = setTimeout(lock, idleMin * 60e3) }
  // a person's own action keeps the vault open; a code refreshing by itself does not (quiet)
  const need = (quiet) => { if (!v) throw new Error('The vault is locked.'); if (!quiet) touch(); return v }
  const save = () => { writeAtomic(FILE(), sealWith(v.data, v.key, v.salt, v.params)) }
  const find = (id) => { const e = need().data.entries.find((x) => x.id === id); if (!e) throw new Error('Not in the vault.'); return e }

  app.whenReady().then(() => {
    powerMonitor.on('suspend', lock)
    powerMonitor.on('lock-screen', lock)
  })
  app.on('before-quit', () => { lock(); clearSecret() })
  // the app's own window closing (not the hidden one a PDF is printed in: destroy() fires no 'close')
  app.on('browser-window-created', (_e, w) => w.on('close', () => { if (w === ctx.win()) lock() }))

  ctx.handle('vault-state', () => ({ exists: fs.existsSync(FILE()), unlocked: !!v, idle: idleMin, count: v ? v.data.entries.length : 0 }))
  ctx.handle('vault-create', async ({ password }) => {
    if (fs.existsSync(FILE())) throw new Error('There is a vault already.')
    if (String(password || '').length < 8) throw new Error('At least 8 characters.')
    const data = { v: 1, entries: [], created: Date.now(), updated: Date.now() }
    const s = await seal(data, password)
    writeAtomic(FILE(), s.buf)
    v = { key: s.key, salt: s.salt, params: s.params, data }
    touch()
    return { ok: true }
  })
  ctx.handle('vault-unlock', async ({ password }) => {
    let buf
    try { buf = fs.readFileSync(FILE()) } catch { throw new Error('There is no vault yet.') }
    const r = await open(buf, String(password || ''))
    if (!Array.isArray(r.data.entries)) r.data.entries = []
    if (v) v.key.fill(0) // opened twice: the first key does not stay in memory
    v = r
    touch()
    return { ok: true, count: v.data.entries.length }
  })
  ctx.handle('vault-lock', () => { lock(); return { ok: true } })
  ctx.handle('vault-idle', ({ minutes }) => { idleMin = [1, 5, 15].includes(Number(minutes)) ? Number(minutes) : 5; touch(); return { idle: idleMin } })
  ctx.handle('vault-list', () => { const d = need().data; const hl = healthOf(d.entries); return d.entries.map((e) => shown(e, hl[e.id])) })
  ctx.handle('vault-save', ({ entry }) => {
    const d = need().data
    const i = entry?.id ? d.entries.findIndex((x) => x.id === entry.id) : -1
    const e = cleanEntry(entry || {}, i >= 0 ? d.entries[i] : {})
    if (i >= 0) d.entries[i] = e; else d.entries.push(e)
    d.updated = Date.now(); save()
    return shown(e, healthOf(d.entries)[e.id])
  })
  ctx.handle('vault-delete', ({ id }) => {
    const d = need().data
    d.entries = d.entries.filter((x) => x.id !== id)
    d.updated = Date.now(); save()
    return { ok: true }
  })
  ctx.handle('vault-reveal', ({ id }) => find(id).password)
  // copied here, not in the page, and taken off the clipboard after 30 s if nothing else was copied since
  ctx.handle('vault-copy', ({ id, field }) => {
    const e = find(id)
    if (field === 'totp') { const t = parseTotp(e.totp); if (!t) throw new Error('No two-factor key.'); toClip(totpAt(t).code, true); return { ok: true, clears: true } }
    const secret = field !== 'username' && field !== 'website'
    toClip(field === 'username' ? e.username : field === 'website' ? e.website : e.password, secret)
    return { ok: true, clears: secret }
  })
  // a generated password: copied the same way, so it too leaves the clipboard after 30 s
  ctx.handle('vault-copy-text', ({ text }) => { toClip(String(text || '').slice(0, 400), true); return { ok: true, clears: true } })
  // the two-factor code of one entry, refreshing (quiet: a code on the screen does not keep the vault open)
  ctx.handle('vault-code', ({ id }) => {
    const e = need(true).data.entries.find((x) => x.id === id)
    const t = e && parseTotp(e.totp)
    if (!t) throw new Error('No two-factor key.')
    return totpAt(t)
  })
  // the key itself, to edit it (as a password is revealed)
  ctx.handle('vault-totp-key', ({ id }) => find(id).totp || '')
  ctx.handle('vault-generate', (opts) => generate(opts || {}))
  ctx.handle('vault-change', async ({ old, password }) => {
    const cur = need()
    let buf
    try { buf = fs.readFileSync(FILE()) } catch { throw new Error('There is no vault yet.') }
    ;(await open(buf, String(old || ''))).key.fill(0) // the old password, asked again
    if (String(password || '').length < 8) throw new Error('At least 8 characters.')
    const s = await seal(cur.data, password)
    writeAtomic(FILE(), s.buf)
    cur.key.fill(0)
    v = { key: s.key, salt: s.salt, params: s.params, data: cur.data }
    touch()
    return { ok: true }
  })
  // a backup: the same sealed file, opened with the same master password
  ctx.handle('vault-export', async () => {
    const cur = need()
    const d = new Date()
    const name = `Vault backup ${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.roarvault`
    const { canceled, filePath } = await dialog.showSaveDialog(ctx.win(), { defaultPath: name, filters: [{ name: 'Vault backup', extensions: ['roarvault'] }] })
    if (canceled || !filePath) return ''
    fs.writeFileSync(filePath, sealWith(cur.data, cur.key, cur.salt, cur.params), { mode: 0o600 })
    ctx.allow(filePath)
    ctx.shell.showItemInFolder(filePath)
    return filePath
  })
  ctx.handle('vault-import', async () => {
    const cur = need()
    const { canceled, filePaths } = await dialog.showOpenDialog(ctx.win(), { title: 'A passwords CSV', properties: ['openFile'], filters: [{ name: 'CSV', extensions: ['csv'] }] })
    if (canceled || !filePaths?.[0]) return { added: 0 }
    const all = parseCsv(csvText(fs.readFileSync(filePaths[0])))
    const rows = newRows(all, cur.data.entries)
    for (const r of rows) cur.data.entries.push(cleanEntry(r))
    if (rows.length) { cur.data.updated = Date.now(); save() }
    touch()
    return { added: rows.length, already: all.length - rows.length, file: path.basename(filePaths[0]) }
  })
}

module.exports = { register, seal, sealWith, open, openWith, deriveKey, readHead, writeAtomic, parseCsv, csvText, newRows, generate, cleanEntry, shown, PARAMS, LOOKALIKE,
  base32, parseTotp, totpAt, healthOf, bitsOf }
